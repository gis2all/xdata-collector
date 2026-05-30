from __future__ import annotations

from .common import *  # noqa: F401,F403



def _service_module():
    import sys

    return sys.modules["backend.collector_service_impl"]

class HealthMixin:
    _HEALTH_X_CACHE_SECONDS: float = 30.0

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
                "cli_version": x_snapshot["detail"].get("cli_version", "unknown"),
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
        resolved_detail = {key: detail.get(key, previous_detail.get(key)) for key in detail}
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
        has_env_auth = bool(os.getenv("TWITTER_AUTH_TOKEN") and os.getenv("TWITTER_CT0"))
        auth_source = "environment" if has_env_auth else "unknown"
        configured = has_env_auth
        try:
            _service_module().find_twitter_cli()
            auth_source = "twitter-cli"
            configured = True
            cli_version = _service_module().get_twitter_cli_version()
        except Exception:
            cli_version = "unknown"
            pass
        detail = {
            "auth_source": auth_source,
            "cli_version": cli_version,
            "account_hint": "unknown",
        }
        if not configured:
            return False, False, detail, "x_not_configured"
        try:
            _service_module().run_twitter_search("from:Galxe", 1, timeout_seconds=15)
            return True, True, detail, ""
        except Exception as exc:  # noqa: BLE001
            return True, False, detail, str(exc)

    def _probe_x_health_cached(self) -> tuple[bool, bool, dict[str, Any], str]:
        now = time.monotonic()
        if self._health_x_cached is not None and (now - self._health_x_last_probe_at) < self._HEALTH_X_CACHE_SECONDS:
            return self._health_x_cached
        result = self._probe_x_health()
        self._health_x_cached = result
        self._health_x_last_probe_at = now
        return result

    def health(self) -> dict[str, Any]:
        previous = self._load_health_snapshots()
        checked_at = _service_module().utc_now_iso()
        db_configured, db_connected, db_detail, db_error = self._probe_database_health()
        x_configured, x_connected, x_detail, x_error = self._probe_x_health_cached()

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
