import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SearchSpecEditor } from "./SearchSpecEditor";
import type { SearchSpec } from "../api";
import { DEFAULT_SEARCH_SPEC, cloneSearchSpec } from "../collector";

const PLACEHOLDERS = {
  allKeywords: "逗号或换行分隔，如：空投, quest, points",
  exactPhrases: "逗号或换行分隔，如：social mining, daily check-in",
  anyKeywords: "逗号或换行分隔，如：testnet, faucet, rewards",
  excludeKeywords: "逗号或换行分隔，如：trade, swap, 合约",
  authorsInclude: "逗号或换行分隔，如：galxe, layer3xyz, kaitoai",
  authorsExclude: "逗号或换行分隔，如：binance, bybit_official, bitgetglobal",
} as const;

function SearchSpecEditorHarness(props: {
  initialValue?: Partial<SearchSpec>;
  onValueChange?: (next: SearchSpec) => void;
}) {
  const [value, setValue] = useState(() => cloneSearchSpec(props.initialValue ?? DEFAULT_SEARCH_SPEC));

  return (
    <SearchSpecEditor
      value={value}
      onChange={(next) => {
        props.onValueChange?.(next);
        setValue(next);
      }}
    />
  );
}

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

  it("defaults days to 1, renders time slice selector, and writes back time_slice_minutes", () => {
    const onChange = vi.fn();
    render(<SearchSpecEditor value={cloneSearchSpec(DEFAULT_SEARCH_SPEC)} onChange={onChange} />);

    const daysInput = screen.getByRole("spinbutton", { name: "\u53d1\u5e03\u65f6\u95f4\u8303\u56f4-max" });
    expect(daysInput).toHaveValue(1);

    const timeSliceSelect = screen.getByRole("combobox", { name: "\u65f6\u95f4\u5207\u7247" });
    expect(timeSliceSelect).toHaveValue("60");
    expect(screen.getByRole("option", { name: "15\u5206\u949f" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "30\u5206\u949f" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1h" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2h" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "4h" })).toBeInTheDocument();

    fireEvent.change(timeSliceSelect, { target: { value: "15" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ time_slice_minutes: 15 }));
  });

  it("disables time slice when days_filter is unbounded or raw_query already has time operators", () => {
    const { rerender } = render(
      <SearchSpecEditor
        value={cloneSearchSpec({ ...DEFAULT_SEARCH_SPEC, days_filter: { mode: "any", min: null, max: null } })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "\u65f6\u95f4\u5207\u7247" })).toBeDisabled();
    expect(screen.getByText("\u5f53\u524d\u53d1\u5e03\u65f6\u95f4\u4e3a\u4e0d\u9650/\u81f3\u5c11\uff0c\u4e0d\u4f1a\u81ea\u52a8\u5207\u7247\u3002")).toBeInTheDocument();

    rerender(
      <SearchSpecEditor
        value={cloneSearchSpec({ ...DEFAULT_SEARCH_SPEC, raw_query: "since_time:1 until_time:2" })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "\u65f6\u95f4\u5207\u7247" })).toBeDisabled();
    expect(screen.getByText("raw_query \u5df2\u5305\u542b since/until \u65f6\u95f4\u8bed\u6cd5\uff0c\u4e0d\u4f1a\u518d\u53e0\u52a0\u81ea\u52a8\u5207\u7247\u3002")).toBeInTheDocument();
  });

  it("defaults max results to 100, clamps input, and explains the twitter-cli per-query ceiling", () => {
    const onValueChange = vi.fn();
    render(<SearchSpecEditorHarness onValueChange={onValueChange} />);

    const maxResultsInput = screen.getByRole("spinbutton", { name: "\u6700\u5927\u7ed3\u679c\u6570" });
    expect(maxResultsInput).toHaveValue(100);
    expect(maxResultsInput).toHaveAttribute("min", "1");
    expect(maxResultsInput).toHaveAttribute("max", "100");
    expect(screen.getByText("\u4f20\u7ed9\u6bcf\u4e2a\u65f6\u95f4\u5207\u7247 query \u7684\u4e0a\u9650\u3002twitter-cli search \u5b9e\u6d4b\u5355 query \u6700\u591a\u8fd4\u56de\u7ea6 40 \u6761\uff1b\u4e2d\u6587 + \u82f1\u6587\u4f1a\u5408\u5e76\u4e3a\u4e00\u6761\u8bed\u8a00 OR \u67e5\u8be2\u3002")).toBeInTheDocument();

    fireEvent.change(maxResultsInput, { target: { value: "999" } });

    expect(onValueChange).toHaveBeenLastCalledWith(expect.objectContaining({ max_results: 100 }));
    expect(maxResultsInput).toHaveValue(100);
  });

  it("keeps in-progress spaces and commas while editing while still emitting parsed arrays", () => {
    const onValueChange = vi.fn();
    render(<SearchSpecEditorHarness onValueChange={onValueChange} />);

    const phrasesField = screen.getByPlaceholderText(/social mining, daily check-in/i);
    fireEvent.change(phrasesField, { target: { value: "social " } });
    expect(phrasesField).toHaveValue("social ");
    expect(onValueChange).toHaveBeenLastCalledWith(expect.objectContaining({ exact_phrases: ["social"] }));

    fireEvent.change(phrasesField, { target: { value: "social mining, " } });
    expect(phrasesField).toHaveValue("social mining, ");
    expect(onValueChange).toHaveBeenLastCalledWith(expect.objectContaining({ exact_phrases: ["social mining"] }));

    const authorsField = screen.getByPlaceholderText(/galxe, layer3xyz, kaitoai/i);
    fireEvent.change(authorsField, { target: { value: "galxe, layer3xyz" } });
    expect(authorsField).toHaveValue("galxe, layer3xyz");
    expect(onValueChange).toHaveBeenLastCalledWith(expect.objectContaining({ authors_include: ["galxe", "layer3xyz"] }));
  });

  it("normalizes textarea list inputs to one item per line on blur", () => {
    render(<SearchSpecEditorHarness />);

    const phrasesField = screen.getByPlaceholderText(/social mining, daily check-in/i);
    fireEvent.change(phrasesField, { target: { value: "social mining, daily check-in" } });

    expect(phrasesField).toHaveValue("social mining, daily check-in");

    fireEvent.blur(phrasesField);

    expect(phrasesField).toHaveValue("social mining\ndaily check-in");
  });

  it("replaces stale draft text when external search spec data is loaded", () => {
    function ExternalUpdateHarness() {
      const [value, setValue] = useState(() => cloneSearchSpec(DEFAULT_SEARCH_SPEC));

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setValue(
                cloneSearchSpec({
                  ...DEFAULT_SEARCH_SPEC,
                  exact_phrases: ["beta phrase", "gamma phrase"],
                }),
              )
            }
          >
            load-pack
          </button>
          <SearchSpecEditor value={value} onChange={setValue} />
        </>
      );
    }

    render(<ExternalUpdateHarness />);

    const phrasesField = screen.getByPlaceholderText(/social mining, daily check-in/i);
    fireEvent.change(phrasesField, { target: { value: "social mining, " } });
    expect(phrasesField).toHaveValue("social mining, ");

    fireEvent.click(screen.getByRole("button", { name: "load-pack" }));

    expect(phrasesField).toHaveValue("beta phrase\ngamma phrase");
  });
});
