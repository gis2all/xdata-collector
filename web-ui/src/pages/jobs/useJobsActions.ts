import {
  batchJobs,
  cancelRun,
  createJob,
  deleteJob,
  purgeJob,
  restoreJob,
  runJobNow,
  toggleJob,
  updateJob,
  type JobBatchAction,
  type JobRecord,
} from "../../api";
import { cloneRuleDefinition, splitCommaLines } from "../../collector";
import { batchActionMessage, batchConfirmText, type JobStatusFilter } from "./jobsTableConfig";
import type { JobFormState } from "./jobDraft";

type DrawerMode = "create" | "view" | "edit";

type RefreshJobsOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
  silent?: boolean;
};

type UseJobsActionsParams = {
  form: JobFormState;
  drawerMode: DrawerMode;
  selectedJob: JobRecord | null;
  status: JobStatusFilter;
  query: string;
  page: number;
  selectedIds: number[];
  allMatchingSelected: boolean;
  selectedCount: number;
  setSaving: (saving: boolean) => void;
  setError: (message: string) => void;
  setActionMessage: (message: string) => void;
  setSelectedJob: (job: JobRecord | null) => void;
  setDrawerMode: (mode: DrawerMode) => void;
  setDrawerOpen: (open: boolean) => void;
  setStatus: (status: JobStatusFilter) => void;
  refreshJobs: (options?: RefreshJobsOptions) => Promise<void>;
  clearSelection: () => void;
  isBatchActionEnabled: (action: JobBatchAction) => boolean;
  markJobRunStarted: (jobId: number, runId: number) => void;
  pollActiveRunsOnce: () => Promise<unknown>;
};

export function useJobsActions({
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
}: UseJobsActionsParams) {
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
      markJobRunStarted(job.id, started.run_id);
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
      const updated = await toggleJob(job.id, !job.enabled);
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

  return {
    handleSave,
    handleDelete,
    handleRestore,
    handlePurge,
    handleRunNow,
    handleStopRun,
    handleToggle,
    handleBatchAction,
  };
}
