import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";

import { RuleSetEditor } from "./RuleSetEditor";
import type { RuleSetDefinition } from "../api";
import { DEFAULT_RULE_SET_DEFINITION, cloneRuleDefinition } from "../collector";

const RULE_DRAFT_WITH_TEXT_CONDITION: RuleSetDefinition = {
  levels: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION).levels,
  rules: [
    {
      id: "rule-alpha",
      name: "Alpha Rule",
      enabled: true,
      operator: "AND",
      conditions: [{ type: "text_contains_any", values: [] }],
      effect: {
        action: "score",
        score: 20,
        level: "A",
      },
    },
  ],
};

const RULE_DRAFT_WITH_SINGLE_VALUE: RuleSetDefinition = {
  levels: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION).levels,
  rules: [
    {
      id: "rule-language",
      name: "Language Rule",
      enabled: true,
      operator: "AND",
      conditions: [{ type: "language_is", value: "" }],
      effect: {
        action: "score",
        score: 20,
        level: "A",
      },
    },
  ],
};

function RuleSetEditorHarness(props: {
  initialDraft?: RuleSetDefinition;
  onDraftValueChange?: (next: RuleSetDefinition) => void;
}) {
  const [draft, setDraft] = useState(() => cloneRuleDefinition(props.initialDraft ?? DEFAULT_RULE_SET_DEFINITION));

  return (
    <RuleSetEditor
      ruleSet={null}
      draft={draft}
      onDraftChange={(next) => {
        props.onDraftValueChange?.(next);
        setDraft(next);
      }}
    />
  );
}

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

  it("keeps in-progress spaces and commas for list conditions while emitting parsed values", () => {
    const onDraftValueChange = vi.fn();
    render(<RuleSetEditorHarness initialDraft={RULE_DRAFT_WITH_TEXT_CONDITION} onDraftValueChange={onDraftValueChange} />);

    const conditionField = within(screen.getByTestId("rule-condition-rule-alpha-0")).getByRole("textbox");
    fireEvent.change(conditionField, { target: { value: "social mining, " } });

    expect(conditionField).toHaveValue("social mining, ");
    expect(onDraftValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            conditions: [expect.objectContaining({ values: ["social mining"] })],
          }),
        ],
      }),
    );
  });

  it("keeps comma-delimited edits in progress and normalizes list conditions on blur", () => {
    render(<RuleSetEditorHarness initialDraft={RULE_DRAFT_WITH_TEXT_CONDITION} />);

    const conditionField = within(screen.getByTestId("rule-condition-rule-alpha-0")).getByRole("textbox");
    fireEvent.change(conditionField, { target: { value: "social mining, daily check-in" } });

    expect(conditionField).toHaveValue("social mining, daily check-in");

    fireEvent.blur(conditionField);

    expect(conditionField).toHaveValue("social mining, daily check-in");
  });

  it("keeps single-value conditions unchanged", () => {
    const onDraftValueChange = vi.fn();
    render(<RuleSetEditorHarness initialDraft={RULE_DRAFT_WITH_SINGLE_VALUE} onDraftValueChange={onDraftValueChange} />);

    const conditionField = within(screen.getByTestId("rule-condition-rule-language-0")).getByRole("textbox");
    fireEvent.change(conditionField, { target: { value: "en" } });

    expect(conditionField).toHaveValue("en");
    expect(onDraftValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            conditions: [expect.objectContaining({ value: "en" })],
          }),
        ],
      }),
    );
  });
});
