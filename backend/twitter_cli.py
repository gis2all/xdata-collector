from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.models import SearchResult
from backend.models import RunCancelled


def find_twitter_cli() -> str:
    for candidate in ("twitter", "twitter.exe"):
        path = shutil.which(candidate)
        if path:
            return path
    for fallback in _twitter_fallback_paths():
        if fallback.exists():
            return str(fallback)
    raise RuntimeError("twitter-cli not found. Run python install.py or python run/bootstrap.py, or install twitter-cli manually.")


def get_twitter_cli_version(timeout_seconds: int = 10) -> str:
    command = [find_twitter_cli(), "--version"]
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
        **_windows_subprocess_run_kwargs(),
    )
    output = (completed.stdout or completed.stderr).strip()
    if completed.returncode != 0 or not output:
        return "unknown"
    match = re.search(r"\bversion\s+([0-9]+(?:\.[0-9]+){1,3})\b", output, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    return output.replace("twitter, version ", "").strip() or "unknown"


def find_xreach_cli() -> str:
    for candidate in ("xreach", "xreach.cmd", "xreach.ps1"):
        path = shutil.which(candidate)
        if path:
            return path
    for fallback in _xreach_fallback_paths():
        if fallback.exists():
            return str(fallback)
    raise RuntimeError("xreach not found. Install with `npm i -g xreach-cli`.")


def _xreach_fallback_paths() -> list[Path]:
    candidates = [
        Path.home() / "AppData" / "Roaming" / "npm" / "xreach.cmd",
        Path.home() / ".npm-global" / "bin" / "xreach",
        Path.home() / ".local" / "bin" / "xreach",
    ]
    npm_prefix = _npm_global_prefix()
    if npm_prefix is not None:
        candidates.extend(
            [
                npm_prefix / "xreach.cmd",
                npm_prefix / "xreach",
                npm_prefix / "bin" / "xreach",
            ]
        )
    seen: set[str] = set()
    unique_candidates: list[Path] = []
    for candidate in candidates:
        normalized = str(candidate)
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_candidates.append(candidate)
    return unique_candidates


def _twitter_fallback_paths() -> list[Path]:
    candidates = [
        Path.home() / ".local" / "bin" / "twitter.exe",
        Path.home() / ".local" / "bin" / "twitter",
    ]
    seen: set[str] = set()
    unique_candidates: list[Path] = []
    for candidate in candidates:
        normalized = str(candidate)
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_candidates.append(candidate)
    return unique_candidates


def _npm_global_prefix() -> Path | None:
    commands: list[str] = []
    for candidate in ("npm.cmd", "npm"):
        resolved = shutil.which(candidate)
        if resolved:
            commands.append(resolved)
        commands.append(candidate)
    seen: set[str] = set()
    for npm in commands:
        if npm in seen:
            continue
        seen.add(npm)
        try:
            completed = subprocess.run(
                [npm, "prefix", "-g"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                timeout=10,
                **_windows_subprocess_run_kwargs(),
            )
        except OSError:
            continue
        if completed.returncode != 0:
            continue
        prefix = (completed.stdout or "").strip()
        if prefix:
            return Path(prefix)
    return None


def _windows_subprocess_run_kwargs() -> dict[str, Any]:
    if os.name != "nt":
        return {}
    return {"creationflags": subprocess.CREATE_NO_WINDOW}


def _run_cli_command(
    command: list[str],
    *,
    timeout_seconds: int,
    cancel_event: threading.Event | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("NO_COLOR", "1")
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
        **_windows_subprocess_run_kwargs(),
    )
    start = time.monotonic()
    while True:
        if cancel_event is not None and cancel_event.is_set():
            process.kill()
            stdout, stderr = process.communicate()
            raise RunCancelled("cancelled")
        try:
            stdout, stderr = process.communicate(timeout=0.1)
            break
        except subprocess.TimeoutExpired as exc:
            if (time.monotonic() - start) >= timeout_seconds:
                process.kill()
                stdout, stderr = process.communicate()
                raise subprocess.TimeoutExpired(command, timeout_seconds, output=stdout, stderr=stderr) from exc
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def run_twitter_search(
    query: str,
    max_results: int,
    timeout_seconds: int = 60,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any] | list[Any]:
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
    completed = _run_cli_command(command, timeout_seconds=timeout_seconds, cancel_event=cancel_event)

    output = completed.stdout.strip()
    if completed.returncode == 0 and output:
        payload = json.loads(output)
        if not _is_twitter_error_payload(payload):
            return payload
    elif completed.returncode == 0 and not output:
        return []

    fallback_error = ""
    try:
        return run_xreach_search(query, max_results, timeout_seconds=timeout_seconds, cancel_event=cancel_event)
    except Exception as exc:  # noqa: BLE001
        fallback_error = str(exc)

    raise RuntimeError(
        "twitter-cli search failed and xreach fallback failed.\n"
        f"command: {' '.join(command)}\n"
        f"stderr: {completed.stderr.strip()}\n"
        f"stdout: {output}\n"
        f"xreach_error: {fallback_error}"
    )


def run_xreach_search(
    query: str,
    max_results: int,
    timeout_seconds: int = 60,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any] | list[Any]:
    xreach_cli = find_xreach_cli()
    command = [
        xreach_cli,
        "search",
        query,
        "-n",
        str(max_results),
        "--json",
    ]

    auth_token = os.getenv("TWITTER_AUTH_TOKEN", "").strip()
    ct0 = os.getenv("TWITTER_CT0", "").strip()
    if auth_token and ct0:
        command.extend(["--auth-token", auth_token, "--ct0", ct0])

    completed = _run_cli_command(command, timeout_seconds=timeout_seconds, cancel_event=cancel_event)
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
    return _enrich_xreach_search_payload(
        payload,
        xreach_cli=xreach_cli,
        timeout_seconds=timeout_seconds,
        cancel_event=cancel_event,
    )


def _run_xreach_tweet_detail(
    tweet_id: str,
    *,
    xreach_cli: str,
    timeout_seconds: int,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any] | None:
    command = [
        xreach_cli,
        "tweet",
        tweet_id,
        "--json",
    ]

    auth_token = os.getenv("TWITTER_AUTH_TOKEN", "").strip()
    ct0 = os.getenv("TWITTER_CT0", "").strip()
    if auth_token and ct0:
        command.extend(["--auth-token", auth_token, "--ct0", ct0])

    completed = _run_cli_command(command, timeout_seconds=timeout_seconds, cancel_event=cancel_event)
    if completed.returncode != 0:
        return None
    output = completed.stdout.strip()
    if not output:
        return None
    payload = json.loads(output)
    if not isinstance(payload, dict) or _is_twitter_error_payload(payload):
        return None
    return payload


def _enrich_xreach_search_payload(
    payload: dict[str, Any] | list[Any],
    *,
    xreach_cli: str,
    timeout_seconds: int,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any] | list[Any]:
    items = _extract_items(payload)
    if not items:
        return payload

    detail_cache: dict[str, dict[str, Any] | None] = {}
    enriched_items: list[Any] = []
    changed = False
    for item in items:
        if not isinstance(item, dict):
            enriched_items.append(item)
            continue
        tweet_id = _first_value(item.get("id"), item.get("tweet_id"), item.get("rest_id"), _deep_get(item, "legacy.id_str"))
        if not tweet_id or not _needs_xreach_detail_enrichment(item):
            enriched_items.append(item)
            continue
        normalized_id = str(tweet_id).strip()
        if normalized_id not in detail_cache:
            detail_cache[normalized_id] = _run_xreach_tweet_detail(
                normalized_id,
                xreach_cli=xreach_cli,
                timeout_seconds=timeout_seconds,
                cancel_event=cancel_event,
            )
        detail = detail_cache[normalized_id]
        if detail is None:
            enriched_items.append(item)
            continue
        enriched_items.append(_merge_payloads(item, detail))
        changed = True

    if not changed:
        return payload
    if isinstance(payload, list):
        return enriched_items
    enriched_payload = dict(payload)
    for key in ("results", "tweets", "items", "entries"):
        if isinstance(enriched_payload.get(key), list):
            enriched_payload[key] = enriched_items
            return enriched_payload
    if isinstance(enriched_payload.get("data"), list):
        enriched_payload["data"] = enriched_items
    return enriched_payload


def _needs_xreach_detail_enrichment(item: dict[str, Any]) -> bool:
    checks = [
        _first_value(
            item.get("username"),
            item.get("screen_name"),
            _deep_get(item, "author.screenName"),
            _deep_get(item, "author.username"),
            _deep_get(item, "user.username"),
            _deep_get(item, "user.screen_name"),
            _deep_get(item, "user.screenName"),
            _deep_get(item, "user.handle"),
            _deep_get(item, "core.user_results.result.legacy.screen_name"),
        ),
        _first_value(
            item.get("author_name"),
            _deep_get(item, "author.name"),
            _deep_get(item, "user.name"),
            _deep_get(item, "core.user_results.result.legacy.name"),
        ),
        _first_value(item.get("full_text"), item.get("text"), item.get("content"), _deep_get(item, "legacy.full_text"), _deep_get(item, "legacy.text")),
        _first_value(item.get("createdAtISO"), item.get("createdAt"), item.get("created_at"), _deep_get(item, "legacy.created_at")),
        _first_value(item.get("viewCount"), item.get("views"), _deep_get(item, "metrics.views")),
        _first_value(item.get("replyCount"), item.get("replies"), _deep_get(item, "metrics.replies")),
        _first_value(item.get("retweetCount"), item.get("retweets"), _deep_get(item, "metrics.retweets")),
        _first_value(item.get("likeCount"), item.get("likes"), _deep_get(item, "metrics.likes")),
    ]
    return any(value is None for value in checks)


def _merge_payloads(base: dict[str, Any], detail: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in detail.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_payloads(merged[key], value)
            continue
        if _has_payload_value(value):
            merged[key] = value
    return merged


def _has_payload_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


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
        author_name = _first_value(
            item.get("author_name"),
            _deep_get(item, "author.name"),
            _deep_get(item, "user.name"),
            _deep_get(item, "core.user_results.result.legacy.name"),
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
                author_name=author_name or "",
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



