from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from backend.collector_rules import (
    build_query_from_search_spec,
    build_query_plan_from_search_spec,
    default_rule_set_definition,
    default_search_spec,
    evaluate_rule_set,
    normalize_rule_set_definition,
    normalize_search_spec,
    parse_created_at,
    passes_search_filters,
    serialize_search_result,
)
from backend.config import load_env_file
from backend.collector_store import connect, row_to_dict, utc_now_iso
from backend.models import SearchResult
from backend.source_identity import (
    build_source_dedupe_key,
    canonicalize_source_url,
)
from backend.twitter_cli import find_twitter_cli, normalize_search_payload, run_twitter_search

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SQLITE_DEFAULT = Path("data") / "app.db"
RUNTIME_LOG_DIR = PROJECT_ROOT / "runtime" / "logs"
RUNTIME_LOG_FILES = (
    "api.current.out.log",
    "api.current.err.log",
    "scheduler.current.out.log",
    "scheduler.current.err.log",
    "web-ui.current.out.log",
    "web-ui.current.err.log",
)

ITEM_FIELDS = (
    "id",
    "run_id",
    "dedupe_key",
    "level",
    "score",
    "title",
    "summary_zh",
    "excerpt",
    "is_zero_cost",
    "source_url",
    "author",
    "created_at_x",
    "reasons_json",
    "rule_set_id",
    "state",
)
ITEM_SORT_FIELDS = {field: field for field in ITEM_FIELDS}
MAX_ITEM_PAGE_SIZE = 200


def _parse_item_created_at(value: Any) -> datetime | None:
    return parse_created_at("" if value is None else str(value))


def _dedupe_sort_key(payload: dict[str, Any]) -> tuple[int, datetime, int]:
    created_at = _parse_item_created_at(payload.get("created_at_x"))
    fallback = datetime.max.replace(tzinfo=timezone.utc)
    return (1 if created_at is None else 0, created_at or fallback, int(payload["id"]))


def _item_created_at_sort_key(payload: dict[str, Any], direction: str) -> tuple[int, float, int]:
    created_at = _parse_item_created_at(payload.get("created_at_x"))
    item_id = int(payload["id"])
    if created_at is None:
        return (1, 0.0, item_id)
    timestamp = created_at.timestamp()
    return (0, timestamp if direction == "ASC" else -timestamp, item_id)


def _metric(item: SearchResult, key: str) -> int:
    metrics = item.raw.get("metrics", {}) if isinstance(item.raw, dict) else {}
    value = metrics.get(key, 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _threshold_pass(item: SearchResult, thresholds: dict[str, Any]) -> bool:
    mode = str(thresholds.get("mode", "OR")).upper()
    views = int(thresholds.get("views", 0) or 0)
    replies = int(thresholds.get("replies", 0) or 0)
    retweets = int(thresholds.get("retweets", 0) or 0)

    checks = []
    if views > 0:
        checks.append(_metric(item, "views") >= views)
    if replies > 0:
        checks.append(_metric(item, "replies") >= replies)
    if retweets > 0:
        checks.append(_metric(item, "retweets") >= retweets)

    if not checks:
        return True
    if mode == "AND":
        return all(checks)
    return any(checks)


def _search_result_to_raw(item: SearchResult) -> dict[str, Any]:
    return asdict(item)


def _dedupe_search_results(items: list[SearchResult]) -> list[SearchResult]:
    deduped: list[SearchResult] = []
    seen: set[str] = set()
    for item in items:
        key = build_source_dedupe_key(
            tweet_id=item.tweet_id,
            url=item.url,
            text=item.text,
            author=item.author,
        ) or canonicalize_source_url(item.url)
        if not key:
            key = f"{item.author}|{item.created_at}|{item.text[:120]}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


class DesktopService:
    def __init__(self, db_path: str | Path = SQLITE_DEFAULT, env_file: str | Path = ".env") -> None:
        self.db_path = Path(db_path)
        self.env_file = str(env_file)
        load_env_file(self.env_file)
        self._force_reload_x_env()
        self._ensure_builtin_rule_set()

    def _job_row_to_dict(self, row: Any) -> dict[str, Any]:
        payload = row_to_dict(row)
        stats = payload.pop("last_run_stats_json", None)
        if isinstance(stats, dict):
            payload["last_run_stats"] = stats
        elif isinstance(stats, str):
            try:
                payload["last_run_stats"] = json.loads(stats)
            except json.JSONDecodeError:
                payload["last_run_stats"] = {}
        else:
            payload["last_run_stats"] = {}
        payload["search_spec_json"] = normalize_search_spec(payload.get("search_spec_json"))
        payload["rule_set_summary"] = self._rule_set_summary_from_row(payload)
        return payload

    def _load_job_row(self, conn: Any, job_id: int) -> dict[str, Any] | None:
        row = conn.execute(
            """
            SELECT
                j.*,
                rs.name AS rule_set_name,
                rs.description AS rule_set_description,
                rs.is_builtin AS rule_set_is_builtin,
                rs.is_enabled AS rule_set_is_enabled,
                rs.version AS rule_set_version,
                r.id AS last_run_id,
                r.status AS last_run_status,
                r.started_at AS last_run_started_at,
                r.ended_at AS last_run_ended_at,
                r.error_text AS last_run_error_text,
                r.stats_json AS last_run_stats_json
            FROM search_jobs AS j
            LEFT JOIN rule_sets AS rs ON rs.id = j.rule_set_id
            LEFT JOIN search_runs AS r
              ON r.id = (
                SELECT sr.id
                FROM search_runs AS sr
                WHERE sr.job_id = j.id
                ORDER BY sr.id DESC
                LIMIT 1
              )
            WHERE j.id = ?
            """,
            (job_id,),
        ).fetchone()
        return self._job_row_to_dict(row) if row is not None else None

    def _job_where_clause(self, query: str | None, status: str | None) -> tuple[str, list[Any]]:
        where: list[str] = []
        params: list[Any] = []
        normalized_status = str(status or "active").strip().lower()
        if normalized_status == "deleted":
            where.append("j.deleted_at IS NOT NULL")
        elif normalized_status == "all":
            pass
        elif normalized_status == "disabled":
            where.append("j.deleted_at IS NULL AND j.enabled = 0")
        else:
            where.append("j.deleted_at IS NULL")
            if normalized_status == "enabled":
                where.append("j.enabled = 1")

        if query:
            token = f"%{query.strip()}%"
            where.append("(j.name LIKE ? OR j.keywords_json LIKE ?)")
            params.extend([token, token])

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        return where_sql, params

    def _force_reload_x_env(self) -> None:
        # load_env_file uses setdefault, which won't overwrite stale inherited values.
        # For X auth stability in long-running collector processes, force-refresh these keys.
        env_path = Path(self.env_file)
        if not env_path.exists():
            return
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key in {"TWITTER_AUTH_TOKEN", "TWITTER_CT0", "TWITTER_BROWSER", "TWITTER_CHROME_PROFILE"}:
                os.environ[key] = value.strip().strip('"').strip("'")

    def _ensure_builtin_rule_set(self) -> None:
        now = utc_now_iso()
        definition = normalize_rule_set_definition(default_rule_set_definition())
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT id FROM rule_sets WHERE is_builtin = 1 ORDER BY id ASC LIMIT 1").fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO rule_sets (name, description, is_enabled, is_builtin, version, definition_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "默认机会发现规则",
                        "兼容旧版机会发现逻辑的内置规则模板，可在 UI 中复制后自由调整。",
                        1,
                        1,
                        1,
                        json.dumps(definition, ensure_ascii=False),
                        now,
                        now,
                    ),
                )
                return
            conn.execute(
                """
                UPDATE rule_sets
                SET definition_json = ?, updated_at = ?, is_enabled = 1
                WHERE id = ?
                """,
                (json.dumps(definition, ensure_ascii=False), now, int(row["id"])),
            )

    def _rule_set_summary_from_row(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        rule_set_id = payload.get("rule_set_id")
        if rule_set_id is None:
            return None
        return {
            "id": int(rule_set_id),
            "name": payload.get("rule_set_name", ""),
            "description": payload.get("rule_set_description", ""),
            "is_builtin": bool(payload.get("rule_set_is_builtin")),
            "is_enabled": bool(payload.get("rule_set_is_enabled", True)),
            "version": int(payload.get("rule_set_version", 1) or 1),
        }

    def _load_rule_set_row(self, conn: Any, rule_set_id: int) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM rule_sets WHERE id = ?", (rule_set_id,)).fetchone()
        if row is None:
            return None
        payload = row_to_dict(row)
        payload["definition_json"] = normalize_rule_set_definition(payload.get("definition_json"))
        return payload

    def _get_default_rule_set_id(self) -> int:
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT id FROM rule_sets WHERE is_builtin = 1 ORDER BY id ASC LIMIT 1").fetchone()
            if row is None:
                raise RuntimeError("default rule set missing")
            return int(row["id"])

    def _resolve_rule_set(self, rule_set_id: int | None = None, inline_rule_set: dict[str, Any] | None = None) -> dict[str, Any]:
        if inline_rule_set:
            return {
                "id": int(rule_set_id or 0),
                "name": str(inline_rule_set.get("name") or "临时规则集"),
                "description": str(inline_rule_set.get("description") or ""),
                "is_enabled": True,
                "is_builtin": False,
                "version": int(inline_rule_set.get("version", 1) or 1),
                "definition_json": normalize_rule_set_definition(inline_rule_set.get("definition") or inline_rule_set),
            }
        resolved_id = int(rule_set_id or self._get_default_rule_set_id())
        with connect(self.db_path) as conn:
            row = self._load_rule_set_row(conn, resolved_id)
        if row is None:
            raise ValueError(f"rule_set {resolved_id} not found")
        return row

    def _job_keywords_preview(self, search_spec: dict[str, Any]) -> list[str]:
        preview: list[str] = []
        preview.extend(search_spec.get("all_keywords", []))
        preview.extend(search_spec.get("exact_phrases", []))
        preview.extend(search_spec.get("any_keywords", []))
        return preview[:12]

    def _load_health_snapshots(self) -> dict[str, dict[str, Any]]:
        snapshots: dict[str, dict[str, Any]] = {}
        with connect(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM runtime_health_snapshot").fetchall()
        for row in rows:
            payload = row_to_dict(row)
            detail = payload.get("detail_json", {})
            snapshots[str(payload["target"])] = {
                "configured": bool(payload.get("configured")),
                "connected": bool(payload.get("connected")),
                "detail": detail if isinstance(detail, dict) else {},
                "last_checked_at": payload.get("last_checked_at") or "",
                "last_error": payload.get("last_error") or "",
            }
        return snapshots

    def _save_health_snapshot(
        self,
        target: str,
        configured: bool,
        connected: bool,
        detail: dict[str, Any],
        last_checked_at: str,
        last_error: str,
    ) -> None:
        with connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO runtime_health_snapshot (target, configured, connected, detail_json, last_checked_at, last_error)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(target) DO UPDATE SET
                    configured = excluded.configured,
                    connected = excluded.connected,
                    detail_json = excluded.detail_json,
                    last_checked_at = excluded.last_checked_at,
                    last_error = excluded.last_error
                """,
                (
                    target,
                    1 if configured else 0,
                    1 if connected else 0,
                    json.dumps(detail, ensure_ascii=False),
                    last_checked_at,
                    last_error or None,
                ),
            )

    def _merge_health_snapshot(
        self,
        target: str,
        previous: dict[str, Any] | None,
        configured: bool,
        connected: bool,
        detail: dict[str, Any],
        checked_at: str,
        last_error: str,
    ) -> dict[str, Any]:
        previous = previous or {}
        previous_detail = previous.get("detail", {}) if isinstance(previous.get("detail"), dict) else {}

        if connected:
            resolved_connected = True
            resolved_detail = {**previous_detail, **detail}
        else:
            resolved_connected = bool(previous.get("connected")) and configured
            resolved_detail = {**previous_detail, **detail}

        snapshot = {
            "configured": configured,
            "connected": resolved_connected,
            "detail": resolved_detail,
            "last_checked_at": checked_at,
            "last_error": last_error,
        }
        self._save_health_snapshot(
            target=target,
            configured=configured,
            connected=resolved_connected,
            detail=resolved_detail,
            last_checked_at=checked_at,
            last_error=last_error,
        )
        return snapshot

    def _probe_database_health(self) -> tuple[bool, bool, dict[str, Any], str]:
        db_path = self.db_path.resolve()
        detail: dict[str, Any] = {
            "db_path": str(db_path),
            "db_exists": db_path.exists(),
            "job_count": 0,
            "run_count": 0,
        }
        configured = True
        try:
            with connect(self.db_path) as conn:
                conn.execute("SELECT 1").fetchone()
                detail["job_count"] = int(conn.execute("SELECT COUNT(1) FROM search_jobs").fetchone()[0])
                detail["run_count"] = int(conn.execute("SELECT COUNT(1) FROM search_runs").fetchone()[0])
            return configured, True, detail, ""
        except Exception as exc:  # noqa: BLE001
            return configured, False, detail, str(exc)

    def _probe_x_health(self) -> tuple[bool, bool, dict[str, Any], str]:
        browser_hint = os.getenv("TWITTER_BROWSER") or "default"
        has_env_auth = bool(os.getenv("TWITTER_AUTH_TOKEN") and os.getenv("TWITTER_CT0"))
        auth_source = "environment" if has_env_auth else "unknown"
        configured = has_env_auth
        try:
            find_twitter_cli()
            auth_source = "twitter-cli"
            configured = True
        except Exception:
            pass

        detail = {
            "auth_source": auth_source,
            "browser_hint": browser_hint if configured else "unknown",
            "account_hint": "unknown",
        }
        if not configured:
            return False, False, detail, "x_not_configured"

        try:
            run_twitter_search("from:Galxe", 1, timeout_seconds=15)
            return True, True, detail, ""
        except Exception as exc:  # noqa: BLE001
            return True, False, detail, str(exc)

    def list_rule_sets(self) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM rule_sets ORDER BY is_builtin DESC, updated_at DESC, id DESC").fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            payload = row_to_dict(row)
            payload["definition_json"] = normalize_rule_set_definition(payload.get("definition_json"))
            items.append(payload)
        return {"items": items}

    def get_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = self._load_rule_set_row(conn, rule_set_id)
        if row is None:
            raise ValueError(f"rule_set {rule_set_id} not found")
        return row

    def create_rule_set(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        definition = normalize_rule_set_definition(payload.get("definition") or payload.get("definition_json"))
        with connect(self.db_path) as conn:
            cur = conn.execute(
                """
                INSERT INTO rule_sets (name, description, is_enabled, is_builtin, version, definition_json, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                """,
                (
                    str(payload.get("name") or "鏂拌鍒欓泦").strip(),
                    str(payload.get("description") or "").strip(),
                    1 if payload.get("is_enabled", True) else 0,
                    int(payload.get("version", 1) or 1),
                    json.dumps(definition, ensure_ascii=False),
                    now,
                    now,
                ),
            )
            rule_set_id = int(cur.lastrowid)
            row = self._load_rule_set_row(conn, rule_set_id)
        return row or {}

    def update_rule_set(self, rule_set_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            current = self._load_rule_set_row(conn, rule_set_id)
            if current is None:
                raise ValueError(f"rule_set {rule_set_id} not found")
            if current.get("is_builtin") and payload.get("delete_builtin"):
                raise ValueError("cannot delete builtin rule set")
            definition = normalize_rule_set_definition(payload.get("definition") or payload.get("definition_json") or current["definition_json"])
            conn.execute(
                """
                UPDATE rule_sets
                SET name = ?, description = ?, is_enabled = ?, version = ?, definition_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    str(payload.get("name") or current["name"]).strip(),
                    str(payload.get("description") if "description" in payload else current["description"]).strip(),
                    1 if payload.get("is_enabled", bool(current.get("is_enabled", True))) else 0,
                    int(payload.get("version", int(current.get("version", 1) or 1)) or 1),
                    json.dumps(definition, ensure_ascii=False),
                    now,
                    rule_set_id,
                ),
            )
            row = self._load_rule_set_row(conn, rule_set_id)
        return row or {}

    def delete_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = self._load_rule_set_row(conn, rule_set_id)
            if row is None:
                raise ValueError(f"rule_set {rule_set_id} not found")
            if row.get("is_builtin"):
                raise ValueError("builtin rule set cannot be deleted")
            in_use = conn.execute("SELECT COUNT(1) FROM search_jobs WHERE rule_set_id = ?", (rule_set_id,)).fetchone()[0]
            if int(in_use) > 0:
                raise ValueError("rule set is referenced by existing jobs")
            conn.execute("DELETE FROM rule_sets WHERE id = ?", (rule_set_id,))
        return row

    def clone_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        original = self.get_rule_set(rule_set_id)
        return self.create_rule_set(
            {
                "name": f"{original['name']} - 副本",
                "description": original.get("description", ""),
                "is_enabled": True,
                "version": int(original.get("version", 1) or 1) + 1,
                "definition": original["definition_json"],
            }
        )

    def create_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        interval = int(payload["interval_minutes"])
        next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat()
        search_spec = normalize_search_spec(
            payload.get("search_spec")
            or {
                "keywords": payload.get("keywords", []),
                "days": payload.get("days", 20),
                "thresholds": payload.get("thresholds", {}),
            }
        )
        rule_set_id = int(payload.get("rule_set_id") or self._get_default_rule_set_id())
        with connect(self.db_path) as conn:
            cur = conn.execute(
                """
                INSERT INTO search_jobs
                (name, keywords_json, interval_minutes, days, thresholds_json, levels_json, enabled, next_run_at, deleted_at, created_at, updated_at, search_spec_json, rule_set_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["name"],
                    json.dumps(self._job_keywords_preview(search_spec), ensure_ascii=False),
                    interval,
                    int(search_spec.get("days", 20)),
                    json.dumps(
                        {
                            **search_spec.get("min_metrics", {}),
                            "mode": search_spec.get("metric_mode", "OR"),
                        },
                        ensure_ascii=False,
                    ),
                    json.dumps(payload.get("levels", []), ensure_ascii=False),
                    1 if payload.get("enabled", True) else 0,
                    next_run_at if payload.get("enabled", True) else None,
                    None,
                    now,
                    now,
                    json.dumps(search_spec, ensure_ascii=False),
                    rule_set_id,
                ),
            )
            job_id = int(cur.lastrowid)
            row = self._load_job_row(conn, job_id)
        return row or {}

    def list_jobs(
        self,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
        status: str | None = "active",
    ) -> dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._job_where_clause(query, status)
        with connect(self.db_path) as conn:
            total = conn.execute(f"SELECT COUNT(1) FROM search_jobs AS j {where_sql}", tuple(params)).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT
                    j.*,
                    rs.name AS rule_set_name,
                    rs.description AS rule_set_description,
                    rs.is_builtin AS rule_set_is_builtin,
                    rs.is_enabled AS rule_set_is_enabled,
                    rs.version AS rule_set_version,
                    r.id AS last_run_id,
                    r.status AS last_run_status,
                    r.started_at AS last_run_started_at,
                    r.ended_at AS last_run_ended_at,
                    r.error_text AS last_run_error_text,
                    r.stats_json AS last_run_stats_json
                FROM search_jobs AS j
                LEFT JOIN rule_sets AS rs ON rs.id = j.rule_set_id
                LEFT JOIN search_runs AS r
                  ON r.id = (
                    SELECT sr.id
                    FROM search_runs AS sr
                    WHERE sr.job_id = j.id
                    ORDER BY sr.id DESC
                    LIMIT 1
                  )
                {where_sql}
                ORDER BY
                    CASE WHEN j.deleted_at IS NULL THEN 0 ELSE 1 END,
                    j.updated_at DESC,
                    j.id DESC
                LIMIT ? OFFSET ?
                """,
                tuple(params + [page_size, offset]),
            ).fetchall()
        return {
            "page": page,
            "page_size": page_size,
            "total": int(total),
            "items": [self._job_row_to_dict(row) for row in rows],
        }

    def get_job(self, job_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = self._load_job_row(conn, job_id)
        if row is None:
            raise ValueError(f"job {job_id} not found")
        return row

    def update_job(self, job_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise ValueError(f"job {job_id} not found")
            current = row_to_dict(row)
            if current.get("deleted_at"):
                raise ValueError(f"job {job_id} is deleted")

            name = str(payload.get("name", current["name"])).strip()
            interval = int(payload.get("interval_minutes", current["interval_minutes"]))
            existing_search_spec = normalize_search_spec(current.get("search_spec_json"))
            incoming_search_spec = payload.get("search_spec")
            if incoming_search_spec is not None:
                search_spec = normalize_search_spec(incoming_search_spec)
            elif any(key in payload for key in ("keywords", "days", "thresholds")):
                search_spec = normalize_search_spec(
                    {
                        "keywords": payload.get("keywords", existing_search_spec.get("all_keywords", [])),
                        "days": payload.get("days", existing_search_spec.get("days", current["days"])),
                        "thresholds": payload.get("thresholds", existing_search_spec.get("min_metrics", {})),
                    }
                )
            else:
                search_spec = normalize_search_spec(existing_search_spec)
            levels = payload.get("levels", current.get("levels_json", []))
            enabled = bool(payload.get("enabled", bool(current["enabled"])))
            rule_set_id = int(payload.get("rule_set_id", current.get("rule_set_id") or self._get_default_rule_set_id()))

            next_run_at = None
            if enabled:
                next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat()

            conn.execute(
                """
                UPDATE search_jobs
                SET name = ?, keywords_json = ?, interval_minutes = ?, days = ?, thresholds_json = ?,
                    levels_json = ?, enabled = ?, next_run_at = ?, updated_at = ?, search_spec_json = ?, rule_set_id = ?
                WHERE id = ?
                """,
                (
                    name,
                    json.dumps(self._job_keywords_preview(search_spec), ensure_ascii=False),
                    interval,
                    int(search_spec.get("days", current["days"])),
                    json.dumps(
                        {
                            **search_spec.get("min_metrics", {}),
                            "mode": search_spec.get("metric_mode", "OR"),
                        },
                        ensure_ascii=False,
                    ),
                    json.dumps(levels, ensure_ascii=False) if not isinstance(levels, str) else levels,
                    1 if enabled else 0,
                    next_run_at,
                    now,
                    json.dumps(search_spec, ensure_ascii=False),
                    rule_set_id,
                    job_id,
                ),
            )
            updated = self._load_job_row(conn, job_id)
        return updated or {}

    def delete_job(self, job_id: int) -> dict[str, Any]:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise ValueError(f"job {job_id} not found")
            conn.execute(
                """
                UPDATE search_jobs
                SET enabled = 0, next_run_at = NULL, deleted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, job_id),
            )
            updated = self._load_job_row(conn, job_id)
        return updated or {}

    def restore_job(self, job_id: int) -> dict[str, Any]:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise ValueError(f"job {job_id} not found")
            conn.execute(
                "UPDATE search_jobs SET deleted_at = NULL, enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?",
                (now, job_id),
            )
            updated = self._load_job_row(conn, job_id)
        return updated or {}

    def purge_job(self, job_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = self._load_job_row(conn, job_id)
            if row is None:
                raise ValueError(f"job {job_id} not found")
            conn.execute("DELETE FROM search_runs WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM search_jobs WHERE id = ?", (job_id,))
        return row

    def toggle_job(self, job_id: int, enabled: bool) -> dict[str, Any]:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise ValueError(f"job {job_id} not found")
            if row["deleted_at"]:
                raise ValueError(f"job {job_id} is deleted")
            interval = int(row["interval_minutes"])
            next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat() if enabled else None
            conn.execute(
                "UPDATE search_jobs SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?",
                (1 if enabled else 0, next_run_at, now, job_id),
            )
            updated = self._load_job_row(conn, job_id)
        return updated or {}

    def run_job_now(self, job_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise ValueError(f"job {job_id} not found")
            if row["deleted_at"]:
                raise ValueError(f"job {job_id} is deleted")
            job = row_to_dict(row)
        report = self.run_manual(
            {
                "search_spec": normalize_search_spec(job.get("search_spec_json")),
                "rule_set_id": job.get("rule_set_id") or self._get_default_rule_set_id(),
            },
            trigger_type="auto",
            job_id=job_id,
        )
        with connect(self.db_path) as conn:
            next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=int(job["interval_minutes"]))).isoformat()
            conn.execute("UPDATE search_jobs SET next_run_at = ?, updated_at = ? WHERE id = ?", (next_run_at, utc_now_iso(), job_id))
        return report

    def run_manual(self, payload: dict[str, Any], trigger_type: str = "manual", job_id: int | None = None) -> dict[str, Any]:
        if payload.get("search_spec") is not None:
            search_spec = normalize_search_spec(payload.get("search_spec"))
        else:
            search_spec = normalize_search_spec(
                {
                    "keywords": payload.get("keywords", []),
                    "days": payload.get("days", 20),
                    "thresholds": payload.get("thresholds", {}),
                    "max_results": payload.get("max_results", 40),
                }
            )
        final_queries = build_query_plan_from_search_spec(search_spec)
        final_query = build_query_from_search_spec(search_spec)
        if len(final_queries) > 1:
            final_query = " || ".join(final_queries)
        if not search_spec.get("all_keywords") and not search_spec.get("raw_query") and not final_queries:
            raise ValueError("search_spec is empty")
        if not final_queries and final_query:
            final_queries = [final_query]
        rule_set = self._resolve_rule_set(
            rule_set_id=int(payload.get("rule_set_id") or 0) or None,
            inline_rule_set=payload.get("rule_set"),
        )
        days = int(search_spec.get("days", 20))

        run_id = self._create_run(job_id=job_id, trigger_type=trigger_type)
        try:
            fetched_results: list[SearchResult] = []
            query_errors: list[str] = []
            for index, query in enumerate(final_queries, start=1):
                try:
                    raw_payload = run_twitter_search(query, int(search_spec.get("max_results", 40)))
                    normalized = normalize_search_payload(f"{trigger_type}:{index}", raw_payload, query)
                    fetched_results.extend(normalized)
                except Exception as exc:  # noqa: BLE001
                    query_errors.append(f"{query}: {exc}")

            if not fetched_results and query_errors:
                raise RuntimeError("; ".join(query_errors[:3]))

            deduped_results = _dedupe_search_results(fetched_results)
            self._store_raw(run_id, deduped_results)

            now_utc = datetime.now(timezone.utc)
            filtered_results = [item for item in deduped_results if passes_search_filters(item, search_spec, now_utc)]
            matched_items, match_stats = evaluate_rule_set(
                items=filtered_results,
                rule_definition=rule_set["definition_json"],
                now_utc=now_utc,
                fallback_days=days,
            )
            self._store_curated(run_id, matched_items, int(rule_set.get("id") or 0) or None)

            run_errors = query_errors[:10]
            dedupe_stats: dict[str, Any] = {}
            if matched_items:
                try:
                    dedupe_summary = self.dedupe_items()
                    dedupe_stats = {
                        "dedupe_groups": int(dedupe_summary.get("groups", 0) or 0),
                        "dedupe_deleted": int(dedupe_summary.get("deleted", 0) or 0),
                        "dedupe_kept": int(dedupe_summary.get("kept", 0) or 0),
                        "dedupe_rows_after": int(dedupe_summary.get("rows_after", 0) or 0),
                    }
                except Exception as exc:  # noqa: BLE001
                    dedupe_stats = {"dedupe_failed": 1}
                    if len(run_errors) >= 10:
                        run_errors = run_errors[:9]
                    run_errors.append(f"auto dedupe failed: {exc}")

            raw_items = [serialize_search_result(item) for item in filtered_results[:100]]
            rule_set_summary = {
                "id": int(rule_set.get("id") or 0) if rule_set.get("id") else None,
                "name": rule_set.get("name", ""),
                "description": rule_set.get("description", ""),
                "version": int(rule_set.get("version", 1) or 1),
                "is_builtin": bool(rule_set.get("is_builtin")),
            }

            report = {
                "run_id": run_id,
                "status": "success",
                "search_spec": search_spec,
                "final_query": final_query,
                "final_queries": final_queries,
                "rule_set_summary": rule_set_summary,
                "raw_total": len(filtered_results),
                "matched_total": len(matched_items),
                "raw_items": raw_items,
                "matched_items": matched_items[:100],
                "stats": {
                    "queries": len(final_queries),
                    "fetched_raw": len(fetched_results),
                    "raw_deduped": len(deduped_results),
                    "raw": len(filtered_results),
                    "search_filter_passed": len(filtered_results),
                    "query_errors": len(query_errors),
                    **match_stats,
                    **dedupe_stats,
                },
                "errors": run_errors,
            }
            self._finish_run(run_id, "success", report["stats"], "")
            return report
        except Exception as exc:  # noqa: BLE001
            self._finish_run(run_id, "failed", {}, str(exc))
            raise

    def get_run(self, run_id: int) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT * FROM search_runs WHERE id = ?", (run_id,)).fetchone()
            if row is None:
                raise ValueError(f"run {run_id} not found")
            return row_to_dict(row)

    def list_runs(self, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(200, int(page_size or 50)))
        offset = (page - 1) * page_size
        with connect(self.db_path) as conn:
            total = int(conn.execute("SELECT COUNT(1) FROM search_runs").fetchone()[0])
            rows = conn.execute(
                """
                SELECT id, job_id, trigger_type, status, started_at, ended_at, error_text, stats_json
                FROM search_runs
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                (page_size, offset),
            ).fetchall()
        return {"page": page, "page_size": page_size, "total": total, "items": [row_to_dict(row) for row in rows]}

    def get_runtime_logs(self) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        for name in RUNTIME_LOG_FILES:
            path = RUNTIME_LOG_DIR / name
            exists = path.exists()
            payload: dict[str, Any] = {
                "name": name,
                "exists": exists,
                "size": int(path.stat().st_size) if exists else 0,
                "updated_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat() if exists else "",
                "content": "",
            }
            if exists:
                try:
                    payload["content"] = path.read_text(encoding="utf-8", errors="replace")
                except OSError as exc:
                    payload["error"] = str(exc)
            items.append(payload)
        return {"items": items}

    def _normalize_item_sort(self, sort_by: str | None, sort_dir: str | None) -> tuple[str, str]:
        requested = str(sort_by or "").strip()
        if requested in ITEM_SORT_FIELDS:
            direction = "ASC" if str(sort_dir or "").strip().lower() == "asc" else "DESC"
            return ITEM_SORT_FIELDS[requested], direction
        return ITEM_SORT_FIELDS["id"], "DESC"

    def _normalize_item_ids(self, ids: list[Any] | None) -> list[int]:
        normalized: list[int] = []
        seen: set[int] = set()
        for raw in ids or []:
            item_id = int(raw)
            if item_id in seen:
                continue
            seen.add(item_id)
            normalized.append(item_id)
        return normalized

    def _item_where_clause(self, level: str | None = None, keyword: str | None = None) -> tuple[str, list[Any]]:
        where: list[str] = []
        params: list[Any] = []
        normalized_level = str(level or "").strip()
        if normalized_level:
            where.append("level = ?")
            params.append(normalized_level.upper())
        normalized_keyword = str(keyword or "").strip()
        if normalized_keyword:
            token = f"%{normalized_keyword}%"
            where.append("(title LIKE ? OR excerpt LIKE ?)")
            params.extend([token, token])
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        return where_sql, params

    def list_items(
        self,
        page: int = 1,
        page_size: int = 50,
        level: str | None = None,
        keyword: str | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(MAX_ITEM_PAGE_SIZE, int(page_size or 50)))
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._item_where_clause(level=level, keyword=keyword)
        sort_column, sort_direction = self._normalize_item_sort(sort_by, sort_dir)
        selected_fields = ", ".join(ITEM_FIELDS)
        with connect(self.db_path) as conn:
            total = conn.execute(f"SELECT COUNT(1) FROM x_items_curated {where_sql}", tuple(params)).fetchone()[0]
            if sort_column == "created_at_x":
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_curated
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
            else:
                order_sql = f"{sort_column} {sort_direction}" if sort_column == "id" else f"{sort_column} {sort_direction}, id ASC"
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_curated
                    {where_sql}
                    ORDER BY {order_sql}
                    LIMIT ? OFFSET ?
                    """,
                    tuple(params + [page_size, offset]),
                ).fetchall()
        items = [row_to_dict(row) for row in rows]
        if sort_column == "created_at_x":
            items = sorted(items, key=lambda item: _item_created_at_sort_key(item, sort_direction))
            items = items[offset : offset + page_size]
        return {
            "page": page,
            "page_size": page_size,
            "total": int(total),
            "items": items,
        }

    def delete_item(self, item_id: int) -> dict[str, Any]:
        normalized_id = int(item_id)
        with connect(self.db_path) as conn:
            row = conn.execute("SELECT id FROM x_items_curated WHERE id = ?", (normalized_id,)).fetchone()
            if row is None:
                raise ValueError(f"item {normalized_id} not found")
            conn.execute("DELETE FROM x_items_curated WHERE id = ?", (normalized_id,))
        return {"id": normalized_id, "deleted": 1}

    def delete_items(self, ids: list[int]) -> dict[str, Any]:
        normalized_ids = self._normalize_item_ids(ids)
        if not normalized_ids:
            return {"ids": [], "deleted": 0}
        placeholders = ", ".join("?" for _ in normalized_ids)
        with connect(self.db_path) as conn:
            existing_rows = conn.execute(
                f"SELECT id FROM x_items_curated WHERE id IN ({placeholders})",
                tuple(normalized_ids),
            ).fetchall()
            existing_ids = {int(row["id"]) for row in existing_rows}
            delete_ids = [item_id for item_id in normalized_ids if item_id in existing_ids]
            if delete_ids:
                delete_placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM x_items_curated WHERE id IN ({delete_placeholders})",
                    tuple(delete_ids),
                )
        return {"ids": normalized_ids, "deleted": len(delete_ids)}

    def delete_items_matching(self, keyword: str | None = None, level: str | None = None) -> dict[str, Any]:
        where_sql, params = self._item_where_clause(level=level, keyword=keyword)
        with connect(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT id FROM x_items_curated {where_sql} ORDER BY id ASC",
                tuple(params),
            ).fetchall()
            delete_ids = [int(row["id"]) for row in rows]
            if delete_ids:
                placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM x_items_curated WHERE id IN ({placeholders})",
                    tuple(delete_ids),
                )
        return {"ids": [], "deleted": len(delete_ids)}

    def dedupe_items(self) -> dict[str, Any]:
        with connect(self.db_path) as conn:
            rows_before = int(conn.execute("SELECT COUNT(1) FROM x_items_curated").fetchone()[0])
            rows = [
                row_to_dict(row)
                for row in conn.execute(
                    """
                    SELECT id, dedupe_key, created_at_x
                    FROM x_items_curated
                    WHERE TRIM(COALESCE(dedupe_key, '')) <> ''
                    ORDER BY dedupe_key ASC, id ASC
                    """
                ).fetchall()
            ]
            grouped: dict[str, list[dict[str, Any]]] = {}
            for row in rows:
                grouped.setdefault(str(row.get("dedupe_key") or ""), []).append(row)

            delete_ids: list[int] = []
            duplicate_groups = 0
            kept = 0
            for items in grouped.values():
                if len(items) < 2:
                    continue
                duplicate_groups += 1
                ranked = sorted(items, key=_dedupe_sort_key)
                kept += 1
                delete_ids.extend(int(item["id"]) for item in ranked[1:])

            if delete_ids:
                placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM x_items_curated WHERE id IN ({placeholders})",
                    tuple(delete_ids),
                )
            rows_after = int(conn.execute("SELECT COUNT(1) FROM x_items_curated").fetchone()[0])
        return {
            "groups": duplicate_groups,
            "deleted": len(delete_ids),
            "kept": kept,
            "rows_before": rows_before,
            "rows_after": rows_after,
        }

    def health(self) -> dict[str, Any]:
        previous = self._load_health_snapshots()
        checked_at = utc_now_iso()
        db_configured, db_connected, db_detail, db_error = self._probe_database_health()
        x_configured, x_connected, x_detail, x_error = self._probe_x_health()

        db_snapshot = self._merge_health_snapshot(
            "db",
            previous.get("db"),
            db_configured,
            db_connected,
            db_detail,
            checked_at,
            db_error,
        )
        x_snapshot = self._merge_health_snapshot(
            "x",
            previous.get("x"),
            x_configured,
            x_connected,
            x_detail,
            checked_at,
            x_error,
        )

        return {
            "summary": {
                "updated_at": checked_at,
                "source": "backend_snapshot",
            },
            "db": {
                "configured": db_snapshot["configured"],
                "connected": db_snapshot["connected"],
                "db_path": db_snapshot["detail"].get("db_path", ""),
                "db_exists": bool(db_snapshot["detail"].get("db_exists")),
                "job_count": int(db_snapshot["detail"].get("job_count", 0) or 0),
                "run_count": int(db_snapshot["detail"].get("run_count", 0) or 0),
                "last_checked_at": db_snapshot["last_checked_at"],
                "last_error": db_snapshot["last_error"],
            },
            "x": {
                "configured": x_snapshot["configured"],
                "connected": x_snapshot["connected"],
                "auth_source": x_snapshot["detail"].get("auth_source", "unknown"),
                "browser_hint": x_snapshot["detail"].get("browser_hint", "unknown"),
                "account_hint": x_snapshot["detail"].get("account_hint", "unknown"),
                "last_checked_at": x_snapshot["last_checked_at"],
                "last_error": x_snapshot["last_error"],
            },
        }

    def tick(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        triggered = 0
        failed = 0
        with connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM search_jobs
                WHERE enabled = 1
                  AND next_run_at IS NOT NULL
                  AND next_run_at <= ?
                ORDER BY id ASC
                """,
                (now.isoformat(),),
            ).fetchall()
            jobs = [row_to_dict(row) for row in rows]
        for job in jobs:
            try:
                self.run_job_now(int(job["id"]))
                triggered += 1
            except Exception:
                failed += 1
        return {"triggered": triggered, "failed": failed}

    def _create_run(self, job_id: int | None, trigger_type: str) -> int:
        with connect(self.db_path) as conn:
            cur = conn.execute(
                """
                INSERT INTO search_runs (job_id, trigger_type, status, stats_json, started_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, trigger_type, "running", "{}", utc_now_iso()),
            )
            return int(cur.lastrowid)

    def _finish_run(self, run_id: int, status: str, stats: dict[str, Any], error_text: str) -> None:
        with connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE search_runs
                SET status = ?, stats_json = ?, ended_at = ?, error_text = ?
                WHERE id = ?
                """,
                (status, json.dumps(stats, ensure_ascii=False), utc_now_iso(), error_text or None, run_id),
            )

    def _store_raw(self, run_id: int, items: list[SearchResult]) -> None:
        now = utc_now_iso()
        with connect(self.db_path) as conn:
            for item in items:
                canonical_url = canonicalize_source_url(item.url)
                metrics = item.raw.get("metrics", {}) if isinstance(item.raw, dict) else {}
                conn.execute(
                    """
                    INSERT INTO x_items_raw
                    (run_id, tweet_id, canonical_url, author, text, created_at_x, metrics_json, query_name, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        item.tweet_id,
                        canonical_url,
                        item.author,
                        item.text,
                        item.created_at,
                        json.dumps(metrics, ensure_ascii=False),
                        item.query_name,
                        now,
                    ),
                )

    def _store_curated(self, run_id: int, curated_items: list[dict[str, Any]], rule_set_id: int | None) -> None:
        with connect(self.db_path) as conn:
            for item in curated_items:
                dedupe_key = build_source_dedupe_key(
                    tweet_id=item.get("tweet_id"),
                    url=item.get("url"),
                    text=item.get("text"),
                    author=item.get("author"),
                ) or ""
                conn.execute(
                    """
                    INSERT INTO x_items_curated
                    (run_id, dedupe_key, level, score, title, summary_zh, excerpt, is_zero_cost, source_url, author, created_at_x, reasons_json, rule_set_id, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        dedupe_key,
                        item.get("level", ""),
                        int(item.get("score", 0) or 0),
                        item.get("title", ""),
                        item.get("summary", ""),
                        " ".join((item.get("text", "") or "").split())[:900],
                        1,
                        item.get("url", ""),
                        item.get("author", ""),
                        item.get("created_at", ""),
                        json.dumps(item.get("reasons", []), ensure_ascii=False),
                        rule_set_id,
                        "new",
                    ),
                )

    def _update_curated_state(self, row_id: int, state: str) -> None:
        with connect(self.db_path) as conn:
            conn.execute("UPDATE x_items_curated SET state = ? WHERE id = ?", (state, row_id))




