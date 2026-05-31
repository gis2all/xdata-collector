import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JobRecord } from "../../api";
import { useJobsSelection } from "./useJobsSelection";

function makeJob(id: number, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id,
    name: `job-${id}`,
    keywords_json: [],
    interval_minutes: 60,
    days: 7,
    thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
    levels_json: [],
    search_spec_json: null,
    rule_set_id: 1,
    rule_set_summary: null,
    pack_name: null,
    pack_path: null,
    group_name: null,
    tags: [],
    enabled: 1,
    next_run_at: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    deleted_at: null,
    last_run_id: null,
    last_run_status: null,
    last_run_started_at: null,
    last_run_ended_at: null,
    last_run_error_text: null,
    last_run_stats: {},
    ...overrides,
  } as JobRecord;
}

describe("useJobsSelection", () => {
  it("tracks page selection, all-matching selection, and mixed deleted warnings", () => {
    const jobs = [
      makeJob(1),
      makeJob(2, { deleted_at: "2026-01-02T00:00:00+00:00", enabled: 0 }),
    ];

    const { result } = renderHook(() =>
      useJobsSelection({
        jobs,
        total: 12,
        status: "all",
      }),
    );

    act(() => {
      result.current.toggleRowSelection(jobs[0], true);
    });

    expect(result.current.selectedIds).toEqual([1]);
    expect(result.current.selectionWarning).toBe("");
    expect(result.current.selectedCount).toBe(1);

    act(() => {
      result.current.toggleRowSelection(jobs[1], true);
    });

    expect(result.current.selectedIds).toEqual([1, 2]);
    expect(result.current.selectionWarning).toContain("同时包含已删除和未删除任务");
    expect(result.current.isBatchActionEnabled("delete")).toBe(false);
    expect(result.current.isBatchActionEnabled("restore")).toBe(false);

    act(() => {
      result.current.clearSelection();
    });

    act(() => {
      result.current.togglePageSelection();
    });

    expect(result.current.selectedIds).toEqual([1, 2]);
    expect(result.current.allPageSelected).toBe(true);
    expect(result.current.showSelectAllMatching).toBe(true);

    act(() => {
      result.current.selectAllMatchingJobs();
    });

    expect(result.current.allMatchingSelected).toBe(true);
    expect(result.current.selectedCount).toBe(12);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.allMatchingSelected).toBe(false);
    expect(result.current.selectionWarning).toBe("");
  });
});
