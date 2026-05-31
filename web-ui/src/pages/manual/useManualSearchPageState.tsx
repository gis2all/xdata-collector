import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import {
  cancelRun,
  createTaskPack,
  deleteTaskPack,
  getRun,
  getTaskPack,
  listTaskPacks,
  runManualStart,
  updateTaskPack,
  type CollectorRunResult,
  type RunRecord,
  type RuleSet,
  type RuleSetDefinition,
  type TaskPackFile,
  type TaskPackSummary,
} from "../../api";
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  buildQueryPreview,
  cloneRuleDefinition,
  cloneSearchSpec,
  joinCommaLinesForTextarea,
  splitCommaLines,
} from "../../collector";
import {
  EMPTY_RUN_PROGRESS,
  buildRunProgress,
  executionStatusLabel,
  normalizeExecutionStatus,
} from "../../runProgress";
import { readImportedTaskPack } from "../../taskPacks";
import { formatUtcPlus8Time } from "../../time";
import {
  DEFAULT_DRAFT_PACK_LABEL,
  DEFAULT_DRAFT_PACK_NAME,
  EMPTY_EXECUTION_SUMMARY,
  buildDraftComparable,
  buildExecutionSummary,
  buildPackComparable,
  buildPackPayload,
  draftSourceLabel,
  type DraftSourceKind,
  type ExecutionSummary,
  type ManualRunProgress,
} from "../manualSearchModel";

export function useManualSearchPageState() {
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
    [draftDefinition, draftRuleDescription, draftRuleName, draftTags, searchSpec],
  );
  const draftDirty = useMemo(() => {
    if (!currentPackComparable) {
      return false;
    }
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
    const fallbackText = finalStatus === "cancelled" ? "已手动停止执行" : "采集失败";
    const failureText = current.error_text || errors[0] || fallbackText;
    setResult(null);
    if (finalStatus === "cancelled") {
      setMessage(failureText);
      setError("");
      setLastExecution(buildExecutionSummary("cancelled", finishedAt, resultPayload, failureText));
      return;
    }
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
      if (prev === DEFAULT_DRAFT_PACK_NAME) {
        return prev;
      }
      if (items.some((item) => item.pack_name === prev)) {
        return prev;
      }
      return DEFAULT_DRAFT_PACK_NAME;
    });
  }

  useEffect(() => {
    refreshTaskPacks().catch((err) => setError(err instanceof Error ? err.message : "加载任务包失败"));
  }, []);

  useEffect(() => () => clearRunPollTimer(), []);

  useEffect(() => {
    if (!loading || runProgress.runId === null || runProgress.status !== "running") {
      return;
    }

    let cancelled = false;
    const activeRunId = runProgress.runId;

    const pollRun = async () => {
      try {
        const current = await getRun(activeRunId);
        if (cancelled) {
          return;
        }

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
        if (cancelled) {
          return;
        }
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
    if (!selectedPackName) {
      return;
    }

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
    if (!targetName) {
      return;
    }

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
    if (!file) {
      return;
    }

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
    if (!file) {
      return;
    }

    setError("");
    setMessage("");
    try {
      const imported = await readImportedTaskPack(file);
      const suggestedName = imported.metaName || imported.sourceName.replace(/\.json$/i, "") || "task-pack";
      const targetName = window.prompt("请输入新任务包名称", suggestedName)?.trim();
      if (!targetName) {
        return;
      }

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
    if (!currentPack?.pack_name || selectedPackName === DEFAULT_DRAFT_PACK_NAME) {
      return;
    }
    if (!window.confirm(`确认删除当前任务包 ${currentPack.pack_name} 吗？`)) {
      return;
    }

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

  async function onStopRun() {
    if (runProgress.runId === null || runProgress.status !== "running") {
      return;
    }
    setError("");
    setMessage("");
    try {
      await cancelRun(runProgress.runId);
      const current = await getRun(runProgress.runId);
      finishManualRun(current, buildRunProgress(current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止执行失败");
    }
  }

  function handleSelectedPackNameChange(value: string) {
    setSelectedPackName(value);
  }

  function handleDraftTagsTextChange(value: string) {
    setDraftTagsText(value);
  }

  function handleDraftRuleNameChange(value: string) {
    setDraftRuleName(value);
  }

  function handleDraftRuleDescriptionChange(value: string) {
    setDraftRuleDescription(value);
  }

  function handleImportFileClick() {
    pendingFileActionRef.current = "draft";
    fileInputRef.current?.click();
  }

  function handleImportAndSaveClick() {
    pendingFileActionRef.current = "save_new";
    fileInputRef.current?.click();
  }

  function handlePackFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    void (pendingFileActionRef.current === "save_new" ? importAndSavePackFile(file) : importPackFile(file));
    event.currentTarget.value = "";
  }

  return {
    searchSpec,
    setSearchSpec,
    result,
    error,
    message,
    loading,
    savingPack,
    deletingPack,
    taskPacks,
    selectedPackName,
    currentPack,
    draftSource,
    draftRuleName,
    draftRuleDescription,
    draftTagsText,
    draftDefinition,
    setDraftDefinition,
    lastExecution,
    runProgress,
    fileInputRef,
    resultsRef,
    ruleSetPreview,
    draftTags,
    draftDirty,
    queryPreview,
    keywordCount,
    authorConstraintCount,
    ruleCount,
    levelCount,
    resultQueries,
    displayedResultQueries,
    hiddenResultQueryCount,
    packDraftLabel,
    packSourceLabel,
    currentDraftStatusLabel,
    lastExecutionStatusLabel,
    lastExecutionTimeLabel,
    resultsSummaryStatusLabel,
    resultsSummaryRawLabel,
    resultsSummaryMatchedLabel,
    resultsSummaryErrorLabel,
    progressVisible,
    progressQueryLabel,
    progressPercentLabel,
    defaultDraftPackLabel: DEFAULT_DRAFT_PACK_LABEL,
    defaultDraftPackName: DEFAULT_DRAFT_PACK_NAME,
    resetDraft,
    refreshTaskPacks,
    importSelectedPack,
    handleSelectedPackNameChange,
    handleDraftTagsTextChange,
    handleDraftRuleNameChange,
    handleDraftRuleDescriptionChange,
    handleImportFileClick,
    handleImportAndSaveClick,
    handlePackFileInputChange,
    handleSaveAsPack: () => savePack("create"),
    handleSaveCurrentPack: () => savePack("overwrite"),
    handleDeleteCurrentPack,
    scrollToResults,
    onRun,
    onStopRun,
  } as const;
}

export type ManualSearchPageState = ReturnType<typeof useManualSearchPageState>;
