import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchSpecEditor } from "./SearchSpecEditor";
import { DEFAULT_SEARCH_SPEC, cloneSearchSpec } from "../collector";

const PLACEHOLDERS = {
  allKeywords: "逗号或换行分隔，如：空投, quest, points",
  exactPhrases: "逗号或换行分隔，如：social mining, daily check-in",
  anyKeywords: "逗号或换行分隔，如：testnet, faucet, rewards",
  excludeKeywords: "逗号或换行分隔，如：trade, swap, 合约",
  authorsInclude: "逗号或换行分隔，如：galxe, layer3xyz, kaitoai",
  authorsExclude: "逗号或换行分隔，如：binance, bybit_official, bitgetglobal",
} as const;

describe("SearchSpecEditor", () => {
  it("renders grouped workbench sections for keywords, scope, metrics, behavior, and query summary", () => {
    render(<SearchSpecEditor value={cloneSearchSpec(DEFAULT_SEARCH_SPEC)} onChange={vi.fn()} />);

    expect(screen.getByTestId("search-spec-editor")).toHaveClass("collector-editor-shell");
    expect(screen.getByTestId("search-spec-section-keywords")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-scope")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-metrics")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-behavior")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-keywords")).toHaveClass("flat-section");
    expect(screen.getByTestId("search-spec-section-scope")).toHaveClass("flat-section");
    expect(screen.getByTestId("search-spec-section-metrics")).toHaveClass("flat-section");
    expect(screen.getByTestId("search-spec-section-behavior")).toHaveClass("flat-section");
    expect(screen.getByTestId("search-spec-query-summary")).toHaveClass("flat-section");
    expect(screen.getByTestId("search-spec-query-summary")).not.toHaveClass("workbench-summary-panel");
    expect(screen.getByText("关键词与作者范围")).toBeInTheDocument();
    expect(screen.getByText("范围与产出控制")).toBeInTheDocument();
    expect(screen.getByText("互动指标阈值")).toBeInTheDocument();
    expect(screen.getByText("补充约束")).toBeInTheDocument();
    expect(screen.getByText("查询摘要")).toBeInTheDocument();
    expect(screen.queryByText("QUERY SETUP")).not.toBeInTheDocument();
    expect(screen.queryByText("SCOPE")).not.toBeInTheDocument();
    expect(screen.queryByText("METRICS")).not.toBeInTheDocument();
    expect(screen.queryByText("BEHAVIOR")).not.toBeInTheDocument();
    expect(screen.queryByText("PREVIEW")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "包含关键词" })).toHaveAttribute("placeholder", PLACEHOLDERS.allKeywords);
    expect(screen.getByRole("textbox", { name: "精确短语" })).toHaveAttribute("placeholder", PLACEHOLDERS.exactPhrases);
    expect(screen.getByRole("textbox", { name: "任意词 (OR)" })).toHaveAttribute("placeholder", PLACEHOLDERS.anyKeywords);
    expect(screen.getByRole("textbox", { name: "排除词" })).toHaveAttribute("placeholder", PLACEHOLDERS.excludeKeywords);
    expect(screen.getByRole("textbox", { name: "作者白名单" })).toHaveAttribute("placeholder", PLACEHOLDERS.authorsInclude);
    expect(screen.getByRole("textbox", { name: "作者黑名单" })).toHaveAttribute("placeholder", PLACEHOLDERS.authorsExclude);
    expect(screen.queryByDisplayValue("BTC")).not.toBeInTheDocument();
  });

  it("defaults language to zh_en and writes back range filters", () => {
    const onChange = vi.fn();
    render(<SearchSpecEditor value={cloneSearchSpec(DEFAULT_SEARCH_SPEC)} onChange={onChange} />);

    const languageSelect = screen.getByRole("combobox", { name: "\u8bed\u8a00" });
    expect(languageSelect).toHaveValue("zh_en");

    fireEvent.change(languageSelect, { target: { value: "zh" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ language_mode: "zh" }));

    const daysMode = screen.getByRole("combobox", { name: "\u53d1\u5e03\u65f6\u95f4\u8303\u56f4-mode" });
    fireEvent.change(daysMode, { target: { value: "between" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        days_filter: expect.objectContaining({ mode: "between" }),
      }),
    );

    const viewsMode = screen.getByRole("combobox", { name: "\u6d4f\u89c8\u91cf-mode" });
    fireEvent.change(viewsMode, { target: { value: "lte" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metric_filters_explicit: true,
        metric_filters: expect.objectContaining({
          views: expect.objectContaining({ mode: "lte" }),
        }),
      }),
    );
  });
});
