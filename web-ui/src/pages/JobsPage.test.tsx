import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobsPage } from "./JobsPage";

vi.mock("../api", () => ({
  listJobs: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  restoreJob: vi.fn(),
  purgeJob: vi.fn(),
  runJobNow: vi.fn(),
  toggleJob: vi.fn(),
  batchJobs: vi.fn(),
  listTaskPacks: vi.fn(),
  getTaskPack: vi.fn(),
  createTaskPack: vi.fn(),
  updateTaskPack: vi.fn(),
}));

import { batchJobs, createJob, createTaskPack, getTaskPack, listJobs, listTaskPacks } from "../api";

const listJobsMock = vi.mocked(listJobs);
const listTaskPacksMock = vi.mocked(listTaskPacks);
const getTaskPackMock = vi.mocked(getTaskPack);
const createJobMock = vi.mocked(createJob);
const createTaskPackMock = vi.mocked(createTaskPack);
const batchJobsMock = vi.mocked(batchJobs);

const packFile = {
  version: 1,
  kind: "task_pack",
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  meta: { name: "Alpha Watch", description: "watch alpha", updated_at: "2026-04-14T00:00:00+00:00" },
  search_spec: {
    all_keywords: ["alpha"],
    exact_phrases: [],
    any_keywords: [],
    exclude_keywords: [],
    authors_include: [],
    authors_exclude: [],
    language_mode: "zh_en",
    days_filter: { mode: "lte", max: 20, min: null },
    metric_filters: {
      views: { mode: "any", min: null, max: null },
      likes: { mode: "any", min: null, max: null },
      replies: { mode: "any", min: null, max: null },
      retweets: { mode: "any", min: null, max: null },
    },
    metric_filters_explicit: true,
    max_results: 40,
    include_retweets: false,
    include_replies: true,
    require_media: false,
    require_links: false,
    raw_query: "",
  },
  rule_set: {
    id: 1,
    name: "Default Rule Set",
    description: "builtin",
    version: 1,
    definition: { levels: [], rules: [] },
  },
};

function makeJob(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `job-${id}`,
    keywords_json: ["alpha"],
    interval_minutes: 60,
    days: 20,
    thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
    levels_json: [],
    search_spec_json: packFile.search_spec,
    rule_set_id: 1,
    rule_set_summary: { id: 1, name: "Default Rule Set", description: "builtin", version: 1, is_builtin: true },
    pack_name: `job-${id}`,
    pack_path: `config/packs/job-${id}.json`,
    enabled: 1,
    next_run_at: "2026-04-14T00:00:00+00:00",
    created_at: "2026-04-14T00:00:00+00:00",
    updated_at: "2026-04-14T00:00:00+00:00",
    deleted_at: null,
    last_run_id: null,
    last_run_status: null,
    last_run_started_at: null,
    last_run_ended_at: null,
    last_run_error_text: null,
    last_run_stats: {},
    ...overrides,
  } as any;
}

describe("JobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    listJobsMock.mockResolvedValue({ page: 1, page_size: 10, total: 0, items: [] } as any);
    listTaskPacksMock.mockResolvedValue({ items: [{ pack_name: "alpha-watch", pack_path: "config/packs/alpha-watch.json", name: "Alpha Watch", description: "watch alpha", updated_at: "2026-04-14T00:00:00+00:00" }] } as any);
    getTaskPackMock.mockResolvedValue(packFile as any);
    createTaskPackMock.mockResolvedValue(packFile as any);
    batchJobsMock.mockResolvedValue({
      action: "delete",
      mode: "ids",
      total_targeted: 0,
      succeeded: 0,
      failed: 0,
      succeeded_ids: [],
      failed_items: [],
    } as any);
    createJobMock.mockResolvedValue({
      id: 10,
      name: "scheduled-alpha",
      keywords_json: ["alpha"],
      interval_minutes: 120,
      days: 20,
      thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
      levels_json: [],
      search_spec_json: packFile.search_spec,
      rule_set_id: 1,
      rule_set_summary: { id: 1, name: "Default Rule Set", description: "builtin", version: 1, is_builtin: true },
      pack_name: "job-010-scheduled-alpha",
      pack_path: "config/packs/job-010-scheduled-alpha.json",
      enabled: 1,
      next_run_at: null,
      created_at: "2026-04-14T00:00:00+00:00",
      updated_at: "2026-04-14T00:00:00+00:00",
    } as any);
  });

  it("imports a task pack into the current form but preserves scheduling fields", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-alpha" } });
    fireEvent.change(screen.getByLabelText("job-interval"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("job-pack-select"), { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("import-job-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    fireEvent.click(screen.getByLabelText("submit-job"));

    await waitFor(() => {
      expect(createJobMock).toHaveBeenCalled();
    });

    const payload = createJobMock.mock.calls[0]?.[0] as any;
    expect(payload.name).toBe("scheduled-alpha");
    expect(payload.interval_minutes).toBe(120);
    expect(payload.search_spec.all_keywords).toEqual(["alpha"]);
    expect(payload.rule_set.name).toBe("Default Rule Set");
  });

  it("supports two-step all matching selection and batch delete", async () => {
    const firstPageItems = Array.from({ length: 10 }, (_, index) => makeJob(index + 1));
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 12, items: firstPageItems } as any)
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any);
    batchJobsMock.mockResolvedValue({
      action: "delete",
      mode: "all_matching",
      total_targeted: 12,
      succeeded: 12,
      failed: 0,
      succeeded_ids: firstPageItems.map((item) => item.id),
      failed_items: [],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("job-1").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("jobs-select-page"));
    expect(screen.getByText("selected=10")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("select-all-matching-jobs"));
    expect(screen.getByText("selected=12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "delete", mode: "all_matching", status: "active" }),
      );
    });

    expect(await screen.findByText("已成功 12 条，失败 0 条")).toBeInTheDocument();
  });

  it("disables batch actions when deleted and non-deleted jobs are mixed in all view", async () => {
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 2,
        items: [
          makeJob(1, { name: "active-job", deleted_at: null }),
          makeJob(2, { name: "deleted-job", enabled: 0, deleted_at: "2026-04-14T00:00:00+00:00" }),
        ],
      } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "all" } });

    await waitFor(() => {
      expect(screen.getAllByText("active-job").length).toBeGreaterThan(0);
      expect(screen.getAllByText("deleted-job").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("select-job-1"));
    fireEvent.click(screen.getByLabelText("select-job-2"));

    expect(screen.getByText("当前选择同时包含已删除和未删除任务，请先按状态筛选或重新勾选。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量删除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "批量恢复" })).toBeDisabled();
  });

  it("switches to all view after a successful batch restore from deleted status", async () => {
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 1,
        items: [makeJob(5, { name: "deleted-job", enabled: 0, deleted_at: "2026-04-14T00:00:00+00:00" })],
      } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 1,
        items: [makeJob(5, { name: "deleted-job", enabled: 0, deleted_at: null })],
      } as any);
    batchJobsMock.mockResolvedValue({
      action: "restore",
      mode: "ids",
      total_targeted: 1,
      succeeded: 1,
      failed: 0,
      succeeded_ids: [5],
      failed_items: [],
    } as any);

    render(<JobsPage />);

    fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "deleted" } });

    await waitFor(() => {
      expect(screen.getAllByText("deleted-job").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("select-job-5"));
    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith({ action: "restore", ids: [5] });
      expect(listJobsMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "all", page: 1 }));
    });
  });

  it("shows summary and first failed jobs for batch run now", async () => {
    const jobs = [makeJob(1, { name: "job-one" }), makeJob(2, { name: "job-two" }), makeJob(3, { name: "job-three" })];
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 3, items: jobs } as any)
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 3, items: jobs } as any);
    batchJobsMock.mockResolvedValue({
      action: "run_now",
      mode: "ids",
      total_targeted: 3,
      succeeded: 1,
      failed: 2,
      succeeded_ids: [1],
      failed_items: [
        { id: 2, name: "job-two", error: "boom-two" },
        { id: 3, name: "job-three", error: "boom-three" },
      ],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("job-one").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("jobs-select-page"));
    fireEvent.click(screen.getByRole("button", { name: "批量立即运行" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith({ action: "run_now", ids: [1, 2, 3] });
    });

    expect(await screen.findByText(/已成功 1 条，失败 2 条/)).toBeInTheDocument();
    expect(screen.getByText(/job-two: boom-two/)).toBeInTheDocument();
    expect(screen.getByText(/job-three: boom-three/)).toBeInTheDocument();
  });
});
