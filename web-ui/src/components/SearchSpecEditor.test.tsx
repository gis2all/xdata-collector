import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchSpecEditor } from "./SearchSpecEditor";
import { DEFAULT_SEARCH_SPEC, cloneSearchSpec } from "../collector";

describe("SearchSpecEditor", () => {
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
