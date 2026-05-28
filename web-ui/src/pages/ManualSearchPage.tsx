import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CollectorRunResult,
  RunRecord,
  RuleSet,
  RuleSetDefinition,
  TaskPackFile,
  TaskPackSummary,
  createTaskPack,
  deleteTaskPack,
  getRun,
  getTaskPack,
  listTaskPacks,
  runManualStart,
  updateTaskPack,
} from "../api";
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  buildQueryPreview,
  cloneRuleDefinition,
  cloneSearchSpec,
  joinCommaLinesForTextarea,
  splitCommaLines,
} from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { RuleSetEditor } from "../components/RuleSetEditor";
import { readImportedTaskPack } from "../taskPacks";
import { formatUtcPlus8Time } from "../time";

function metricValue(item: any, key: string) {
  return Number(item?.metrics?.[key] || 0);
}

function buildPackPayload(
  name: string,
  description: string,
  tags: string[],
  searchSpec: ReturnType<typeof cloneSearchSpec>,
  ruleName: string,
  ruleDescription: string,
  draftDefinition: RuleSetDefinition,
) {
  return {
    meta: {
      name,
      description,
    },
    tags,
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim() || name,
      description: ruleDescription.trim(),
      version: 1,
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

function buildDraftComparable(
  tags: string[],
  searchSpec: ReturnType<typeof cloneSearchSpec>,
  ruleName: string,
  ruleDescription: string,
  draftDefinition: RuleSetDefinition,
) {
  return {
    tags: [...tags],
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim(),
      description: ruleDescription.trim(),
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

function buildPackComparable(pack: TaskPackFile) {
  return {
    tags: [...(pack.tags || [])],
    search_spec: cloneSearchSpec(pack.search_spec),
    rule_set: {
      name: String(pack.rule_set.name || "").trim(),
      description: String(pack.rule_set.description || "").trim(),
      definition: cloneRuleDefinition(pack.rule_set.definition),
    },
  };
}

type DraftSourceKind = "blank" | "pack" | "file";
type ExecutionStatus = "idle" | "running" | "success" | "failed";

const DEFAULT_DRAFT_PACK_NAME = "__default_draft__";
const DEFAULT_DRAFT_PACK_LABEL = "默认草稿";

type ExecutionSummary = {
  status: ExecutionStatus;
  executedAt: string | null;
  rawTotal: number;
  matchedTotal: number;
  errorCount: number;
  errorText: string;
};

const EMPTY_EXECUTION_SUMMARY: ExecutionSummary = {
  status: "idle",
  executedAt: null,
  rawTotal: 0,
  matchedTotal: 0,
  errorCount: 0,
  errorText: "",
};

type ManualRunProgress = {
  runId: number | null;
  status: ExecutionStatus;
  totalQueries: number;
  completedQueries: number;
  progressPercent: number;
  fetchedRaw: number;
  queryErrors: number;
  startedAt: string | null;
  endedAt: string | null;
};

const EMPTY_RUN_PROGRESS: ManualRunProgress = {
  runId: null,
  status: "idle",
  totalQueries: 0,
  completedQueries: 0,
  progressPercent: 0,
  fetchedRaw: 0,
  queryErrors: 0,
  startedAt: null,
  endedAt: null,
};

function draftSourceLabel(kind: DraftSourceKind) {
  if (kind === "pack") return "任务包载入";
  if (kind === "file") return "文件导入";
  return "默认草稿";
}

function executionStatusLabel(status: ExecutionStatus) {
  if (status === "running") return "执行中";
  if (status === "success") return "执行成功";
  if (status === "failed") return "执行失败";
  return "未执行";
}

function executionStatusTone(status: ExecutionStatus) {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "neutral";
}

function normalizeExecutionStatus(status: string | null | undefined): ExecutionStatus {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "idle";
}

function statNumber(stats: Record<string, number> | undefined, key: string) {
  const value = Number(stats?.[key] ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function progressPercentForRun(status: ExecutionStatus, completedQueries: number, totalQueries: number, reportedPercent: number) {
  if (status === "success") return 100;
  if (status === "failed" && totalQueries > 0 && completedQueries >= totalQueries) return 100;
  if (reportedPercent > 0) return clampPercent(reportedPercent);
  if (totalQueries > 0) return clampPercent((completedQueries / totalQueries) * 100);
  return 0;
}

function buildRunProgress(run: RunRecord): ManualRunProgress {
  const status = normalizeExecutionStatus(run.status);
  const totalQueries = statNumber(run.stats_json, "total_queries");
  const completedQueries = statNumber(run.stats_json, "completed_queries");
  const progressPercent = progressPercentForRun(
    status,
    completedQueries,
    totalQueries,
    statNumber(run.stats_json, "progress_percent"),
  );
  return {
    runId: Number(run.id || 0) || null,
    status,
    totalQueries,
    completedQueries,
    progressPercent,
    fetchedRaw: statNumber(run.stats_json, "fetched_raw"),
    queryErrors: statNumber(run.stats_json, "query_errors"),
    startedAt: run.started_at || null,
    endedAt: run.ended_at || null,
  };
}

function buildExecutionSummary(
  status: Extract<ExecutionStatus, "success" | "failed">,
  executedAt: string,
  result: CollectorRunResult | null,
  fallbackError: string,
): ExecutionSummary {
  const errors = Array.isArray(result?.errors) ? result?.errors : [];
  const errorText = fallbackError || errors[0] || "";
  return {
    status,
    executedAt,
    rawTotal: Number(result?.raw_total || 0),
    matchedTotal: Number(result?.matched_total || 0),
    errorCount: errors.length || (errorText ? 1 : 0),
    errorText,
  };
}

function formatAuthorDisplay(authorName?: string | null, author?: string | null) {
  const name = String(authorName || "").trim();
  const handle = String(author || "").trim();
  if (name && handle) return `${name} @${handle.replace(/^@+/, "")}`;
  if (name) return name;
  if (handle) return `@${handle.replace(/^@+/, "")}`;
  return "--";
}

function ManualSectionHeader(props: { title: string; description: string; aside?: ReactNode }) {
  return (
    <div className="manual-section-header workbench-section-header">
      <div className="manual-section-copy workbench-section-copy">
        <h4 className="workbench-section-title">{props.title}</h4>
        <p className="kv manual-section-description">{props.description}</p>
      </div>
      {props.aside ? <div className="manual-section-aside">{props.aside}</div> : null}
    </div>
  );
}

export function ManualSearchPage() {
  const [searchSpec, setSearchSpec] = useState(() => cloneSearchSpec(DEFAULT_SEARCH_SPEC));
  const [result, setResult] = useState<CollectorRunResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPack, setSavingPack] = useState(false);
  const [deletingPack, setDeletingPack] = useState(false);
  const [taskPacks, setTaskPacks] = useState<TaskPackSummary[]>([]);
  const [selectedPackName, setSelectedPackName] = useState(DEFAULT_DRAFT_PACK_NAME);
  const [currentPack, setCurrentPack] = useState<TaskPackFile | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSourceKind>("blank");
  const [draftRuleName, setDraftRuleName] = useState("Default Rule Set");
  const [draftRuleDescription, setDraftRuleDescription] = useState("Built-in opportunity discovery rules.");
  const [draftTagsText, setDraftTagsText] = useState("");
  const [draftDefinition, setDraftDefinition] = useState<RuleSetDefinition>(
    cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
  );
  const [lastExecution, setLastExecution] = useState<ExecutionSummary>(EMPTY_EXECUTION_SUMMARY);
  const [runProgress, setRunProgress] = useState<ManualRunProgress>(EMPTY_RUN_PROGRESS);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const pendingFileActionRef = useRef<"draft" | "save_new">("draft");
  const runPollTimerRef = useRef<number | null>(null);

  const ruleSetPreview = useMemo<RuleSet | null>(
    () => ({
      id: 1,
      name: draftRuleName,
      description: draftRuleDescription,
      is_enabled: true,
      is_builtin: currentPack ? false : true,
      version: 1,
      definition_json: cloneRuleDefinition(draftDefinition),
    }),
    [currentPack, draftDefinition, draftRuleDescription, draftRuleName],
  );

  const draftTags = useMemo(() => splitCommaLines(draftTagsText), [draftTagsText]);
  const currentPackComparable = useMemo(() => (currentPack ? buildPackComparable(currentPack) : null), [currentPack]);
  const currentDraftComparable = useMemo(
    () => buildDraftComparable(draftTags, searchSpec, draftRuleName, draftRuleDescription, draftDefinition),
    [draftTags, searchSpec, draftDefinition, draftRuleDescription, draftRuleName],
  );
  const draftDirty = useMemo(() => {
    if (!currentPackComparable) return false;
    return JSON.stringify(currentPackComparable) !== JSON.stringify(currentDraftComparable);
  }, [currentDraftComparable, currentPackComparable]);
  const queryPreview = useMemo(() => buildQueryPreview(searchSpec) || "--", [searchSpec]);
  const keywordCount = useMemo(
    () =>
      [
        searchSpec.all_keywords,
        searchSpec.exact_phrases,
        searchSpec.any_keywords,
        searchSpec.exclude_keywords,
      ].reduce((total, items) => total + items.length, 0),
    [searchSpec],
  );
  const authorConstraintCount = useMemo(
    () => searchSpec.authors_include.length + searchSpec.authors_exclude.length,
    [searchSpec],
  );
  const ruleCount = useMemo(() => draftDefinition.rules?.length || 0, [draftDefinition]);
  const levelCount = useMemo(() => draftDefinition.levels?.length || 0, [draftDefinition]);
  const resultQueries = useMemo(
    () => (result ? (result.final_queries?.length ? result.final_queries : [result.final_query]).filter(Boolean) : []),
    [result],
  );
  const displayedResultQueries = useMemo(() => resultQueries.slice(0, 5), [resultQueries]);
  const hiddenResultQueryCount = Math.max(0, resultQueries.length - displayedResultQueries.length);
  const packBindingLabel = currentPack ? "已绑定本地任务包" : "未绑定";
  const packDraftLabel = currentPack ? (draftDirty ? "已修改未保存" : "未修改") : "未绑定";
  const packSourceLabel = draftSourceLabel(draftSource);
  const currentDraftStatusLabel = currentPack ? (draftDirty ? "已修改未保存" : "已绑定任务包") : "未绑定草稿";
  const lastExecutionStatusLabel = executionStatusLabel(lastExecution.status);
  const lastExecutionTimeLabel = lastExecution.executedAt ? formatUtcPlus8Time(lastExecution.executedAt) : "尚未执行";
  const resultsSummaryStatusLabel = `状态：${lastExecutionStatusLabel}`;
  const resultsSummaryRawLabel = `raw_total：${lastExecution.status === "idle" ? "--" : lastExecution.rawTotal}`;
  const resultsSummaryMatchedLabel = `matched_total：${lastExecution.status === "idle" ? "--" : lastExecution.matchedTotal}`;
  const resultsSummaryErrorLabel = `errors：${lastExecution.status === "idle" ? "--" : lastExecution.errorCount}`;
  const progressVisible = runProgress.status !== "idle";
  const progressQueryLabel =
    runProgress.totalQueries > 0 ? `${runProgress.completedQueries} / ${runProgress.totalQueries}` : "-- / --";
  const progressPercentLabel = `${runProgress.progressPercent}%`;

  function clearRunPollTimer() {
    if (runPollTimerRef.current !== null) {
      window.clearTimeout(runPollTimerRef.current);
      runPollTimerRef.current = null;
    }
  }

  function finishManualRun(current: RunRecord, progress: ManualRunProgress) {
    clearRunPollTimer();
    setRunProgress(progress);
    setLoading(false);

    const finishedAt = current.ended_at || current.started_at || new Date().toISOString();
    const finalStatus = normalizeExecutionStatus(current.status);
    const resultPayload = current.result_json ?? null;

    if (finalStatus === "success" && resultPayload) {
      setResult(resultPayload);
      setLastExecution(buildExecutionSummary("success", finishedAt, resultPayload, ""));
      return;
    }

    const errors = Array.isArray(resultPayload?.errors) ? resultPayload.errors : [];
    const failureText = current.error_text || errors[0] || "采集失败";
    setResult(null);
    setError(failureText);
    setLastExecution(buildExecutionSummary("failed", finishedAt, resultPayload, failureText));
  }

  function resetToBlankDraft() {
    setSearchSpec(cloneSearchSpec(DEFAULT_SEARCH_SPEC));
    setDraftRuleName("Default Rule Set");
    setDraftRuleDescription("Built-in opportunity discovery rules.");
    setDraftTagsText("");
    setDraftDefinition(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));
    setCurrentPack(null);
    setSelectedPackName(DEFAULT_DRAFT_PACK_NAME);
    setDraftSource("blank");
  }

  function resetDraft() {
    if (currentPack) {
      setSearchSpec(cloneSearchSpec(currentPack.search_spec));
      setDraftTagsText(joinCommaLinesForTextarea(currentPack.tags || []));
      setDraftRuleName(currentPack.rule_set.name || currentPack.meta.name);
      setDraftRuleDescription(currentPack.rule_set.description || currentPack.meta.description || "");
      setDraftDefinition(cloneRuleDefinition(currentPack.rule_set.definition));
      setDraftSource("pack");
      setMessage("已恢复当前任务包草稿");
      return;
    }

    resetToBlankDraft();
    setMessage("已重置为默认草稿");
  }

  async function refreshTaskPacks() {
    const payload = await listTaskPacks();
    const items = payload.items || [];
    setTaskPacks(items);
    setSelectedPackName((prev) => {
      if (prev === DEFAULT_DRAFT_PACK_NAME) return prev;
      if (items.some((item) => item.pack_name === prev)) return prev;
      return DEFAULT_DRAFT_PACK_NAME;
    });
  }

  useEffect(() => {
    refreshTaskPacks().catch((err) => setError(err instanceof Error ? err.message : "加载任务包失败"));
  }, []);

  useEffect(() => () => clearRunPollTimer(), []);

  useEffect(() => {
    if (!loading || runProgress.runId === null || runProgress.status !== "running") return;

    let cancelled = false;
    const activeRunId = runProgress.runId;

    const pollRun = async () => {
      try {
        const current = await getRun(activeRunId);
        if (cancelled) return;

        const nextProgress = buildRunProgress(current);
        if (nextProgress.status === "running") {
          setRunProgress(nextProgress);
          clearRunPollTimer();
          runPollTimerRef.current = window.setTimeout(() => {
            void pollRun();
          }, 300);
          return;
        }

        finishManualRun(current, nextProgress);
      } catch (err) {
        if (cancelled) return;
        const failureText = err instanceof Error ? err.message : "获取执行进度失败";
        clearRunPollTimer();
        setLoading(false);
        setError(failureText);
        setRunProgress((prev) => ({
          ...prev,
          status: "failed",
          endedAt: new Date().toISOString(),
        }));
        setLastExecution(buildExecutionSummary("failed", new Date().toISOString(), null, failureText));
      }
    };

    void pollRun();

    return () => {
      cancelled = true;
      clearRunPollTimer();
    };
  }, [loading, runProgress.runId, runProgress.status]);

  async function importSelectedPack() {
    if (selectedPackName === DEFAULT_DRAFT_PACK_NAME) {
      resetToBlankDraft();
      setMessage("已切换到默认草稿");
      return;
    }
    if (!selectedPackName) return;

    setError("");
    setMessage("");
    try {
      const pack = await getTaskPack(selectedPackName);
      setSearchSpec(cloneSearchSpec(pack.search_spec));
      setDraftTagsText(joinCommaLinesForTextarea(pack.tags || []));
      setDraftRuleName(pack.rule_set.name || pack.meta.name);
      setDraftRuleDescription(pack.rule_set.description || pack.meta.description || "");
      setDraftDefinition(cloneRuleDefinition(pack.rule_set.definition));
      setCurrentPack(pack);
      setSelectedPackName(pack.pack_name);
      setDraftSource("pack");
      setMessage(`已载入任务包 ${pack.meta.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包失败");
    }
  }

  async function savePack(mode: "create" | "overwrite") {
    const suggestedName = currentPack?.pack_name || draftRuleName || "task-pack";
    const targetName =
      mode === "overwrite" && currentPack?.pack_name
        ? currentPack.pack_name
        : window.prompt("请输入任务包名称", suggestedName)?.trim();
    if (!targetName) return;

    setSavingPack(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPackPayload(
        targetName,
        draftRuleDescription,
        draftTags,
        searchSpec,
        draftRuleName,
        draftRuleDescription,
        draftDefinition,
      );
      const saved =
        mode === "overwrite" && currentPack?.pack_name
          ? await updateTaskPack(currentPack.pack_name, payload)
          : await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentPack(saved);
      setSelectedPackName(saved.pack_name);
      setDraftSource("pack");
      setDraftRuleName(saved.rule_set.name || targetName);
      setDraftRuleDescription(saved.rule_set.description || "");
      setDraftTagsText(joinCommaLinesForTextarea(saved.tags || []));
      setDraftDefinition(cloneRuleDefinition(saved.rule_set.definition));
      setMessage(mode === "overwrite" ? "已保存到当前任务包" : `已另存为新任务包 ${saved.pack_name}`);
      await refreshTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function importPackFile(file: File | null | undefined) {
    if (!file) return;

    setError("");
    setMessage("");
    try {
      const imported = await readImportedTaskPack(file);
      setSearchSpec(imported.searchSpec);
      setDraftTagsText(joinCommaLinesForTextarea(imported.tags || []));
      setDraftRuleName(imported.ruleSet.name);
      setDraftRuleDescription(imported.ruleSet.description || imported.description);
      setDraftDefinition(cloneRuleDefinition(imported.ruleSet.definition));
      setCurrentPack(null);
      setSelectedPackName(DEFAULT_DRAFT_PACK_NAME);
      setDraftSource("file");
      setMessage(`已从文件导入任务包 ${imported.sourceName}，当前仍是未绑定草稿`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包文件失败");
    }
  }

  async function importAndSavePackFile(file: File | null | undefined) {
    if (!file) return;

    setError("");
    setMessage("");
    try {
      const imported = await readImportedTaskPack(file);
      const suggestedName = imported.metaName || imported.sourceName.replace(/\.json$/i, "") || "task-pack";
      const targetName = window.prompt("请输入新任务包名称", suggestedName)?.trim();
      if (!targetName) return;

      setSavingPack(true);
      const payload = buildPackPayload(
        targetName,
        imported.description,
        imported.tags,
        imported.searchSpec,
        imported.ruleSet.name,
        imported.ruleSet.description,
        imported.ruleSet.definition,
      );
      const saved = await createTaskPack({ pack_name: targetName, ...payload });
      setSearchSpec(cloneSearchSpec(saved.search_spec));
      setDraftTagsText(joinCommaLinesForTextarea(saved.tags || []));
      setDraftRuleName(saved.rule_set.name || targetName);
      setDraftRuleDescription(saved.rule_set.description || "");
      setDraftDefinition(cloneRuleDefinition(saved.rule_set.definition));
      setCurrentPack(saved);
      setSelectedPackName(saved.pack_name);
      setDraftSource("pack");
      setMessage(`已从文件导入并保存为新任务包 ${saved.pack_name}`);
      await refreshTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入并保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleDeleteCurrentPack() {
    if (!currentPack?.pack_name || selectedPackName === DEFAULT_DRAFT_PACK_NAME) return;
    if (!window.confirm(`确认删除当前任务包 ${currentPack.pack_name} 吗？`)) return;

    setDeletingPack(true);
    setError("");
    setMessage("");
    try {
      const deletedPackName = currentPack.pack_name;
      await deleteTaskPack(deletedPackName);
      resetToBlankDraft();
      setMessage(`已删除任务包 ${deletedPackName}`);
      await refreshTaskPacks();
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

  function scrollToResults() {
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onRun() {
    setError("");
    setMessage("");
    setLoading(true);
    setResult(null);
    clearRunPollTimer();

    const startedAt = new Date().toISOString();
    setRunProgress({
      ...EMPTY_RUN_PROGRESS,
      status: "running",
      startedAt,
    });

    try {
      const data = await runManualStart({
        search_spec: searchSpec,
        tags: draftTags,
        rule_set: {
          name: draftRuleName,
          description: draftRuleDescription,
          version: 1,
          definition: cloneRuleDefinition(draftDefinition),
        },
      });
      setRunProgress((prev) => ({
        ...prev,
        runId: Number(data.run_id || 0) || null,
        status: "running",
      }));
    } catch (err) {
      const failureText = err instanceof Error ? err.message : "采集失败";
      setError(failureText);
      setLoading(false);
      setRunProgress({
        ...EMPTY_RUN_PROGRESS,
        status: "failed",
        startedAt,
        endedAt: new Date().toISOString(),
      });
      setLastExecution(buildExecutionSummary("failed", new Date().toISOString(), null, failureText));
    }
  }

  return (
    <div className="collector-workbench manual-page" data-testid="manual-search-page">
      <header className="card collector-hero manual-page-header workbench-page-header" data-testid="manual-page-header">
        <div className="manual-page-header-copy workbench-page-header-copy">
          <h3>手动执行任务</h3>
          <p className="kv">当前页面编辑的是任务草稿，可直接执行，不需要先保存为任务包。</p>
        </div>
        <div className="manual-page-header-actions workbench-page-header-actions">
          <button type="button" className="workbench-primary-action" onClick={onRun} data-testid="manual-run-button" disabled={loading}>
            {loading ? "执行中..." : "立即执行任务"}
          </button>
        </div>
      </header>

      {progressVisible && (
        <section className="card manual-run-progress-card workbench-layer" data-testid="manual-run-progress">
          <div className="manual-run-progress-head">
            <div className="manual-run-progress-copy">
              <div className="workbench-section-eyebrow">执行进度</div>
              <div className="manual-run-progress-title">
                {runProgress.status === "success"
                  ? "本次执行已完成"
                  : runProgress.status === "failed"
                    ? "本次执行已结束"
                    : "正在按查询计划抓取"}
              </div>
              <div className="kv">
                {runProgress.totalQueries > 0
                  ? `已完成 ${progressQueryLabel} 个查询切片`
                  : runProgress.runId
                    ? `执行任务 #${runProgress.runId} 已启动，等待返回查询总数`
                    : "正在创建执行任务..."}
              </div>
            </div>
            <div className="manual-run-progress-side">
              <span className={`jobs-summary-pill workbench-pill ${executionStatusTone(runProgress.status)}`}>
                {executionStatusLabel(runProgress.status)}
              </span>
              <div className="manual-run-progress-percent">{progressPercentLabel}</div>
            </div>
          </div>
          <div
            className="manual-run-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={runProgress.progressPercent}
          >
            <div className="manual-run-progress-fill" style={{ width: `${runProgress.progressPercent}%` }} />
          </div>
          <div className="manual-run-progress-meta">
            <span>{`查询 ${progressQueryLabel}`}</span>
            <span>{`raw ${runProgress.fetchedRaw}`}</span>
            <span>{`errors ${runProgress.queryErrors}`}</span>
          </div>
        </section>
      )}

      {error && (
        <div className="alert error" data-testid="manual-error">
          {error}
        </div>
      )}
      {message && <div className="alert success">{message}</div>}

      <div className="manual-layout">
        <div className="manual-editor-pane">
          <section className="card manual-section-card manual-section-card-muted workbench-layer">
            <ManualSectionHeader
              title="任务包操作"
              description="先确定草稿来源，再决定是否保存为任务包。"
              aside={
                <div className="collector-toolbar">
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    data-testid="manual-reset-draft"
                    onClick={resetDraft}
                  >
                    {currentPack ? "恢复任务包内容" : "清空当前草稿"}
                  </button>
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    data-testid="manual-refresh-task-packs"
                    onClick={() => refreshTaskPacks().catch(() => undefined)}
                  >
                    刷新任务包列表
                  </button>
                </div>
              }
            />
            <div
              className="manual-pack-context-hint flat-meta-strip"
              data-testid="manual-pack-context-hint"
            >
              <div className="workbench-pill-row">
                <span className="jobs-summary-pill workbench-pill">{`当前来源：${packSourceLabel}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`当前绑定：${currentPack?.pack_name || "--"}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`tags：${draftTags.length ? draftTags.join(", ") : "--"}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`草稿状态：${packDraftLabel}`}</span>
              </div>
            </div>
            <div className="collector-grid collector-grid-2 manual-pack-actions-grid">
              <div className="manual-action-card flat-section" data-testid="manual-pack-load-card">
                <div className="manual-action-card-head">
                  <div className="manual-action-card-copy">
                    <div className="manual-action-card-eyebrow">草稿来源</div>
                    <div className="collector-subtitle">载入到当前草稿</div>
                  </div>
                </div>
                <div className="kv manual-pack-note">可从任务包列表载入，或从本地 JSON 导入。</div>
                <div className="manual-action-group">
                  <div className="manual-action-group-label">载入已有任务包</div>
                  <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                    <select
                      aria-label="manual-pack-select"
                      value={selectedPackName}
                      onChange={(event) => setSelectedPackName(event.target.value)}
                    >
                      <option value={DEFAULT_DRAFT_PACK_NAME}>{DEFAULT_DRAFT_PACK_LABEL}</option>
                      {taskPacks.map((item) => (
                        <option key={item.pack_name} value={item.pack_name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="workbench-secondary-action"
                      data-testid="manual-load-pack"
                      onClick={() => importSelectedPack().catch(() => undefined)}
                    >
                      载入任务包
                    </button>
                  </div>
                </div>
                <div className="manual-action-group">
                  <div className="manual-action-group-label">从本地文件导入</div>
                  <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                    <button
                      type="button"
                      className="workbench-secondary-action"
                      data-testid="manual-import-file-pack"
                      onClick={() => {
                        pendingFileActionRef.current = "draft";
                        fileInputRef.current?.click();
                      }}
                    >
                      从文件导入
                    </button>
                    <button
                      type="button"
                      className="workbench-secondary-action"
                      data-testid="manual-import-and-save-pack"
                      onClick={() => {
                        pendingFileActionRef.current = "save_new";
                        fileInputRef.current?.click();
                      }}
                    >
                      导入并保存为新任务包
                    </button>
                    <input
                      ref={fileInputRef}
                      data-testid="manual-pack-file-input"
                      type="file"
                      accept=".json,application/json"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void (pendingFileActionRef.current === "save_new"
                          ? importAndSavePackFile(file)
                          : importPackFile(file));
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <div className="kv manual-pack-note">从文件导入只替换当前草稿。</div>
                  <div className="kv manual-pack-note">导入并保存会新建并绑定任务包。</div>
                </div>
                <div className="manual-action-group">
                  <div className="manual-action-group-label">tags</div>
                  <textarea
                    className="workbench-textarea"
                    rows={3}
                    value={draftTagsText}
                    onChange={(event) => setDraftTagsText(event.target.value)}
                    placeholder="逗号或换行分隔，如：alpha, defi, wallet"
                    aria-label="manual-pack-tags"
                  />
                </div>
              </div>
              <div className="manual-action-card flat-section" data-testid="manual-pack-save-card">
                <div className="manual-action-card-head">
                  <div className="manual-action-card-copy">
                    <div className="manual-action-card-eyebrow">草稿落盘</div>
                    <div className="collector-subtitle">保存当前草稿</div>
                  </div>
                </div>
                <div className="kv manual-pack-note">可另存为新任务包，或保存回当前任务包。</div>
                <div className="manual-action-group">
                  <div className="manual-action-group-label">创建或覆盖</div>
                  <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                    <button
                      type="button"
                      className="workbench-secondary-action"
                      data-testid="manual-save-as-pack"
                      onClick={() => savePack("create").catch(() => undefined)}
                      disabled={savingPack}
                    >
                      另存为新任务包
                    </button>
                    <button
                      type="button"
                      className="workbench-primary-action"
                      data-testid="manual-save-current-pack"
                      onClick={() => savePack("overwrite").catch(() => undefined)}
                      disabled={savingPack || !currentPack?.pack_name}
                    >
                      保存到当前任务包
                    </button>
                  </div>
                </div>
                <div className="manual-action-group manual-action-group-danger">
                  <div className="manual-action-group-label">删除当前绑定任务包</div>
                  <div className="kv manual-pack-note">默认任务包和仍被引用的任务包不能在此删除。</div>
                  <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                    <button
                      type="button"
                      className="workbench-danger-action"
                      data-testid="manual-delete-pack"
                      onClick={() => handleDeleteCurrentPack().catch(() => undefined)}
                      disabled={deletingPack || !currentPack?.pack_name || selectedPackName === DEFAULT_DRAFT_PACK_NAME}
                    >
                      {deletingPack ? "删除中..." : "删除当前任务包"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card manual-section-card workbench-layer">
            <ManualSectionHeader
              title="任务正文摘要"
              description="任务正文由搜索条件和规则组成，这里先给出当前草稿的查询摘要，再进入详细编辑。"
              aside={
                <div className="chiprow">
                  <span className="collector-query-chip">任务包 = 搜索条件 + 规则</span>
                </div>
              }
            />
            <div className="manual-body-overview">
              <div className="collector-query-preview manual-body-preview">
                <div className="collector-subtitle">查询摘要</div>
                <code>{queryPreview}</code>
              </div>
              <div className="manual-body-detail-grid flat-row-list">
                <div className="flat-row">
                  <span>关键词片段</span>
                  <strong>{`${keywordCount} 项`}</strong>
                </div>
                <div className="flat-row">
                  <span>作者约束</span>
                  <strong>{`${authorConstraintCount} 项`}</strong>
                </div>
                <div className="flat-row">
                  <span>规则条数</span>
                  <strong>{`${ruleCount} 条`}</strong>
                </div>
                <div className="flat-row">
                  <span>等级数</span>
                  <strong>{`${levelCount} 层`}</strong>
                </div>
                <div className="flat-row flat-row-wide">
                  <span>规则名称</span>
                  <strong>{draftRuleName || "--"}</strong>
                </div>
                <div className="flat-row flat-row-wide">
                  <span>规则说明</span>
                  <strong>{draftRuleDescription || "未填写规则说明"}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="card manual-section-card workbench-layer">
            <ManualSectionHeader
              title="搜索条件"
              description="这里定义这个任务要去搜什么。"
              aside={
                <div className="workbench-pill-row">
                  <span className="jobs-summary-pill workbench-pill">{`关键词片段：${keywordCount}`}</span>
                  <span className="jobs-summary-pill workbench-pill">{`作者约束：${authorConstraintCount}`}</span>
                </div>
              }
            />
            <div className="manual-editor-surface" data-testid="manual-search-editor-surface">
              <div className="manual-editor-surface-head">
                <div className="manual-editor-surface-copy">
                  <div className="collector-subtitle">搜索输入面板</div>
                  <div className="kv">直接编辑搜索条件，顶部任务正文摘要会同步反映当前查询内容。</div>
                </div>
              </div>
              <div className="collector-panel manual-editor-panel">
                <SearchSpecEditor value={searchSpec} onChange={setSearchSpec} disabled={loading} />
              </div>
            </div>
          </section>

          <section className="card manual-section-card workbench-layer">
            <ManualSectionHeader
              title="规则"
              description="这里定义原始结果如何筛选、打分和分级。"
              aside={
                <div className="workbench-pill-row">
                  <span className="jobs-summary-pill workbench-pill">{`规则：${ruleCount}`}</span>
                  <span className="jobs-summary-pill workbench-pill">{`等级：${levelCount}`}</span>
                </div>
              }
            />
            <div className="manual-editor-surface" data-testid="manual-rule-editor-surface">
              <div className="manual-editor-surface-head">
                <div className="manual-editor-surface-copy">
                  <div className="collector-subtitle">筛选与打分规则</div>
                  <div className="kv">先维护规则名称和说明，再在下方编辑等级、规则项和命中条件。</div>
                </div>
              </div>
              <div className="collector-grid collector-grid-2 manual-rule-meta-grid">
                <label className="field">
                  <span>规则名称</span>
                  <input value={draftRuleName} onChange={(event) => setDraftRuleName(event.target.value)} />
                </label>
                <label className="field">
                  <span>规则说明</span>
                  <input value={draftRuleDescription} onChange={(event) => setDraftRuleDescription(event.target.value)} />
                </label>
              </div>
              <RuleSetEditor
                ruleSet={ruleSetPreview}
                draft={draftDefinition}
                onDraftChange={setDraftDefinition}
                disabled={loading}
              />
            </div>
          </section>
        </div>

        <aside className="card manual-execution-rail workbench-layer" data-testid="manual-execution-rail">
          <ManualSectionHeader
            title="执行摘要"
            description="这里只展示草稿状态和最近一次执行结果。"
          />
          <div className="manual-rail-hero flat-section">
            <div className="manual-rail-pills workbench-pill-row">
              <span className="jobs-summary-pill workbench-pill">{`当前草稿：${currentDraftStatusLabel}`}</span>
              <span className="jobs-summary-pill workbench-pill">{`最近状态：${lastExecutionStatusLabel}`}</span>
              <span className="jobs-summary-pill workbench-pill">{`最近执行：${lastExecutionTimeLabel}`}</span>
            </div>
            <div className={`manual-execution-note ${lastExecution.status === "failed" ? "failed" : ""}`}>
              {lastExecution.status === "idle"
                ? "尚未执行"
                : lastExecution.status === "failed"
                  ? lastExecution.errorText || "最近执行失败，请检查任务正文后重试。"
                  : "最近执行完成，可查看下方结果。"}
            </div>
          </div>
          <div className="manual-rail-grid flat-row-list">
            <div className="flat-row">
              <span>草稿状态</span>
              <strong>
                {currentDraftStatusLabel}
              </strong>
            </div>
            <div className="flat-row">
              <span>最近执行</span>
              <strong>{lastExecutionTimeLabel}</strong>
            </div>
            <div className="flat-row">
              <span>最近一次结果</span>
              <strong>
                <span className={`badge ${executionStatusTone(lastExecution.status)}`}>
                  {executionStatusLabel(lastExecution.status)}
                </span>
              </strong>
            </div>
            <div className="flat-row">
              <span>raw_total</span>
              <strong>{lastExecution.status === "idle" ? "--" : `${lastExecution.rawTotal} 条`}</strong>
            </div>
            <div className="flat-row">
              <span>matched_total</span>
              <strong>{lastExecution.status === "idle" ? "--" : `${lastExecution.matchedTotal} 条`}</strong>
            </div>
            <div className="flat-row">
              <span>errors</span>
              <strong>{lastExecution.status === "idle" ? "--" : `${lastExecution.errorCount} 条`}</strong>
            </div>
          </div>
          <div className="manual-rail-footer">
            <div className="kv manual-rail-caption">完整执行输出会在下方全宽结果区展开，不会挤压右侧执行轨。</div>
            <button
              type="button"
              className="manual-results-link workbench-secondary-action"
              data-testid="manual-scroll-results"
              onClick={scrollToResults}
            >
              查看执行结果
            </button>
          </div>
        </aside>
      </div>

      <section ref={resultsRef} className="card manual-results-section workbench-layer">
        <ManualSectionHeader
          title="执行结果"
          description="完整执行输出仍放在页面下方全宽区域，包含最终查询、原始结果和命中结果。"
        />
        <div className="manual-results-hero flat-meta-strip" data-testid="manual-results-summary-card">
          <div className="manual-results-hero-copy">
            <div className="workbench-section-eyebrow">执行概览</div>
            <div className="collector-subtitle">结果区只负责承载完整输出</div>
            <div className="kv">未执行时保留清晰空状态；执行后在这里先给出状态摘要，再展开完整结果。</div>
          </div>
          <div className="manual-results-hero-pills workbench-pill-row">
            <span className={`jobs-summary-pill workbench-pill ${executionStatusTone(lastExecution.status)}`}>
              {resultsSummaryStatusLabel}
            </span>
            <span className="jobs-summary-pill workbench-pill">{resultsSummaryRawLabel}</span>
            <span className="jobs-summary-pill workbench-pill">{resultsSummaryMatchedLabel}</span>
            <span className="jobs-summary-pill workbench-pill">{resultsSummaryErrorLabel}</span>
          </div>
        </div>

        {loading ? (
          <div className="searching" data-testid="manual-searching">
            <span className="spinner" /> 正在执行任务并评估结果...
          </div>
        ) : result ? (
          <div className="collector-stack">
            <div className="collector-summary-grid flat-row-list">
              <div className="flat-row">
                <span>实际查询</span>
                <div>
                  {displayedResultQueries.map((query) => (
                    <div key={query} className="collector-text-snippet">
                      {query}
                    </div>
                  ))}
                  {hiddenResultQueryCount > 0 && <div className="kv">{`还有 ${hiddenResultQueryCount} 条时间切片查询未展开`}</div>}
                  {!resultQueries.length && <strong>--</strong>}
                </div>
              </div>
              <div className="flat-row">
                <span>本次执行规则</span>
                <strong>{result.rule_set_summary?.name || "--"}</strong>
              </div>
              <div className="flat-row">
                <span>原始结果</span>
                <strong>{result.raw_total}</strong>
              </div>
              <div className="flat-row">
                <span>命中结果</span>
                <strong>{result.matched_total}</strong>
              </div>
            </div>

            <div className="collector-result-grid">
              <section className="card">
                <div className="collector-toolbar between">
                  <h4>原始结果</h4>
                  <span className="kv">{`total=${result.raw_items.length}`}</span>
                </div>
                <table className="table collector-table">
                  <thead>
                    <tr>
                      <th>作者 / 时间</th>
                      <th>内容</th>
                      <th>互动</th>
                      <th>标记</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.raw_items.map((item) => (
                      <tr key={`${item.tweet_id}-${item.url}`}>
                        <td>
                          <div className="job-name">{formatAuthorDisplay(item.author_name, item.author)}</div>
                          <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                        </td>
                        <td>
                          <div className="collector-text-snippet">{item.text || "--"}</div>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            查看原文
                          </a>
                        </td>
                        <td>
                          <div>views {metricValue(item, "views")}</div>
                          <div>likes {metricValue(item, "likes")}</div>
                          <div>replies {metricValue(item, "replies")}</div>
                          <div>retweets {metricValue(item, "retweets")}</div>
                        </td>
                        <td>
                          <div className="collector-flag-list">
                            {item.flags.has_link && <span className="badge">link</span>}
                            {item.flags.has_media && <span className="badge">media</span>}
                            {item.flags.is_reply && <span className="badge">reply</span>}
                            {item.flags.is_retweet && <span className="badge">retweet</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="card">
                <div className="collector-toolbar between">
                  <h4>命中结果</h4>
                  <span className="kv">{`total=${result.matched_items.length}`}</span>
                </div>
                <table className="table collector-table">
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th>等级 / 分数</th>
                      <th>命中原因</th>
                      <th>作者 / 时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched_items.map((item) => (
                      <tr key={`${item.tweet_id}-${item.url}-matched`}>
                        <td>
                          <div className="job-name">{item.title || item.text}</div>
                          <div className="collector-text-snippet">{item.summary || item.text}</div>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            查看原文
                          </a>
                        </td>
                        <td>
                          <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level}</span>
                          <div className="kv">score {item.score || 0}</div>
                        </td>
                        <td>
                          <div className="collector-reason-list">
                            {item.reasons?.map((reason) => (
                              <div key={`${item.tweet_id}-${reason.rule_id}`} className="collector-reason-item">
                                <strong>{reason.rule_name}</strong>
                                <div className="kv">{reason.matched_conditions.join(" / ")}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="job-name">{formatAuthorDisplay(item.author_name, item.author)}</div>
                          <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                        </td>
                      </tr>
                    ))}
                    {!result.matched_items.length && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", color: "#64748b" }}>
                          本次执行有原始结果，但当前任务正文中的规则没有命中任何线索。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          </div>
        ) : (
          <div className="manual-results-empty">
            <strong>{lastExecution.status === "failed" ? "最近一次执行失败" : "等待执行"}</strong>
            <p className="kv">
              {lastExecution.status === "failed"
                ? lastExecution.errorText || "最近执行失败，请修正任务正文后重试。"
                : "执行后，这里会展示最终查询、原始结果和命中结果。"}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
