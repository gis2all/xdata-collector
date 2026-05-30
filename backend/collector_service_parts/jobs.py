from __future__ import annotations

from .common import *  # noqa: F401,F403

class JobMixin:
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
            if str(item.get("status") or "").lower() == "running":
                item = self._reconcile_orphaned_run(item)
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
            "tags": [],
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
            str(job.get("group_name") or "").lower(),
            json.dumps(self._job_keywords_preview(search_spec), ensure_ascii=False).lower(),
            json.dumps(normalize_tags(self._load_job_pack(job, allow_missing=True).get("tags")), ensure_ascii=False).lower(),
            str(rule_set.get("name") or "").lower(),
            str(rule_set.get("description") or "").lower(),
        ]
        return any(token in value for value in haystacks)

    def _serialize_job(self, job: dict[str, Any], *, last_run: dict[str, Any] | None = None) -> dict[str, Any]:
        pack = self._load_job_pack(job, allow_missing=True)
        search_spec = normalize_search_spec(pack.get("search_spec") or default_search_spec())
        rule_set = self._resolve_rule_set(inline_rule_set=pack.get("rule_set"))
        payload = copy.deepcopy(job)
        payload["group_name"] = normalize_group_name(job.get("group_name"))
        payload["keywords_json"] = self._job_keywords_preview(search_spec)
        payload["days"] = int(search_spec.get("days", search_spec.get("days_filter", {}).get("max") or 1) or 1)
        payload["thresholds_json"] = {**search_spec.get("min_metrics", {}), "mode": search_spec.get("metric_mode", "OR")}
        payload["levels_json"] = [item.get("id") for item in rule_set.get("definition_json", {}).get("levels", [])]
        payload["search_spec_json"] = search_spec
        payload["rule_set_id"] = int(rule_set.get("id") or 0) if rule_set.get("id") is not None else None
        payload["rule_set_summary"] = self._build_rule_set_summary(rule_set)
        payload["pack_meta"] = copy.deepcopy(pack.get("meta") or {})
        payload["tags"] = normalize_tags(pack.get("tags"))
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

    def _build_job_run_payload(self, job: dict[str, Any]) -> dict[str, Any]:
        pack = self._load_job_pack(job)
        rule_set = self._resolve_rule_set(inline_rule_set=pack.get("rule_set"))
        tags = normalize_tags(pack.get("tags"))
        return {
            "search_spec": normalize_search_spec(pack.get("search_spec") or default_search_spec()),
            "tags": tags,
            "rule_set": {
                "id": rule_set.get("id"),
                "name": rule_set.get("name"),
                "description": rule_set.get("description"),
                "version": rule_set.get("version"),
                "definition": rule_set.get("definition_json"),
            },
        }

    def _schedule_job_next_run(self, job_id: int, interval_minutes: int) -> None:
        workspace = self._ensure_builtin_rule_set()
        index = self._find_job_index(workspace.get("jobs", []), job_id)
        if index < 0:
            return
        workspace["jobs"][index]["next_run_at"] = (datetime.now(timezone.utc) + timedelta(minutes=int(interval_minutes))).isoformat()
        workspace["jobs"][index]["updated_at"] = utc_now_iso()
        self._save_workspace(workspace)

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
                "days": payload.get("days", 1),
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
                tags=payload.get("tags"),
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
                "group_name": normalize_group_name(payload.get("group_name")),
                "next_run_at": next_run_at,
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
                "tags": normalize_tags(payload.get("tags")),
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
                    "days": payload.get("days", 1),
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
                tags=payload.get("tags", current_pack.get("tags")),
            ),
        )
        current.update(
            {
                "name": name,
                "interval_minutes": interval,
                "enabled": 1 if enabled else 0,
                "group_name": (
                    normalize_group_name(payload.get("group_name"))
                    if "group_name" in payload
                    else normalize_group_name(current.get("group_name"))
                ),
                "next_run_at": next_run_at,
                "updated_at": now,
                "tags": normalize_tags(payload.get("tags", current_pack.get("tags"))),
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
            if self._running_run_for_job(int(job["id"])) is not None:
                continue
            try:
                self.run_job_now(int(job["id"]))
                triggered += 1
            except Exception:
                failed += 1
        return {"triggered": triggered, "failed": failed}
