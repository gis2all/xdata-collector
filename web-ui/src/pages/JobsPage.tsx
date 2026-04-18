import { useEffect, useMemo, useState } from "react";
import {
  JobBatchAction,
  JobBatchResponse,
  JobRecord,
  RuleSetDefinition,
  TaskPackSummary,
  batchJobs,
  createJob,
  createTaskPack,
  deleteJob,
  getJob,
  getTaskPack,
  listJobs,
  listTaskPacks,
  purgeJob,
  restoreJob,
  runJobNow,
  toggleJob,
  updateJob,
  updateTaskPack,
} from "../api";
import { DEFAULT_RULE_SET_DEFINITION, DEFAULT_SEARCH_SPEC, buildQueryPreview, cloneRuleDefinition, cloneSearchSpec } from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { formatUtcPlus8Time } from "../time";

type JobStatusFilter = "active" | "all" | "deleted";
type DrawerMode = "create" | "view" | "edit";
type JobSelectionState = "none" | "active" | "deleted" | "mixed";
type RefreshOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
};

type JobFormState = {
  name: string;
  interval_minutes: number;
  enabled: boolean;
  pack_name: string | null;
  import_pack_name: string;
  search_spec: ReturnType<typeof cloneSearchSpec>;
  rule_set: {
    id?: number | null;
    name: string;
    description: string;
    version: number;
    definition: RuleSetDefinition;
  };
};

type BatchActionSpec = {
  action: JobBatchAction;
  label: string;
  tone?: "danger" | "ghost";
};

const DEFAULT_FORM: JobFormState = {
  name: "mining-watch",
  interval_minutes: 60,
  enabled: true,
  pack_name: null,
  import_pack_name: "",
  search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
  rule_set: {
    id: 1,
    name: "Default Rule Set",
    description: "Built-in opportunity discovery rules.",
    version: 1,
    definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
  },
};

const ACTIVE_BATCH_ACTIONS: BatchActionSpec[] = [
  { action: "enable", label: "批量启用", tone: "ghost" },
  { action: "disable", label: "批量停用", tone: "ghost" },
  { action: "run_now", label: "批量立即运行" },
  { action: "delete", label: "批量删除", tone: "danger" },
];

const DELETED_BATCH_ACTIONS: BatchActionSpec[] = [
  { action: "restore", label: "批量恢复" },
  { action: "purge", label: "批量彻底删除", tone: "danger" },
];

function jobState(job: JobRecord) {
  if (job.deleted_at) return "已删除";
  return job.enabled ? "已启用" : "已停用";
}

function jobSelectionState(status: JobStatusFilter, allMatchingSelected: boolean, selectedIds: number[], selectedDeletedById: Record<number, boolean>) {
  if (allMatchingSelected) {
    if (status === "active") return "active" as JobSelectionState;
    if (status === "deleted") return "deleted" as JobSelectionState;
    return "mixed" as JobSelectionState;
  }
  if (!selectedIds.length) return "none" as JobSelectionState;
  const deletedStates = new Set(selectedIds.map((id) => Boolean(selectedDeletedById[id])));
  if (deletedStates.size > 1) return "mixed" as JobSelectionState;
  return deletedStates.has(true) ? "deleted" : "active";
}

function batchActionMessage(result: JobBatchResponse) {
  const summary = `已成功 ${result.succeeded} 条，失败 ${result.failed} 条`;
  if (result.action === "run_now" && result.failed_items.length) {
    return [summary, ...result.failed_items.slice(0, 3).map((item) => `${item.name}: ${item.error}`)].join("\n");
  }
  return summary;
}

function batchConfirmText(action: JobBatchAction, count: number) {
  if (action === "delete") return `确认删除 ${count} 条任务吗？`;
  if (action === "purge") return `确认彻底删除 ${count} 条任务吗？此操作不可恢复。`;
  if (action === "run_now") return `确认顺序执行 ${count} 条任务吗？`;
  return "";
}

function buildPackPayload(form: JobFormState, packName: string) {
  return {
    meta: {
      name: packName,
      description: form.rule_set.description,
    },
    search_spec: cloneSearchSpec(form.search_spec),
    rule_set: {
      id: form.rule_set.id ?? null,
      name: form.rule_set.name,
      description: form.rule_set.description,
      version: form.rule_set.version,
      definition: cloneRuleDefinition(form.rule_set.definition),
    },
  };
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [taskPacks, setTaskPacks] = useState<TaskPackSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [status, setStatus] = useState<JobStatusFilter>("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<JobFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [savingPack, setSavingPack] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState("");
  const [selectedDeletedById, setSelectedDeletedById] = useState<Record<number, boolean>>({});

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const selectedOnPage = allMatchingSelected ? jobs.length : jobs.filter((job) => selectedIds.includes(job.id)).length;
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const allPageSelected = jobs.length > 0 && selectedOnPage === jobs.length;
  const selectionState = useMemo(
    () => jobSelectionState(status, allMatchingSelected, selectedIds, selectedDeletedById),
    [status, allMatchingSelected, selectedIds, selectedDeletedById],
  );
  const showSelectAllMatching = !allMatchingSelected && jobs.length > 0 && selectedOnPage === jobs.length && total > jobs.length;
  const batchActionSpecs = useMemo(() => {
    if (status === "active") return ACTIVE_BATCH_ACTIONS;
    if (status === "deleted") return DELETED_BATCH_ACTIONS;
    return [...ACTIVE_BATCH_ACTIONS, ...DELETED_BATCH_ACTIONS];
  }, [status]);

  async function loadTaskPacks() {
    const data = await listTaskPacks();
    const items = data.items || [];
    setTaskPacks(items);
    setForm((prev) => ({ ...prev, import_pack_name: prev.import_pack_name || items[0]?.pack_name || "" }));
  }

  async function loadJobs(nextPage = page, nextQuery = query, nextStatus = status, allowPageFallback = false) {
    setLoading(true);
    setError("");
    try {
      const data = await listJobs({ page: nextPage, page_size: pageSize, query: nextQuery || undefined, status: nextStatus });
      let items = data.items || [];
      let totalItems = data.total || 0;
      let currentPage = data.page || nextPage;

      if (allowPageFallback && currentPage > 1 && items.length === 0 && totalItems > 0) {
        const fallback = await listJobs({ page: 1, page_size: pageSize, query: nextQuery || undefined, status: nextStatus });
        items = fallback.items || [];
        totalItems = fallback.total || 0;
        currentPage = fallback.page || 1;
      }

      setJobs(items);
      setTotal(totalItems);
      setPage(currentPage);
      setSelectedDeletedById((prev) => {
        if (!selectedIds.length) return prev;
        const next = { ...prev };
        for (const job of items) {
          if (selectedIds.includes(job.id)) {
            next[job.id] = Boolean(job.deleted_at);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setJobs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTaskPacks().catch(() => undefined);
    loadJobs(1, query, status).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectionState === "mixed") {
      setSelectionWarning("当前选择同时包含已删除和未删除任务，请先按状态筛选或重新勾选。");
      return;
    }
    setSelectionWarning("");
  }, [selectionState]);

  function resetForm() {
    setForm({ ...DEFAULT_FORM, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC), rule_set: { ...DEFAULT_FORM.rule_set, definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION) }, import_pack_name: taskPacks[0]?.pack_name || "" });
  }

  function clearSelection() {
    setSelectedIds([]);
    setAllMatchingSelected(false);
    setSelectionWarning("");
    setSelectedDeletedById({});
  }

  function openCreate() {
    setSelectedJob(null);
    setDrawerMode("create");
    resetForm();
    setDrawerOpen(true);
  }

  async function openJob(job: JobRecord, mode: DrawerMode = "view") {
    try {
      const detail = await getJob(job.id);
      setSelectedJob(detail);
      setDrawerMode(mode);
      const pack = detail.pack_name ? await getTaskPack(detail.pack_name).catch(() => null) : null;
      setForm({
        name: detail.name,
        interval_minutes: detail.interval_minutes,
        enabled: Boolean(detail.enabled),
        pack_name: detail.pack_name,
        import_pack_name: detail.pack_name || taskPacks[0]?.pack_name || "",
        search_spec: cloneSearchSpec(pack?.search_spec || detail.search_spec_json),
        rule_set: {
          id: pack?.rule_set?.id ?? detail.rule_set_id ?? null,
          name: pack?.rule_set?.name || detail.rule_set_summary?.name || "Default Rule Set",
          description: pack?.rule_set?.description || detail.rule_set_summary?.description || "",
          version: pack?.rule_set?.version || detail.rule_set_summary?.version || 1,
          definition: cloneRuleDefinition(pack?.rule_set?.definition || DEFAULT_RULE_SET_DEFINITION),
        },
      });
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务详情失败");
    }
  }

  function updateForm<K extends keyof JobFormState>(key: K, value: JobFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRowSelection(job: JobRecord, checked: boolean) {
    if (allMatchingSelected) {
      clearSelection();
      return;
    }
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(job.id) ? prev : [...prev, job.id];
      }
      return prev.filter((item) => item !== job.id);
    });
    setSelectedDeletedById((prev) => {
      if (!checked) {
        const next = { ...prev };
        delete next[job.id];
        return next;
      }
      return { ...prev, [job.id]: Boolean(job.deleted_at) };
    });
  }

  function togglePageSelection() {
    if (allMatchingSelected || allPageSelected) {
      clearSelection();
      return;
    }
    const pageIds = jobs.map((job) => job.id);
    setSelectedIds((prev) => {
      const next = [...prev];
      for (const id of pageIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
    setSelectedDeletedById((prev) => {
      const next = { ...prev };
      for (const job of jobs) {
        next[job.id] = Boolean(job.deleted_at);
      }
      return next;
    });
  }

  function selectAllMatchingJobs() {
    setAllMatchingSelected(true);
    setSelectedIds([]);
  }

  function isBatchActionEnabled(action: JobBatchAction) {
    if (!selectedCount || selectionState === "none" || selectionState === "mixed") return false;
    const requiresDeleted = action === "restore" || action === "purge";
    return requiresDeleted ? selectionState === "deleted" : selectionState === "active";
  }

  async function refreshJobs(options: RefreshOptions = {}) {
    const nextPage = options.page ?? page;
    const nextQuery = options.query ?? query;
    const nextStatus = options.status ?? status;
    const keepDrawer = options.keepDrawer ?? true;
    const reloadSelected = options.reloadSelected ?? true;

    await loadJobs(nextPage, nextQuery, nextStatus, true);
    if (!keepDrawer) {
      setSelectedJob(null);
      setDrawerMode("create");
      resetForm();
      return;
    }
    if (reloadSelected && selectedJob) {
      const fresh = await getJob(selectedJob.id).catch(() => null);
      if (fresh) {
        setSelectedJob(fresh);
      }
    }
  }

  async function handleImportPack() {
    if (!form.import_pack_name) return;
    setError("");
    try {
      const pack = await getTaskPack(form.import_pack_name);
      setForm((prev) => ({
        ...prev,
        search_spec: cloneSearchSpec(pack.search_spec),
        rule_set: {
          id: pack.rule_set.id ?? null,
          name: pack.rule_set.name,
          description: pack.rule_set.description || "",
          version: pack.rule_set.version || 1,
          definition: cloneRuleDefinition(pack.rule_set.definition),
        },
        pack_name: prev.pack_name,
      }));
      setActionMessage(`已导入任务包 ${pack.meta.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包失败");
    }
  }

  async function handleSavePack(mode: "create" | "overwrite") {
    const suggestedName = form.pack_name || form.name || "task-pack";
    const targetName = mode === "overwrite" && form.pack_name ? form.pack_name : window.prompt("请输入任务包名称", suggestedName)?.trim();
    if (!targetName) return;

    setSavingPack(true);
    setError("");
    try {
      const payload = buildPackPayload(form, targetName);
      const saved = mode === "overwrite" && form.pack_name ? await updateTaskPack(form.pack_name, payload) : await createTaskPack({ pack_name: targetName, ...payload });
      setForm((prev) => ({ ...prev, pack_name: saved.pack_name, import_pack_name: saved.pack_name }));
      setActionMessage(mode === "overwrite" ? "已覆盖当前任务包" : `已导出任务包 ${saved.pack_name}`);
      await loadTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (!form.name.trim()) throw new Error("任务名称不能为空");
      if (!form.search_spec.all_keywords.length && !form.search_spec.raw_query.trim()) throw new Error("请至少填写关键词或原生查询");
      const payload = {
        name: form.name.trim(),
        interval_minutes: Number(form.interval_minutes),
        enabled: form.enabled,
        search_spec: form.search_spec,
        rule_set: {
          id: form.rule_set.id ?? null,
          name: form.rule_set.name,
          description: form.rule_set.description,
          version: form.rule_set.version,
          definition: cloneRuleDefinition(form.rule_set.definition),
        },
      };
      if (drawerMode === "create") {
        const created = await createJob(payload as any);
        setSelectedJob(created);
        setDrawerMode("view");
        setDrawerOpen(true);
        await refreshJobs({ page: 1, query: "", status: "active", reloadSelected: false });
      } else if (selectedJob) {
        const updated = await updateJob(selectedJob.id, payload as any);
        setSelectedJob(updated);
        setDrawerMode("view");
        setDrawerOpen(true);
        await refreshJobs();
      }
      setActionMessage("已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(job: JobRecord) {
    if (!window.confirm(`确认删除任务 ${job.name} 吗？`)) return;
    setError("");
    try {
      await deleteJob(job.id);
      setActionMessage("已删除");
      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
        setDrawerOpen(false);
      }
      await refreshJobs({ keepDrawer: false, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleRestore(job: JobRecord) {
    setError("");
    try {
      const restored = await restoreJob(job.id);
      setActionMessage("已恢复");
      setSelectedJob(restored);
      setDrawerMode("view");
      setDrawerOpen(true);
      const nextStatus = status === "deleted" ? "active" : status;
      if (status === "deleted") setStatus("active");
      await refreshJobs({ page: 1, status: nextStatus, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    }
  }

  async function handlePurge(job: JobRecord) {
    if (!window.confirm(`确认永久删除任务 ${job.name} 吗？`)) return;
    setError("");
    try {
      await purgeJob(job.id);
      setActionMessage("已永久删除");
      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
        setDrawerOpen(false);
      }
      await refreshJobs({ keepDrawer: false, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "永久删除失败");
    }
  }

  async function handleRunNow(job: JobRecord) {
    setError("");
    try {
      await runJobNow(job.id);
      setActionMessage(`已触发 ${job.name} 立即运行`);
      await refreshJobs({ reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "立即运行失败");
    }
  }

  async function handleToggle(job: JobRecord) {
    setError("");
    try {
      const updated = await toggleJob(job.id, !Boolean(job.enabled));
      setActionMessage(updated.enabled ? "已启用" : "已停用");
      if (selectedJob?.id === job.id) {
        setSelectedJob(updated);
      }
      await refreshJobs({ reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换状态失败");
    }
  }

  async function handleBatchAction(action: JobBatchAction) {
    if (!isBatchActionEnabled(action)) return;
    const confirmText = batchConfirmText(action, selectedCount);
    if (confirmText && !window.confirm(confirmText)) return;

    setError("");
    try {
      const result = allMatchingSelected
        ? await batchJobs({ action, mode: "all_matching", query: query || undefined, status })
        : await batchJobs({ action, ids: [...selectedIds] });
      setActionMessage(batchActionMessage(result));
      clearSelection();

      const shouldSwitchToAll = action === "restore" && status === "deleted" && result.succeeded > 0;
      const nextStatus = shouldSwitchToAll ? "all" : status;
      if (shouldSwitchToAll) {
        setStatus("all");
      }
      await refreshJobs({ page: shouldSwitchToAll ? 1 : page, status: nextStatus, keepDrawer: false, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量操作失败");
    }
  }

  function submitQuery() {
    setQuery(queryInput.trim());
    clearSelection();
    refreshJobs({ page: 1, query: queryInput.trim() }).catch(() => undefined);
  }

  function renderActions(job: JobRecord) {
    if (job.deleted_at) {
      return (
        <div className="table-actions">
          <button type="button" className="ghost" onClick={() => openJob(job, "view")}>{"查看"}</button>
          <button type="button" onClick={() => handleRestore(job)}>{"恢复"}</button>
          <button type="button" className="danger" onClick={() => handlePurge(job)}>{"彻底删除"}</button>
        </div>
      );
    }
    return (
      <div className="table-actions">
        <button type="button" className="ghost" onClick={() => openJob(job, "view")}>{"查看"}</button>
        <button type="button" className="ghost" onClick={() => openJob(job, "edit")}>{"编辑"}</button>
        <button type="button" onClick={() => handleRunNow(job)}>{"立即运行"}</button>
        <button type="button" className="ghost" onClick={() => handleToggle(job)}>{job.enabled ? "停用" : "启用"}</button>
        <button type="button" className="danger" onClick={() => handleDelete(job)}>{"删除"}</button>
      </div>
    );
  }

  const drawerDisabled = Boolean(selectedJob?.deleted_at) && drawerMode !== "create";

  return (
    <div className="card jobs-page" data-testid="jobs-page">
      <div className="jobs-header">
        <div>
          <h3>{"自动任务"}</h3>
          <p className="kv">{"任务正文来自 task pack 文件，调度字段只保存在轻量 workspace job registry 中。"}</p>
        </div>
        <div className="jobs-toolbar">
          <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder={"按任务名称搜索"} aria-label="搜索任务" />
          <select
            value={status}
            onChange={(e) => {
              const nextStatus = e.target.value as JobStatusFilter;
              setStatus(nextStatus);
              clearSelection();
              refreshJobs({ page: 1, status: nextStatus }).catch(() => undefined);
            }}
            aria-label="任务状态"
          >
            <option value="active">{"启用中"}</option>
            <option value="all">{"全部"}</option>
            <option value="deleted">{"已删除"}</option>
          </select>
          <button type="button" onClick={submitQuery}>{"搜索"}</button>
          <button type="button" data-testid="create-job-button" onClick={openCreate}>{"新建任务"}</button>
        </div>
      </div>

      <div className="jobs-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <span className="kv">{`selected=${selectedCount}`}</span>
        <span className="kv">{`total=${total}`}</span>
        <span className="kv">{`status=${status}`}</span>
        {showSelectAllMatching && (
          <button type="button" className="ghost" aria-label="select-all-matching-jobs" onClick={selectAllMatchingJobs}>
            {`已选中本页 ${jobs.length} 条。选择全部 ${total} 条匹配结果`}
          </button>
        )}
        {selectedCount > 0 && (
          <button type="button" className="ghost" aria-label="clear-job-selection" onClick={clearSelection}>
            {"清空选择"}
          </button>
        )}
        {batchActionSpecs.map((item) => (
          <button
            key={item.action}
            type="button"
            className={item.tone === "danger" ? "danger" : item.tone === "ghost" ? "ghost" : undefined}
            disabled={!isBatchActionEnabled(item.action)}
            onClick={() => handleBatchAction(item.action).catch(() => undefined)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}
      {selectionWarning && <div className="alert error">{selectionWarning}</div>}
      {actionMessage && <div className="alert success" style={{ whiteSpace: "pre-line" }}>{actionMessage}</div>}

      <div className="jobs-layout">
        <div className="jobs-table-wrap">
          {loading ? (
            <div className="searching"><span className="spinner" /> {"正在加载任务..."}</div>
          ) : (
            <table className="table jobs-table">
              <thead>
                <tr>
                  <th>
                    <label className="field checkbox-row" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input aria-label="jobs-select-page" type="checkbox" checked={allPageSelected} onChange={togglePageSelection} />
                      <span>{"本页全选"}</span>
                    </label>
                  </th>
                  <th>{"任务"}</th>
                  <th>{"规则集"}</th>
                  <th>{"查询摘要"}</th>
                  <th>{"间隔"}</th>
                  <th>{"状态"}</th>
                  <th>{"下次运行"}</th>
                  <th>{"最近运行"}</th>
                  <th>{"操作"}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className={job.deleted_at ? "row-deleted" : ""}>
                    <td>
                      <input
                        aria-label={`select-job-${job.id}`}
                        type="checkbox"
                        checked={allMatchingSelected || selectedIds.includes(job.id)}
                        onChange={(event) => toggleRowSelection(job, event.target.checked)}
                      />
                    </td>
                    <td>
                      <div className="job-name">{job.name}</div>
                      <div className="kv">#{job.id}</div>
                    </td>
                    <td>
                      <div>{job.rule_set_summary?.name || "--"}</div>
                      <div className="kv">{job.pack_name}</div>
                    </td>
                    <td><div className="collector-text-snippet">{buildQueryPreview(job.search_spec_json) || "--"}</div></td>
                    <td>{job.interval_minutes} {"分钟"}</td>
                    <td><span className={`badge ${job.deleted_at ? "b" : job.enabled ? "a" : ""}`}>{jobState(job)}</span></td>
                    <td>{formatUtcPlus8Time(job.next_run_at)}</td>
                    <td>
                      <div>{job.last_run_status || "--"}</div>
                      <div className="kv">{formatUtcPlus8Time(job.last_run_ended_at || job.last_run_started_at)}</div>
                    </td>
                    <td>{renderActions(job)}</td>
                  </tr>
                ))}
                {!jobs.length && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "#64748b" }}>{status === "deleted" ? "暂无已删除任务" : "暂无任务"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          <div className="jobs-pagination">
            <span className="kv">{"共 "}{total}{" 条"}</span>
            <div className="row">
              <button type="button" className="ghost" disabled={page <= 1} onClick={() => refreshJobs({ page: page - 1 }).catch(() => undefined)}>{"上一页"}</button>
              <span className="kv">{"第 "}{page}{" / "}{totalPages}{" 页"}</span>
              <button type="button" className="ghost" disabled={page >= totalPages} onClick={() => refreshJobs({ page: page + 1 }).catch(() => undefined)}>{"下一页"}</button>
            </div>
          </div>
        </div>

        <aside className={`jobs-drawer ${drawerOpen ? "open" : ""}`}>
          {drawerOpen ? (
            <>
              <div className="drawer-header">
                <div>
                  <h4>{drawerMode === "create" ? "新建任务" : drawerMode === "edit" ? "编辑任务" : "任务详情"}</h4>
                  <div className="kv">{selectedJob ? `任务 #${selectedJob.id}` : "未保存新任务"}</div>
                </div>
                <button type="button" className="ghost" onClick={() => { setSelectedJob(null); setDrawerMode("create"); resetForm(); setDrawerOpen(false); }}>{"关闭"}</button>
              </div>

              {selectedJob && (
                <div className="drawer-section">
                  <div className="kv">{"状态："}{jobState(selectedJob)}</div>
                  <div className="kv">{"最近运行："}{selectedJob.last_run_status || "--"}</div>
                  <div className="kv">{"下次运行："}{formatUtcPlus8Time(selectedJob.next_run_at)}</div>
                  {selectedJob.deleted_at && <div className="kv">{"删除时间："}{formatUtcPlus8Time(selectedJob.deleted_at)}</div>}
                </div>
              )}

              <div className="drawer-section">
                <div className="collector-grid collector-grid-2">
                  <label className="field">
                    <span>{"任务名称"}</span>
                    <input aria-label="job-name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} disabled={drawerDisabled} />
                  </label>
                  <label className="field">
                    <span>{"执行间隔（分钟）"}</span>
                    <input aria-label="job-interval" type="number" value={form.interval_minutes} onChange={(e) => updateForm("interval_minutes", Number(e.target.value))} disabled={drawerDisabled} />
                  </label>
                </div>
                <div className="collector-grid collector-grid-2" style={{ marginTop: 8 }}>
                  <label className="field checkbox-row">
                    <span>{"启用"}</span>
                    <input type="checkbox" checked={form.enabled} onChange={(e) => updateForm("enabled", e.target.checked)} disabled={drawerDisabled} />
                  </label>
                  <label className="field">
                    <span>{"当前规则"}</span>
                    <input value={form.rule_set.name} readOnly />
                  </label>
                </div>
                <div className="collector-toolbar" style={{ marginTop: 12 }}>
                  <select aria-label="job-pack-select" value={form.import_pack_name} onChange={(e) => updateForm("import_pack_name", e.target.value)} disabled={drawerDisabled}>
                    <option value="">{"选择任务包"}</option>
                    {taskPacks.map((item) => (
                      <option key={item.pack_name} value={item.pack_name}>{item.name}</option>
                    ))}
                  </select>
                  <button type="button" className="ghost" aria-label="import-job-pack" onClick={() => handleImportPack().catch(() => undefined)} disabled={drawerDisabled}>{"导入任务包"}</button>
                  <button type="button" className="ghost" aria-label="export-job-pack" onClick={() => handleSavePack("create").catch(() => undefined)} disabled={drawerDisabled || savingPack}>{"导出为任务包"}</button>
                  <button type="button" aria-label="overwrite-job-pack" onClick={() => handleSavePack("overwrite").catch(() => undefined)} disabled={drawerDisabled || savingPack || !form.pack_name}>{"覆盖当前任务包"}</button>
                </div>
                <div className="collector-query-preview" style={{ marginTop: 12 }}>
                  <div className="collector-subtitle">{"查询摘要"}</div>
                  <code>{buildQueryPreview(form.search_spec) || "--"}</code>
                </div>
              </div>

              <div className="drawer-section">
                <h5>{"搜索条件"}</h5>
                <SearchSpecEditor value={form.search_spec} onChange={(next) => updateForm("search_spec", next)} disabled={drawerDisabled} />
              </div>

              {selectedJob?.last_run_stats && (
                <div className="drawer-section">
                  <h5>{"最近运行统计"}</h5>
                  <pre className="drawer-json">{JSON.stringify(selectedJob.last_run_stats, null, 2)}</pre>
                </div>
              )}

              <div className="drawer-footer">
                {!selectedJob ? (
                  <button type="button" aria-label="submit-job" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存任务"}</button>
                ) : selectedJob.deleted_at ? (
                  <>
                    <button type="button" onClick={() => handleRestore(selectedJob)}>{"恢复任务"}</button>
                    <button type="button" className="danger" onClick={() => handlePurge(selectedJob)}>{"彻底删除"}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存任务"}</button>
                    <button type="button" className="ghost" onClick={() => handleRunNow(selectedJob)}>{"立即运行"}</button>
                    <button type="button" className="ghost" onClick={() => handleToggle(selectedJob)}>{selectedJob.enabled ? "停用任务" : "启用任务"}</button>
                    <button type="button" className="danger" onClick={() => handleDelete(selectedJob)}>{"删除任务"}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="drawer-empty">
              <h4>{"任务面板"}</h4>
              <p>{"选择一个任务查看详情，或新建任务并绑定 task pack。"}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
