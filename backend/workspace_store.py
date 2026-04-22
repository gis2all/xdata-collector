from __future__ import annotations

import copy
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

from backend.collector_rules import (
    default_rule_set_definition,
    default_search_spec,
    normalize_rule_set_definition,
    normalize_search_spec,
)
from backend.collector_store import utc_now_iso

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE_PATH = PROJECT_ROOT / "config" / "workspace.json"
DEFAULT_PACKS_DIR = PROJECT_ROOT / "config" / "packs"
DEFAULT_RUNS_PATH = PROJECT_ROOT / "runtime" / "history" / "search_runs.jsonl"
DEFAULT_HEALTH_PATH = PROJECT_ROOT / "runtime" / "state" / "runtime_health_snapshot.json"
DEFAULT_SEQUENCE_PATH = PROJECT_ROOT / "runtime" / "state" / "sequences.json"
WORKSPACE_VERSION = 2
TASK_PACK_VERSION = 1
TASK_PACK_KIND = "task_pack"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _atomic_write_text(path: Path, content: str) -> None:
    _ensure_parent(path)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def _read_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8").lstrip("\ufeff"))


def _decode_json_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _slugify(value: str, *, fallback: str) -> str:
    lowered = re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return lowered or fallback


def _project_root_from_workspace_path(workspace_path: Path) -> Path:
    if workspace_path.parent.name == "config":
        return workspace_path.parent.parent
    return workspace_path.parent


def _pack_file_name(prefix: str, numeric_id: int, label: str, existing: set[str]) -> str:
    base = f"{prefix}-{int(numeric_id):03d}-{_slugify(label, fallback=f'{prefix}-{numeric_id}') }"
    candidate = base
    suffix = 2
    while candidate in existing:
        candidate = f"{base}-{suffix}"
        suffix += 1
    existing.add(candidate)
    return candidate


def _relative_path(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def default_builtin_rule_set(*, rule_set_id: int = 1, now: str | None = None) -> dict[str, Any]:
    timestamp = now or utc_now_iso()
    return {
        "id": int(rule_set_id),
        "name": "Default Rule Set",
        "description": "Built-in opportunity discovery rules.",
        "is_enabled": 1,
        "is_builtin": 1,
        "version": 1,
        "definition_json": normalize_rule_set_definition(default_rule_set_definition()),
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def default_environment() -> dict[str, Any]:
    return {
        "db_path": "data/app.db",
        "runtime_dir": "runtime",
        "env_file": ".env",
    }


def default_workspace() -> dict[str, Any]:
    now = utc_now_iso()
    return {
        "version": WORKSPACE_VERSION,
        "meta": {
            "updated_at": now,
            "next_job_id": 1,
        },
        "environment": default_environment(),
        "jobs": [],
    }


def default_task_pack() -> dict[str, Any]:
    now = utc_now_iso()
    return {
        "version": TASK_PACK_VERSION,
        "kind": TASK_PACK_KIND,
        "meta": {
            "name": "New Task Pack",
            "description": "",
            "updated_at": now,
        },
        "search_spec": normalize_search_spec(default_search_spec()),
        "rule_set": {
            "id": 1,
            "name": "Default Rule Set",
            "description": "Built-in opportunity discovery rules.",
            "version": 1,
            "definition": normalize_rule_set_definition(default_rule_set_definition()),
        },
    }


def _normalize_pack_rule_set(payload: dict[str, Any] | None) -> dict[str, Any]:
    source = payload or {}
    definition = source.get("definition")
    if definition is None:
        definition = source.get("definition_json")
    return {
        "id": int(source["id"]) if source.get("id") is not None else None,
        "name": str(source.get("name") or "Default Rule Set").strip() or "Default Rule Set",
        "description": str(source.get("description") or "").strip(),
        "version": max(1, int(source.get("version", 1) or 1)),
        "definition": normalize_rule_set_definition(definition or default_rule_set_definition()),
    }


def _normalize_task_pack(payload: dict[str, Any] | None, *, fallback_name: str) -> dict[str, Any]:
    base = default_task_pack()
    source = payload or {}
    meta_source = source.get("meta") or {}
    search_spec = normalize_search_spec(source.get("search_spec") or base["search_spec"])
    rule_set = _normalize_pack_rule_set(source.get("rule_set") or base["rule_set"])
    return {
        "version": int(source.get("version") or TASK_PACK_VERSION),
        "kind": TASK_PACK_KIND,
        "meta": {
            "name": str(meta_source.get("name") or fallback_name).strip() or fallback_name,
            "description": str(meta_source.get("description") or "").strip(),
            "updated_at": str(meta_source.get("updated_at") or utc_now_iso()),
        },
        "search_spec": search_spec,
        "rule_set": rule_set,
    }


def _normalize_rule_set(payload: dict[str, Any], *, fallback_id: int) -> dict[str, Any]:
    now = utc_now_iso()
    definition = payload.get("definition_json")
    if definition is None:
        definition = payload.get("definition")
    return {
        "id": int(payload.get("id") or fallback_id),
        "name": str(payload.get("name") or f"Rule Set {fallback_id}").strip(),
        "description": str(payload.get("description") or "").strip(),
        "is_enabled": 1 if payload.get("is_enabled", True) else 0,
        "is_builtin": 1 if payload.get("is_builtin", False) else 0,
        "version": max(1, int(payload.get("version", 1) or 1)),
        "definition_json": normalize_rule_set_definition(_decode_json_value(definition) or default_rule_set_definition()),
        "created_at": str(payload.get("created_at") or now),
        "updated_at": str(payload.get("updated_at") or payload.get("created_at") or now),
    }


def _normalize_manual_preset(payload: dict[str, Any], *, fallback_id: int) -> dict[str, Any]:
    return {
        "id": int(payload.get("id") or fallback_id),
        "name": str(payload.get("name") or f"Preset {fallback_id}").strip(),
        "description": str(payload.get("description") or "").strip(),
        "search_spec": normalize_search_spec(payload.get("search_spec") or payload),
    }


def _normalize_legacy_job(payload: dict[str, Any], *, fallback_id: int, default_rule_set_id: int | None) -> dict[str, Any]:
    now = utc_now_iso()
    search_spec = normalize_search_spec(_decode_json_value(payload.get("search_spec") or payload.get("search_spec_json")))
    resolved_rule_set_id = payload.get("rule_set_id")
    if resolved_rule_set_id is None:
        resolved_rule_set_id = default_rule_set_id
    return {
        "id": int(payload.get("id") or fallback_id),
        "name": str(payload.get("name") or f"Job {fallback_id}").strip(),
        "interval_minutes": max(1, int(payload.get("interval_minutes", 30) or 30)),
        "enabled": 1 if payload.get("enabled", True) else 0,
        "next_run_at": payload.get("next_run_at") or None,
        "created_at": str(payload.get("created_at") or now),
        "updated_at": str(payload.get("updated_at") or payload.get("created_at") or now),
        "deleted_at": payload.get("deleted_at") or None,
        "search_spec_json": search_spec,
        "rule_set_id": int(resolved_rule_set_id) if resolved_rule_set_id is not None else None,
    }


def _normalize_job_registry_entry(payload: dict[str, Any], *, fallback_id: int) -> dict[str, Any]:
    job_id = int(payload.get("id") or fallback_id)
    pack_name = _slugify(str(payload.get("pack_name") or Path(str(payload.get("pack_path") or f"job-{job_id}")).stem), fallback=f"job-{job_id}")
    return {
        "id": job_id,
        "name": str(payload.get("name") or f"Job {job_id}").strip() or f"Job {job_id}",
        "enabled": 1 if payload.get("enabled", True) else 0,
        "interval_minutes": max(1, int(payload.get("interval_minutes", 30) or 30)),
        "pack_name": pack_name,
        "pack_path": str(payload.get("pack_path") or f"config/packs/{pack_name}.json").replace("\\", "/"),
        "next_run_at": payload.get("next_run_at") or None,
        "created_at": str(payload.get("created_at") or utc_now_iso()),
        "updated_at": str(payload.get("updated_at") or payload.get("created_at") or utc_now_iso()),
        "deleted_at": payload.get("deleted_at") or None,
    }


class TaskPackStore:
    def __init__(self, *, packs_dir: str | Path = DEFAULT_PACKS_DIR, project_root: str | Path | None = None) -> None:
        self.packs_dir = Path(packs_dir)
        self.project_root = Path(project_root) if project_root is not None else self._infer_project_root(self.packs_dir)

    def _infer_project_root(self, packs_dir: Path) -> Path:
        if packs_dir.parent.name == "config":
            return packs_dir.parent.parent
        if len(packs_dir.parents) >= 2:
            return packs_dir.parents[1]
        return packs_dir.parent

    def _resolve_pack_path(self, pack_name_or_path: str | Path) -> Path:
        raw = str(pack_name_or_path or "").strip()
        if not raw:
            raise ValueError("pack name is required")
        if raw.endswith(".json") or "/" in raw or "\\" in raw:
            candidate = Path(pack_name_or_path)
            if not candidate.is_absolute() and not isinstance(pack_name_or_path, Path):
                candidate = self.project_root / candidate
        else:
            candidate = self.packs_dir / f"{_slugify(raw, fallback='task-pack')}.json"
        candidate = candidate.resolve()
        packs_root = self.packs_dir.resolve()
        if candidate.parent != packs_root:
            raise ValueError("task pack path must stay under config/packs")
        return candidate

    def _pack_name(self, path: Path) -> str:
        return path.stem

    def _pack_summary(self, path: Path) -> dict[str, Any]:
        payload = self.get_pack(path)
        return {
            "pack_name": self._pack_name(path),
            "pack_path": _relative_path(path, self.project_root),
            "name": payload["meta"]["name"],
            "description": payload["meta"].get("description", ""),
            "updated_at": payload["meta"].get("updated_at", ""),
        }

    def list_packs(self) -> list[dict[str, Any]]:
        if not self.packs_dir.exists():
            return []
        items = [self._pack_summary(path) for path in sorted(self.packs_dir.glob("*.json"))]
        items.sort(key=lambda item: item.get("name", "").lower())
        items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
        return items

    def get_pack(self, pack_name_or_path: str | Path) -> dict[str, Any]:
        path = self._resolve_pack_path(pack_name_or_path)
        if not path.exists():
            raise ValueError(f"task pack {path.name} not found")
        return _normalize_task_pack(_read_json_file(path), fallback_name=path.stem)

    def create_pack(self, pack_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = self._resolve_pack_path(pack_name)
        if path.exists():
            raise ValueError(f"task pack {path.name} already exists")
        return self.upsert_pack(pack_name, payload)

    def update_pack(self, pack_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = self._resolve_pack_path(pack_name)
        if not path.exists():
            raise ValueError(f"task pack {path.name} not found")
        return self.upsert_pack(pack_name, payload)

    def upsert_pack(self, pack_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = self._resolve_pack_path(pack_name)
        normalized = _normalize_task_pack(payload, fallback_name=path.stem)
        _atomic_write_text(path, json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
        return copy.deepcopy(normalized)

    def delete_pack(self, pack_name_or_path: str | Path) -> str:
        path = self._resolve_pack_path(pack_name_or_path)
        if not path.exists():
            raise ValueError(f"task pack {path.name} not found")
        path.unlink()
        return self._pack_name(path)

    def relative_pack_path(self, pack_name_or_path: str | Path) -> str:
        return _relative_path(self._resolve_pack_path(pack_name_or_path), self.project_root)


class WorkspaceStore:
    def __init__(
        self,
        *,
        workspace_path: str | Path = DEFAULT_WORKSPACE_PATH,
        packs_dir: str | Path | None = None,
        legacy_config_dir: str | Path | None = None,
        legacy_db_path: str | Path | None = None,
    ) -> None:
        self.workspace_path = Path(workspace_path)
        self.project_root = _project_root_from_workspace_path(self.workspace_path)
        self.packs_dir = Path(packs_dir) if packs_dir is not None else self.workspace_path.parent / "packs"
        self.legacy_config_dir = Path(legacy_config_dir) if legacy_config_dir is not None else self.workspace_path.parent
        self.legacy_db_path = Path(legacy_db_path) if legacy_db_path is not None else PROJECT_ROOT / "data" / "app.db"
        self.pack_store = TaskPackStore(packs_dir=self.packs_dir, project_root=self.project_root)
        self._cache: dict[str, Any] | None = None
        self._mtime: float | None = None

    def get_workspace(self) -> dict[str, Any]:
        if not self.workspace_path.exists():
            workspace = self._bootstrap_workspace()
            self._write_workspace(workspace)
            return copy.deepcopy(workspace)
        mtime = self.workspace_path.stat().st_mtime
        if self._cache is not None and self._mtime == mtime:
            return copy.deepcopy(self._cache)
        payload = _read_json_file(self.workspace_path)
        if self._is_legacy_workspace(payload):
            workspace = self._migrate_legacy_workspace(payload)
            self._write_workspace(workspace)
            return copy.deepcopy(workspace)
        workspace = self._normalize_workspace(payload)
        self._cache = workspace
        self._mtime = self.workspace_path.stat().st_mtime
        return copy.deepcopy(workspace)

    def update_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        workspace = self._normalize_workspace(payload)
        self._write_workspace(workspace)
        return copy.deepcopy(workspace)

    def import_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.update_workspace(payload)

    def export_workspace(self) -> dict[str, Any]:
        return self.get_workspace()

    def _write_workspace(self, workspace: dict[str, Any]) -> None:
        normalized = self._normalize_workspace(workspace)
        _atomic_write_text(self.workspace_path, json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
        self._cache = normalized
        self._mtime = self.workspace_path.stat().st_mtime

    def _is_legacy_workspace(self, payload: Any) -> bool:
        if not isinstance(payload, dict):
            return False
        if any(key in payload for key in ("manual", "rule_sets")):
            return True
        for job in payload.get("jobs", []) or []:
            if not isinstance(job, dict):
                continue
            if "search_spec_json" in job or "rule_set_id" in job:
                return True
        return False

    def _bootstrap_workspace(self) -> dict[str, Any]:
        legacy_payload = self._load_legacy_sources()
        if legacy_payload is None:
            return default_workspace()
        return self._migrate_legacy_workspace(legacy_payload)

    def _load_legacy_sources(self) -> dict[str, Any] | None:
        rule_sets = self._load_legacy_rule_sets()
        if not rule_sets:
            rule_sets = [default_builtin_rule_set(rule_set_id=1)]
        default_rule_set_id = int(rule_sets[0]["id"]) if rule_sets else 1
        jobs = self._load_legacy_jobs(default_rule_set_id=default_rule_set_id)
        if not jobs and not rule_sets:
            return None
        return {
            "version": 1,
            "meta": {
                "updated_at": utc_now_iso(),
                "next_job_id": max([int(item["id"]) for item in jobs], default=0) + 1,
            },
            "manual": {
                "draft": normalize_search_spec(default_search_spec()),
                "selected_rule_set_id": default_rule_set_id,
                "presets": [],
            },
            "rule_sets": rule_sets,
            "jobs": jobs,
        }

    def _legacy_table_exists(self, conn: sqlite3.Connection, table: str) -> bool:
        row = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone()
        return row is not None

    def _load_legacy_rule_sets(self) -> list[dict[str, Any]]:
        if not self.legacy_db_path.exists():
            return []
        conn = sqlite3.connect(self.legacy_db_path)
        conn.row_factory = sqlite3.Row
        try:
            if not self._legacy_table_exists(conn, "rule_sets"):
                return []
            rows = conn.execute("SELECT * FROM rule_sets ORDER BY is_builtin DESC, updated_at DESC, id DESC").fetchall()
            return [_normalize_rule_set(dict(row), fallback_id=index) for index, row in enumerate(rows, start=1)]
        finally:
            conn.close()

    def _load_legacy_jobs(self, *, default_rule_set_id: int | None) -> list[dict[str, Any]]:
        if not self.legacy_db_path.exists():
            return []
        conn = sqlite3.connect(self.legacy_db_path)
        conn.row_factory = sqlite3.Row
        try:
            if not self._legacy_table_exists(conn, "search_jobs"):
                return []
            rows = conn.execute("SELECT * FROM search_jobs ORDER BY updated_at DESC, id DESC").fetchall()
            return [
                _normalize_legacy_job(dict(row), fallback_id=index, default_rule_set_id=default_rule_set_id)
                for index, row in enumerate(rows, start=1)
            ]
        finally:
            conn.close()

    def _migrate_legacy_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        source = payload or {}
        now = utc_now_iso()
        existing_names: set[str] = {item["pack_name"] for item in self._normalize_workspace({"jobs": []}).get("jobs", [])}
        rule_sets = [
            _normalize_rule_set(item, fallback_id=index)
            for index, item in enumerate(source.get("rule_sets") or [default_builtin_rule_set(rule_set_id=1, now=now)], start=1)
        ]
        if not rule_sets:
            rule_sets = [default_builtin_rule_set(rule_set_id=1, now=now)]
        default_rule = next((item for item in rule_sets if bool(item.get("is_builtin"))), rule_sets[0])
        rule_sets_by_id = {int(item["id"]): item for item in rule_sets}

        jobs: list[dict[str, Any]] = []
        used_rule_set_ids: set[int] = set()
        for index, raw_job in enumerate(source.get("jobs") or [], start=1):
            job = _normalize_legacy_job(raw_job, fallback_id=index, default_rule_set_id=int(default_rule["id"]))
            rule_set = rule_sets_by_id.get(int(job.get("rule_set_id") or default_rule["id"])) or default_rule
            used_rule_set_ids.add(int(rule_set["id"]))
            pack_name = _pack_file_name("job", int(job["id"]), str(job["name"]), existing_names)
            self.pack_store.upsert_pack(
                pack_name,
                {
                    "meta": {
                        "name": str(job["name"]),
                        "description": f"Migrated from legacy job #{job['id']}",
                        "updated_at": str(job.get("updated_at") or now),
                    },
                    "search_spec": job["search_spec_json"],
                    "rule_set": {
                        "id": int(rule_set["id"]),
                        "name": rule_set["name"],
                        "description": rule_set.get("description", ""),
                        "version": int(rule_set.get("version", 1) or 1),
                        "definition": rule_set["definition_json"],
                    },
                },
            )
            jobs.append(
                _normalize_job_registry_entry(
                    {
                        "id": job["id"],
                        "name": job["name"],
                        "enabled": job.get("enabled", True),
                        "interval_minutes": job.get("interval_minutes", 30),
                        "pack_name": pack_name,
                        "pack_path": self.pack_store.relative_pack_path(pack_name),
                        "next_run_at": job.get("next_run_at"),
                        "created_at": job.get("created_at"),
                        "updated_at": job.get("updated_at"),
                        "deleted_at": job.get("deleted_at"),
                    },
                    fallback_id=int(job["id"]),
                )
            )

        manual = source.get("manual") or {}
        presets = [
            _normalize_manual_preset(item, fallback_id=index)
            for index, item in enumerate(manual.get("presets") or [], start=1)
        ]
        for preset in presets:
            pack_name = _pack_file_name("manual-preset", int(preset["id"]), str(preset["name"]), existing_names)
            self.pack_store.upsert_pack(
                pack_name,
                {
                    "meta": {
                        "name": str(preset["name"]),
                        "description": str(preset.get("description") or ""),
                        "updated_at": now,
                    },
                    "search_spec": preset["search_spec"],
                    "rule_set": {
                        "id": int(default_rule["id"]),
                        "name": default_rule["name"],
                        "description": default_rule.get("description", ""),
                        "version": int(default_rule.get("version", 1) or 1),
                        "definition": default_rule["definition_json"],
                    },
                },
            )

        for rule_set in rule_sets:
            if bool(rule_set.get("is_builtin")):
                continue
            if int(rule_set["id"]) in used_rule_set_ids:
                continue
            pack_name = _pack_file_name("manual-rule-set", int(rule_set["id"]), str(rule_set["name"]), existing_names)
            self.pack_store.upsert_pack(
                pack_name,
                {
                    "meta": {
                        "name": str(rule_set["name"]),
                        "description": str(rule_set.get("description") or ""),
                        "updated_at": str(rule_set.get("updated_at") or now),
                    },
                    "search_spec": normalize_search_spec(default_search_spec()),
                    "rule_set": {
                        "id": int(rule_set["id"]),
                        "name": rule_set["name"],
                        "description": rule_set.get("description", ""),
                        "version": int(rule_set.get("version", 1) or 1),
                        "definition": rule_set["definition_json"],
                    },
                },
            )

        workspace = {
            "version": WORKSPACE_VERSION,
            "meta": {
                "updated_at": str((source.get("meta") or {}).get("updated_at") or now),
                "next_job_id": max(
                    max([int(item["id"]) for item in jobs], default=0) + 1,
                    int((source.get("meta") or {}).get("next_job_id", 1) or 1),
                ),
            },
            "environment": default_environment(),
            "jobs": jobs,
        }
        return self._normalize_workspace(workspace)

    def _normalize_workspace(self, payload: dict[str, Any] | None) -> dict[str, Any]:
        base = default_workspace()
        source = payload or {}
        jobs_source = source.get("jobs") or []
        jobs = [
            _normalize_job_registry_entry(item, fallback_id=index)
            for index, item in enumerate(jobs_source, start=1)
        ]
        meta_source = source.get("meta") or {}
        env_source = source.get("environment") or {}
        environment = {
            "db_path": str(env_source.get("db_path") or base["environment"]["db_path"]).replace("\\", "/"),
            "runtime_dir": str(env_source.get("runtime_dir") or base["environment"]["runtime_dir"]).replace("\\", "/"),
            "env_file": str(env_source.get("env_file") or base["environment"]["env_file"]).replace("\\", "/"),
        }
        next_job_id = max([int(item["id"]) for item in jobs], default=0) + 1
        meta = {
            "updated_at": str(meta_source.get("updated_at") or utc_now_iso()),
            "next_job_id": max(next_job_id, int(meta_source.get("next_job_id", 1) or 1)),
        }
        return {
            "version": int(source.get("version") or WORKSPACE_VERSION),
            "meta": meta,
            "environment": environment,
            "jobs": jobs,
        }


class RuntimeStateStore:
    def __init__(
        self,
        *,
        runs_path: str | Path = DEFAULT_RUNS_PATH,
        health_path: str | Path = DEFAULT_HEALTH_PATH,
        sequence_path: str | Path = DEFAULT_SEQUENCE_PATH,
    ) -> None:
        self.runs_path = Path(runs_path)
        self.health_path = Path(health_path)
        self.sequence_path = Path(sequence_path)

    def _load_sequences(self) -> dict[str, int]:
        if not self.sequence_path.exists():
            return {}
        return _read_json_file(self.sequence_path)

    def _save_sequences(self, payload: dict[str, int]) -> None:
        _atomic_write_text(self.sequence_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

    def _next_sequence(self, key: str) -> int:
        payload = self._load_sequences()
        next_value = int(payload.get(key, 0) or 0) + 1
        payload[key] = next_value
        self._save_sequences(payload)
        return next_value

    def _load_runs(self) -> list[dict[str, Any]]:
        if not self.runs_path.exists():
            return []
        items: list[dict[str, Any]] = []
        for line in self.runs_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
        return items

    def _save_runs(self, payload: list[dict[str, Any]]) -> None:
        serialized = "\n".join(json.dumps(item, ensure_ascii=False) for item in payload)
        if serialized:
            serialized += "\n"
        _atomic_write_text(self.runs_path, serialized)

    def create_run(self, *, job_id: int | None, trigger_type: str, started_at: str | None = None) -> int:
        run_id = self._next_sequence("run_id")
        runs = self._load_runs()
        runs.append(
            {
                "id": run_id,
                "job_id": job_id,
                "trigger_type": trigger_type,
                "status": "running",
                "stats_json": {},
                "started_at": started_at or utc_now_iso(),
                "ended_at": None,
                "error_text": None,
            }
        )
        self._save_runs(runs)
        return run_id

    def finish_run(
        self,
        run_id: int,
        *,
        status: str,
        stats: dict[str, Any],
        error_text: str,
        ended_at: str | None = None,
    ) -> None:
        runs = self._load_runs()
        found = False
        for item in runs:
            if int(item.get("id") or 0) != int(run_id):
                continue
            item["status"] = status
            item["stats_json"] = copy.deepcopy(stats)
            item["ended_at"] = ended_at or utc_now_iso()
            item["error_text"] = error_text or None
            found = True
            break
        if not found:
            raise ValueError(f"run {run_id} not found")
        self._save_runs(runs)

    def get_run(self, run_id: int) -> dict[str, Any]:
        for item in self._load_runs():
            if int(item.get("id") or 0) == int(run_id):
                return item
        raise ValueError(f"run {run_id} not found")

    def list_runs(self, *, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = max(1, int(page_size or 50))
        runs = sorted(self._load_runs(), key=lambda item: int(item.get("id") or 0), reverse=True)
        offset = max(0, (page - 1) * page_size)
        return {
            "page": page,
            "page_size": page_size,
            "total": len(runs),
            "items": runs[offset : offset + page_size],
        }

    def delete_runs_for_job(self, job_id: int) -> None:
        runs = [item for item in self._load_runs() if item.get("job_id") != job_id]
        self._save_runs(runs)

    def load_health_snapshots(self) -> dict[str, Any]:
        if not self.health_path.exists():
            return {}
        payload = _read_json_file(self.health_path)
        return payload if isinstance(payload, dict) else {}

    def save_health_snapshots(self, payload: dict[str, Any]) -> None:
        _atomic_write_text(self.health_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
