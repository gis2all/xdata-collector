import { useEffect, useMemo, useRef, useState } from "react";
import {
  JobRecord,
  RuleSet,
  getJob,
  getTaskPack,
  listJobs,
} from "../../api";
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  cloneRuleDefinition,
  cloneSearchSpec,
  joinCommaLinesForTextarea,
  splitCommaLines,
} from "../../collector";
import { formatUtcPlus8Time } from "../../time";
import { usePagination } from "../../hooks/usePagination";
import { useSplitPaneResize } from "../../hooks/useSplitPaneResize";
import {
  ACTIVE_BATCH_ACTIONS,
  DELETED_BATCH_ACTIONS,
  JOBS_SELECT_COLUMN_WIDTH,
  JOB_TABLE_COLUMNS,
  jobState,
  readJobColumnWidths,
  resolveJobColumnWidth,
  writeJobColumnWidths,
  type JobColumnWidths,
  type JobStatusFilter,
} from "./jobsTableConfig";
import {
  DEFAULT_FORM,
  buildJobDraftComparable,
  buildJobPackComparable,
  type JobFormState,
} from "./jobDraft";
import { useJobsRunState } from "./useJobsRunState";
import { useJobsSelection } from "./useJobsSelection";
import { useJobsColumnResize } from "./useJobsColumnResize";
import { useJobsTaskPacks } from "./useJobsTaskPacks";
import { useJobsActions } from "./useJobsActions";

type DrawerMode = "create" | "view" | "edit";
type RefreshOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
  silent?: boolean;
};

const MIN_LIST_PANE_WIDTH = 320;
const MIN_DRAWER_PANE_WIDTH = 320;
const RESIZER_WIDTH = 20;
const SPLIT_LAYOUT_BREAKPOINT = 1160;
export function useJobsPageState() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
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
  const formTags = useMemo(() => splitCommaLines(form.tagsText), [form.tagsText]);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [columnWidths, setColumnWidths] = useState<JobColumnWidths>(() => readJobColumnWidths());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileActionRef = useRef<"draft" | "save_new">("draft");
  const refreshJobsRef = useRef<() => Promise<void>>(async () => undefined);
  const { isResizingColumn, resizingColumnId, startColumnResize } = useJobsColumnResize({ setColumnWidths });
  const { isSplitLayout, isResizing, layoutRef, startResizing } = useSplitPaneResize({
    breakpoint: SPLIT_LAYOUT_BREAKPOINT,
    minLeftPaneWidth: MIN_LIST_PANE_WIDTH,
    minRightPaneWidth: MIN_DRAWER_PANE_WIDTH,
    resizerWidth: RESIZER_WIDTH,
  });

  const { totalPages } = usePagination(total, pageSize);
  const {
    selectedIds,
    allMatchingSelected,
    selectionWarning,
    selectedCount,
    allPageSelected,
    showSelectAllMatching,
    clearSelection,
    toggleRowSelection,
    togglePageSelection,
    selectAllMatchingJobs,
    syncSelectedDeletedFromJobs,
    isBatchActionEnabled,
  } = useJobsSelection({ jobs, total, status });
  const {
    activeRunsByJobId,
    mergeActiveRunsFromJobs,
    pollActiveRunsOnce,
    markJobRunStarted,
  } = useJobsRunState({
    onRefreshJobs: () => refreshJobsRef.current(),
    onError: (message) => setError(message),
  });
  const {
    taskPacks,
    savingPack,
    deletingPack,
    currentTaskPack,
    setCurrentTaskPack,
    clearCurrentTaskPack,
    loadTaskPacks,
    handleImportPack,
    handleSavePack,
    handleImportPackFile,
    handleImportAndSavePackFile,
    handleDeleteCurrentPack,
  } = useJobsTaskPacks({
    form,
    setForm,
    setError,
    setActionMessage,
    refreshJobs,
  });
  const {
    handleSave,
    handleDelete,
    handleRestore,
    handlePurge,
    handleRunNow,
    handleStopRun,
    handleToggle,
    handleBatchAction,
  } = useJobsActions({
    form,
    drawerMode,
    selectedJob,
    status,
    query,
    page,
    selectedIds,
    allMatchingSelected,
    selectedCount,
    setSaving,
    setError,
    setActionMessage,
    setSelectedJob,
    setDrawerMode,
    setDrawerOpen,
    setStatus,
    refreshJobs,
    clearSelection,
    isBatchActionEnabled,
    markJobRunStarted,
    pollActiveRunsOnce,
  });
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
  const taskKeywordCount = useMemo(
    () =>
      [
        form.search_spec.all_keywords,
        form.search_spec.exact_phrases,
        form.search_spec.any_keywords,
        form.search_spec.exclude_keywords,
      ].reduce((total, items) => total + items.length, 0),
    [form.search_spec],
  );
  const taskAuthorConstraintCount = useMemo(
    () => form.search_spec.authors_include.length + form.search_spec.authors_exclude.length,
    [form.search_spec],
  );
  const taskRuleCount = useMemo(() => form.rule_set.definition.rules?.length || 0, [form.rule_set.definition]);
  const taskLevelCount = useMemo(() => form.rule_set.definition.levels?.length || 0, [form.rule_set.definition]);
  const taskPackDirty = useMemo(() => {
    if (!currentTaskPackComparable) return false;
    return JSON.stringify(currentTaskPackComparable) !== JSON.stringify(currentJobDraftComparable);
  }, [currentTaskPackComparable, currentJobDraftComparable]);
  const resolvedJobColumns = useMemo(
    () =>
      JOB_TABLE_COLUMNS.map((column) => ({
        ...column,
        currentWidth: resolveJobColumnWidth(column, columnWidths[column.key]),
      })),
    [columnWidths],
  );
  const jobsTableMinWidth = useMemo(
    () => Math.max(900, JOBS_SELECT_COLUMN_WIDTH + resolvedJobColumns.reduce((sum, column) => sum + column.currentWidth, 0)),
    [resolvedJobColumns],
  );
  const manageSelectionSummary = selectedCount > 0
    ? `当前已选 ${selectedCount} 项，可继续清空选择或直接执行批量操作。`
    : "先在表格中勾选任务，再执行批量操作。";
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
  const selectedJobActiveRun = selectedJob ? activeRunsByJobId[selectedJob.id] ?? null : null;

  async function loadJobs(nextPage = page, nextQuery = query, nextStatus = status, allowPageFallback = false, silent = false) {
    if (!silent) {
      setLoading(true);
    }
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
      mergeActiveRunsFromJobs(items);
      syncSelectedDeletedFromJobs(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setJobs([]);
      setTotal(0);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadTaskPacks().catch(() => undefined);
    loadJobs(1, query, status).catch(() => undefined);
  }, []);

  useEffect(() => {
    writeJobColumnWidths(columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    refreshJobsRef.current = () => refreshJobs({ reloadSelected: true, silent: true });
  });

  function resetForm() {
    setForm({
      ...DEFAULT_FORM,
      group_name: "",
      search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
      tagsText: "",
      rule_set: { ...DEFAULT_FORM.rule_set, definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION) },
      import_pack_name: taskPacks[0]?.pack_name || "",
    });
    clearCurrentTaskPack();
  }

  function handleResizerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startResizing();
    event.preventDefault();
  }

  function handleResizerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    startResizing();
    event.preventDefault();
  }

  function openCreate() {
    setSelectedJob(null);
    setDrawerMode("create");
    resetForm();
    setDrawerOpen(true);
  }

  async function openJob(job: JobRecord, mode: DrawerMode = "edit") {
    try {
      const detail = await getJob(job.id);
      setSelectedJob(detail);
      setDrawerMode(mode);
      const pack = detail.pack_name ? await getTaskPack(detail.pack_name).catch(() => null) : null;
      setCurrentTaskPack(pack);
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
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务详情失败");
    }
  }

  function updateForm<K extends keyof JobFormState>(key: K, value: JobFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refreshJobs(options: RefreshOptions = {}) {
    const nextPage = options.page ?? page;
    const nextQuery = options.query ?? query;
    const nextStatus = options.status ?? status;
    const keepDrawer = options.keepDrawer ?? true;
    const reloadSelected = options.reloadSelected ?? true;
    const silent = options.silent ?? false;

    await loadJobs(nextPage, nextQuery, nextStatus, true, silent);
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

  function submitQuery() {
    setQuery(queryInput.trim());
    clearSelection();
    refreshJobs({ page: 1, query: queryInput.trim() }).catch(() => undefined);
  }

  function openJobWorkspace(job: JobRecord) {
    void openJob(job, job.deleted_at ? "view" : "edit");
  }

  const drawerDisabled = Boolean(selectedJob?.deleted_at) && drawerMode !== "create";
  const workspaceTitle = selectedJob ? "当前任务工作区" : "新建任务工作区";
  const workspaceMeta = selectedJob ? `任务 #${selectedJob.id}` : "未保存新任务";
  const currentStatusLabel = selectedJob ? jobState(selectedJob) : form.enabled ? "已启用" : "已停用";
  const nextRunLabel = selectedJob?.next_run_at ? formatUtcPlus8Time(selectedJob.next_run_at) : "保存后生成";
  const lastRunLabel = selectedJobActiveRun
    ? (selectedJobActiveRun.progress.status === "running"
      ? `${selectedJobActiveRun.run.status} ${selectedJobActiveRun.progress.progressPercent}%`
      : selectedJobActiveRun.run.status)
    : selectedJob?.last_run_status || "尚未运行";
  const lastRunTimeLabel = selectedJobActiveRun?.progress.startedAt || selectedJob?.last_run_ended_at || selectedJob?.last_run_started_at
    ? formatUtcPlus8Time(selectedJobActiveRun?.progress.startedAt || selectedJob?.last_run_ended_at || selectedJob?.last_run_started_at)
    : "尚未运行";
  const currentTaskEyebrow = selectedJob ? `调度任务 #${selectedJob.id}` : "调度设置";
  const currentTaskHeroTitle = form.name.trim() || (selectedJob ? selectedJob.name : "未命名任务");
  const currentTaskHeroDescription = selectedJob
    ? "这里收口当前调度任务的基础设置，确认后再继续编辑任务正文。"
    : "先把调度设置定下来，再继续补全任务包、搜索条件和规则。";
  const currentTaskPackName = currentTaskPack?.pack_name || form.pack_name || null;
  const hasCurrentTaskPackBinding = Boolean(currentTaskPackName);
  const currentTaskPackBindingLabel = hasCurrentTaskPackBinding ? "已绑定本地任务包" : "未绑定";
  const currentTaskPackDraftLabel = hasCurrentTaskPackBinding
    ? (currentTaskPack ? (taskPackDirty ? "已修改未保存" : "未修改") : "已绑定")
    : "未绑定";
  const isCreateWorkspace = drawerOpen && !selectedJob;
  return {
    error,
    actionMessage,
    layoutRef,
    isResizing,
    total,
    page,
    totalPages,
    loading,
    queryInput,
    status,
    manageSelectionSummary,
    showSelectAllMatching,
    selectedCount,
    batchActionSpecs,
    selectionWarning,
    jobsTableMinWidth,
    isResizingColumn,
    JOBS_SELECT_COLUMN_WIDTH,
    resolvedJobColumns,
    allPageSelected,
    resizingColumnId,
    jobs,
    activeRunsByJobId,
    selectedJob,
    allMatchingSelected,
    selectedIds,
    setQueryInput,
    submitQuery,
    setStatus,
    clearSelection,
    refreshJobs,
    selectAllMatchingJobs,
    handleBatchAction,
    isBatchActionEnabled,
    togglePageSelection,
    startColumnResize,
    openJobWorkspace,
    toggleRowSelection,
    isSplitLayout,
    handleResizerPointerDown,
    handleResizerMouseDown,
    drawerOpen,
    isCreateWorkspace,
    selectedJobActiveRun,
    workspaceTitle,
    workspaceMeta,
    drawerDisabled,
    currentTaskEyebrow,
    currentTaskHeroTitle,
    currentTaskHeroDescription,
    currentStatusLabel,
    nextRunLabel,
    lastRunLabel,
    lastRunTimeLabel,
    currentTaskPackName,
    currentTaskPackBindingLabel,
    currentTaskPackDraftLabel,
    formTags,
    taskPacks,
    currentTaskPack,
    form,
    taskKeywordCount,
    taskAuthorConstraintCount,
    taskRuleCount,
    taskLevelCount,
    currentRuleSetPreview,
    saving,
    savingPack,
    deletingPack,
    fileInputRef,
    pendingFileActionRef,
    updateForm,
    setForm,
    handleSave,
    handleRestore,
    handlePurge,
    handleRunNow,
    handleStopRun,
    handleToggle,
    handleDelete,
    handleImportPack,
    handleSavePack,
    handleDeleteCurrentPack,
    handleImportPackFile,
    handleImportAndSavePackFile,
    setSelectedJob,
    setDrawerMode,
    resetForm,
    setDrawerOpen,
    openCreate,
  } as const;
}

export type UseJobsPageState = ReturnType<typeof useJobsPageState>;
