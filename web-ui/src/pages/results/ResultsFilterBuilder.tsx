import type { ReactNode } from "react";

import type {
  ItemTable,
  ResultsFilterConditionNode,
  ResultsFilterConditionOperator,
  ResultsFilterField,
  ResultsFilterGroupNode,
  ResultsFilterRelation,
} from "../../api";
import {
  RESULTS_FILTER_FIELD_OPTIONS,
  createFilterCondition,
  createResultsFilterTreeTextValue,
  filterOperatorNeedsArrayValue,
  filterOperatorNeedsRange,
  filterOperatorNeedsSingleValue,
  getDefaultFilterOperator,
  getFilterFieldOption,
  getFilterOperatorOptions,
  parseFilterTagValues,
} from "./resultsFilterState";

type ResultsFilterBuilderProps = {
  table: ItemTable;
  draftFilterTree: ResultsFilterGroupNode;
  updateCondition: (path: number[], updater: (current: ResultsFilterConditionNode) => ResultsFilterConditionNode) => void;
  updateGroupRelation: (path: number[], relation: ResultsFilterRelation) => void;
  addConditionToGroup: (path: number[]) => void;
  addGroupToGroup: (path: number[]) => void;
  removeDraftNode: (path: number[]) => void;
};

export function ResultsFilterBuilder({
  table,
  draftFilterTree,
  updateCondition,
  updateGroupRelation,
  addConditionToGroup,
  addGroupToGroup,
  removeDraftNode,
}: ResultsFilterBuilderProps) {
const renderedConditionCounter = { current: 0 };

function renderFilterCondition(condition: ResultsFilterConditionNode, path: number[]) {
  const fieldOption = getFilterFieldOption(table, condition.field);
  const operatorOptions = getFilterOperatorOptions(fieldOption.kind);
  const conditionIndex = renderedConditionCounter.current++;
  const operator = operatorOptions.some((item) => item.value === condition.operator)
    ? condition.operator
    : getDefaultFilterOperator(fieldOption.kind);
  const needsRange = filterOperatorNeedsRange(operator);
  const needsArrayValue = filterOperatorNeedsArrayValue(operator);
  const needsSingleValue = filterOperatorNeedsSingleValue(operator);
  return (
    <div key={`condition-${path.join("-")}`} className="results-advanced-filter-condition">
      <label className="field">
        <select
          aria-label={`filter-field-${conditionIndex}`}
          value={condition.field}
          onChange={(event) => {
            const nextField = event.target.value as ResultsFilterField;
            const nextFieldOption = getFilterFieldOption(table, nextField);
            updateCondition(path, () => createFilterCondition(nextFieldOption.field, nextFieldOption.kind));
          }}
        >
          {RESULTS_FILTER_FIELD_OPTIONS[table].map((option) => (
            <option key={option.field} value={option.field}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <select
          aria-label={`filter-operator-${conditionIndex}`}
          value={operator}
          onChange={(event) => {
            const nextOperator = event.target.value as ResultsFilterConditionOperator;
            updateCondition(path, (current) => {
              const nextCondition = createFilterCondition(current.field, fieldOption.kind);
              const preservedValue = current.value ?? "";
              const preservedValues = current.values ?? [];
              const preservedMin = current.min ?? "";
              const preservedMax = current.max ?? "";
              nextCondition.operator = nextOperator;
              if (filterOperatorNeedsArrayValue(nextOperator)) {
                nextCondition.values = preservedValues;
              } else if (filterOperatorNeedsRange(nextOperator)) {
                nextCondition.min = preservedMin;
                nextCondition.max = preservedMax;
              } else if (filterOperatorNeedsSingleValue(nextOperator)) {
                nextCondition.value = preservedValue;
              }
              return nextCondition;
            });
          }}
        >
          {operatorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="results-advanced-filter-value">
        {needsArrayValue ? (
          <label className="field">
            <textarea
              rows={2}
              aria-label={`filter-value-${conditionIndex}`}
              placeholder="逗号或换行分隔"
              value={createResultsFilterTreeTextValue(condition.values)}
              onChange={(event) => {
                const nextValues = parseFilterTagValues(event.target.value);
                updateCondition(path, (current) => ({
                  ...current,
                  values: nextValues,
                }));
              }}
            />
          </label>
        ) : null}
        {needsRange ? (
          <div className="results-advanced-filter-range">
            <label className="field">
              <input
                aria-label={`filter-min-${conditionIndex}`}
                type={fieldOption.kind === "datetime" ? "datetime-local" : "text"}
                inputMode={fieldOption.kind === "number" || operator === "length_between" ? "numeric" : undefined}
                placeholder="最小值"
                value={String(condition.min ?? "")}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  updateCondition(path, (current) => ({
                    ...current,
                    min: nextValue,
                  }));
                }}
              />
            </label>
            <label className="field">
              <input
                aria-label={`filter-max-${conditionIndex}`}
                type={fieldOption.kind === "datetime" ? "datetime-local" : "text"}
                inputMode={fieldOption.kind === "number" || operator === "length_between" ? "numeric" : undefined}
                placeholder="最大值"
                value={String(condition.max ?? "")}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  updateCondition(path, (current) => ({
                    ...current,
                    max: nextValue,
                  }));
                }}
              />
            </label>
          </div>
        ) : null}
        {needsSingleValue ? (
          <label className="field">
            <input
              aria-label={`filter-value-${conditionIndex}`}
              type={fieldOption.kind === "datetime" ? "datetime-local" : "text"}
              inputMode={fieldOption.kind === "number" || operator.startsWith("length_") ? "numeric" : undefined}
              placeholder="筛选值"
              value={String(condition.value ?? "")}
              onChange={(event) => {
                const nextValue = event.target.value;
                updateCondition(path, (current) => ({
                  ...current,
                  value: nextValue,
                }));
              }}
            />
          </label>
        ) : null}
        {!needsArrayValue && !needsRange && !needsSingleValue ? (
          <div className="kv results-advanced-filter-inline-note">该操作符无需额外输入</div>
        ) : null}
      </div>
      <button
        type="button"
        className="workbench-secondary-action"
        onClick={() => removeDraftNode(path)}
      >
        删除条件
      </button>
    </div>
  );
}

function renderFilterGroup(group: ResultsFilterGroupNode, path: number[] = [], depth = 0): ReactNode {
  const isRoot = path.length === 0;
  return (
    <div
      key={`group-${path.join("-") || "root"}`}
      className="results-advanced-filter-group"
      data-depth={depth}
    >
      <div className="results-advanced-filter-group-head">
        <div className="results-advanced-filter-group-meta">
          <span className="kv">{isRoot ? "顶层条件组" : "条件组"}</span>
          <label className="field results-advanced-filter-relation-field">
            <select
              aria-label={isRoot ? "filter-relation-root" : `filter-relation-${path.join("-")}`}
              value={group.relation}
              onChange={(event) => updateGroupRelation(path, event.target.value as ResultsFilterRelation)}
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </label>
        </div>
        <div className="results-advanced-filter-group-actions">
          <button type="button" className="workbench-secondary-action" onClick={() => addConditionToGroup(path)}>
            新增条件
          </button>
          <button type="button" className="workbench-secondary-action" onClick={() => addGroupToGroup(path)}>
            新增条件组
          </button>
          {!isRoot ? (
            <button type="button" className="workbench-secondary-action" onClick={() => removeDraftNode(path)}>
              删除条件组
            </button>
          ) : null}
        </div>
      </div>
      {group.children.length ? (
        <div className="results-advanced-filter-children">
          {group.children.map((child, index) => (
            child.type === "group"
              ? renderFilterGroup(child, [...path, index], depth + 1)
              : renderFilterCondition(child, [...path, index])
          ))}
        </div>
      ) : (
        <div className="drawer-empty results-advanced-filter-empty">暂无高级条件，点击“新增条件”开始筛选。</div>
      )}
    </div>
  );
}

  return renderFilterGroup(draftFilterTree);
}
