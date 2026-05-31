import { useEffect, useMemo, useState } from "react";

import type { JobBatchAction, JobRecord } from "../../api";
import { jobSelectionState, type JobStatusFilter } from "./jobsTableConfig";

type UseJobsSelectionParams = {
  jobs: JobRecord[];
  total: number;
  status: JobStatusFilter;
};

export function useJobsSelection({ jobs, total, status }: UseJobsSelectionParams) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState("");
  const [selectedDeletedById, setSelectedDeletedById] = useState<Record<number, boolean>>({});

  const selectedOnPage = allMatchingSelected ? jobs.length : jobs.filter((job) => selectedIds.includes(job.id)).length;
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const allPageSelected = jobs.length > 0 && selectedOnPage === jobs.length;
  const selectionState = useMemo(
    () => jobSelectionState(status, allMatchingSelected, selectedIds, selectedDeletedById),
    [allMatchingSelected, selectedDeletedById, selectedIds, status],
  );
  const showSelectAllMatching = !allMatchingSelected && jobs.length > 0 && selectedOnPage === jobs.length && total > jobs.length;

  useEffect(() => {
    if (selectionState === "mixed") {
      setSelectionWarning("当前选择同时包含已删除和未删除任务，请先按状态筛选或重新勾选。");
      return;
    }
    setSelectionWarning("");
  }, [selectionState]);

  function clearSelection() {
    setSelectedIds([]);
    setAllMatchingSelected(false);
    setSelectionWarning("");
    setSelectedDeletedById({});
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

  function syncSelectedDeletedFromJobs(items: JobRecord[]) {
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
  }

  function isBatchActionEnabled(action: JobBatchAction) {
    if (!selectedCount || selectionState === "none" || selectionState === "mixed") return false;
    const requiresDeleted = action === "restore" || action === "purge";
    return requiresDeleted ? selectionState === "deleted" : selectionState === "active";
  }

  return {
    selectedIds,
    setSelectedIds,
    allMatchingSelected,
    setAllMatchingSelected,
    selectionWarning,
    selectedDeletedById,
    selectedOnPage,
    selectedCount,
    allPageSelected,
    selectionState,
    showSelectAllMatching,
    clearSelection,
    toggleRowSelection,
    togglePageSelection,
    selectAllMatchingJobs,
    syncSelectedDeletedFromJobs,
    isBatchActionEnabled,
  };
}
