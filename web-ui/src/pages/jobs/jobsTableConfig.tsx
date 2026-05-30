import type { ReactNode } from "react";

import type { JobBatchAction, JobBatchResponse, JobRecord, RunRecord } from "../../api";
import { TagPills } from "../../components/TagPills";
import { buildRunProgress, type RunProgress } from "../../runProgress";
import { formatUtcPlus8Time } from "../../time";

export type JobStatusFilter = "active" | "all" | "deleted";

export type JobSelectionState = "none" | "active" | "deleted" | "mixed";

export type BatchActionSpec = {
  action: JobBatchAction;
  label: string;
  tone?: "danger" | "ghost";
};

export type ActiveJobRun = {
  run: RunRecord;
  progress: RunProgress;
};

export type JobTableColumnKey = "name" | "pack" | "group" | "tags" | "interval" | "status" | "next_run_at" | "last_run";

export type JobTableColumnDefinition = {
  key: JobTableColumnKey;
  label: string;
  width: number;
  render: (job: JobRecord, activeRun: ActiveJobRun | undefined) => ReactNode;
};

export type JobColumnWidths = Partial<Record<JobTableColumnKey, number>>;

export type JobColumnResizeState = {
  leftKey: JobTableColumnKey;
  rightKey: JobTableColumnKey;
  startX: number;
  leftStartWidth: number;
  rightStartWidth: number;
  leftMinWidth: number;
  rightMinWidth: number;
};

export function buildActiveJobRunFromJob(job: JobRecord): ActiveJobRun | null {
  if (!job.last_run_id || String(job.last_run_status || "").toLowerCase() !== "running") {
    return null;
  }
  const run: RunRecord = {
    id: job.last_run_id,
    job_id: job.id,
    trigger_type: "auto",
    status: job.last_run_status || "running",
    started_at: job.last_run_started_at || job.updated_at,
    ended_at: job.last_run_ended_at || null,
    error_text: job.last_run_error_text || null,
    stats_json: (job.last_run_stats as Record<string, number> | undefined) || {},
    result_json: null,
  };
  return {
    run,
    progress: buildRunProgress(run),
  };
}

export const JOB_TABLE_COLUMNS: JobTableColumnDefinition[] = [
  {
    key: "name",
    label: "任务",
    width: 220,
    render: (job) => (
      <>
        <div className="job-name jobs-row-title">{job.name}</div>
        <div className="kv jobs-row-meta">#{job.id}</div>
      </>
    ),
  },
  {
    key: "pack",
    label: "任务包",
    width: 220,
    render: (job) => (
      <>
        <div className="job-name jobs-row-title">{job.pack_meta?.name || job.pack_name || "--"}</div>
        <div className="kv jobs-row-meta">{job.pack_name || "--"}</div>
      </>
    ),
  },
  {
    key: "group",
    label: "分组",
    width: 160,
    render: (job) => job.group_name || "--",
  },
  {
    key: "tags",
    label: "任务标签",
    width: 180,
    render: (job) => <TagPills tags={job.tags} />,
  },
  {
    key: "interval",
    label: "间隔",
    width: 110,
    render: (job) => `${job.interval_minutes} 分钟`,
  },
  {
    key: "status",
    label: "状态",
    width: 110,
    render: (job) => <span className={`badge ${job.deleted_at ? "b" : job.enabled ? "a" : ""}`}>{jobState(job)}</span>,
  },
  {
    key: "next_run_at",
    label: "下次运行",
    width: 220,
    render: (job) => formatUtcPlus8Time(job.next_run_at),
  },
  {
    key: "last_run",
    label: "最近运行",
    width: 220,
    render: (job, activeRun) =>
      activeRun ? (
        <>
          <div className="jobs-running-status">
            <span>{`${activeRun.run.status || "running"} `}</span>
            <span className="jobs-running-percent">{`${activeRun.progress.progressPercent || 0}%`}</span>
          </div>
          <div className="kv">{formatUtcPlus8Time(activeRun.progress.startedAt)}</div>
        </>
      ) : (
        <>
          <div>{job.last_run_status || "--"}</div>
          <div className="kv">{formatUtcPlus8Time(job.last_run_ended_at || job.last_run_started_at)}</div>
        </>
      ),
  },
];

export function normalizeJobColumnWidths(value: unknown): JobColumnWidths {
  if (value == null || typeof value !== "object") {
    return {};
  }
  const allowed = new Set(JOB_TABLE_COLUMNS.map((column) => column.key));
  const result: JobColumnWidths = {};
  for (const [key, rawWidth] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key as JobTableColumnKey)) {
      continue;
    }
    if (typeof rawWidth !== "number" || !Number.isFinite(rawWidth) || rawWidth <= 0) {
      continue;
    }
    result[key as JobTableColumnKey] = Math.round(rawWidth);
  }
  return result;
}

export function readJobColumnWidths(): JobColumnWidths {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(JOBS_COLUMN_WIDTHS_KEY);
  if (!raw) {
    return {};
  }
  try {
    return normalizeJobColumnWidths(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function writeJobColumnWidths(widths: JobColumnWidths) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(JOBS_COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

export function getJobColumnMinWidth(column: JobTableColumnDefinition) {
  if (column.width <= 90) return 72;
  if (column.width <= 120) return 88;
  if (column.width <= 160) return 120;
  return 140;
}

export function resolveJobColumnWidth(column: JobTableColumnDefinition, storedWidth?: number) {
  const minWidth = getJobColumnMinWidth(column);
  const width = typeof storedWidth === "number" && Number.isFinite(storedWidth) ? storedWidth : column.width;
  return Math.max(minWidth, Math.round(width));
}

export const ACTIVE_BATCH_ACTIONS: BatchActionSpec[] = [
  { action: "enable", label: "批量启用", tone: "ghost" },
  { action: "disable", label: "批量停用", tone: "ghost" },
  { action: "run_now", label: "批量立即运行" },
  { action: "delete", label: "批量删除", tone: "danger" },
];

export const DELETED_BATCH_ACTIONS: BatchActionSpec[] = [
  { action: "restore", label: "批量恢复" },
  { action: "purge", label: "批量彻底删除", tone: "danger" },
];

export const JOBS_SELECT_COLUMN_WIDTH = 48;
const JOBS_COLUMN_WIDTHS_KEY = "jobs.columnWidths.v1";

export function jobState(job: JobRecord) {
  if (job.deleted_at) return "已删除";
  return job.enabled ? "已启用" : "已停用";
}

export function jobSelectionState(status: JobStatusFilter, allMatchingSelected: boolean, selectedIds: number[], selectedDeletedById: Record<number, boolean>) {
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

export function batchActionMessage(result: JobBatchResponse) {
  const summary = `已成功 ${result.succeeded} 条，失败 ${result.failed} 条`;
  if (result.action === "run_now" && result.failed_items.length) {
    return [summary, ...result.failed_items.slice(0, 3).map((item) => `${item.name}: ${item.error}`)].join("\n");
  }
  return summary;
}

export function batchConfirmText(action: JobBatchAction, count: number) {
  if (action === "delete") return `确认删除 ${count} 条任务吗？`;
  if (action === "purge") return `确认彻底删除 ${count} 条任务吗？此操作不可恢复。`;
  if (action === "run_now") return `确认顺序执行 ${count} 条任务吗？`;
  return "";
}
