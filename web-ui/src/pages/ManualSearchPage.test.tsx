import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualSearchPage } from "./ManualSearchPage";

vi.mock("../api", () => ({
  listRuleSets: vi.fn(),
  runManual: vi.fn(),
  createRuleSet: vi.fn(),
  updateRuleSet: vi.fn(),
  deleteRuleSet: vi.fn(),
  cloneRuleSet: vi.fn(),
}));

vi.mock("../components/RuleSetEditor", () => ({
  RuleSetEditor: () => <div data-testid="rule-set-editor" />,
}));

import { listRuleSets, runManual } from "../api";

const listRuleSetsMock = vi.mocked(listRuleSets);
const runManualMock = vi.mocked(runManual);

describe("ManualSearchPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    listRuleSetsMock.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "\u9ed8\u8ba4\u89c4\u5219\u96c6",
          description: "",
          is_enabled: true,
          is_builtin: true,
          version: 1,
          definition_json: { levels: [], rules: [] },
        },
      ],
    });
  });

  it("renders multiple final queries after a zh_en manual run", async () => {
    runManualMock.mockResolvedValue({
      run_id: 1,
      status: "success",
      search_spec: {
        all_keywords: ["BTC"],
        exact_phrases: [],
        any_keywords: [],
        exclude_keywords: [],
        authors_include: [],
        authors_exclude: [],
        language_mode: "zh_en",
        days_filter: { mode: "lte", max: 20, min: null },
        metric_filters: {
          views: { mode: "gte", min: 200, max: null },
          likes: { mode: "any", min: null, max: null },
          replies: { mode: "gte", min: 1, max: null },
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
      final_query: "BTC lang:zh || BTC lang:en",
      final_queries: ["BTC lang:zh -is:retweet", "BTC lang:en -is:retweet"],
      rule_set_summary: { id: 1, name: "\u9ed8\u8ba4\u89c4\u5219\u96c6", description: "", version: 1, is_builtin: true },
      raw_total: 1,
      matched_total: 0,
      raw_items: [],
      matched_items: [],
      stats: {},
      errors: [],
    });

    render(<ManualSearchPage />);

    await waitFor(() => {
      expect(screen.getByTestId("manual-search-page")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("manual-run-button"));

    await waitFor(() => {
      expect(screen.getByText("BTC lang:zh -is:retweet")).toBeInTheDocument();
    });

    expect(screen.getByText("BTC lang:en -is:retweet")).toBeInTheDocument();
    expect(screen.getByText("\u5b9e\u9645\u67e5\u8be2")).toBeInTheDocument();
  });
});
