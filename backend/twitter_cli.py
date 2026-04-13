from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.models import SearchResult


def find_twitter_cli() -> str:
    for candidate in ("twitter", "twitter.exe"):
        path = shutil.which(candidate)
        if path:
            return path
    fallback = Path.home() / ".local" / "bin" / "twitter.exe"
    if fallback.exists():
        return str(fallback)
    raise RuntimeError("twitter-cli not found. Run python run/bootstrap.py or install twitter-cli manually.")


def find_xreach_cli() -> str:
    for candidate in ("xreach", "xreach.cmd", "xreach.ps1"):
        path = shutil.which(candidate)
        if path:
            return path
    fallback = Path.home() / "AppData" / "Roaming" / "npm" / "xreach.cmd"
    if fallback.exists():
        return str(fallback)
    raise RuntimeError("xreach not found. Install with `npm i -g xreach`.")


def run_twitter_search(query: str, max_results: int, timeout_seconds: int = 60) -> dict[str, Any] | list[Any]:
    command = [
        find_twitter_cli(),
        "search",
        query,
        "-t",
        "Latest",
        "--max",
        str(max_results),
        "--json",
    ]
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("NO_COLOR", "1")
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        env=env,
        timeout=timeout_seconds,
    )

    output = completed.stdout.strip()
    if completed.returncode == 0 and output:
        payload = json.loads(output)
        if not _is_twitter_error_payload(payload):
            return payload
    elif completed.returncode == 0 and not output:
        return []

    fallback_error = ""
    try:
        return run_xreach_search(query, max_results, timeout_seconds=timeout_seconds)
    except Exception as exc:  # noqa: BLE001
        fallback_error = str(exc)

    raise RuntimeError(
        "twitter-cli search failed and xreach fallback failed.\n"
        f"command: {' '.join(command)}\n"
        f"stderr: {completed.stderr.strip()}\n"
        f"stdout: {output}\n"
        f"xreach_error: {fallback_error}"
    )


def run_xreach_search(query: str, max_results: int, timeout_seconds: int = 60) -> dict[str, Any] | list[Any]:
    command = [
        find_xreach_cli(),
        "search",
        query,
        "-n",
        str(max_results),
        "--json",
    ]

    auth_token = os.getenv("TWITTER_AUTH_TOKEN", "").strip()
    ct0 = os.getenv("TWITTER_CT0", "").strip()
    cookie_source = os.getenv("TWITTER_BROWSER", "").strip().lower()
    chrome_profile = os.getenv("TWITTER_CHROME_PROFILE", "").strip()

    if auth_token and ct0:
        command.extend(["--auth-token", auth_token, "--ct0", ct0])
    elif cookie_source in {"chrome", "edge", "arc", "brave", "firefox", "safari"}:
        command.extend(["--cookie-source", cookie_source])
        if chrome_profile:
            command.extend(["--chrome-profile", chrome_profile])

    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("NO_COLOR", "1")
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
        env=env,
        timeout=timeout_seconds,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"xreach search failed: {' '.join(command)}\n"
            f"stderr: {completed.stderr.strip()}\n"
            f"stdout: {completed.stdout.strip()}"
        )

    output = completed.stdout.strip()
    if not output:
        return []
    payload = json.loads(output)
    if _is_twitter_error_payload(payload):
        raise RuntimeError(f"xreach returned error payload: {payload}")
    return payload


def save_search_bundle(
    output_dir: str | Path,
    query_name: str,
    query: str,
    results: list[SearchResult],
) -> Path:
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = directory / f"{timestamp}_{query_name}.json"
    payload = {
        "generated_at": timestamp,
        "query_name": query_name,
        "query": query,
        "results": [result.to_dict() for result in results],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def normalize_search_payload(
    query_name: str,
    payload: dict[str, Any] | list[Any],
    query: str = "",
) -> list[SearchResult]:
    items = _extract_items(payload)
    results: list[SearchResult] = []
    seen_tweet_ids: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        tweet_id = _first_value(
            item.get("id"),
            item.get("tweet_id"),
            item.get("rest_id"),
            _deep_get(item, "legacy.id_str"),
        )
        if not tweet_id:
            continue
        tweet_id = str(tweet_id).strip()
        if tweet_id in seen_tweet_ids:
            continue
        seen_tweet_ids.add(tweet_id)

        author = _first_value(
            item.get("username"),
            item.get("screen_name"),
            _deep_get(item, "author.screenName"),
            _deep_get(item, "author.username"),
            _deep_get(item, "user.username"),
            _deep_get(item, "user.screen_name"),
            _deep_get(item, "user.screenName"),
            _deep_get(item, "user.handle"),
            _deep_get(item, "core.user_results.result.legacy.screen_name"),
        )

        text = _first_value(
            item.get("full_text"),
            item.get("text"),
            item.get("content"),
            _deep_get(item, "legacy.full_text"),
            _deep_get(item, "legacy.text"),
        )

        created_at = _first_value(
            item.get("createdAtISO"),
            item.get("createdAt"),
            item.get("created_at"),
            _deep_get(item, "legacy.created_at"),
        )

        url = _first_value(
            item.get("url"),
            item.get("tweet_url"),
            _compose_tweet_url(author, tweet_id),
            f"https://x.com/i/web/status/{tweet_id}",
        )

        metrics = _extract_metrics(item)
        raw_item = dict(item)
        if metrics:
            raw_item["metrics"] = metrics

        results.append(
            SearchResult(
                query_name=query_name,
                query=query,
                tweet_id=tweet_id,
                url=url or "",
                text=text or "",
                author=author or "",
                created_at=created_at or "",
                raw=raw_item,
            )
        )
    return results


def load_search_bundle(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _is_twitter_error_payload(payload: Any) -> bool:
    return bool(
        isinstance(payload, dict)
        and payload.get("ok") is False
        and isinstance(payload.get("error"), dict)
    )


def _extract_items(payload: dict[str, Any] | list[Any]) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("results", "tweets", "items", "entries"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        if isinstance(payload.get("data"), list):
            return payload["data"]
    return []


def _deep_get(data: dict[str, Any], dotted_path: str) -> Any:
    current: Any = data
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _first_value(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if value is not None and not isinstance(value, (dict, list)):
            return str(value)
    return None


def _compose_tweet_url(author: str | None, tweet_id: str | None) -> str | None:
    if not tweet_id:
        return None
    if author:
        return f"https://x.com/{author}/status/{tweet_id}"
    return f"https://x.com/i/web/status/{tweet_id}"


def _extract_metrics(item: dict[str, Any]) -> dict[str, int]:
    mapping = {
        "views": _first_value(item.get("viewCount"), item.get("views"), _deep_get(item, "metrics.views")),
        "replies": _first_value(item.get("replyCount"), item.get("replies"), _deep_get(item, "metrics.replies")),
        "retweets": _first_value(
            item.get("retweetCount"),
            item.get("retweets"),
            _deep_get(item, "metrics.retweets"),
        ),
        "likes": _first_value(item.get("likeCount"), item.get("likes"), _deep_get(item, "metrics.likes")),
    }
    out: dict[str, int] = {}
    for key, value in mapping.items():
        if value is None:
            continue
        try:
            out[key] = int(str(value).replace(",", "").strip())
        except ValueError:
            continue
    return out



