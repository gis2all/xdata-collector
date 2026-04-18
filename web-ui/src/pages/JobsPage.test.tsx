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
  listTaskPacks: vi.fn(),
  getTaskPack: vi.fn(),
  createTaskPack: vi.fn(),
  updateTaskPack: vi.fn(),
}));

import { createJob, createTaskPack, getTaskPack, listJobs, listTaskPacks } from "../api";

const listJobsMock = vi.mocked(listJobs);
const listTaskPacksMock = vi.mocked(listTaskPacks);
const getTaskPackMock = vi.mocked(getTaskPack);
const createJobMock = vi.mocked(createJob);
const createTaskPackMock = vi.mocked(createTaskPack);

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

describe("JobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listJobsMock.mockResolvedValue({ page: 1, page_size: 10, total: 0, items: [] } as any);
    listTaskPacksMock.mockResolvedValue({ items: [{ pack_name: "alpha-watch", pack_path: "config/packs/alpha-watch.json", name: "Alpha Watch", description: "watch alpha", updated_at: "2026-04-14T00:00:00+00:00" }] } as any);
    getTaskPackMock.mockResolvedValue(packFile as any);
    createTaskPackMock.mockResolvedValue(packFile as any);
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
});
