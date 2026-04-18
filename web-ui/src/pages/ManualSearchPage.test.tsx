import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualSearchPage } from "./ManualSearchPage";

vi.mock("../api", () => ({
  listTaskPacks: vi.fn(),
  getTaskPack: vi.fn(),
  createTaskPack: vi.fn(),
  updateTaskPack: vi.fn(),
  runManual: vi.fn(),
}));

vi.mock("../components/RuleSetEditor", () => ({
  RuleSetEditor: () => <div data-testid="rule-set-editor" />,
}));

import { createTaskPack, getTaskPack, listTaskPacks, runManual } from "../api";

const listTaskPacksMock = vi.mocked(listTaskPacks);
const getTaskPackMock = vi.mocked(getTaskPack);
const createTaskPackMock = vi.mocked(createTaskPack);
const runManualMock = vi.mocked(runManual);

const taskPackSummary = {
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  name: "Alpha Watch",
  description: "watch alpha",
  updated_at: "2026-04-14T00:00:00+00:00",
};

const taskPackFile = {
  version: 1,
  kind: "task_pack",
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  meta: {
    name: "Alpha Watch",
    description: "watch alpha",
    updated_at: "2026-04-14T00:00:00+00:00",
  },
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

describe("ManualSearchPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listTaskPacksMock.mockResolvedValue({ items: [taskPackSummary] } as any);
    getTaskPackMock.mockResolvedValue(taskPackFile as any);
    createTaskPackMock.mockResolvedValue(taskPackFile as any);
  });

  it("renders multiple final queries after a manual run", async () => {
    runManualMock.mockResolvedValue({
      run_id: 1,
      status: "success",
      search_spec: taskPackFile.search_spec,
      final_query: "alpha lang:zh || alpha lang:en",
      final_queries: ["alpha lang:zh -is:retweet", "alpha lang:en -is:retweet"],
      rule_set_summary: { id: 1, name: "Default Rule Set", description: "", version: 1, is_builtin: true },
      raw_total: 1,
      matched_total: 0,
      raw_items: [],
      matched_items: [],
      stats: {},
      errors: [],
    } as any);

    render(<ManualSearchPage />);

    await waitFor(() => {
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("manual-run-button"));

    await waitFor(() => {
      expect(screen.getByText("alpha lang:zh -is:retweet")).toBeInTheDocument();
    });

    expect(runManualMock).toHaveBeenCalled();
    expect(screen.getByText("alpha lang:en -is:retweet")).toBeInTheDocument();
  });

  it("imports a task pack and exports the current editor state", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("manual-alpha");

    render(<ManualSearchPage />);

    const select = await screen.findByLabelText("manual-pack-select");
    fireEvent.change(select, { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("import-manual-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("alpha")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("export-manual-pack"));

    await waitFor(() => {
      expect(createTaskPackMock).toHaveBeenCalled();
    });

    promptSpy.mockRestore();
  });
});
