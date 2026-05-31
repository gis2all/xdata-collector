import { useCallback, useEffect, useRef, useState } from "react";

import { getRun, type JobRecord, type RunRecord } from "../../api";
import { EMPTY_RUN_PROGRESS, buildRunProgress } from "../../runProgress";
import { buildActiveJobRunFromJob, type ActiveJobRun } from "./jobsTableConfig";

function isNotFoundError(err: unknown) {
  return err instanceof Error && err.message.trim().toLowerCase() === "not found";
}

type UseJobsRunStateParams = {
  onRefreshJobs: () => Promise<void>;
  onError: (message: string) => void;
};

export function useJobsRunState({ onRefreshJobs, onError }: UseJobsRunStateParams) {
  const [activeRunsByJobId, setActiveRunsByJobId] = useState<Record<number, ActiveJobRun>>({});
  const runPollTimerRef = useRef<number | null>(null);
  const activeRunsRef = useRef<Record<number, ActiveJobRun>>({});

  const clearRunPollTimer = useCallback(() => {
    if (runPollTimerRef.current !== null) {
      window.clearTimeout(runPollTimerRef.current);
      runPollTimerRef.current = null;
    }
  }, []);

  const mergeActiveRunsFromJobs = useCallback((items: JobRecord[]) => {
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
  }, []);

  const pollActiveRunsOnce = useCallback(async () => {
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

    await onRefreshJobs();
    return updates.some((update) => update.run && buildRunProgress(update.run).status === "running");
  }, [clearRunPollTimer, onRefreshJobs]);

  const markJobRunStarted = useCallback((jobId: number, runId: number) => {
    const run: RunRecord = {
      id: runId,
      job_id: jobId,
      trigger_type: "auto",
      status: "running",
      started_at: new Date().toISOString(),
      ended_at: null,
      error_text: null,
      stats_json: {},
      result_json: null,
    };
    const entry: ActiveJobRun = {
      run,
      progress: {
        ...EMPTY_RUN_PROGRESS,
        runId,
        status: "running",
        startedAt: run.started_at,
      },
    };
    setActiveRunsByJobId((prev) => {
      const next = {
        ...prev,
        [jobId]: entry,
      };
      activeRunsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    activeRunsRef.current = activeRunsByJobId;
  }, [activeRunsByJobId]);

  useEffect(() => {
    if (!Object.values(activeRunsByJobId).some((entry) => entry.progress.status === "running")) {
      clearRunPollTimer();
      return;
    }

    clearRunPollTimer();
    runPollTimerRef.current = window.setTimeout(() => {
      void pollActiveRunsOnce().catch((err) => {
        onError(err instanceof Error ? err.message : "获取自动任务进度失败");
      });
    }, 300);

    return () => {
      clearRunPollTimer();
    };
  }, [activeRunsByJobId, clearRunPollTimer, onError, pollActiveRunsOnce]);

  useEffect(() => () => clearRunPollTimer(), [clearRunPollTimer]);

  return {
    activeRunsByJobId,
    mergeActiveRunsFromJobs,
    pollActiveRunsOnce,
    markJobRunStarted,
  };
}
