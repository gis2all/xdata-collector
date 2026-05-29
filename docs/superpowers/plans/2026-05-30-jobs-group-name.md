# Job Group Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-value `group_name` field to automatic jobs so users can edit it in the Jobs workspace, see it in the jobs table, and search jobs by it without changing task-pack behavior.

**Architecture:** Persist `group_name` only on the workspace job registry entry, not in task-pack JSON. Extend backend normalization, serialization, and list-query matching so the field round-trips cleanly and defaults to `null` for historical data. On the frontend, add a dedicated form input plus a table column while keeping tags, pack draft comparison, and pack save/load behavior unchanged.

**Tech Stack:** Python backend (`backend/workspace_store.py`, `backend/collector_service.py`, `unittest`/`pytest`), React + TypeScript (`web-ui/src/api.ts`, `web-ui/src/pages/JobsPage.tsx`), Vitest + Testing Library.

---

## File Map

- `backend/workspace_store.py`
  - Normalize `group_name` on job registry entries loaded from workspace JSON or legacy bootstrap.
  - Keep missing historical values as `None`.
- `backend/collector_service.py`
  - Accept `group_name` on create/update.
  - Serialize `group_name` in `get_job()` / `list_jobs()`.
  - Include `group_name` in text search matching.
- `tests/test_workspace_store.py`
  - Prove workspace bootstrap trims `group_name` and fills missing values with `None`.
- `tests/test_collector_service.py`
  - Prove create/update/list/search round-trip `group_name`.
- `web-ui/src/api.ts`
  - Extend `JobRecord`, `createJob()`, and `updateJob()` payload types.
- `web-ui/src/pages/JobsPage.tsx`
  - Add `group_name` to form state and save payload.
  - Add a “分组” table column between pack and tags.
  - Render a `分组` input under `任务名称`.
  - Keep task-pack comparable/payload helpers untouched so `group_name` never pollutes pack state.
- `web-ui/src/pages/JobsPage.test.tsx`
  - Verify the new field renders, saves, reloads, and shows in the table.

### Task 1: Backend `group_name` Storage, Serialization, and Search

**Files:**
- Modify: `tests/test_workspace_store.py`
- Modify: `tests/test_collector_service.py`
- Modify: `backend/workspace_store.py:265-302`
- Modify: `backend/collector_service.py:857-889`
- Modify: `backend/collector_service.py:1260-1401`

- [ ] **Step 1: Write the failing backend tests**

Add a workspace-store regression test in `tests/test_workspace_store.py` near the other `WorkspaceStoreTests`:

```python
    def test_workspace_jobs_preserve_trimmed_group_name_and_fill_missing_null(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_dir = root / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            workspace_path = config_dir / "workspace.json"

            workspace_payload = {
                "version": 2,
                "meta": {"updated_at": "2026-05-30T00:00:00+00:00", "next_job_id": 3},
                "environment": {
                    "db_path": "data/app.db",
                    "runtime_dir": "data/runtime",
                    "env_file": ".env",
                },
                "jobs": [
                    {
                        "id": 1,
                        "name": "alpha-watch",
                        "enabled": 1,
                        "interval_minutes": 30,
                        "pack_name": "alpha-watch",
                        "pack_path": "config/packs/alpha-watch.json",
                        "group_name": "  Alpha Ops  ",
                        "next_run_at": None,
                        "created_at": "2026-05-30T00:00:00+00:00",
                        "updated_at": "2026-05-30T00:00:00+00:00",
                        "deleted_at": None,
                    },
                    {
                        "id": 2,
                        "name": "beta-watch",
                        "enabled": 1,
                        "interval_minutes": 45,
                        "pack_name": "beta-watch",
                        "pack_path": "config/packs/beta-watch.json",
                        "next_run_at": None,
                        "created_at": "2026-05-30T00:00:00+00:00",
                        "updated_at": "2026-05-30T00:00:00+00:00",
                        "deleted_at": None,
                    },
                ],
            }
            workspace_path.write_text(json.dumps(workspace_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            store = WorkspaceStore(
                workspace_path=workspace_path,
                legacy_config_dir=config_dir,
                legacy_db_path=root / "data" / "app.db",
            )

            workspace = store.get_workspace()

            self.assertEqual(workspace["jobs"][0]["group_name"], "Alpha Ops")
            self.assertIsNone(workspace["jobs"][1]["group_name"])
```

Add a collector-service round-trip test in `tests/test_collector_service.py` near the existing job lifecycle tests:

```python
    def test_job_group_name_round_trips_and_is_searchable(self) -> None:
        default_rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        created = self.service.create_job(
            {
                "name": "alpha-watch",
                "group_name": "  Alpha Ops  ",
                "interval_minutes": 30,
                "enabled": True,
                "rule_set_id": default_rule_set_id,
                "search_spec": {
                    "all_keywords": ["alpha"],
                    "language_mode": "en",
                    "days_filter": {"mode": "lte", "max": 1},
                },
            }
        )

        self.assertEqual(created["group_name"], "Alpha Ops")
        self.assertEqual(self.service.list_jobs(query="alpha ops")["total"], 1)

        updated = self.service.update_job(int(created["id"]), {"group_name": "Core"})
        self.assertEqual(updated["group_name"], "Core")

        cleared = self.service.update_job(int(created["id"]), {"group_name": ""})
        self.assertIsNone(cleared["group_name"])
        self.assertEqual(self.service.get_job(int(created["id"]))["group_name"], None)
```

- [ ] **Step 2: Run the backend tests to confirm they fail**

Run:

```powershell
python -m pytest tests/test_workspace_store.py tests/test_collector_service.py -k group_name -vv
```

Expected: FAIL because the normalized workspace jobs and serialized collector jobs do not expose `group_name` yet.

- [ ] **Step 3: Implement backend normalization and service support**

In `backend/workspace_store.py`, add a small helper next to `normalize_tags` and use it from job normalization:

```python
def normalize_group_name(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
```

Update `_normalize_job_registry_entry` so every workspace job carries the field:

```python
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
        "group_name": normalize_group_name(payload.get("group_name")),
        "next_run_at": payload.get("next_run_at") or None,
        "created_at": str(payload.get("created_at") or utc_now_iso()),
        "updated_at": str(payload.get("updated_at") or payload.get("created_at") or utc_now_iso()),
        "deleted_at": payload.get("deleted_at") or None,
    }
```

In `backend/collector_service.py`, import the helper and wire it through query matching, serialization, create, and update:

```python
from backend.workspace_store import (
    RuntimeStateStore,
    WorkspaceStore,
    default_builtin_rule_set,
    normalize_group_name,
    normalize_tags,
)
```

```python
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
```

```python
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
```

```python
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
```

```python
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
```

Do not add `group_name` to `_task_pack_payload` or any task-pack JSON shape.

- [ ] **Step 4: Run the backend tests again**

Run:

```powershell
python -m pytest tests/test_workspace_store.py tests/test_collector_service.py -k group_name -vv
```

Expected: PASS for both new tests.

- [ ] **Step 5: Commit the backend slice**

Run:

```powershell
git add tests/test_workspace_store.py tests/test_collector_service.py backend/workspace_store.py backend/collector_service.py
git commit -m "feat: add job group_name backend support"
```

### Task 2: Frontend `group_name` Editing and Table Display

**Files:**
- Modify: `web-ui/src/pages/JobsPage.test.tsx`
- Modify: `web-ui/src/api.ts:271-730`
- Modify: `web-ui/src/pages/JobsPage.tsx:63-255`
- Modify: `web-ui/src/pages/JobsPage.tsx:767-1048`
- Modify: `web-ui/src/pages/JobsPage.tsx:1715-1805`

- [ ] **Step 1: Write the failing frontend tests**

First extend `makeJob` in `web-ui/src/pages/JobsPage.test.tsx` so tests can override `group_name` cleanly by inserting `group_name: null` right after `pack_path`:

```ts
    pack_name: `job-${id}`,
    pack_path: `config/packs/job-${id}.json`,
    group_name: null,
    tags: [],
    enabled: 1,
```

Then add a create-flow test near the existing save tests:

```ts
  it("saves a trimmed group_name without mixing it into task-pack tags", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-alpha" } });
    fireEvent.change(screen.getByLabelText("job-group-name"), { target: { value: "  Alpha Ops  " } });
    fireEvent.change(screen.getByLabelText("job-pack-select"), { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("job-load-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    fireEvent.click(screen.getByLabelText("submit-job"));

    await waitFor(() => {
      expect(createJobMock).toHaveBeenCalled();
    });

    const payload = createJobMock.mock.calls[0]?.[0] as any;
    expect(payload.group_name).toBe("Alpha Ops");
    expect(payload.tags).toEqual(["defi", "wallet"]);
  });
```

Add a table-and-edit test for existing jobs:

```ts
  it("renders the group column and lets an existing job clear group_name", async () => {
    listJobsMock.mockResolvedValue({
      page: 1,
      page_size: 10,
      total: 1,
      items: [makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" }, group_name: "Alpha Ops", tags: ["defi"] })],
    } as any);
    getJobMock.mockResolvedValue(makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" }, group_name: "Alpha Ops", tags: ["defi"] }) as any);
    updateJobMock.mockResolvedValue(makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" }, group_name: null, tags: ["defi"] }) as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("jobs-table-wrap")).getByText("分组")).toBeInTheDocument();
      expect(within(screen.getByTestId("jobs-table-wrap")).getByText("Alpha Ops")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("alpha-watch-job"));

    await waitFor(() => {
      expect(screen.getByLabelText("job-group-name")).toHaveValue("Alpha Ops");
    });

    fireEvent.change(screen.getByLabelText("job-group-name"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("submit-job"));

    await waitFor(() => {
      expect(updateJobMock).toHaveBeenCalled();
    });

    const payload = updateJobMock.mock.calls[0]?.[1] as any;
    expect(payload.group_name).toBeNull();
  });
```

- [ ] **Step 2: Run the frontend tests to confirm they fail**

Run:

```powershell
npm test -- web-ui/src/pages/JobsPage.test.tsx
```

Expected: FAIL because `JobRecord`, the Jobs form, and the jobs table do not know about `group_name` yet.

- [ ] **Step 3: Implement the frontend type, form, and table changes**

In `web-ui/src/api.ts`, extend the job type and payload contracts.

Add the new field directly to `JobRecord` after `pack_meta`:

```ts
  group_name?: string | null;
```

Add the field to `createJob`:

```ts
export function createJob(payload: {
  name: string;
  group_name?: string | null;
  interval_minutes: number;
  enabled: boolean;
  search_spec: SearchSpec;
  tags?: string[];
  rule_set?: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
  rule_set_id?: number | null;
}) {
  return req<JobRecord>("/jobs/create", { method: "POST", body: JSON.stringify(payload) });
}
```

Add the field to `updateJob`:

```ts
export function updateJob(
  id: number,
  payload: Partial<{
    name: string;
    group_name: string | null;
    interval_minutes: number;
    enabled: boolean;
    search_spec: SearchSpec;
    tags?: string[];
    rule_set?: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
    rule_set_id: number | null;
  }>,
) {
  return req<JobRecord>(`/jobs/${id}/update`, { method: "POST", body: JSON.stringify(payload) });
}
```

In `web-ui/src/pages/JobsPage.tsx`, add `group_name` to form state and keep it out of task-pack helpers:

```ts
type JobFormState = {
  name: string;
  group_name: string;
  interval_minutes: number;
  enabled: boolean;
  pack_name: string | null;
  import_pack_name: string;
  tagsText: string;
  search_spec: ReturnType<typeof cloneSearchSpec>;
  rule_set: {
    id?: number | null;
    name: string;
    description: string;
    version: number;
    definition: RuleSetDefinition;
  };
};

const DEFAULT_FORM: JobFormState = {
  name: "mining-watch",
  group_name: "",
  interval_minutes: 60,
  enabled: true,
  pack_name: null,
  import_pack_name: "",
  tagsText: "",
  search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
  rule_set: {
    id: 1,
    name: "Default Rule Set",
    description: "Built-in opportunity discovery rules.",
    version: 1,
    definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
  },
};
```

Keep `buildJobDraftComparable` and `buildPackPayload` exactly pack-only; do not add `group_name` to either one.

Add the new union member to `JobTableColumnKey`:

```ts
type JobTableColumnKey = "name" | "pack" | "group" | "tags" | "interval" | "status" | "next_run_at" | "last_run";
```

Insert this column object immediately before the existing `tags` column in `JOB_TABLE_COLUMNS`:

```ts
  {
    key: "group",
    label: "分组",
    width: 160,
    render: (job) => job.group_name || "--",
  },
```

Load/save/reset the form field:

```ts
function resetForm() {
  setForm({
    name: DEFAULT_FORM.name,
    group_name: "",
    interval_minutes: DEFAULT_FORM.interval_minutes,
    enabled: DEFAULT_FORM.enabled,
    pack_name: null,
    import_pack_name: taskPacks[0]?.pack_name || "",
    tagsText: "",
    search_spec: cloneSearchSpec(DEFAULT_FORM.search_spec),
    rule_set: {
      id: DEFAULT_FORM.rule_set.id,
      name: DEFAULT_FORM.rule_set.name,
      description: DEFAULT_FORM.rule_set.description,
      version: DEFAULT_FORM.rule_set.version,
      definition: cloneRuleDefinition(DEFAULT_FORM.rule_set.definition),
    },
  });
}
```

```ts
      setForm({
        name: detail.name,
        group_name: detail.group_name || "",
        interval_minutes: detail.interval_minutes,
        enabled: Boolean(detail.enabled),
        pack_name: detail.pack_name || pack?.pack_name || null,
        import_pack_name: detail.pack_name || taskPacks[0]?.pack_name || "",
        tagsText: joinCommaLinesForTextarea(pack?.tags || detail.tags || []),
        search_spec: cloneSearchSpec(pack?.search_spec || detail.search_spec_json),
        rule_set: {
          id: pack?.rule_set?.id ?? detail.rule_set_id ?? null,
          name: pack?.rule_set?.name || detail.rule_set_summary?.name || "Default Rule Set",
          description: pack?.rule_set?.description || detail.rule_set_summary?.description || "",
          version: pack?.rule_set?.version || detail.rule_set_summary?.version || 1,
          definition: cloneRuleDefinition(pack?.rule_set?.definition || DEFAULT_RULE_SET_DEFINITION),
        },
      });
```

```ts
      const payload = {
        name: form.name.trim(),
        group_name: form.group_name.trim() || null,
        interval_minutes: Number(form.interval_minutes),
        enabled: form.enabled,
        tags: splitCommaLines(form.tagsText),
        search_spec: form.search_spec,
        rule_set: {
          id: form.rule_set.id ?? null,
          name: form.rule_set.name,
          description: form.rule_set.description,
          version: form.rule_set.version,
          definition: cloneRuleDefinition(form.rule_set.definition),
        },
      };
```

Render the field under `任务名称`:

```tsx
                  <label className="field">
                    <span>{"任务名称"}</span>
                    <input aria-label="job-name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} disabled={drawerDisabled} />
                  </label>
                  <label className="field">
                    <span>{"分组"}</span>
                    <input aria-label="job-group-name" value={form.group_name} onChange={(e) => updateForm("group_name", e.target.value)} disabled={drawerDisabled} placeholder="如：Alpha / Exchange / Research" />
                  </label>
                  <label className="field">
                    <span>{"执行间隔（分钟）"}</span>
                    <input aria-label="job-interval" type="number" value={form.interval_minutes} onChange={(e) => updateForm("interval_minutes", Number(e.target.value))} disabled={drawerDisabled} />
                  </label>
```

- [ ] **Step 4: Run the frontend tests again**

Run:

```powershell
npm test -- web-ui/src/pages/JobsPage.test.tsx
```

Expected: PASS for the new `group_name` coverage and the pre-existing Jobs-page tests.

- [ ] **Step 5: Commit the frontend slice**

Run:

```powershell
git add web-ui/src/api.ts web-ui/src/pages/JobsPage.tsx web-ui/src/pages/JobsPage.test.tsx
git commit -m "feat: add job group_name to jobs page"
```

### Task 3: Regression Verification

**Files:**
- No code changes expected unless a regression appears during verification.

- [ ] **Step 1: Run the full targeted backend regression**

Run:

```powershell
python -m pytest tests/test_workspace_store.py tests/test_collector_service.py tests/test_api.py -q
```

Expected: PASS. `tests/test_api.py` should stay green because the API layer still forwards generic JSON payloads to the service unchanged.

- [ ] **Step 2: Run the targeted frontend regression**

Run:

```powershell
npm test -- web-ui/src/pages/JobsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the frontend production build**

Run:

```powershell
npm run build
```

Expected: successful production build with no TypeScript errors from the new `group_name` field.

- [ ] **Step 4: Smoke-check the expected behavior manually**

Verify this exact flow in the running app:

1. Create a new job.
2. Fill `任务名称` and `分组`.
3. Load a task pack with tags.
4. Save the job.
5. Confirm the jobs table shows the new `分组` column value.
6. Reopen the job and confirm:
   - `分组` rehydrates correctly
   - `任务标签` still comes from pack tags
   - saving the pack does not include `group_name`

Expected: `group_name` behaves as job metadata only and never leaks into the task-pack editing flow.

- [ ] **Step 5: Commit only if Step 4 required fixes**

If verification required follow-up edits in the known job-group files, run:

```powershell
git add backend/workspace_store.py backend/collector_service.py tests/test_workspace_store.py tests/test_collector_service.py web-ui/src/api.ts web-ui/src/pages/JobsPage.tsx web-ui/src/pages/JobsPage.test.tsx
git commit -m "fix: polish job group_name regression issues"
```

If no follow-up edits were needed, skip this step.
