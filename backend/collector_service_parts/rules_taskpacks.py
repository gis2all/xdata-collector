from __future__ import annotations

from .common import *  # noqa: F401,F403

class RuleTaskPackMixin:
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
        tags: Any = None,
    ) -> dict[str, Any]:
        return {
            "meta": {"name": name, "description": description, "updated_at": updated_at},
            "tags": normalize_tags(tags),
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
                tags=[],
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
                tags=current.get("tags") or [],
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
