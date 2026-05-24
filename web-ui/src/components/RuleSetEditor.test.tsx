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
    expect(screen.getByTestId("rule-set-summary")).toHaveClass("flat-section");
    expect(screen.getByTestId("rule-set-summary")).not.toHaveClass("workbench-summary-panel");
    expect(screen.getByTestId("rule-set-levels")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("rule-set-levels")).toHaveClass("flat-section");
    expect(screen.getByTestId("rule-set-rules")).toHaveClass("collector-editor-section");
    expect(screen.getByTestId("rule-set-rules")).toHaveClass("flat-section");
    expect(screen.getByText("规则可视化编辑器")).toBeInTheDocument();
    expect(screen.getByText("等级映射")).toBeInTheDocument();
    expect(screen.getByText("规则块")).toBeInTheDocument();
    expect(screen.queryByText("RULES")).not.toBeInTheDocument();
    expect(screen.queryByText("LEVELS")).not.toBeInTheDocument();
    expect(screen.queryByText("RULE BLOCKS")).not.toBeInTheDocument();
    expect(screen.getByLabelText("add-scoring-rule")).toHaveClass("workbench-secondary-action");
    expect(screen.getByLabelText("add-scoring-rule")).not.toHaveClass("ghost");
    expect(screen.getByText("0 / 0 条规则启用")).toBeInTheDocument();
    expect(screen.queryByLabelText("delete-rule-exclude-trade-gated")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("add-condition-exclude-trade-gated")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("delete-condition-exclude-trade-gated-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rule-card-exclude-trade-gated")).not.toBeInTheDocument();
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
  });
});
