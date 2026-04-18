from __future__ import annotations

import copy
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
from backend.workspace_store import RuntimeStateStore, WorkspaceStore, default_builtin_rule_set

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

CURATED_ITEM_FIELDS = (
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
CURATED_ITEM_SORT_FIELDS = {field: field for field in CURATED_ITEM_FIELDS}
RAW_ITEM_DB_FIELDS = (
    "id",
    "run_id",
    "tweet_id",
    "canonical_url",
    "author",
    "text",
    "created_at_x",
    "metrics_json",
    "query_name",
    "fetched_at",
)
RAW_ITEM_FIELDS = (
    "id",
    "run_id",
    "tweet_id",
    "canonical_url",
    "author",
    "text",
    "created_at_x",
    "views",
    "likes",
    "replies",
    "retweets",
    "query_name",
    "fetched_at",
)
RAW_ITEM_SORT_FIELDS = {field: field for field in RAW_ITEM_FIELDS}
RAW_ITEM_PYTHON_SORT_FIELDS = {"created_at_x", "views", "likes", "replies", "retweets"}
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


def _number_sort_key(payload: dict[str, Any], field: str, direction: str) -> tuple[int, int]:
    item_id = int(payload["id"])
    value = payload.get(field, 0)
    try:
        numeric = int(value or 0)
    except (TypeError, ValueError):
        numeric = 0
    return (numeric if direction == "ASC" else -numeric, item_id)


def _raw_metrics(payload: dict[str, Any]) -> dict[str, int]:
    raw_metrics = payload.get("metrics_json", {})
    if not isinstance(raw_metrics, dict):
        raw_metrics = {}
    normalized: dict[str, int] = {}
    for key in ("views", "likes", "replies", "retweets"):
        value = raw_metrics.get(key, 0)
        try:
            normalized[key] = int(value or 0)
        except (TypeError, ValueError):
            normalized[key] = 0
    return normalized


def _raw_row_to_item(row: Any) -> dict[str, Any]:
    payload = row_to_dict(row)
    metrics = _raw_metrics(payload)
    return {
        "id": int(payload["id"]),
        "run_id": int(payload["run_id"]),
        "tweet_id": str(payload.get("tweet_id") or ""),
        "canonical_url": str(payload.get("canonical_url") or ""),
        "author": str(payload.get("author") or ""),
        "text": str(payload.get("text") or ""),
        "created_at_x": payload.get("created_at_x"),
        "views": metrics["views"],
        "likes": metrics["likes"],
        "replies": metrics["replies"],
        "retweets": metrics["retweets"],
        "query_name": str(payload.get("query_name") or ""),
        "fetched_at": payload.get("fetched_at"),
    }


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
    def __init__(
        self,
        db_path: str | Path = SQLITE_DEFAULT,
        env_file: str | Path = ".env",
        workspace_path: str | Path | None = None,
        runtime_dir: str | Path | None = None,
    ) -> None:
        self.db_path = Path(db_path)
        self.env_file = str(env_file)
        self.runtime_dir = Path(runtime_dir) if runtime_dir is not None else PROJECT_ROOT / "runtime"
        resolved_workspace_path = Path(workspace_path) if workspace_path is not None else PROJECT_ROOT / "config" / "workspace.json"
        self.workspace_store = WorkspaceStore(workspace_path=resolved_workspace_path, legacy_db_path=self.db_path)
        self.task_pack_store = self.workspace_store.pack_store
        self.runtime_store = RuntimeStateStore(
            runs_path=self.runtime_dir / "history" / "search_runs.jsonl",
            health_path=self.runtime_dir / "state" / "runtime_health_snapshot.json",
            sequence_path=self.runtime_dir / "state" / "sequences.json",
        )
        load_env_file(self.env_file)
        self._force_reload_x_env()
        with connect(self.db_path):
            pass
        self._ensure_builtin_rule_set()

    def get_workspace(self) -> dict[str, Any]:
        return self._ensure_builtin_rule_set()

    def update_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.workspace_store.update_workspace(payload)
        return self._ensure_builtin_rule_set()

    def import_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.workspace_store.import_workspace(payload)
        return self._ensure_builtin_rule_set()

    def export_workspace(self) -> dict[str, Any]:
        return self.get_workspace()

    def _workspace(self) -> dict[str, Any]:
        return self.workspace_store.get_workspace()

    def _save_workspace(self, workspace: dict[str, Any]) -> dict[str, Any]:
        return self.workspace_store.update_workspace(workspace)

    def _force_reload_x_env(self) -> None:
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

    def _ensure_builtin_rule_set(self) -> dict[str, Any]:
        return self.workspace_store.get_workspace()

    def _sorted_rule_sets(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sorted_items = [copy.deepcopy(item) for item in items]
        sorted_items.sort(key=lambda item: int(item.get("id") or 0), reverse=True)
        sorted_items.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        sorted_items.sort(key=lambda item: 0 if bool(item.get("is_builtin")) else 1)
        return sorted_items

    def _pack_rule_set_to_row(self, payload: dict[str, Any], *, updated_at: str) -> dict[str, Any]:
        return {
            "id": int(payload.get("id") or 0),
            "name": str(payload.get("name") or "").strip(),
            "description": str(payload.get("description") or "").strip(),
            "is_enabled": 1,
            "is_builtin": 1 if int(payload.get("id") or 0) == 1 else 0,
            "version": int(payload.get("version", 1) or 1),
            "definition_json": normalize_rule_set_definition(payload.get("definition") or payload.get("definition_json") or default_rule_set_definition()),
            "created_at": updated_at,
            "updated_at": updated_at,
        }

    def _rule_set_catalog(self) -> list[dict[str, Any]]:
        catalog: dict[int, dict[str, Any]] = {1: default_builtin_rule_set(rule_set_id=1)}
        for summary in self.task_pack_store.list_packs():
            try:
                pack = self.task_pack_store.get_pack(summary["pack_name"])
            except Exception:
                continue
            rule_set = pack.get("rule_set") or {}
            rule_set_id = int(rule_set.get("id") or 0)
            if rule_set_id <= 0 or rule_set_id == 1:
                continue
            catalog[rule_set_id] = self._pack_rule_set_to_row(rule_set, updated_at=str(pack.get("meta", {}).get("updated_at") or utc_now_iso()))
        return self._sorted_rule_sets(list(catalog.values()))

    def _find_rule_set(self, rule_set_id: int) -> dict[str, Any] | None:
        for item in self._rule_set_catalog():
            if int(item.get("id") or 0) == int(rule_set_id):
                row = copy.deepcopy(item)
                row["definition_json"] = normalize_rule_set_definition(row.get("definition_json"))
                return row
        return None

    def _build_rule_set_summary(self, payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if payload is None:
            return None
        return {
            "id": int(payload["id"]) if payload.get("id") is not None else None,
            "name": str(payload.get("name") or ""),
            "description": str(payload.get("description") or ""),
            "is_builtin": bool(payload.get("is_builtin")),
            "is_enabled": bool(payload.get("is_enabled", True)),
            "version": int(payload.get("version", 1) or 1),
        }

    def _get_default_rule_set_id(self) -> int:
        return 1

    def _resolve_rule_set(self, rule_set_id: int | None = None, inline_rule_set: dict[str, Any] | None = None) -> dict[str, Any]:
        if inline_rule_set:
            return {
                "id": int(inline_rule_set.get("id") or rule_set_id or 0) or None,
                "name": str(inline_rule_set.get("name") or "Inline Rule Set").strip(),
                "description": str(inline_rule_set.get("description") or "").strip(),
                "is_enabled": 1,
                "is_builtin": 0,
                "version": int(inline_rule_set.get("version", 1) or 1),
                "definition_json": normalize_rule_set_definition(inline_rule_set.get("definition") or inline_rule_set.get("definition_json") or inline_rule_set),
            }
        resolved_id = int(rule_set_id or self._get_default_rule_set_id())
        row = self._find_rule_set(resolved_id)
        if row is None:
            raise ValueError(f"rule_set {resolved_id} not found")
        return row

    def _job_keywords_preview(self, search_spec: dict[str, Any]) -> list[str]:
        preview: list[str] = []
        preview.extend(search_spec.get("all_keywords", []))
        preview.extend(search_spec.get("exact_phrases", []))
        preview.extend(search_spec.get("any_keywords", []))
        return preview[:12]

    def _list_all_runs(self) -> list[dict[str, Any]]:
        return [copy.deepcopy(item) for item in self.runtime_store._load_runs()]

    def _last_runs_by_job(self) -> dict[int, dict[str, Any]]:
        runs_by_job: dict[int, dict[str, Any]] = {}
        runs = sorted(self._list_all_runs(), key=lambda item: int(item.get("id") or 0), reverse=True)
        for item in runs:
            if item.get("job_id") is None:
                continue
            normalized_job_id = int(item["job_id"])
            if normalized_job_id not in runs_by_job:
                runs_by_job[normalized_job_id] = item
        return runs_by_job

    def _load_job_pack(self, job: dict[str, Any], *, allow_missing: bool = False) -> dict[str, Any]:
        pack_ref = job.get("pack_path") or job.get("pack_name")
        if pack_ref:
            try:
                return self.task_pack_store.get_pack(str(pack_ref))
            except Exception:
                if not allow_missing:
                    raise
        return {
            "meta": {"name": job.get("name") or "", "description": "", "updated_at": job.get("updated_at") or utc_now_iso()},
            "search_spec": normalize_search_spec(default_search_spec()),
            "rule_set": {
                "id": 1,
                "name": "Default Rule Set",
                "description": "Built-in opportunity discovery rules.",
                "version": 1,
                "definition": normalize_rule_set_definition(default_rule_set_definition()),
            },
        }

    def _job_search_spec(self, job: dict[str, Any], *, allow_missing: bool = False) -> dict[str, Any]:
        return normalize_search_spec(self._load_job_pack(job, allow_missing=allow_missing).get("search_spec") or default_search_spec())

    def _job_rule_set(self, job: dict[str, Any], *, allow_missing: bool = False) -> dict[str, Any]:
        return self._resolve_rule_set(inline_rule_set=self._load_job_pack(job, allow_missing=allow_missing).get("rule_set"))

    def _job_matches_status(self, job: dict[str, Any], status: str | None) -> bool:
        normalized_status = str(status or "active").strip().lower()
        deleted = bool(job.get("deleted_at"))
        enabled = bool(job.get("enabled"))
        if normalized_status == "deleted":
            return deleted
        if normalized_status == "all":
            return True
        if normalized_status == "disabled":
            return (not deleted) and (not enabled)
        if normalized_status == "enabled":
            return (not deleted) and enabled
        return not deleted

    def _job_matches_query(self, job: dict[str, Any], query: str | None) -> bool:
        token = str(query or "").strip().lower()
        if not token:
            return True
        search_spec = self._job_search_spec(job, allow_missing=True)
        rule_set = self._job_rule_set(job, allow_missing=True)
        haystacks = [
            str(job.get("name") or "").lower(),
            json.dumps(self._job_keywords_preview(search_spec), ensure_ascii=False).lower(),
            str(rule_set.get("name") or "").lower(),
            str(rule_set.get("description") or "").lower(),
        ]
        return any(token in value for value in haystacks)

    def _serialize_job(self, job: dict[str, Any], *, last_run: dict[str, Any] | None = None) -> dict[str, Any]:
        pack = self._load_job_pack(job, allow_missing=True)
        search_spec = normalize_search_spec(pack.get("search_spec") or default_search_spec())
        rule_set = self._resolve_rule_set(inline_rule_set=pack.get("rule_set"))
        payload = copy.deepcopy(job)
        payload["keywords_json"] = self._job_keywords_preview(search_spec)
        payload["days"] = int(search_spec.get("days", search_spec.get("days_filter", {}).get("max") or 20) or 20)
        payload["thresholds_json"] = {**search_spec.get("min_metrics", {}), "mode": search_spec.get("metric_mode", "OR")}
        payload["levels_json"] = [item.get("id") for item in rule_set.get("definition_json", {}).get("levels", [])]
        payload["search_spec_json"] = search_spec
        payload["rule_set_id"] = int(rule_set.get("id") or 0) if rule_set.get("id") is not None else None
        payload["rule_set_summary"] = self._build_rule_set_summary(rule_set)
        payload["pack_meta"] = copy.deepcopy(pack.get("meta") or {})
        payload["last_run_id"] = int(last_run["id"]) if last_run is not None else None
        payload["last_run_status"] = last_run.get("status") if last_run is not None else None
        payload["last_run_started_at"] = last_run.get("started_at") if last_run is not None else None
        payload["last_run_ended_at"] = last_run.get("ended_at") if last_run is not None else None
        payload["last_run_error_text"] = last_run.get("error_text") if last_run is not None else None
        payload["last_run_stats"] = copy.deepcopy(last_run.get("stats_json") or {}) if last_run is not None else {}
        return payload

    def _find_job_index(self, jobs: list[dict[str, Any]], job_id: int) -> int:
        normalized_id = int(job_id)
        for index, item in enumerate(jobs):
            if int(item.get("id") or 0) == normalized_id:
                return index
        return -1

    def _normalize_job_batch_action(self, action: Any) -> str:
        normalized = str(action or "").strip().lower()
        allowed = {"enable", "disable", "run_now", "delete", "restore", "purge"}
        if normalized not in allowed:
            raise ValueError(f"unsupported batch action: {action}")
        return normalized

    def _normalize_job_ids(self, ids: list[Any] | None) -> list[int]:
        normalized: list[int] = []
        seen: set[int] = set()
        for raw in ids or []:
            job_id = int(raw)
            if job_id in seen:
                continue
            seen.add(job_id)
            normalized.append(job_id)
        return normalized

    def _select_batch_jobs(self, payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        workspace_jobs = [copy.deepcopy(item) for item in self._ensure_builtin_rule_set().get("jobs", [])]
        mode = "all_matching" if str(payload.get("mode") or "").strip().lower() == "all_matching" else "ids"
        if mode == "all_matching":
            query = payload.get("query")
            status = str(payload.get("status") or "active")
            jobs = [
                item
                for item in workspace_jobs
                if self._job_matches_status(item, status) and self._job_matches_query(item, query)
            ]
            jobs.sort(key=lambda item: int(item.get("id") or 0), reverse=True)
            jobs.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
            jobs.sort(key=lambda item: 0 if not item.get("deleted_at") else 1)
            if not jobs:
                raise ValueError("no jobs matched current filters")
            return mode, jobs

        normalized_ids = self._normalize_job_ids(payload.get("ids"))
        if not normalized_ids:
            raise ValueError("no jobs selected")
        job_by_id = {int(item.get("id") or 0): item for item in workspace_jobs}
        jobs = [copy.deepcopy(job_by_id[job_id]) for job_id in normalized_ids if job_id in job_by_id]
        if not jobs:
            raise ValueError("no jobs matched selected ids")
        return mode, jobs

    def _validate_batch_jobs(self, action: str, jobs: list[dict[str, Any]]) -> str:
        deleted_states = {bool(item.get("deleted_at")) for item in jobs}
        if len(deleted_states) > 1:
            raise ValueError("batch target jobs mix deleted and non-deleted states")
        deleted_state = "deleted" if deleted_states.pop() else "active"
        if action in {"restore", "purge"} and deleted_state != "deleted":
            raise ValueError(f"action {action} requires deleted jobs")
        if action in {"enable", "disable", "run_now", "delete"} and deleted_state != "active":
            raise ValueError(f"action {action} requires non-deleted jobs")
        return deleted_state

    def batch_jobs(self, payload: dict[str, Any]) -> dict[str, Any]:
        action = self._normalize_job_batch_action(payload.get("action"))
        mode, jobs = self._select_batch_jobs(payload)
        self._validate_batch_jobs(action, jobs)

        execution_jobs = [copy.deepcopy(item) for item in jobs]
        if action == "run_now":
            execution_jobs.sort(key=lambda item: int(item.get("id") or 0))

        succeeded_ids: list[int] = []
        failed_items: list[dict[str, Any]] = []

        for job in execution_jobs:
            job_id = int(job["id"])
            try:
                if action == "enable":
                    self.toggle_job(job_id, True)
                elif action == "disable":
                    self.toggle_job(job_id, False)
                elif action == "run_now":
                    self.run_job_now(job_id)
                elif action == "delete":
                    self.delete_job(job_id)
                elif action == "restore":
                    self.restore_job(job_id)
                elif action == "purge":
                    self.purge_job(job_id)
                succeeded_ids.append(job_id)
            except Exception as exc:  # noqa: BLE001
                failed_items.append({"id": job_id, "name": str(job.get("name") or ""), "error": str(exc)})

        return {
            "action": action,
            "mode": mode,
            "total_targeted": len(execution_jobs),
            "succeeded": len(succeeded_ids),
            "failed": len(failed_items),
            "succeeded_ids": succeeded_ids,
            "failed_items": failed_items,
        }

    def list_rule_sets(self) -> dict[str, Any]:
        return {"items": self._rule_set_catalog()}

    def get_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        row = self._find_rule_set(rule_set_id)
        if row is None:
            raise ValueError(f"rule_set {rule_set_id} not found")
        return row

    def _rule_set_pack_name(self, rule_set_id: int) -> str | None:
        for summary in self.task_pack_store.list_packs():
            try:
                pack = self.task_pack_store.get_pack(summary["pack_name"])
            except Exception:
                continue
            if int(pack.get("rule_set", {}).get("id") or 0) == int(rule_set_id) and summary["pack_name"].startswith("rule-set-"):
                return summary["pack_name"]
        return None

    def _task_pack_payload(
        self,
        *,
        name: str,
        description: str,
        search_spec: dict[str, Any],
        rule_set: dict[str, Any],
        updated_at: str,
    ) -> dict[str, Any]:
        return {
            "meta": {"name": name, "description": description, "updated_at": updated_at},
            "search_spec": normalize_search_spec(search_spec),
            "rule_set": {
                "id": int(rule_set.get("id") or 0) if rule_set.get("id") is not None else None,
                "name": str(rule_set.get("name") or "Default Rule Set"),
                "description": str(rule_set.get("description") or ""),
                "version": int(rule_set.get("version", 1) or 1),
                "definition": normalize_rule_set_definition(rule_set.get("definition_json") or rule_set.get("definition") or default_rule_set_definition()),
            },
        }

    def _task_pack_response(self, pack_name: str, pack: dict[str, Any]) -> dict[str, Any]:
        payload = copy.deepcopy(pack)
        payload["pack_name"] = pack_name
        payload["pack_path"] = self.task_pack_store.relative_pack_path(pack_name)
        payload["rule_set_summary"] = self._build_rule_set_summary(self._resolve_rule_set(inline_rule_set=payload.get("rule_set")))
        payload["query_preview"] = " || ".join(build_query_plan_from_search_spec(payload.get("search_spec") or {}))
        return payload

    def list_task_packs(self) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        for summary in self.task_pack_store.list_packs():
            try:
                pack = self.task_pack_store.get_pack(summary["pack_name"])
            except Exception:
                continue
            item = copy.deepcopy(summary)
            item["rule_set_summary"] = self._build_rule_set_summary(self._resolve_rule_set(inline_rule_set=pack.get("rule_set")))
            item["query_preview"] = " || ".join(build_query_plan_from_search_spec(pack.get("search_spec") or {}))
            items.append(item)
        return {"items": items}

    def get_task_pack(self, pack_name: str) -> dict[str, Any]:
        return self._task_pack_response(pack_name, self.task_pack_store.get_pack(pack_name))

    def create_task_pack(self, payload: dict[str, Any]) -> dict[str, Any]:
        pack_name = str(payload.get("pack_name") or (payload.get("meta") or {}).get("name") or "task-pack").strip()
        pack = self.task_pack_store.create_pack(pack_name, payload)
        resolved_name = self.task_pack_store._resolve_pack_path(pack_name).stem
        return self._task_pack_response(resolved_name, pack)

    def update_task_pack(self, pack_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        pack = self.task_pack_store.update_pack(pack_name, payload)
        resolved_name = self.task_pack_store._resolve_pack_path(pack_name).stem
        return self._task_pack_response(resolved_name, pack)

    def delete_task_pack(self, pack_name: str) -> dict[str, Any]:
        resolved_path = self.task_pack_store._resolve_pack_path(pack_name)
        resolved_name = resolved_path.stem
        if resolved_name == "default-rule-set":
            raise ValueError("default task pack cannot be deleted")
        referenced_by = [
            copy.deepcopy(item)
            for item in self._ensure_builtin_rule_set().get("jobs", [])
            if str(item.get("pack_name") or "").strip() == resolved_name
            or str(item.get("pack_path") or "").replace("\\", "/").strip() == self.task_pack_store.relative_pack_path(resolved_name)
        ]
        if referenced_by:
            raise ValueError("task pack is referenced by existing jobs")
        deleted_name = self.task_pack_store.delete_pack(resolved_name)
        return {"pack_name": deleted_name, "deleted": 1}

    def create_rule_set(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        next_rule_set_id = max((int(item.get("id") or 0) for item in self._rule_set_catalog()), default=0) + 1
        pack_name = f"rule-set-{next_rule_set_id:03d}-{str(payload.get('name') or next_rule_set_id)}"
        self.task_pack_store.create_pack(
            pack_name,
            self._task_pack_payload(
                name=str(payload.get("name") or f"Rule Set {next_rule_set_id}").strip(),
                description=str(payload.get("description") or "").strip(),
                search_spec=default_search_spec(),
                rule_set={
                    "id": next_rule_set_id,
                    "name": str(payload.get("name") or f"Rule Set {next_rule_set_id}").strip(),
                    "description": str(payload.get("description") or "").strip(),
                    "version": int(payload.get("version", 1) or 1),
                    "definition_json": normalize_rule_set_definition(payload.get("definition") or payload.get("definition_json") or default_rule_set_definition()),
                },
                updated_at=now,
            ),
        )
        return self.get_rule_set(next_rule_set_id)

    def update_rule_set(self, rule_set_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        if int(rule_set_id) == 1:
            raise ValueError("builtin rule set cannot be updated")
        pack_name = self._rule_set_pack_name(rule_set_id)
        if pack_name is None:
            raise ValueError(f"rule_set {rule_set_id} not found")
        current = self.task_pack_store.get_pack(pack_name)
        current_rule_set = self._resolve_rule_set(inline_rule_set=current.get("rule_set"))
        self.task_pack_store.update_pack(
            pack_name,
            self._task_pack_payload(
                name=str((current.get("meta") or {}).get("name") or current_rule_set.get("name") or f"Rule Set {rule_set_id}").strip(),
                description=str((current.get("meta") or {}).get("description") or "").strip(),
                search_spec=current.get("search_spec") or default_search_spec(),
                rule_set={
                    **current_rule_set,
                    "name": str(payload.get("name") or current_rule_set.get("name") or "").strip(),
                    "description": str(payload.get("description") or current_rule_set.get("description") or "").strip(),
                    "version": int(payload.get("version", current_rule_set.get("version", 1)) or 1),
                    "definition_json": normalize_rule_set_definition(payload.get("definition") or payload.get("definition_json") or current_rule_set.get("definition_json")),
                },
                updated_at=utc_now_iso(),
            ),
        )
        return self.get_rule_set(rule_set_id)

    def delete_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        row = self.get_rule_set(rule_set_id)
        if bool(row.get("is_builtin")):
            raise ValueError("builtin rule set cannot be deleted")
        in_use = any(int(self._job_rule_set(item, allow_missing=True).get("id") or 0) == int(rule_set_id) for item in self._ensure_builtin_rule_set().get("jobs", []))
        if in_use:
            raise ValueError("rule set is referenced by existing jobs")
        pack_name = self._rule_set_pack_name(rule_set_id)
        if pack_name is None:
            raise ValueError(f"rule_set {rule_set_id} not found")
        self.task_pack_store._resolve_pack_path(pack_name).unlink(missing_ok=False)
        return row

    def clone_rule_set(self, rule_set_id: int) -> dict[str, Any]:
        original = self.get_rule_set(rule_set_id)
        return self.create_rule_set(
            {
                "name": f"{original['name']} - 副本",
                "description": original.get("description", ""),
                "version": int(original.get("version", 1) or 1) + 1,
                "definition": original["definition_json"],
            }
        )

    def create_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        now = utc_now_iso()
        job_id = int(workspace.get("meta", {}).get("next_job_id", 1) or 1)
        interval = max(1, int(payload["interval_minutes"]))
        enabled = bool(payload.get("enabled", True))
        next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat() if enabled else None
        search_spec = normalize_search_spec(
            payload.get("search_spec")
            or {
                "keywords": payload.get("keywords", []),
                "days": payload.get("days", 20),
                "thresholds": payload.get("thresholds", {}),
            }
        )
        rule_set = self._resolve_rule_set(
            rule_set_id=int(payload.get("rule_set_id") or 0) or None,
            inline_rule_set=payload.get("rule_set"),
        )
        pack_name = self.task_pack_store._resolve_pack_path(f"job-{job_id:03d}-{str(payload.get('name') or job_id)}").stem
        self.task_pack_store.upsert_pack(
            pack_name,
            self._task_pack_payload(
                name=str(payload["name"]).strip(),
                description=f"Automatic job #{job_id}",
                search_spec=search_spec,
                rule_set=rule_set,
                updated_at=now,
            ),
        )
        workspace["jobs"] = [
            *workspace.get("jobs", []),
            {
                "id": job_id,
                "name": str(payload["name"]).strip(),
                "enabled": 1 if enabled else 0,
                "interval_minutes": interval,
                "pack_name": pack_name,
                "pack_path": self.task_pack_store.relative_pack_path(pack_name),
                "next_run_at": next_run_at,
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            },
        ]
        workspace.setdefault("meta", {})["next_job_id"] = job_id + 1
        self._save_workspace(workspace)
        return self.get_job(job_id)

    def list_jobs(
        self,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
        status: str | None = "active",
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, int(page_size or 20))
        offset = max(0, (page - 1) * page_size)
        jobs = [
            copy.deepcopy(item)
            for item in self._ensure_builtin_rule_set().get("jobs", [])
            if self._job_matches_status(item, status) and self._job_matches_query(item, query)
        ]
        jobs.sort(key=lambda item: int(item.get("id") or 0), reverse=True)
        jobs.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        jobs.sort(key=lambda item: 0 if not item.get("deleted_at") else 1)
        total = len(jobs)
        last_runs = self._last_runs_by_job()
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [self._serialize_job(item, last_run=last_runs.get(int(item["id"]))) for item in jobs[offset : offset + page_size]],
        }

    def get_job(self, job_id: int) -> dict[str, Any]:
        last_runs = self._last_runs_by_job()
        for item in self._ensure_builtin_rule_set().get("jobs", []):
            if int(item.get("id") or 0) == int(job_id):
                return self._serialize_job(item, last_run=last_runs.get(int(job_id)))
        raise ValueError(f"job {job_id} not found")

    def update_job(self, job_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        now = utc_now_iso()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        current = copy.deepcopy(workspace["jobs"][index])
        if current.get("deleted_at"):
            raise ValueError(f"job {job_id} is deleted")
        current_pack = self._load_job_pack(current)
        current_rule_set = self._resolve_rule_set(inline_rule_set=current_pack.get("rule_set"))
        name = str(payload.get("name", current["name"])).strip()
        interval = max(1, int(payload.get("interval_minutes", current["interval_minutes"])))
        if payload.get("search_spec") is not None:
            search_spec = normalize_search_spec(payload.get("search_spec"))
        elif any(key in payload for key in ("keywords", "days", "thresholds")):
            search_spec = normalize_search_spec(
                {
                    "keywords": payload.get("keywords", self._job_keywords_preview(current_pack.get("search_spec") or {})),
                    "days": payload.get("days", 20),
                    "thresholds": payload.get("thresholds", {}),
                }
            )
        else:
            search_spec = normalize_search_spec(current_pack.get("search_spec") or default_search_spec())
        if payload.get("rule_set") is not None or payload.get("rule_set_id") is not None:
            rule_set = self._resolve_rule_set(
                rule_set_id=int(payload.get("rule_set_id") or 0) or None,
                inline_rule_set=payload.get("rule_set"),
            )
        else:
            rule_set = current_rule_set
        enabled = bool(payload.get("enabled", bool(current["enabled"])))
        next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat() if enabled else None
        self.task_pack_store.upsert_pack(
            current["pack_name"],
            self._task_pack_payload(
                name=name,
                description=str((current_pack.get("meta") or {}).get("description") or f"Automatic job #{job_id}"),
                search_spec=search_spec,
                rule_set=rule_set,
                updated_at=now,
            ),
        )
        current.update(
            {
                "name": name,
                "interval_minutes": interval,
                "enabled": 1 if enabled else 0,
                "next_run_at": next_run_at,
                "updated_at": now,
            }
        )
        workspace["jobs"][index] = current
        self._save_workspace(workspace)
        return self.get_job(job_id)

    def delete_job(self, job_id: int) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        now = utc_now_iso()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        workspace["jobs"][index]["enabled"] = 0
        workspace["jobs"][index]["next_run_at"] = None
        workspace["jobs"][index]["deleted_at"] = now
        workspace["jobs"][index]["updated_at"] = now
        self._save_workspace(workspace)
        return self.get_job(job_id)

    def restore_job(self, job_id: int) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        now = utc_now_iso()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        workspace["jobs"][index]["deleted_at"] = None
        workspace["jobs"][index]["enabled"] = 0
        workspace["jobs"][index]["next_run_at"] = None
        workspace["jobs"][index]["updated_at"] = now
        self._save_workspace(workspace)
        return self.get_job(job_id)

    def purge_job(self, job_id: int) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        row = self.get_job(job_id)
        workspace["jobs"] = [item for item in workspace.get("jobs", []) if int(item.get("id") or 0) != int(job_id)]
        self._save_workspace(workspace)
        self.runtime_store.delete_runs_for_job(int(job_id))
        return row

    def toggle_job(self, job_id: int, enabled: bool) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        now = utc_now_iso()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        current = workspace["jobs"][index]
        if current.get("deleted_at"):
            raise ValueError(f"job {job_id} is deleted")
        interval = int(current["interval_minutes"])
        current["enabled"] = 1 if enabled else 0
        current["next_run_at"] = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat() if enabled else None
        current["updated_at"] = now
        workspace["jobs"][index] = current
        self._save_workspace(workspace)
        return self.get_job(job_id)

    def run_job_now(self, job_id: int) -> dict[str, Any]:
        workspace = self._ensure_builtin_rule_set()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            raise ValueError(f"job {job_id} not found")
        job = copy.deepcopy(workspace["jobs"][index])
        if job.get("deleted_at"):
            raise ValueError(f"job {job_id} is deleted")
        pack = self._load_job_pack(job)
        rule_set = self._resolve_rule_set(inline_rule_set=pack.get("rule_set"))
        report = self.run_manual(
            {
                "search_spec": normalize_search_spec(pack.get("search_spec") or default_search_spec()),
                "rule_set": {
                    "id": rule_set.get("id"),
                    "name": rule_set.get("name"),
                    "description": rule_set.get("description"),
                    "version": rule_set.get("version"),
                    "definition": rule_set.get("definition_json"),
                },
            },
            trigger_type="auto",
            job_id=job_id,
        )
        workspace = self._ensure_builtin_rule_set()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index >= 0:
            workspace["jobs"][index]["next_run_at"] = (datetime.now(timezone.utc) + timedelta(minutes=int(job["interval_minutes"]))).isoformat()
            workspace["jobs"][index]["updated_at"] = utc_now_iso()
            self._save_workspace(workspace)
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
                    dedupe_summary = self.dedupe_items(table="curated")
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
            self._finish_run(run_id, "success", report["stats"], "\n".join(run_errors))
            return report
        except Exception as exc:  # noqa: BLE001
            self._finish_run(run_id, "failed", {}, str(exc))
            raise

    def get_run(self, run_id: int) -> dict[str, Any]:
        return self.runtime_store.get_run(int(run_id))

    def list_runs(self, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(200, int(page_size or 50)))
        return self.runtime_store.list_runs(page=page, page_size=page_size)

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
    def _normalize_item_table(self, table: str | None) -> str:
        return "raw" if str(table or "").strip().lower() == "raw" else "curated"

    def _item_table_name(self, table: str) -> str:
        return "x_items_raw" if table == "raw" else "x_items_curated"

    def _normalize_item_sort(self, table: str, sort_by: str | None, sort_dir: str | None) -> tuple[str, str]:
        requested = str(sort_by or "").strip()
        sort_fields = RAW_ITEM_SORT_FIELDS if table == "raw" else CURATED_ITEM_SORT_FIELDS
        if requested in sort_fields:
            direction = "ASC" if str(sort_dir or "").strip().lower() == "asc" else "DESC"
            return sort_fields[requested], direction
        return sort_fields["id"], "DESC"

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

    def _item_where_clause(self, table: str, level: str | None = None, keyword: str | None = None) -> tuple[str, list[Any]]:
        where: list[str] = []
        params: list[Any] = []
        normalized_keyword = str(keyword or "").strip()
        if table == "curated":
            normalized_level = str(level or "").strip()
            if normalized_level:
                where.append("level = ?")
                params.append(normalized_level.upper())
            if normalized_keyword:
                token = f"%{normalized_keyword}%"
                where.append("(title LIKE ? OR excerpt LIKE ?)")
                params.extend([token, token])
        else:
            if normalized_keyword:
                token = f"%{normalized_keyword}%"
                where.append("(text LIKE ? OR author LIKE ? OR canonical_url LIKE ?)")
                params.extend([token, token, token])
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        return where_sql, params

    def _list_curated_items(
        self,
        page: int,
        page_size: int,
        level: str | None,
        keyword: str | None,
        sort_by: str | None,
        sort_dir: str | None,
    ) -> dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._item_where_clause("curated", level=level, keyword=keyword)
        sort_column, sort_direction = self._normalize_item_sort("curated", sort_by, sort_dir)
        selected_fields = ", ".join(CURATED_ITEM_FIELDS)
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

    def _list_raw_items(
        self,
        page: int,
        page_size: int,
        keyword: str | None,
        sort_by: str | None,
        sort_dir: str | None,
    ) -> dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        where_sql, params = self._item_where_clause("raw", keyword=keyword)
        sort_column, sort_direction = self._normalize_item_sort("raw", sort_by, sort_dir)
        selected_fields = ", ".join(RAW_ITEM_DB_FIELDS)
        with connect(self.db_path) as conn:
            total = int(conn.execute(f"SELECT COUNT(1) FROM x_items_raw {where_sql}", tuple(params)).fetchone()[0])
            if sort_column in RAW_ITEM_PYTHON_SORT_FIELDS:
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_raw
                    {where_sql}
                    """,
                    tuple(params),
                ).fetchall()
                items = [_raw_row_to_item(row) for row in rows]
                if sort_column == "created_at_x":
                    items = sorted(items, key=lambda item: _item_created_at_sort_key(item, sort_direction))
                else:
                    items = sorted(items, key=lambda item: _number_sort_key(item, sort_column, sort_direction))
                items = items[offset : offset + page_size]
            else:
                order_sql = f"{sort_column} {sort_direction}" if sort_column == "id" else f"{sort_column} {sort_direction}, id ASC"
                rows = conn.execute(
                    f"""
                    SELECT {selected_fields}
                    FROM x_items_raw
                    {where_sql}
                    ORDER BY {order_sql}
                    LIMIT ? OFFSET ?
                    """,
                    tuple(params + [page_size, offset]),
                ).fetchall()
                items = [_raw_row_to_item(row) for row in rows]
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": items,
        }

    def list_items(
        self,
        page: int = 1,
        page_size: int = 50,
        level: str | None = None,
        keyword: str | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
        table: str = "curated",
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, min(MAX_ITEM_PAGE_SIZE, int(page_size or 50)))
        normalized_table = self._normalize_item_table(table)
        if normalized_table == "raw":
            return self._list_raw_items(page=page, page_size=page_size, keyword=keyword, sort_by=sort_by, sort_dir=sort_dir)
        return self._list_curated_items(
            page=page,
            page_size=page_size,
            level=level,
            keyword=keyword,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

    def delete_item(self, item_id: int, table: str = "curated") -> dict[str, Any]:
        normalized_id = int(item_id)
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        with connect(self.db_path) as conn:
            row = conn.execute(f"SELECT id FROM {table_name} WHERE id = ?", (normalized_id,)).fetchone()
            if row is None:
                raise ValueError(f"item {normalized_id} not found")
            conn.execute(f"DELETE FROM {table_name} WHERE id = ?", (normalized_id,))
        return {"id": normalized_id, "deleted": 1}

    def delete_items(self, ids: list[int], table: str = "curated") -> dict[str, Any]:
        normalized_ids = self._normalize_item_ids(ids)
        if not normalized_ids:
            return {"ids": [], "deleted": 0}
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        placeholders = ", ".join("?" for _ in normalized_ids)
        delete_ids: list[int] = []
        with connect(self.db_path) as conn:
            existing_rows = conn.execute(
                f"SELECT id FROM {table_name} WHERE id IN ({placeholders})",
                tuple(normalized_ids),
            ).fetchall()
            existing_ids = {int(row["id"]) for row in existing_rows}
            delete_ids = [item_id for item_id in normalized_ids if item_id in existing_ids]
            if delete_ids:
                delete_placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM {table_name} WHERE id IN ({delete_placeholders})",
                    tuple(delete_ids),
                )
        return {"ids": normalized_ids, "deleted": len(delete_ids)}

    def delete_items_matching(self, keyword: str | None = None, level: str | None = None, table: str = "curated") -> dict[str, Any]:
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        where_sql, params = self._item_where_clause(normalized_table, level=level, keyword=keyword)
        with connect(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT id FROM {table_name} {where_sql} ORDER BY id ASC",
                tuple(params),
            ).fetchall()
            delete_ids = [int(row["id"]) for row in rows]
            if delete_ids:
                placeholders = ", ".join("?" for _ in delete_ids)
                conn.execute(
                    f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
                    tuple(delete_ids),
                )
        return {"ids": [], "deleted": len(delete_ids)}

    def dedupe_items(self, table: str = "curated") -> dict[str, Any]:
        normalized_table = self._normalize_item_table(table)
        table_name = self._item_table_name(normalized_table)
        with connect(self.db_path) as conn:
            rows_before = int(conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()[0])
            grouped: dict[str, list[dict[str, Any]]] = {}
            if normalized_table == "raw":
                rows = [
                    row_to_dict(row)
                    for row in conn.execute(
                        """
                        SELECT id, tweet_id, canonical_url, author, text, created_at_x
                        FROM x_items_raw
                        ORDER BY id ASC
                        """
                    ).fetchall()
                ]
                for row in rows:
                    dedupe_key = build_source_dedupe_key(
                        tweet_id=row.get("tweet_id"),
                        url=row.get("canonical_url"),
                        text=row.get("text"),
                        author=row.get("author"),
                    ) or ""
                    if not dedupe_key:
                        continue
                    grouped.setdefault(dedupe_key, []).append(
                        {
                            "id": int(row["id"]),
                            "created_at_x": row.get("created_at_x"),
                        }
                    )
            else:
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
                    f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
                    tuple(delete_ids),
                )
            rows_after = int(conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()[0])
        return {
            "groups": duplicate_groups,
            "deleted": len(delete_ids),
            "kept": kept,
            "rows_before": rows_before,
            "rows_after": rows_after,
        }

    def _load_health_snapshots(self) -> dict[str, dict[str, Any]]:
        payload = self.runtime_store.load_health_snapshots()
        return payload if isinstance(payload, dict) else {}

    def _save_health_snapshots(self, payload: dict[str, Any]) -> None:
        self.runtime_store.save_health_snapshots(payload)

    def _health_response_from_snapshots(
        self,
        db_snapshot: dict[str, Any],
        x_snapshot: dict[str, Any],
        *,
        source: str,
        updated_at: str,
    ) -> dict[str, Any]:
        return {
            "summary": {
                "updated_at": updated_at,
                "source": source,
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
        resolved_connected = True if connected else bool(previous.get("connected")) and configured
        resolved_detail = {**previous_detail, **detail}
        snapshot = {
            "configured": configured,
            "connected": resolved_connected,
            "detail": resolved_detail,
            "last_checked_at": checked_at,
            "last_error": last_error,
        }
        return snapshot

    def _probe_database_health(self) -> tuple[bool, bool, dict[str, Any], str]:
        db_path = self.db_path.resolve()
        detail: dict[str, Any] = {
            "db_path": str(db_path),
            "db_exists": db_path.exists(),
            "job_count": len(self._ensure_builtin_rule_set().get("jobs", [])),
            "run_count": len(self._list_all_runs()),
        }
        try:
            with connect(self.db_path) as conn:
                conn.execute("SELECT 1").fetchone()
            return True, True, detail, ""
        except Exception as exc:  # noqa: BLE001
            return True, False, detail, str(exc)

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

        self._save_health_snapshots({"db": db_snapshot, "x": x_snapshot})
        return self._health_response_from_snapshots(
            db_snapshot,
            x_snapshot,
            source="backend_snapshot",
            updated_at=checked_at,
        )

    def health_snapshot(self) -> dict[str, Any]:
        payload = self._load_health_snapshots()
        db_snapshot = payload.get("db")
        x_snapshot = payload.get("x")
        if not isinstance(db_snapshot, dict) or not isinstance(x_snapshot, dict):
            raise FileNotFoundError("health snapshot not found")
        updated_at = max(
            str(db_snapshot.get("last_checked_at", "") or ""),
            str(x_snapshot.get("last_checked_at", "") or ""),
        )
        return self._health_response_from_snapshots(
            db_snapshot,
            x_snapshot,
            source="runtime_snapshot",
            updated_at=updated_at,
        )

    def tick(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        triggered = 0
        failed = 0
        jobs = [
            copy.deepcopy(item)
            for item in self._ensure_builtin_rule_set().get("jobs", [])
            if bool(item.get("enabled"))
            and not bool(item.get("deleted_at"))
            and item.get("next_run_at")
            and (_parse_item_created_at(item.get("next_run_at")) or datetime.max.replace(tzinfo=timezone.utc)) <= now
        ]
        jobs.sort(key=lambda item: int(item.get("id") or 0))
        for job in jobs:
            try:
                self.run_job_now(int(job["id"]))
                triggered += 1
            except Exception:
                failed += 1
        return {"triggered": triggered, "failed": failed}

    def _create_run(self, job_id: int | None, trigger_type: str) -> int:
        return self.runtime_store.create_run(job_id=job_id, trigger_type=trigger_type, started_at=utc_now_iso())

    def _finish_run(self, run_id: int, status: str, stats: dict[str, Any], error_text: str) -> None:
        self.runtime_store.finish_run(
            int(run_id),
            status=status,
            stats=copy.deepcopy(stats),
            error_text=error_text or "",
            ended_at=utc_now_iso(),
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




