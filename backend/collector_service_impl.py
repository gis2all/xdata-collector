from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

from backend.collector_rules import evaluate_rule_set
from backend.collector_store import connect, utc_now_iso
from backend.config import load_env_file
from backend.twitter_cli import find_twitter_cli, get_twitter_cli_version, normalize_search_payload, run_twitter_search
from backend.workspace_store import RuntimeStateStore, WorkspaceStore

from .collector_service_parts.common import *  # noqa: F401,F403
from .collector_service_parts.health import HealthMixin
from .collector_service_parts.items import ItemMixin
from .collector_service_parts.jobs import JobMixin
from .collector_service_parts.rules_taskpacks import RuleTaskPackMixin
from .collector_service_parts.runs import RunMixin

class DesktopService(RuleTaskPackMixin, JobMixin, RunMixin, ItemMixin, HealthMixin):
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
        self._run_cancel_events: dict[int, threading.Event] = {}
        self._run_cancel_lock = threading.RLock()
        self._run_slot_limit = threading.BoundedSemaphore(MAX_BACKGROUND_RUNS)
        self._health_x_last_probe_at: float = 0.0
        self._health_x_cached: tuple[bool, bool, dict[str, Any], str] | None = None
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
            if key in {"TWITTER_AUTH_TOKEN", "TWITTER_CT0"}:
                os.environ[key] = value.strip().strip('"').strip("'")

    def _ensure_builtin_rule_set(self) -> dict[str, Any]:
        return self.workspace_store.get_workspace()
