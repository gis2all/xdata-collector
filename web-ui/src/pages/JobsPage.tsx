import { useEffect, useMemo, useRef, useState } from "react";
import {
  JobBatchAction,
  JobBatchResponse,
  JobRecord,
  RuleSet,
  RuleSetDefinition,
  TaskPackFile,
  TaskPackSummary,
  batchJobs,
  createJob,
  createTaskPack,
  deleteTaskPack,
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
import { RuleSetEditor } from "../components/RuleSetEditor";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { ImportedTaskPackDraft, readImportedTaskPack } from "../taskPacks";
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

function buildJobDraftComparable(form: JobFormState) {
  return {
    search_spec: cloneSearchSpec(form.search_spec),
    rule_set: {
      name: form.rule_set.name.trim(),
      description: form.rule_set.description.trim(),
      definition: cloneRuleDefinition(form.rule_set.definition),
    },
  };
}

function buildJobPackComparable(pack: TaskPackFile) {
  return {
    search_spec: cloneSearchSpec(pack.search_spec),
    rule_set: {
      name: String(pack.rule_set.name || "").trim(),
      description: String(pack.rule_set.description || "").trim(),
      definition: cloneRuleDefinition(pack.rule_set.definition),
    },
  };
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

type DraftSourceKind = "blank" | "pack" | "file";

function draftSourceLabel(kind: DraftSourceKind) {
  if (kind === "pack") return "任务包载入";
  if (kind === "file") return "文件导入";
  return "默认空白";
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
  const [deletingPack, setDeletingPack] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [savingPack, setSavingPack] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState("");
  const [selectedDeletedById, setSelectedDeletedById] = useState<Record<number, boolean>>({});
  const [currentTaskPack, setCurrentTaskPack] = useState<TaskPackFile | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSourceKind>("blank");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileActionRef = useRef<"draft" | "save_new">("draft");

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
  const currentTaskPackComparable = useMemo(
    () => (currentTaskPack ? buildJobPackComparable(currentTaskPack) : null),
    [currentTaskPack],
  );
  const currentJobDraftComparable = useMemo(() => buildJobDraftComparable(form), [form]);
  const taskPackDirty = useMemo(() => {
    if (!currentTaskPackComparable) return false;
    return JSON.stringify(currentTaskPackComparable) !== JSON.stringify(currentJobDraftComparable);
  }, [currentTaskPackComparable, currentJobDraftComparable]);
  const currentTaskPackName = currentTaskPack?.meta.name || (form.pack_name ? taskPacks.find((item) => item.pack_name === form.pack_name)?.name || form.pack_name : "未绑定");
  const currentTaskPackDescription = currentTaskPack?.meta.description || "";
  const currentRuleSetPreview = useMemo<RuleSet | null>(
    () => ({
      id: Number(form.rule_set.id ?? 0) || 0,
      name: form.rule_set.name,
      description: form.rule_set.description,
      is_enabled: true,
      is_builtin: currentTaskPack?.pack_name === "default-rule-set",
      version: form.rule_set.version,
      definition_json: cloneRuleDefinition(form.rule_set.definition),
    }),
    [currentTaskPack?.pack_name, form.rule_set],
  );

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
    setCurrentTaskPack(null);
    setDraftSource("blank");
  }

  function resetTaskBodyToDraft() {
    setForm((prev) => ({
      ...prev,
      pack_name: null,
      import_pack_name: taskPacks[0]?.pack_name || "",
      search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
      rule_set: {
        ...prev.rule_set,
        id: 1,
        name: "Default Rule Set",
        description: "Built-in opportunity discovery rules.",
        version: 1,
        definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
      },
    }));
    setCurrentTaskPack(null);
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
      setCurrentTaskPack(pack);
      setDraftSource(pack ? "pack" : "blank");
      setForm({
        name: detail.name,
        interval_minutes: detail.interval_minutes,
        enabled: Boolean(detail.enabled),
        pack_name: detail.pack_name || pack?.pack_name || null,
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
      setCurrentTaskPack(pack);
      setDraftSource(pack ? "pack" : "blank");
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
        pack_name: pack.pack_name,
      }));
      setActionMessage(`已载入任务包 ${pack.meta.name}`);
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
      setCurrentTaskPack(saved);
      setDraftSource("pack");
      setForm((prev) => ({ ...prev, pack_name: saved.pack_name, import_pack_name: saved.pack_name }));
      setActionMessage(mode === "overwrite" ? "已保存到当前任务包" : `已另存为新任务包 ${saved.pack_name}`);
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

  async function handleImportPackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      const imported = await readImportedTaskPack(file);
      setCurrentTaskPack(null);
      setDraftSource("file");
      setForm((prev) => ({
        ...prev,
        pack_name: null,
        import_pack_name: taskPacks[0]?.pack_name || "",
        search_spec: cloneSearchSpec(imported.searchSpec),
        rule_set: {
          id: imported.ruleSet.id ?? null,
          name: imported.ruleSet.name,
          description: imported.ruleSet.description || imported.description,
          version: imported.ruleSet.version || 1,
          definition: cloneRuleDefinition(imported.ruleSet.definition),
        },
      }));
      setActionMessage(`已从文件导入任务包 ${imported.sourceName}，当前仍是未绑定草稿`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包文件失败");
    }
  }

  async function handleImportAndSavePackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      const imported = await readImportedTaskPack(file);
      const suggestedName = imported.metaName || imported.sourceName.replace(/\.json$/i, "") || "task-pack";
      const targetName = window.prompt("请输入新任务包名称", suggestedName)?.trim();
      if (!targetName) return;
      setSavingPack(true);
      const payload = {
        meta: {
          name: targetName,
          description: imported.ruleSet.description || imported.description,
        },
        search_spec: cloneSearchSpec(imported.searchSpec),
        rule_set: {
          id: imported.ruleSet.id ?? null,
          name: imported.ruleSet.name,
          description: imported.ruleSet.description || imported.description,
          version: imported.ruleSet.version,
          definition: cloneRuleDefinition(imported.ruleSet.definition),
        },
      };
      const saved = await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentTaskPack(saved);
      setDraftSource("pack");
      setForm((prev) => ({
        ...prev,
        pack_name: saved.pack_name,
        import_pack_name: saved.pack_name,
        search_spec: cloneSearchSpec(saved.search_spec),
        rule_set: {
          id: saved.rule_set.id ?? null,
          name: saved.rule_set.name,
          description: saved.rule_set.description || "",
          version: saved.rule_set.version || 1,
          definition: cloneRuleDefinition(saved.rule_set.definition),
        },
      }));
      setActionMessage(`已从文件导入并保存为新任务包 ${saved.pack_name}`);
      await loadTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入并保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleDeleteCurrentPack() {
    if (!currentTaskPack?.pack_name) return;
    if (!window.confirm(`确认删除当前任务包 ${currentTaskPack.pack_name} 吗？`)) return;

    setDeletingPack(true);
    setError("");
    try {
      const deletedPackName = currentTaskPack.pack_name;
      await deleteTaskPack(deletedPackName);
      resetTaskBodyToDraft();
      setActionMessage(`已删除任务包 ${deletedPackName}`);
      await loadTaskPacks();
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "删除任务包失败";
      if (fallback.includes("referenced by existing jobs")) {
        setError("当前任务包仍被自动任务使用，请先更换绑定后再删除");
      } else if (fallback.includes("default task pack cannot be deleted")) {
        setError("默认规则任务包不可删除");
      } else {
        setError(fallback);
      }
    } finally {
      setDeletingPack(false);
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
          <p className="kv">{"自动任务负责调度；任务正文来自当前绑定任务包，包含搜索条件和规则。"}</p>
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
                  <th>{"任务包"}</th>
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
                      <div className="job-name">{job.pack_meta?.name || job.pack_name || "--"}</div>
                      <div className="kv">{job.pack_name || "--"}</div>
                    </td>
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
                    <td colSpan={8} style={{ textAlign: "center", color: "#64748b" }}>{status === "deleted" ? "暂无已删除任务" : "暂无任务"}</td>
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
                  <h5>{"调度设置"}</h5>
                  <div className="collector-grid collector-grid-2">
                    <div className="dashboard-detail-item">
                      <span>{"状态"}</span>
                      <strong>{jobState(selectedJob)}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{"下次运行"}</span>
                      <strong>{formatUtcPlus8Time(selectedJob.next_run_at)}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{"最近运行"}</span>
                      <strong>{selectedJob.last_run_status || "--"}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{"最近运行时间"}</span>
                      <strong>{formatUtcPlus8Time(selectedJob.last_run_ended_at || selectedJob.last_run_started_at)}</strong>
                    </div>
                    {selectedJob.deleted_at && (
                      <div className="dashboard-detail-item dashboard-detail-item-wide">
                        <span>{"删除时间"}</span>
                        <strong>{formatUtcPlus8Time(selectedJob.deleted_at)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="drawer-section">
                <h5>{"调度设置"}</h5>
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
                    <span>{"执行间隔说明"}</span>
                    <input value={`${form.interval_minutes} 分钟`} readOnly />
                  </label>
                </div>
              </div>

              <div className="drawer-section">
                <h5>{"任务正文"}</h5>
                <div className="collector-card">
                  <h6 style={{ margin: "0 0 10px", fontSize: 14 }}>{"当前绑定任务包"}</h6>
                  <div className="collector-toolbar between">
                    <div>
                      <div className="job-name" style={{ marginTop: 6 }}>{currentTaskPackName}</div>
                      <div className="kv" style={{ marginTop: 6 }}>{currentTaskPackDescription || "先把任务包载入到当前草稿，再决定是另存为新任务包，还是保存回当前任务包。"}</div>
                      <div className="kv" style={{ marginTop: 8 }}>{`pack_name=${currentTaskPack?.pack_name || "--"}`}</div>
                      <div className="kv">{`pack_path=${currentTaskPack?.pack_path || "--"}`}</div>
                    </div>
                    <div className="collector-grid" style={{ minWidth: 240 }}>
                      <div className="dashboard-detail-item">
                        <span>{"绑定状态"}</span>
                        <strong>{currentTaskPack ? "已绑定本地任务包" : "未绑定"}</strong>
                      </div>
                      <div className="dashboard-detail-item">
                        <span>{"草稿状态"}</span>
                        <strong>{currentTaskPack ? (taskPackDirty ? "已修改未保存" : "未修改") : "未绑定"}</strong>
                      </div>
                      <div className="dashboard-detail-item">
                        <span>{"草稿来源"}</span>
                        <strong>{draftSourceLabel(draftSource)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
                  <div className="collector-card">
                    <div className="collector-subtitle">{"载入到当前草稿"}</div>
                    <div className="kv" style={{ marginTop: 6 }}>{"可以从任务包列表载入，也可以直接从本地 JSON 文件导入。"}</div>
                    <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                      <select aria-label="job-pack-select" value={form.import_pack_name} onChange={(e) => updateForm("import_pack_name", e.target.value)} disabled={drawerDisabled}>
                        <option value="">{"选择任务包"}</option>
                        {taskPacks.map((item) => (
                          <option key={item.pack_name} value={item.pack_name}>{item.name}</option>
                        ))}
                      </select>
                      <button type="button" className="ghost" aria-label="job-load-pack" onClick={() => handleImportPack().catch(() => undefined)} disabled={drawerDisabled}>{"载入任务包"}</button>
                      <button type="button" className="ghost" aria-label="job-import-file-pack" onClick={() => { pendingFileActionRef.current = "draft"; fileInputRef.current?.click(); }} disabled={drawerDisabled}>{"从文件导入"}</button>
                      <button type="button" className="ghost" aria-label="job-import-and-save-pack" onClick={() => { pendingFileActionRef.current = "save_new"; fileInputRef.current?.click(); }} disabled={drawerDisabled || savingPack}>{"导入并保存为新任务包"}</button>
                      <input
                        ref={fileInputRef}
                        data-testid="job-pack-file-input"
                        type="file"
                        accept=".json,application/json"
                        style={{ display: "none" }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void (pendingFileActionRef.current === "save_new" ? handleImportAndSavePackFile(file) : handleImportPackFile(file));
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                    <div className="kv" style={{ marginTop: 10 }}>{"从文件导入：只替换当前草稿，不会创建任务包。"}</div>
                    <div className="kv">{"导入并保存为新任务包：会先导入文件，再立刻保存成新的本地任务包并绑定。"}</div>
                  </div>
                  <div className="collector-card">
                    <div className="collector-subtitle">{"保存当前草稿"}</div>
                    <div className="kv" style={{ marginTop: 6 }}>{"把当前草稿另存为新任务包，或保存回当前绑定任务包。"}</div>
                    <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                      <button type="button" className="ghost" aria-label="job-save-as-pack" onClick={() => handleSavePack("create").catch(() => undefined)} disabled={drawerDisabled || savingPack}>{"另存为新任务包"}</button>
                      <button type="button" aria-label="job-save-current-pack" onClick={() => handleSavePack("overwrite").catch(() => undefined)} disabled={drawerDisabled || savingPack || !form.pack_name}>{"保存到当前任务包"}</button>
                      <button
                        type="button"
                        className="danger"
                        aria-label="job-delete-pack"
                        onClick={() => handleDeleteCurrentPack().catch(() => undefined)}
                        disabled={drawerDisabled || deletingPack || !currentTaskPack?.pack_name}
                      >
                        {deletingPack ? "删除中..." : "删除当前任务包"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="collector-query-preview" style={{ marginTop: 12 }}>
                  <div className="collector-subtitle">{"任务正文摘要"}</div>
                  <code>{buildQueryPreview(form.search_spec) || "--"}</code>
                </div>
              </div>

              <div className="drawer-section">
                <h5>{"搜索条件"}</h5>
                <div className="kv">{"这里定义自动任务具体要去搜什么。"}</div>
                <SearchSpecEditor value={form.search_spec} onChange={(next) => updateForm("search_spec", next)} disabled={drawerDisabled} />
              </div>

              <div className="drawer-section">
                <h5>{"规则"}</h5>
                <div className="kv">{"这里定义原始结果如何筛选、打分和分级。"}</div>
                <div className="collector-grid collector-grid-2" style={{ marginTop: 12, marginBottom: 12 }}>
                  <label className="field">
                    <span>{"规则名称"}</span>
                    <input
                      value={form.rule_set.name}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          rule_set: { ...prev.rule_set, name: e.target.value },
                        }))
                      }
                      disabled={drawerDisabled}
                    />
                  </label>
                  <label className="field">
                    <span>{"规则说明"}</span>
                    <input
                      value={form.rule_set.description}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          rule_set: { ...prev.rule_set, description: e.target.value },
                        }))
                      }
                      disabled={drawerDisabled}
                    />
                  </label>
                </div>
                <RuleSetEditor
                  ruleSet={currentRuleSetPreview}
                  draft={form.rule_set.definition}
                  onDraftChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      rule_set: { ...prev.rule_set, definition: next },
                    }))
                  }
                  disabled={drawerDisabled}
                />
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

