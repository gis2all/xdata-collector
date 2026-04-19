import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RuleSetEditor } from "./RuleSetEditor";
import { DEFAULT_RULE_SET_DEFINITION, cloneRuleDefinition } from "../collector";

describe("RuleSetEditor", () => {
  it("renders summary, level mapping, and rule workspace sections with unified action classes", () => {
    render(
      <RuleSetEditor
        ruleSet={null}
        draft={cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION)}
        onDraftChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("rule-set-editor")).toHaveClass("collector-editor-shell");
    expect(screen.getByTestId("rule-set-summary")).toHaveClass("workbench-summary-panel");
    expect(screen.getByTestId("rule-set-levels")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("rule-set-rules")).toHaveClass("collector-editor-section");
    expect(screen.getByLabelText("add-scoring-rule")).toHaveClass("workbench-secondary-action");
    expect(screen.getByLabelText("delete-rule-exclude-trade-gated")).toHaveClass("workbench-danger-action");
    expect(screen.getByLabelText("add-condition-exclude-trade-gated")).toHaveClass("workbench-secondary-action");
    expect(screen.getByLabelText("delete-condition-exclude-trade-gated-0")).toHaveClass("workbench-danger-action");
    expect(screen.getByTestId("rule-card-exclude-trade-gated")).toHaveClass("collector-rule-shell");
  });

  it("writes back rule and condition mutations through the shared editor shell", () => {
    const onDraftChange = vi.fn();
    render(
      <RuleSetEditor
        ruleSet={null}
        draft={cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION)}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("add-scoring-rule"));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ name: "\u65b0\u89c4\u5219" }),
        ]),
      }),
    );

    fireEvent.click(screen.getByLabelText("add-condition-exclude-trade-gated"));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({
            id: "exclude-trade-gated",
            conditions: expect.arrayContaining([
              expect.objectContaining({ type: "text_contains_any" }),
            ]),
          }),
        ]),
      }),
    );
  });
});
