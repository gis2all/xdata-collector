import { useState } from "react";

import type { ResultItemRecord } from "../../api";

type UseResultsSelectionParams = {
  items: ResultItemRecord[];
  total: number;
  hasAdvancedFilter: boolean;
};

export function useResultsSelection({ items, total, hasAdvancedFilter }: UseResultsSelectionParams) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);

  const selectedOnPage = allMatchingSelected ? items.length : items.filter((item) => selectedIds.includes(item.id)).length;
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const allSelectedOnPage = items.length > 0 && selectedOnPage === items.length;
  const showSelectAllMatching = !hasAdvancedFilter && !allMatchingSelected && allSelectedOnPage && total > items.length;

  function handleSelectAllMatching() {
    if (hasAdvancedFilter) {
      return;
    }
    setAllMatchingSelected(true);
  }

  function handleClearSelection() {
    setAllMatchingSelected(false);
    setSelectedIds([]);
  }

  function toggleSelected(id: number) {
    if (allMatchingSelected) {
      handleClearSelection();
      return;
    }
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  function toggleSelectAll() {
    if (allMatchingSelected) {
      handleClearSelection();
      return;
    }
    if (allSelectedOnPage) {
      setSelectedIds((current) => current.filter((id) => !items.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      items.forEach((item) => next.add(item.id));
      return Array.from(next);
    });
  }

  return {
    selectedIds,
    setSelectedIds,
    allMatchingSelected,
    setAllMatchingSelected,
    selectedOnPage,
    selectedCount,
    allSelectedOnPage,
    showSelectAllMatching,
    handleSelectAllMatching,
    handleClearSelection,
    toggleSelected,
    toggleSelectAll,
  };
}
