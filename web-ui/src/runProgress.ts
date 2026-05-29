import { RunRecord } from "./api";

export type ExecutionStatus = "idle" | "running" | "success" | "failed" | "cancelled";

export type RunProgress = {
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

export const EMPTY_RUN_PROGRESS: RunProgress = {
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

export function normalizeExecutionStatus(status: string | null | undefined): ExecutionStatus {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "idle";
}

export function executionStatusLabel(status: ExecutionStatus) {
  if (status === "running") return "执行中";
  if (status === "success") return "执行成功";
  if (status === "failed") return "执行失败";
  if (status === "cancelled") return "已停止";
  return "未执行";
}

export function executionStatusTone(status: ExecutionStatus) {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "neutral";
}

export function statNumber(stats: Record<string, number> | undefined, key: string) {
  const value = Number(stats?.[key] ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function progressPercentForRun(status: ExecutionStatus, completedQueries: number, totalQueries: number, reportedPercent: number) {
  if (status === "success") return 100;
  if (status === "failed" && totalQueries > 0 && completedQueries >= totalQueries) return 100;
  if (reportedPercent > 0) return clampPercent(reportedPercent);
  if (totalQueries > 0) return clampPercent((completedQueries / totalQueries) * 100);
  return 0;
}

export function buildRunProgress(run: RunRecord): RunProgress {
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

export function runProgressSummary(progress: RunProgress) {
  return `${progress.completedQueries} / ${progress.totalQueries}`;
}
