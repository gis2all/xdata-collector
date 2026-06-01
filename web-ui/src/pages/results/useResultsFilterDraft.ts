import type { Dispatch, SetStateAction } from "react";

import type {
  ItemTable,
  ResultsFilterConditionNode,
  ResultsFilterGroupNode,
  ResultsFilterRelation,
} from "../../api";
import {
  RESULTS_FILTER_FIELD_OPTIONS,
  cloneResultsFilterTree,
  createEmptyResultsFilterTree,
  createFilterCondition,
  getFilterGroupAtPath,
  getFilterParentAtPath,
  type ResultsFilterState,
} from "./resultsFilterState";

type UseResultsFilterDraftParams = {
  table: ItemTable;
  setFilterStateByTable: Dispatch<SetStateAction<Record<ItemTable, ResultsFilterState>>>;
};

export function useResultsFilterDraft({ table, setFilterStateByTable }: UseResultsFilterDraftParams) {
  function updateFilterState(targetTable: ItemTable, updater: (current: ResultsFilterState) => ResultsFilterState) {
    setFilterStateByTable((current) => ({
      ...current,
      [targetTable]: updater(current[targetTable]),
    }));
  }

  function updateDraftTree(updater: (current: ResultsFilterGroupNode) => ResultsFilterGroupNode) {
    updateFilterState(table, (current) => ({
      ...current,
      draftTree: updater(current.draftTree),
    }));
  }

  function handleKeywordInputChange(value: string) {
    updateFilterState(table, (current) => ({
      ...current,
      keywordInput: value,
    }));
  }

  function handleToggleAdvancedFilters() {
    updateFilterState(table, (current) => ({
      ...current,
      advancedOpen: !current.advancedOpen,
    }));
  }

  function addConditionToGroup(path: number[]) {
    updateDraftTree((current) => {
      const next = cloneResultsFilterTree(current);
      const group = getFilterGroupAtPath(next, path);
      if (!group) {
        return current;
      }
      const defaultField = RESULTS_FILTER_FIELD_OPTIONS[table][0];
      group.children.push(createFilterCondition(defaultField.field, defaultField.kind));
      return next;
    });
  }

  function addGroupToGroup(path: number[]) {
    updateDraftTree((current) => {
      const next = cloneResultsFilterTree(current);
      const group = getFilterGroupAtPath(next, path);
      if (!group) {
        return current;
      }
      group.children.push(createEmptyResultsFilterTree());
      return next;
    });
  }

  function removeDraftNode(path: number[]) {
    updateDraftTree((current) => {
      const next = cloneResultsFilterTree(current);
      const parentRef = getFilterParentAtPath(next, path);
      if (!parentRef) {
        return current;
      }
      parentRef.parent.children.splice(parentRef.index, 1);
      return next;
    });
  }

  function updateGroupRelation(path: number[], relation: ResultsFilterRelation) {
    updateDraftTree((current) => {
      const next = cloneResultsFilterTree(current);
      const group = getFilterGroupAtPath(next, path);
      if (!group) {
        return current;
      }
      group.relation = relation === "OR" ? "OR" : "AND";
      return next;
    });
  }

  function updateCondition(path: number[], updater: (current: ResultsFilterConditionNode) => ResultsFilterConditionNode) {
    updateDraftTree((current) => {
      const next = cloneResultsFilterTree(current);
      const parentRef = getFilterParentAtPath(next, path);
      if (!parentRef) {
        return current;
      }
      const target = parentRef.parent.children[parentRef.index];
      if (!target || target.type !== "condition") {
        return current;
      }
      parentRef.parent.children[parentRef.index] = updater(target);
      return next;
    });
  }

  return {
    updateFilterState,
    handleKeywordInputChange,
    handleToggleAdvancedFilters,
    addConditionToGroup,
    addGroupToGroup,
    removeDraftNode,
    updateGroupRelation,
    updateCondition,
  };
}
