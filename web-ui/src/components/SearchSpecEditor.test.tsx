import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchSpecEditor } from "./SearchSpecEditor";
import { DEFAULT_SEARCH_SPEC, cloneSearchSpec } from "../collector";

describe("SearchSpecEditor", () => {
  it("renders grouped workbench sections for keywords, scope, metrics, behavior, and query summary", () => {
    render(<SearchSpecEditor value={cloneSearchSpec(DEFAULT_SEARCH_SPEC)} onChange={vi.fn()} />);

    expect(screen.getByTestId("search-spec-editor")).toHaveClass("collector-editor-shell");
    expect(screen.getByTestId("search-spec-section-keywords")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-scope")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-metrics")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-section-behavior")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("search-spec-query-summary")).toHaveClass("workbench-summary-panel");
    expect(screen.getByText("QUERY SETUP")).toBeInTheDocument();
    expect(screen.getByText("PREVIEW")).toBeInTheDocument();
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
