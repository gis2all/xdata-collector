import { useEffect, useMemo, useRef, useState } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  isAbortError,
  listItems,
  type ItemSortField,
  type ItemTable,
  type ResultsFilterGroupNode,
  type ResultItemRecord,
  type SortDirection,
} from "../../api";
import { usePagination } from "../../hooks/usePagination";
import { useSplitPaneResize } from "../../hooks/useSplitPaneResize";
import {
  COLUMN_DEFINITIONS_BY_TABLE,
  readColumnWidths,
  writeColumnWidths,
  type ColumnWidthsByTable,
} from "./resultsTableConfig";
import {
  cloneResultsFilterTree,
  createDefaultResultsFilterState,
  filterTreeHasConditions,
  readResultsFilterState,
  sanitizeFilterTreeForSubmit,
  writeResultsFilterState,
  type ResultsFilterState,
} from "./resultsFilterState";
import { useResultsColumnResize } from "./useResultsColumnResize";
import { useResultsColumns } from "./useResultsColumns";
import { useResultsFilterDraft } from "./useResultsFilterDraft";
import { useResultsSelection } from "./useResultsSelection";

const PAGE_SIZE = 100;
export const RESULTS_SELECT_COLUMN_WIDTH = 48;
const RESULTS_SPLIT_LAYOUT_BREAKPOINT = 1180;
const RESULTS_MIN_TABLE_PANE_WIDTH = 720;
const RESULTS_MIN_DETAIL_PANE_WIDTH = 380;
const RESULTS_RESIZER_WIDTH = 20;

const TEXT = {
  title: "结果查询",
  subtitle: "筛选、查看、批量处理结果。",
  curatedTab: "筛选结果",
  rawTab: "原始结果",
  keywordLabel: "关键词",
  keywordPlaceholder: "关键词",
  refresh: "刷新列表",
  fields: "字段",
  resetColumns: "恢复默认",
  batchDelete: "批量删除",
  dedupe: "全表去重",
  loading: "加载中...",
  empty: "暂无结果记录",
  selectPage: "本页全选",
  chooseFirst: "请先勾选要删除的记录",
  selectAllMatchingPrefix: "已选中本页",
  selectAllMatching: "选择全部匹配结果",
  allMatchingSelected: "已选中全部匹配结果",
  clearSelection: "清空选择",
  prevPage: "上一页",
  nextPage: "下一页",
} as const;

const TABLE_NAMES: Record<ItemTable, string> = {
  curated: "x_items_curated",
  raw: "x_items_raw",
};

const TABLE_LABELS: Record<ItemTable, string> = {
  curated: "筛选结果",
  raw: "原始结果",
};

export function useResultsPageState() {
  const [table, setTable] = useState<ItemTable>("raw");
  const [items, setItems] = useState<ResultItemRecord[]>([]);
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const [filterStateByTable, setFilterStateByTable] = useState<Record<ItemTable, ResultsFilterState>>(() => readResultsFilterState());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [columnWidthsByTable, setColumnWidthsByTable] = useState<ColumnWidthsByTable>(() => readColumnWidths());
  const [sortBy, setSortBy] = useState<ItemSortField>("id");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadRequestIdRef = useRef(0);
  const { isResizingColumn, resizingColumnId, startColumnResize } = useResultsColumnResize({
    table,
    setColumnWidthsByTable,
  });
  const {
    isSplitLayout,
    isResizing: isResizingWorkspace,
    layoutRef: workspaceLayoutRef,
    startResizing: startWorkspaceResizing,
  } = useSplitPaneResize<HTMLElement>({
    breakpoint: RESULTS_SPLIT_LAYOUT_BREAKPOINT,
    minLeftPaneWidth: RESULTS_MIN_TABLE_PANE_WIDTH,
    minRightPaneWidth: RESULTS_MIN_DETAIL_PANE_WIDTH,
    resizerWidth: RESULTS_RESIZER_WIDTH,
  });
  const {
    updateFilterState,
    handleKeywordInputChange,
    handleToggleAdvancedFilters,
    addConditionToGroup,
    addGroupToGroup,
    removeDraftNode,
    updateGroupRelation,
    updateCondition,
  } = useResultsFilterDraft({ table, setFilterStateByTable });
  const {
    visibleColumnsByTable,
    setVisibleColumnsByTable,
    fieldMenuOpen,
    setFieldMenuOpen,
    visibleColumns,
    columnDefinitions,
    visibleColumnDefinitions,
    currentColumnWidths,
    resolvedVisibleColumnDefinitions,
    sortFieldSet,
    toggleColumnVisibility,
    handleRestoreDefaultColumns,
    handleToggleFieldMenu,
  } = useResultsColumns({ table, columnWidthsByTable });

  const currentFilterState = filterStateByTable[table];
  const keywordInput = currentFilterState.keywordInput;
  const appliedKeyword = currentFilterState.appliedKeyword;
  const draftFilterTree = currentFilterState.draftTree;
  const appliedFilterTree = currentFilterState.appliedTree;
  const hasAdvancedFilter = filterTreeHasConditions(appliedFilterTree);
  const {
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
  } = useResultsSelection({ items, total, hasAdvancedFilter });
  const { totalPages } = usePagination(total, PAGE_SIZE);
  const activeItem = useMemo(() => items.find((item) => item.id === activeRowId) ?? null, [activeRowId, items]);
  const sortDirectionLabel = sortDir === "asc" ? "升序" : "降序";
  const tableMinWidth = Math.max(
    960,
    RESULTS_SELECT_COLUMN_WIDTH + resolvedVisibleColumnDefinitions.reduce((sum, column) => sum + column.currentWidth, 0),
  );
  const tableName = TABLE_NAMES[table];
  const tableLabel = TABLE_LABELS[table];
  const activeKeywordLabel = appliedKeyword || "全部";
  const dedupeConfirmText = `确定对整个 ${tableName} 表执行去重吗？此操作会删除重复行。`;
  const batchDeleteConfirm = hasAdvancedFilter
    ? `确定硬删除当前筛选命中的 ${total} 条记录吗？此操作无法恢复。`
    : allMatchingSelected
      ? "确定硬删除当前筛选结果的全部记录吗？此操作无法恢复。"
      : "确定硬删除已勾选的记录吗？此操作无法恢复。";

  useEffect(() => {
    writeColumnWidths(columnWidthsByTable);
  }, [columnWidthsByTable]);

  useEffect(() => {
    writeResultsFilterState(filterStateByTable);
  }, [filterStateByTable]);

  async function load(options?: {
    table?: ItemTable;
    page?: number;
    keyword?: string;
    filterTree?: ResultsFilterGroupNode | null;
    sortBy?: ItemSortField;
    sortDir?: SortDirection;
    preserveMessage?: boolean;
    allowPageFallback?: boolean;
    clearSelection?: boolean;
  }) {
    const nextTable = options?.table ?? table;
    const nextPage = options?.page ?? page;
    const nextKeyword = options?.keyword ?? filterStateByTable[nextTable].appliedKeyword;
    const nextFilterTree = options?.filterTree ?? filterStateByTable[nextTable].appliedTree;
    const useStructuredFilter = filterTreeHasConditions(nextFilterTree);
    const nextSortBy = options?.sortBy ?? sortBy;
    const nextSortDir = options?.sortDir ?? sortDir;
    const shouldClearSelection = Boolean(options?.clearSelection);
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    loadAbortRef.current = controller;
    setLoading(true);
    setError("");
    if (!options?.preserveMessage) {
      setMessage("");
    }
    try {
      const data = await listItems({
        table: nextTable,
        page: nextPage,
        page_size: PAGE_SIZE,
        keyword: nextKeyword || undefined,
        sort_by: nextSortBy,
        sort_dir: nextSortDir,
        filter_tree: useStructuredFilter ? nextFilterTree : undefined,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== loadRequestIdRef.current) {
        return;
      }
      let nextItems = data.items || [];
      let totalItems = data.total || 0;
      let currentPage = data.page || nextPage;

      if (options?.allowPageFallback && currentPage > 1 && nextItems.length === 0 && totalItems > 0) {
        const fallbackPage = Math.min(currentPage - 1, Math.max(1, Math.ceil(totalItems / PAGE_SIZE)));
        if (fallbackPage !== currentPage) {
          const fallback = await listItems({
            table: nextTable,
            page: fallbackPage,
            page_size: PAGE_SIZE,
            keyword: nextKeyword || undefined,
            sort_by: nextSortBy,
            sort_dir: nextSortDir,
            filter_tree: useStructuredFilter ? nextFilterTree : undefined,
            signal: controller.signal,
          });
          if (controller.signal.aborted || requestId !== loadRequestIdRef.current) {
            return;
          }
          nextItems = fallback.items || [];
          totalItems = fallback.total || 0;
          currentPage = fallback.page || fallbackPage;
        }
      }

      setItems(nextItems);
      setTotal(totalItems);
      setPage(currentPage);
      setActiveRowId((current) => {
        if (current != null && nextItems.some((item) => item.id === current)) {
          return current;
        }
        return nextItems[0]?.id ?? null;
      });
      setSelectedIds((current) => {
        if (shouldClearSelection) {
          return [];
        }
        return current.filter((id) => nextItems.some((item) => item.id === id));
      });
      if (shouldClearSelection) {
        setAllMatchingSelected(false);
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || requestId !== loadRequestIdRef.current) {
        return;
      }
      setItems([]);
      setTotal(0);
      setPage(1);
      setSelectedIds([]);
      setAllMatchingSelected(false);
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
        }
      }
    }
  }

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void load({
      table: "raw",
      page: 1,
      keyword: filterStateByTable.raw.appliedKeyword,
      filterTree: filterStateByTable.raw.appliedTree,
      sortBy,
      sortDir,
    });
    // initial page load only; refresh and sorting are explicit actions
  }, []);

  async function handleSort(field: ItemSortField, direction: SortDirection) {
    setSortBy(field);
    setSortDir(direction);
    await load({ table, page, sortBy: field, sortDir: direction, filterTree: appliedFilterTree });
  }

  async function handlePageChange(nextPage: number) {
    await load({ table, page: nextPage, filterTree: appliedFilterTree });
  }

  async function handleRefresh() {
    const nextKeyword = keywordInput.trim();
    const nextDraftTree = cloneResultsFilterTree(draftFilterTree);
    const nextAppliedTree = sanitizeFilterTreeForSubmit(table, nextDraftTree);
    const keywordChanged = nextKeyword !== appliedKeyword;
    const filterChanged = JSON.stringify(nextAppliedTree) !== JSON.stringify(appliedFilterTree);
    updateFilterState(table, (current) => ({
      ...current,
      keywordInput: nextKeyword,
      appliedKeyword: nextKeyword,
      draftTree: nextDraftTree,
      appliedTree: nextAppliedTree,
    }));
    await load({
      table,
      page: keywordChanged || filterChanged ? 1 : page,
      keyword: nextKeyword,
      filterTree: nextAppliedTree,
      clearSelection: keywordChanged || filterChanged,
    });
  }

  async function handleResetFilters() {
    const nextState = createDefaultResultsFilterState();
    updateFilterState(table, () => nextState);
    await load({
      table,
      page: 1,
      keyword: "",
      filterTree: nextState.appliedTree,
      clearSelection: true,
    });
  }

  async function handleTableSwitch(nextTable: ItemTable) {
    if (nextTable === table) {
      return;
    }
    setFieldMenuOpen(false);
    const targetColumns = COLUMN_DEFINITIONS_BY_TABLE[nextTable].map((column) => column.key);
    const nextVisibleColumns = visibleColumnsByTable[nextTable];
    const nextSortBy = sortFieldSet.has(sortBy) && targetColumns.includes(sortBy) ? sortBy : "id";
    const nextSortDir = sortFieldSet.has(sortBy) && targetColumns.includes(sortBy) ? sortDir : "desc";

    setTable(nextTable);
    setVisibleColumnsByTable((current) => ({
      ...current,
      [nextTable]: nextVisibleColumns,
    }));
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setSelectedIds([]);
    setAllMatchingSelected(false);
    const nextFilterState = filterStateByTable[nextTable];
    await load({
      table: nextTable,
      page,
      keyword: nextFilterState.appliedKeyword,
      filterTree: nextFilterState.appliedTree,
      sortBy: nextSortBy,
      sortDir: nextSortDir,
      allowPageFallback: true,
      clearSelection: true,
    });
  }

  async function handleDeleteOne(item: ResultItemRecord) {
    if (!window.confirm(`确定硬删除记录 #${item.id} 吗？此操作无法恢复。`)) {
      return;
    }
    setError("");
    try {
      const result = await deleteItem(item.id, table);
      setMessage(`已删除记录 #${result.id}`);
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      if (allMatchingSelected) {
        setAllMatchingSelected(false);
      }
      await load({
        table,
        keyword: appliedKeyword,
        filterTree: appliedFilterTree,
        preserveMessage: true,
        allowPageFallback: true,
        clearSelection: allMatchingSelected,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  async function handleBatchDelete() {
    if (hasAdvancedFilter && total <= 0) {
      setError("当前高级筛选没有匹配记录");
      return;
    }
    if (!hasAdvancedFilter && !selectedCount) {
      setError(TEXT.chooseFirst);
      return;
    }
    if (!window.confirm(batchDeleteConfirm)) {
      return;
    }
    setError("");
    try {
      const result = hasAdvancedFilter
        ? await deleteItems({
            mode: "all_matching",
            keyword: appliedKeyword || undefined,
            table,
            filter_tree: appliedFilterTree,
          })
        : allMatchingSelected
          ? await deleteItems({ mode: "all_matching", keyword: appliedKeyword || undefined, table })
          : await deleteItems({ ids: [...selectedIds], table });
      setMessage(`已删除 ${result.deleted} 条记录`);
      await load({
        table,
        keyword: appliedKeyword,
        filterTree: appliedFilterTree,
        preserveMessage: true,
        allowPageFallback: true,
        clearSelection: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  async function handleDedupe() {
    if (!window.confirm(dedupeConfirmText)) {
      return;
    }
    setError("");
    try {
      const summary = await dedupeItems({ table });
      setMessage(`去重完成：${summary.groups} 组重复，删除 ${summary.deleted} 条，保留 ${summary.kept} 条`);
      await load({
        table,
        keyword: appliedKeyword,
        filterTree: appliedFilterTree,
        preserveMessage: true,
        allowPageFallback: true,
        clearSelection: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  function handleActivateRow(id: number) {
    setActiveRowId(id);
  }

  function handleWorkspaceResizerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startWorkspaceResizing();
    event.preventDefault();
  }

  function handleWorkspaceResizerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    startWorkspaceResizing();
    event.preventDefault();
  }

  return {
    table,
    tableLabel,
    activeKeywordLabel,
    keywordInput,
    appliedKeyword,
    draftFilterTree,
    appliedFilterTree,
    currentFilterState,
    hasAdvancedFilter,
    fieldMenuOpen,
    tableName,
    visibleColumns,
    columnDefinitions,
    visibleColumnDefinitions,
    currentColumnWidths,
    resolvedVisibleColumnDefinitions,
    sortFieldSet,
    items,
    total,
    page,
    totalPages,
    selectedIds,
    allMatchingSelected,
    selectedCount,
    selectedOnPage,
    allPageSelected: allSelectedOnPage,
    showSelectAllMatching,
    activeRowId,
    activeItem,
    sortBy,
    sortDir,
    sortDirectionLabel,
    pageSize: PAGE_SIZE,
    loading,
    error,
    message,
    visibleColumnCount: visibleColumnDefinitions.length,
    tableMinWidth,
    isResizingColumn,
    resizingColumnId,
    isSplitLayout,
    isResizingWorkspace,
    selectedItemCountLabel: selectedCount > 0 ? `当前已选 ${selectedCount} 项` : "请先在表格中勾选任务，再执行批量操作。",
    dedupeConfirmText,
    batchDeleteConfirm,
    currentFilterStateSummaryLabel: `当前表：${tableLabel}`,
    currentTableSummaryLabel: `关键词：${activeKeywordLabel}`,
    currentColumnWidthCount: visibleColumnDefinitions.length,
    tableNameLabel: tableName,
    TEXT,
    handleKeywordInputChange,
    handleToggleAdvancedFilters,
    addConditionToGroup,
    addGroupToGroup,
    removeDraftNode,
    updateGroupRelation,
    updateCondition,
    handleSort,
    handlePageChange,
    handleRefresh,
    handleResetFilters,
    handleTableSwitch,
    handleDeleteOne,
    handleBatchDelete,
    handleDedupe,
    handleSelectAllMatching,
    handleClearSelection,
    toggleSelected,
    toggleSelectAll,
    toggleColumnVisibility,
    handleToggleFieldMenu,
    handleActivateRow,
    handleRestoreDefaultColumns,
    startColumnResize,
    handleWorkspaceResizerPointerDown,
    handleWorkspaceResizerMouseDown,
    workspaceLayoutRef,
    setFieldMenuOpen,
    setActiveRowId,
    setTable,
    setSelectedIds,
    setAllMatchingSelected,
  } as const;
}

export type UseResultsPageState = ReturnType<typeof useResultsPageState>;
