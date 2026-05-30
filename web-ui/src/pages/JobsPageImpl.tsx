import { useEffect, useMemo, useRef, useState } from "react";
import {
  JobBatchAction,
  JobRecord,
  RuleSet,
  TaskPackFile,
  TaskPackSummary,
  batchJobs,
  cancelRun,
  createJob,
  createTaskPack,
  deleteTaskPack,
  deleteJob,
  getJob,
  getRun,
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
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  cloneRuleDefinition,
  cloneSearchSpec,
  joinCommaLinesForTextarea,
  splitCommaLines,
} from "../collector";
import {
  EMPTY_RUN_PROGRESS,
  buildRunProgress,
} from "../runProgress";
import { ImportedTaskPackDraft, readImportedTaskPack } from "../taskPacks";
import { formatUtcPlus8Time } from "../time";
import { JobWorkspace } from "./jobs/JobWorkspace";
import { JobsTable } from "./jobs/JobsTable";
import {
  ACTIVE_BATCH_ACTIONS,
  DELETED_BATCH_ACTIONS,
  JOBS_SELECT_COLUMN_WIDTH,
  JOB_TABLE_COLUMNS,
  batchActionMessage,
  batchConfirmText,
  buildActiveJobRunFromJob,
  getJobColumnMinWidth,
  jobSelectionState,
  jobState,
  readJobColumnWidths,
  resolveJobColumnWidth,
  writeJobColumnWidths,
  type ActiveJobRun,
  type BatchActionSpec,
  type JobColumnResizeState,
  type JobColumnWidths,
  type JobStatusFilter,
  type JobTableColumnKey,
  type JobTableColumnDefinition,
} from "./jobs/jobsTableConfig";
import {
  DEFAULT_FORM,
  buildJobDraftComparable,
  buildJobPackComparable,
  buildPackPayload,
  draftSourceLabel,
  type DraftSourceKind,
  type JobFormState,
} from "./jobs/jobDraft";

type DrawerMode = "create" | "view" | "edit";
type RefreshOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
  silent?: boolean;
};

function isNotFoundError(err: unknown) {
  return err instanceof Error && err.message.trim().toLowerCase() === "not found";
}

const MIN_LIST_PANE_WIDTH = 320;
const MIN_DRAWER_PANE_WIDTH = 320;
const RESIZER_WIDTH = 20;
const SPLIT_LAYOUT_BREAKPOINT = 1160;
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
  const formTags = useMemo(() => splitCommaLines(form.tagsText), [form.tagsText]);
  const [saving, setSaving] = useState(false);
  const [deletingPack, setDeletingPack] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [savingPack, setSavingPack] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState("");
  const [selectedDeletedById, setSelectedDeletedById] = useState<Record<number, boolean>>({});
  const [currentTaskPack, setCurrentTaskPack] = useState<TaskPackFile | null>(null);
  const [activeRunsByJobId, setActiveRunsByJobId] = useState<Record<number, ActiveJobRun>>({});
  const [draftSource, setDraftSource] = useState<DraftSourceKind>("blank");
  const [columnWidths, setColumnWidths] = useState<JobColumnWidths>(() => readJobColumnWidths());
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? SPLIT_LAYOUT_BREAKPOINT : window.innerWidth));
  const [leftPaneWidth, setLeftPaneWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<JobTableColumnKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileActionRef = useRef<"draft" | "save_new">("draft");
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dragBoundsRef = useRef<{ left: number; width: number } | null>(null);
  const columnResizeStateRef = useRef<JobColumnResizeState | null>(null);
  const runPollTimerRef = useRef<number | null>(null);
  const activeRunsRef = useRef<Record<number, ActiveJobRun>>({});

  const isSplitLayout = viewportWidth > SPLIT_LAYOUT_BREAKPOINT;
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

  function clearRunPollTimer() {
    if (runPollTimerRef.current !== null) {
      window.clearTimeout(runPollTimerRef.current);
      runPollTimerRef.current = null;
    }
  }

  function mergeActiveRunsFromJobs(items: JobRecord[]) {
    setActiveRunsByJobId((prev) => {
      const next = { ...prev };
      for (const job of items) {
        const current = next[job.id];
        const snapshot = buildActiveJobRunFromJob(job);
        if (!current && snapshot) {
          next[job.id] = snapshot;
          continue;
        }
        if (!current) continue;
        if (current.progress.status === "running") continue;
        if (job.last_run_id && current.run.id === job.last_run_id) {
          delete next[job.id];
          continue;
        }
        if (job.last_run_id && current.run.id !== job.last_run_id) {
          delete next[job.id];
        }
      }
      activeRunsRef.current = next;
      return next;
    });
  }

  async function pollActiveRunsOnce() {
    const runningEntries = Object.entries(activeRunsRef.current).filter(([, entry]) => entry.progress.status === "running");
    if (!runningEntries.length) {
      clearRunPollTimer();
      return false;
    }

    const updates = await Promise.all(
      runningEntries.map(async ([jobId, entry]) => {
        try {
          const run = await getRun(entry.run.id);
          return { jobId: Number(jobId), run, stale: false as const, error: null };
        } catch (err) {
          if (isNotFoundError(err)) {
            return { jobId: Number(jobId), run: null, stale: true as const, error: null };
          }
          return { jobId: Number(jobId), run: null, stale: false as const, error: err };
        }
      }),
    );
    const firstError = updates.find((update) => update.error)?.error;
    if (firstError) {
      throw firstError;
    }

    setActiveRunsByJobId((prev) => {
      const next = { ...prev };
      for (const update of updates) {
        if (update.stale || !update.run) {
          delete next[update.jobId];
          continue;
        }
        const progress = buildRunProgress(update.run);
        next[update.jobId] = { run: update.run, progress };
      }
      activeRunsRef.current = next;
      return next;
    });
    void refreshJobs({ reloadSelected: true, silent: true });
    return updates.some((update) => update.run && buildRunProgress(update.run).status === "running");
  }

  function applyLeftPaneWidth(nextWidth: number | null) {
    setLeftPaneWidth(nextWidth);
    if (!layoutRef.current) return;
    layoutRef.current.style.gridTemplateColumns = nextWidth === null
      ? ""
      : `${nextWidth}px ${RESIZER_WIDTH}px minmax(${MIN_DRAWER_PANE_WIDTH}px, 1fr)`;
  }

  function updateDraggedWidth(clientX: number | undefined) {
    const bounds = dragBoundsRef.current;
    if (!bounds || typeof clientX !== "number" || Number.isNaN(clientX)) return;
    const maxWidth = Math.max(MIN_LIST_PANE_WIDTH, bounds.width - MIN_DRAWER_PANE_WIDTH - RESIZER_WIDTH);
    const nextWidth = Math.min(Math.max(clientX - bounds.left, MIN_LIST_PANE_WIDTH), maxWidth);
    applyLeftPaneWidth(nextWidth);
  }

  async function loadTaskPacks() {
    const data = await listTaskPacks();
    const items = data.items || [];
    setTaskPacks(items);
    setForm((prev) => ({ ...prev, import_pack_name: prev.import_pack_name || items[0]?.pack_name || "" }));
  }

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
    activeRunsRef.current = activeRunsByJobId;
  }, [activeRunsByJobId]);

  useEffect(() => {
    writeJobColumnWidths(columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    if (!Object.values(activeRunsByJobId).some((entry) => entry.progress.status === "running")) {
      clearRunPollTimer();
      return;
    }

    clearRunPollTimer();
    runPollTimerRef.current = window.setTimeout(() => {
      void pollActiveRunsOnce().catch((err) => {
        setError(err instanceof Error ? err.message : "获取自动任务进度失败");
      });
    }, 300);

    return () => {
      clearRunPollTimer();
    };
  }, [activeRunsByJobId]);

  useEffect(() => {
    function handleWindowResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleWindowResize);

    function handlePointerMove(event: PointerEvent) {
      updateDraggedWidth(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateDraggedWidth(event.clientX);
    }

    function stopResizing() {
      dragBoundsRef.current = null;
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    if (isSplitLayout) return;
    setIsResizing(false);
    applyLeftPaneWidth(null);
    dragBoundsRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [isSplitLayout]);

  useEffect(() => {
    function updateResizedColumnWidth(clientX: number | undefined) {
      const resizeState = columnResizeStateRef.current;
      if (!resizeState || typeof clientX !== "number" || Number.isNaN(clientX)) {
        return;
      }
      const delta = clientX - resizeState.startX;
      const pairTotal = resizeState.leftStartWidth + resizeState.rightStartWidth;
      const nextLeftWidth = Math.min(
        Math.max(Math.round(resizeState.leftStartWidth + delta), resizeState.leftMinWidth),
        pairTotal - resizeState.rightMinWidth,
      );
      const nextRightWidth = pairTotal - nextLeftWidth;
      setColumnWidths((current) => {
        if (current[resizeState.leftKey] === nextLeftWidth && current[resizeState.rightKey] === nextRightWidth) {
          return current;
        }
        return {
          ...current,
          [resizeState.leftKey]: nextLeftWidth,
          [resizeState.rightKey]: nextRightWidth,
        };
      });
    }

    function handlePointerMove(event: PointerEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function stopResizingColumn() {
      columnResizeStateRef.current = null;
      setIsResizingColumn(false);
      setResizingColumnId(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizingColumn);
    window.addEventListener("pointercancel", stopResizingColumn);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizingColumn);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizingColumn);
      window.removeEventListener("pointercancel", stopResizingColumn);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizingColumn);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    if (selectionState === "mixed") {
      setSelectionWarning("当前选择同时包含已删除和未删除任务，请先按状态筛选或重新勾选。");
      return;
    }
    setSelectionWarning("");
  }, [selectionState]);

  function resetForm() {
    setForm({
      ...DEFAULT_FORM,
      group_name: "",
      search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
      tagsText: "",
      rule_set: { ...DEFAULT_FORM.rule_set, definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION) },
      import_pack_name: taskPacks[0]?.pack_name || "",
    });
    setCurrentTaskPack(null);
    setDraftSource("blank");
  }

  function resetTaskBodyToDraft() {
    setForm((prev) => ({
      ...prev,
      pack_name: null,
      import_pack_name: taskPacks[0]?.pack_name || "",
      tagsText: "",
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

  function startResizing() {
    if (!isSplitLayout || !layoutRef.current) return;
    const bounds = layoutRef.current.getBoundingClientRect();
    dragBoundsRef.current = { left: bounds.left, width: bounds.width };
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function handleResizerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startResizing();
    event.preventDefault();
  }

  function handleResizerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    startResizing();
    event.preventDefault();
  }

  function startColumnResize(
    leftColumn: JobTableColumnDefinition & { currentWidth: number },
    rightColumn: JobTableColumnDefinition & { currentWidth: number } | undefined,
    clientX: number | undefined,
  ) {
    if (typeof clientX !== "number" || Number.isNaN(clientX) || !rightColumn) {
      return;
    }
    columnResizeStateRef.current = {
      leftKey: leftColumn.key,
      rightKey: rightColumn.key,
      startX: clientX,
      leftStartWidth: leftColumn.currentWidth,
      rightStartWidth: rightColumn.currentWidth,
      leftMinWidth: getJobColumnMinWidth(leftColumn),
      rightMinWidth: getJobColumnMinWidth(rightColumn),
    };
    setIsResizingColumn(true);
    setResizingColumnId(leftColumn.key);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
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
      setDraftSource(pack ? "pack" : "blank");
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
        tagsText: joinCommaLinesForTextarea(pack.tags || []),
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
      setForm((prev) => ({ ...prev, pack_name: saved.pack_name, import_pack_name: saved.pack_name, tagsText: joinCommaLinesForTextarea(saved.tags || []) }));
      setActionMessage(mode === "overwrite" ? "已保存到当前任务包" : `已另存为新任务包 ${saved.pack_name}`);
      await loadTaskPacks();
      await refreshJobs({ keepDrawer: true, reloadSelected: true });
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
      const started = await runJobNow(job.id);
      setActiveRunsByJobId((prev) => ({
        ...prev,
        [job.id]: {
          run: {
            id: started.run_id,
            job_id: job.id,
            trigger_type: "auto",
            status: "running",
            started_at: new Date().toISOString(),
            ended_at: null,
            error_text: null,
            stats_json: {},
            result_json: null,
          },
          progress: {
            ...EMPTY_RUN_PROGRESS,
            runId: started.run_id,
            status: "running",
            startedAt: new Date().toISOString(),
          },
        },
      }));
      activeRunsRef.current = {
        ...activeRunsRef.current,
        [job.id]: {
          run: {
            id: started.run_id,
            job_id: job.id,
            trigger_type: "auto",
            status: "running",
            started_at: new Date().toISOString(),
            ended_at: null,
            error_text: null,
            stats_json: {},
            result_json: null,
          },
          progress: {
            ...EMPTY_RUN_PROGRESS,
            runId: started.run_id,
            status: "running",
            startedAt: new Date().toISOString(),
          },
        },
      };
      setActionMessage(`已触发 ${job.name} 立即运行`);
      await refreshJobs({ reloadSelected: false });
      void pollActiveRunsOnce().catch((err) => {
        setError(err instanceof Error ? err.message : "获取自动任务进度失败");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "立即运行失败");
    }
  }

  async function handleStopRun(job: JobRecord, runId: number) {
    setError("");
    try {
      await cancelRun(runId);
      setActionMessage(`已停止 ${job.name} 的当前运行`);
      await refreshJobs({ reloadSelected: true });
      void pollActiveRunsOnce().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止运行失败");
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
        tagsText: joinCommaLinesForTextarea(imported.tags || []),
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
        tags: imported.tags,
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
        tagsText: joinCommaLinesForTextarea(saved.tags || []),
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
  return (
    <div className="jobs-page" data-testid="jobs-page">
      <section className="card jobs-page-header workbench-page-header">
        <div className="workbench-page-header-copy">
          <h3>{"自动任务"}</h3>
          <p className="kv">{"自动任务负责调度，任务正文来自当前绑定任务包。"}</p>
        </div>
        <div className="jobs-page-header-actions workbench-page-header-actions">
          <button type="button" className="workbench-primary-action" data-testid="create-job-button" onClick={openCreate}>{"新建任务"}</button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {actionMessage && <div className="alert success" style={{ whiteSpace: "pre-line" }}>{actionMessage}</div>}

      <div
        ref={layoutRef}
        className={`jobs-layout${isResizing ? " dragging" : ""}`}
        data-testid="jobs-layout"
      >
        <section className="jobs-list-pane">
          <div className="card jobs-list-tools workbench-layer">
            <div
              className="jobs-list-filterbar flat-actions"
              data-testid="jobs-filter-bar"
            >
              <div className="jobs-filter-query-group" data-testid="jobs-filter-query-group">
                <label className="field jobs-filter-field">
                  <span>{"搜索任务"}</span>
                  <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder={"按任务名称搜索"} aria-label="搜索任务" />
                </label>
                <div className="jobs-filter-actions">
                  <button type="button" className="workbench-secondary-action" data-testid="jobs-search-button" onClick={submitQuery}>{"搜索"}</button>
                </div>
                <label className="field jobs-filter-field jobs-filter-status">
                  <span>{"状态"}</span>
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
                </label>
              </div>
            </div>

            <div className="jobs-managebar" data-testid="jobs-manage-bar">
              <div className="jobs-managebar-copy">
                <div className="collector-subtitle">{"表格管理"}</div>
                <div className="kv">{manageSelectionSummary}</div>
              </div>
              <div className="jobs-managebar-actions">
                {showSelectAllMatching && (
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="select-all-matching-jobs"
                    onClick={selectAllMatchingJobs}
                  >
                    {`已选中本页 ${jobs.length} 条。选择全部 ${total} 条匹配结果`}
                  </button>
                )}
                {selectedCount > 0 && (
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="clear-job-selection"
                    onClick={clearSelection}
                  >
                    {"清空选择"}
                  </button>
                )}
                {batchActionSpecs.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    className={
                      item.tone === "danger"
                        ? "workbench-danger-action"
                        : "workbench-secondary-action"
                    }
                    disabled={!isBatchActionEnabled(item.action)}
                    onClick={() => handleBatchAction(item.action).catch(() => undefined)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectionWarning && <div className="alert error jobs-list-alert">{selectionWarning}</div>}

          <JobsTable
            total={total}
            page={page}
            totalPages={totalPages}
            loading={loading}
            jobsTableMinWidth={jobsTableMinWidth}
            isResizingColumn={isResizingColumn}
            selectColumnWidth={JOBS_SELECT_COLUMN_WIDTH}
            columns={resolvedJobColumns}
            allPageSelected={allPageSelected}
            resizingColumnId={resizingColumnId}
            jobs={jobs}
            activeRunsByJobId={activeRunsByJobId}
            selectedJobId={selectedJob?.id ?? null}
            allMatchingSelected={allMatchingSelected}
            selectedIds={selectedIds}
            status={status}
            onPageChange={(nextPage) => { void refreshJobs({ page: nextPage }); }}
            onTogglePageSelection={togglePageSelection}
            onStartColumnResize={startColumnResize}
            onOpenJobWorkspace={openJobWorkspace}
            onToggleRowSelection={toggleRowSelection}
          />
        </section>

        {isSplitLayout && (
          <div
            className={`jobs-resizer${isResizing ? " dragging" : ""}`}
            data-testid="jobs-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整区域宽度"
            onPointerDown={handleResizerPointerDown}
            onMouseDown={handleResizerMouseDown}
          />
        )}

        <JobWorkspace
          drawerOpen={drawerOpen}
          isCreateWorkspace={isCreateWorkspace}
          selectedJob={selectedJob}
          selectedJobActiveRun={selectedJobActiveRun}
          workspaceTitle={workspaceTitle}
          workspaceMeta={workspaceMeta}
          drawerDisabled={drawerDisabled}
          currentTaskEyebrow={currentTaskEyebrow}
          currentTaskHeroTitle={currentTaskHeroTitle}
          currentTaskHeroDescription={currentTaskHeroDescription}
          currentStatusLabel={currentStatusLabel}
          nextRunLabel={nextRunLabel}
          lastRunLabel={lastRunLabel}
          lastRunTimeLabel={lastRunTimeLabel}
          currentTaskPackName={currentTaskPackName}
          currentTaskPackBindingLabel={currentTaskPackBindingLabel}
          currentTaskPackDraftLabel={currentTaskPackDraftLabel}
          formTags={formTags}
          taskPacks={taskPacks}
          currentTaskPack={currentTaskPack}
          form={form}
          taskKeywordCount={taskKeywordCount}
          taskAuthorConstraintCount={taskAuthorConstraintCount}
          taskRuleCount={taskRuleCount}
          taskLevelCount={taskLevelCount}
          currentRuleSetPreview={currentRuleSetPreview}
          saving={saving}
          savingPack={savingPack}
          deletingPack={deletingPack}
          loading={loading}
          fileInputRef={fileInputRef}
          pendingFileActionRef={pendingFileActionRef}
          updateForm={updateForm}
          setForm={setForm}
          handleSave={handleSave}
          handleRestore={handleRestore}
          handlePurge={handlePurge}
          handleRunNow={handleRunNow}
          handleStopRun={handleStopRun}
          handleToggle={handleToggle}
          handleDelete={handleDelete}
          handleImportPack={handleImportPack}
          handleSavePack={handleSavePack}
          handleDeleteCurrentPack={handleDeleteCurrentPack}
          handleImportPackFile={handleImportPackFile}
          handleImportAndSavePackFile={handleImportAndSavePackFile}
          onClose={() => { setSelectedJob(null); setDrawerMode("create"); resetForm(); setDrawerOpen(false); }}
          onOpenCreate={openCreate}
          onRefreshEmpty={() => { void refreshJobs({ keepDrawer: false, reloadSelected: false }); }}
        />
      </div>
    </div>
  );
}

