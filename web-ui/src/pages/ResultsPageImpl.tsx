import { useEffect, useMemo, useRef, useState } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  listItems,
  type ItemSortField,
  type ItemTable,
  type ResultsFilterConditionNode,
  type ResultsFilterGroupNode,
  type ResultsFilterNode,
  type ResultsFilterRelation,
  type ResultItemRecord,
  type SortDirection,
} from "../api";
import { ResultsDetailRail } from "./results/ResultsDetailRail";
import { ResultsFilterBuilder } from "./results/ResultsFilterBuilder";
import { ResultsDataTable } from "./results/ResultsDataTable";
import { ResultsPageHeader } from "./results/ResultsPageHeader";
import { ResultsTableManager } from "./results/ResultsTableManager";
import {
  COLUMN_DEFINITIONS_BY_TABLE,
  DEFAULT_VISIBLE_COLUMNS_BY_TABLE,
  getColumnMinWidth,
  orderVisibleColumns,
  readColumnWidths,
  resolveColumnWidth,
  writeColumnWidths,
  type ColumnDefinition,
  type ColumnResizeState,
  type ColumnWidthsByTable,
} from "./results/resultsTableConfig";
import {
  RESULTS_FILTER_FIELD_OPTIONS,
  cloneResultsFilterTree,
  createDefaultResultsFilterState,
  createEmptyResultsFilterTree,
  createFilterCondition,
  filterTreeHasConditions,
  getFilterGroupAtPath,
  getFilterParentAtPath,
  readResultsFilterState,
  sanitizeFilterTreeForSubmit,
  writeResultsFilterState,
  type ResultsFilterState,
} from "./results/resultsFilterState";

const RESULTS_COLUMN_WIDTHS_KEY = "results.columnWidths.v1";
const PAGE_SIZE = 100;
const RESULTS_SELECT_COLUMN_WIDTH = 48;
const RESULTS_SPLIT_LAYOUT_BREAKPOINT = 1180;
const RESULTS_MIN_TABLE_PANE_WIDTH = 720;
const RESULTS_MIN_DETAIL_PANE_WIDTH = 380;
const RESULTS_RESIZER_WIDTH = 20;

const TEXT = {
  title: "\u7ed3\u679c\u67e5\u8be2",
  subtitle: "\u7b5b\u9009\u3001\u67e5\u770b\u3001\u6279\u91cf\u5904\u7406\u7ed3\u679c\u3002",
  curatedTab: "\u7b5b\u9009\u7ed3\u679c",
  rawTab: "\u539f\u59cb\u7ed3\u679c",
  keywordLabel: "\u5173\u952e\u8bcd",
  keywordPlaceholder: "\u5173\u952e\u8bcd",
  refresh: "\u5237\u65b0\u5217\u8868",
  fields: "\u5b57\u6bb5",
  resetColumns: "\u6062\u590d\u9ed8\u8ba4",
  batchDelete: "\u6279\u91cf\u5220\u9664",
  dedupe: "\u5168\u8868\u53bb\u91cd",
  loading: "\u52a0\u8f7d\u4e2d...",
  empty: "\u6682\u65e0\u7ed3\u679c\u8bb0\u5f55",
  selectPage: "\u672c\u9875\u5168\u9009",
  operation: "\u64cd\u4f5c",
  delete: "\u5220\u9664",
  chooseFirst: "\u8bf7\u5148\u52fe\u9009\u8981\u5220\u9664\u7684\u8bb0\u5f55",
  selectAllMatchingPrefix: "\u5df2\u9009\u4e2d\u672c\u9875",
  selectAllMatching: "\u9009\u62e9\u5168\u90e8\u5339\u914d\u7ed3\u679c",
  allMatchingSelected: "\u5df2\u9009\u4e2d\u5168\u90e8\u5339\u914d\u7ed3\u679c",
  clearSelection: "\u6e05\u7a7a\u9009\u62e9",
  prevPage: "\u4e0a\u4e00\u9875",
  nextPage: "\u4e0b\u4e00\u9875",
} as const;

const TABLE_NAMES: Record<ItemTable, string> = {
  curated: "x_items_curated",
  raw: "x_items_raw",
};

const TABLE_LABELS: Record<ItemTable, string> = {
  curated: "筛选结果",
  raw: "原始结果",
};

export function ResultsPage() {
  const [table, setTable] = useState<ItemTable>("raw");
  const [items, setItems] = useState<ResultItemRecord[]>([]);
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const [filterStateByTable, setFilterStateByTable] = useState<Record<ItemTable, ResultsFilterState>>(() => readResultsFilterState());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [visibleColumnsByTable, setVisibleColumnsByTable] = useState<Record<ItemTable, ItemSortField[]>>({
    curated: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE.curated],
    raw: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE.raw],
  });
  const [columnWidthsByTable, setColumnWidthsByTable] = useState<ColumnWidthsByTable>(() => readColumnWidths());
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ItemSortField>("id");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? RESULTS_SPLIT_LAYOUT_BREAKPOINT : window.innerWidth));
  const [leftPaneWidth, setLeftPaneWidth] = useState<number | null>(null);
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const resizeStateRef = useRef<ColumnResizeState | null>(null);
  const workspaceLayoutRef = useRef<HTMLElement | null>(null);
  const workspaceDragBoundsRef = useRef<{ left: number; width: number } | null>(null);

  const currentFilterState = filterStateByTable[table];
  const keywordInput = currentFilterState.keywordInput;
  const appliedKeyword = currentFilterState.appliedKeyword;
  const draftFilterTree = currentFilterState.draftTree;
  const appliedFilterTree = currentFilterState.appliedTree;
  const hasAdvancedFilter = filterTreeHasConditions(appliedFilterTree);
  const visibleColumns = visibleColumnsByTable[table];
  const columnDefinitions = COLUMN_DEFINITIONS_BY_TABLE[table];
  const visibleColumnDefinitions = columnDefinitions.filter((column) => visibleColumns.includes(column.key));
  const currentColumnWidths = columnWidthsByTable[table];
  const resolvedVisibleColumnDefinitions = useMemo(
    () =>
      visibleColumnDefinitions.map((column) => ({
        ...column,
        currentWidth: resolveColumnWidth(column, currentColumnWidths?.[column.key]),
      })),
    [currentColumnWidths, visibleColumnDefinitions],
  );
  const sortFieldSet = useMemo(() => new Set(columnDefinitions.map((column) => column.key)), [columnDefinitions]);
  const pageSize = PAGE_SIZE;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const selectedOnPage = allMatchingSelected ? items.length : items.filter((item) => selectedIds.includes(item.id)).length;
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const activeItem = useMemo(() => items.find((item) => item.id === activeRowId) ?? null, [activeRowId, items]);
  const allSelectedOnPage = items.length > 0 && selectedOnPage === items.length;
  const showSelectAllMatching = !hasAdvancedFilter && !allMatchingSelected && allSelectedOnPage && total > items.length;
  const sortDirectionLabel = sortDir === "asc" ? "\u5347\u5e8f" : "\u964d\u5e8f";
  const tableMinWidth = Math.max(
    960,
    RESULTS_SELECT_COLUMN_WIDTH + resolvedVisibleColumnDefinitions.reduce((sum, column) => sum + column.currentWidth, 0),
  );
  const tableName = TABLE_NAMES[table];
  const tableLabel = TABLE_LABELS[table];
  const activeKeywordLabel = appliedKeyword || "\u5168\u90e8";
  const isSplitLayout = viewportWidth > RESULTS_SPLIT_LAYOUT_BREAKPOINT;
  const dedupeConfirmText = `\u786e\u5b9a\u5bf9\u6574\u4e2a ${tableName} \u8868\u6267\u884c\u53bb\u91cd\u5417\uff1f\u6b64\u64cd\u4f5c\u4f1a\u5220\u9664\u91cd\u590d\u884c\u3002`;
  const batchDeleteConfirm = hasAdvancedFilter
    ? `确定硬删除当前筛选命中的 ${total} 条记录吗？此操作无法恢复。`
    : allMatchingSelected
      ? "\u786e\u5b9a\u786c\u5220\u9664\u5f53\u524d\u7b5b\u9009\u7ed3\u679c\u7684\u5168\u90e8\u8bb0\u5f55\u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u6062\u590d\u3002"
      : "\u786e\u5b9a\u786c\u5220\u9664\u5df2\u52fe\u9009\u7684\u8bb0\u5f55\u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u6062\u590d\u3002";

  useEffect(() => {
    writeColumnWidths(columnWidthsByTable);
  }, [columnWidthsByTable]);

  useEffect(() => {
    writeResultsFilterState(filterStateByTable);
  }, [filterStateByTable]);

  function applyWorkspacePaneWidth(nextWidth: number | null) {
    setLeftPaneWidth(nextWidth);
    if (!workspaceLayoutRef.current) return;
    workspaceLayoutRef.current.style.gridTemplateColumns = nextWidth === null
      ? ""
      : `${nextWidth}px ${RESULTS_RESIZER_WIDTH}px minmax(${RESULTS_MIN_DETAIL_PANE_WIDTH}px, 1fr)`;
  }

  function updateDraggedWorkspaceWidth(clientX: number | undefined) {
    const bounds = workspaceDragBoundsRef.current;
    if (!bounds || typeof clientX !== "number" || Number.isNaN(clientX)) return;
    const maxWidth = Math.max(RESULTS_MIN_TABLE_PANE_WIDTH, bounds.width - RESULTS_MIN_DETAIL_PANE_WIDTH - RESULTS_RESIZER_WIDTH);
    const nextWidth = Math.min(Math.max(clientX - bounds.left, RESULTS_MIN_TABLE_PANE_WIDTH), maxWidth);
    applyWorkspacePaneWidth(nextWidth);
  }

  useEffect(() => {
    function updateResizedColumnWidth(clientX: number | undefined) {
      const resizeState = resizeStateRef.current;
      if (!resizeState || typeof clientX !== "number" || Number.isNaN(clientX)) {
        return;
      }
      const delta = clientX - resizeState.startX;
      const pairTotal = resizeState.leftStartWidth + resizeState.rightStartWidth;
      const nextLeftWidth = Math.min(
        Math.max(Math.round(resizeState.leftStartWidth + delta), resizeState.leftMinWidth),
        pairTotal - resizeState.rightMinWidth,
      );
      const nextRightWidth = pairTotal - nextLeftWidth;
      setColumnWidthsByTable((current) => {
        const tableWidths = current[resizeState.table];
        if (
          tableWidths?.[resizeState.leftKey] === nextLeftWidth &&
          tableWidths?.[resizeState.rightKey] === nextRightWidth
        ) {
          return current;
        }
        return {
          ...current,
          [resizeState.table]: {
            ...tableWidths,
            [resizeState.leftKey]: nextLeftWidth,
            [resizeState.rightKey]: nextRightWidth,
          },
        };
      });
    }

    function handlePointerMove(event: PointerEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function handleMouseMove(event: MouseEvent) {
      updateResizedColumnWidth(event.clientX);
    }

    function stopResizingColumn() {
      resizeStateRef.current = null;
      setIsResizingColumn(false);
      setResizingColumnId(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizingColumn);
    window.addEventListener("pointercancel", stopResizingColumn);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizingColumn);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizingColumn);
      window.removeEventListener("pointercancel", stopResizingColumn);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizingColumn);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    function handleWindowResize() {
      setViewportWidth(window.innerWidth);
    }

    function handleWorkspacePointerMove(event: PointerEvent) {
      updateDraggedWorkspaceWidth(event.clientX);
    }

    function handleWorkspaceMouseMove(event: MouseEvent) {
      updateDraggedWorkspaceWidth(event.clientX);
    }

    function stopWorkspaceResizing() {
      workspaceDragBoundsRef.current = null;
      setIsResizingWorkspace(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("pointermove", handleWorkspacePointerMove);
    window.addEventListener("pointerup", stopWorkspaceResizing);
    window.addEventListener("pointercancel", stopWorkspaceResizing);
    window.addEventListener("mousemove", handleWorkspaceMouseMove);
    window.addEventListener("mouseup", stopWorkspaceResizing);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointermove", handleWorkspacePointerMove);
      window.removeEventListener("pointerup", stopWorkspaceResizing);
      window.removeEventListener("pointercancel", stopWorkspaceResizing);
      window.removeEventListener("mousemove", handleWorkspaceMouseMove);
      window.removeEventListener("mouseup", stopWorkspaceResizing);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    if (isSplitLayout) return;
    setIsResizingWorkspace(false);
    applyWorkspacePaneWidth(null);
    workspaceDragBoundsRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [isSplitLayout]);

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
    setLoading(true);
    setError("");
    if (!options?.preserveMessage) {
      setMessage("");
    }
    try {
      const data = await listItems({
        table: nextTable,
        page: nextPage,
        page_size: pageSize,
        keyword: nextKeyword || undefined,
        sort_by: nextSortBy,
        sort_dir: nextSortDir,
        filter_tree: useStructuredFilter ? nextFilterTree : undefined,
      });
      let nextItems = data.items || [];
      let totalItems = data.total || 0;
      let currentPage = data.page || nextPage;

      if (options?.allowPageFallback && currentPage > 1 && nextItems.length === 0 && totalItems > 0) {
        const fallbackPage = Math.min(currentPage - 1, Math.max(1, Math.ceil(totalItems / pageSize)));
        if (fallbackPage !== currentPage) {
          const fallback = await listItems({
            table: nextTable,
            page: fallbackPage,
            page_size: pageSize,
            keyword: nextKeyword || undefined,
            sort_by: nextSortBy,
            sort_dir: nextSortDir,
            filter_tree: useStructuredFilter ? nextFilterTree : undefined,
          });
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
      setItems([]);
      setTotal(0);
      setPage(1);
      setSelectedIds([]);
      setAllMatchingSelected(false);
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSort(field: ItemSortField, direction: SortDirection) {
    setSortBy(field);
    setSortDir(direction);
    await load({ table, page, sortBy: field, sortDir: direction, filterTree: appliedFilterTree });
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
    if (!window.confirm(`\u786e\u5b9a\u786c\u5220\u9664\u8bb0\u5f55 #${item.id} \u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u6062\u590d\u3002`)) {
      return;
    }
    setError("");
    try {
      const result = await deleteItem(item.id, table);
      setMessage(`\u5df2\u5220\u9664\u8bb0\u5f55 #${result.id}`);
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
      setMessage(`\u5df2\u5220\u9664 ${result.deleted} \u6761\u8bb0\u5f55`);
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
      setMessage(`\u53bb\u91cd\u5b8c\u6210\uff1a${summary.groups} \u7ec4\u91cd\u590d\uff0c\u5220\u9664 ${summary.deleted} \u6761\uff0c\u4fdd\u7559 ${summary.kept} \u6761`);
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

  function toggleColumnVisibility(key: ItemSortField) {
    setVisibleColumnsByTable((current) => {
      const tableColumns = current[table];
      const nextColumns = tableColumns.includes(key)
        ? tableColumns.filter((field) => field !== key)
        : orderVisibleColumns(table, [...tableColumns, key]);
      return {
        ...current,
        [table]: nextColumns,
      };
    });
  }

  function handleRestoreDefaultColumns() {
    setVisibleColumnsByTable((current) => ({
      ...current,
      [table]: [...DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table]],
    }));
  }

  function startColumnResize(
    leftColumn: ColumnDefinition & { currentWidth: number },
    rightColumn: ColumnDefinition & { currentWidth: number } | undefined,
    clientX: number | undefined,
  ) {
    if (typeof clientX !== "number" || Number.isNaN(clientX) || !rightColumn) {
      return;
    }
    resizeStateRef.current = {
      table,
      leftKey: leftColumn.key,
      rightKey: rightColumn.key,
      startX: clientX,
      leftStartWidth: leftColumn.currentWidth,
      rightStartWidth: rightColumn.currentWidth,
      leftMinWidth: getColumnMinWidth(leftColumn),
      rightMinWidth: getColumnMinWidth(rightColumn),
    };
    setIsResizingColumn(true);
    setResizingColumnId(`${table}:${leftColumn.key}`);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function startWorkspaceResizing() {
    if (!isSplitLayout || !workspaceLayoutRef.current) return;
    const bounds = workspaceLayoutRef.current.getBoundingClientRect();
    workspaceDragBoundsRef.current = { left: bounds.left, width: bounds.width };
    setIsResizingWorkspace(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function handleWorkspaceResizerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startWorkspaceResizing();
    event.preventDefault();
  }

  function handleWorkspaceResizerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    startWorkspaceResizing();
    event.preventDefault();
  }


  return (
    <div className="results-page" data-testid="results-page">
      <ResultsPageHeader title={TEXT.title} subtitle={TEXT.subtitle} />

      <section className="results-control-layer workbench-layer" data-testid="results-control-layer">
        <div className="results-control-summary flat-meta-strip" data-testid="results-control-summary">
          <div className="results-filter-copy workbench-section-copy">
            <div className="results-filter-title workbench-section-title">当前结果表</div>
          </div>
          <div className="results-filter-summary workbench-pill-row" data-testid="results-filter-summary">
            <div className="results-summary-pill workbench-pill">{`\u5f53\u524d\u8868\uff1a${tableLabel}`}</div>
            <div className="results-summary-pill workbench-pill">{`\u5173\u952e\u8bcd\uff1a${activeKeywordLabel}`}</div>
          </div>
        </div>
        <div
          className="results-filter-toolbar-shell flat-actions"
          data-testid="results-filter-toolbar-shell"
        >
          <div className="results-filter-controls results-filter-toolbar" data-testid="results-filter-toolbar">
            <div className="results-filter-browse" data-testid="results-filter-browse">
              <div className="segmented-control" role="tablist" aria-label="results-table-switcher">
                <button
                  type="button"
                  className={table === "curated" ? "active" : "ghost"}
                  onClick={() => void handleTableSwitch("curated")}
                >
                  {TEXT.curatedTab}
                </button>
                <button
                  type="button"
                  className={table === "raw" ? "active" : "ghost"}
                  onClick={() => void handleTableSwitch("raw")}
                >
                  {TEXT.rawTab}
                </button>
              </div>
              <label className="field results-filter-keyword-field">
                <input
                  placeholder={TEXT.keywordPlaceholder}
                  value={keywordInput}
                  onChange={(event) => handleKeywordInputChange(event.target.value)}
                  aria-label={TEXT.keywordLabel}
                />
              </label>
            </div>
            <div className="results-filter-primary" data-testid="results-filter-primary">
              <div className="results-filter-primary-actions">
                <button
                  type="button"
                  className={`workbench-secondary-action${currentFilterState.advancedOpen ? " active" : ""}`}
                  onClick={handleToggleAdvancedFilters}
                  disabled={loading}
                >
                  高级筛选
                </button>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  onClick={() => void handleRefresh()}
                  disabled={loading}
                >
                  应用筛选
                </button>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  onClick={() => void handleResetFilters()}
                  disabled={loading}
                >
                  重置筛选
                </button>
                <button
                  type="button"
                  className="workbench-primary-action"
                  onClick={() => void handleRefresh()}
                  disabled={loading}
                >
                  {TEXT.refresh}
                </button>
              </div>
            </div>
            <ResultsTableManager
              selectedCount={selectedCount}
              allMatchingSelected={allMatchingSelected}
              showSelectAllMatching={showSelectAllMatching}
              fieldsLabel={TEXT.fields}
              resetColumnsLabel={TEXT.resetColumns}
              batchDeleteLabel={TEXT.batchDelete}
              dedupeLabel={TEXT.dedupe}
              clearSelectionLabel={TEXT.clearSelection}
              loading={loading}
              allowBatchDeleteWithoutSelection={hasAdvancedFilter && total > 0}
              fieldMenuOpen={fieldMenuOpen}
              fieldMenu={fieldMenuOpen ? (
                <div className="results-field-menu" data-testid="results-field-menu">
                  <div className="results-field-menu-header">
                    <div className="results-field-menu-copy">
                      <div className="results-field-menu-title">列显示</div>
                      <div className="kv">隐藏列会保留宽度设置，重新显示时会恢复。</div>
                    </div>
                    <span className="results-summary-pill workbench-pill">{`已选 ${visibleColumnDefinitions.length} 列`}</span>
                  </div>
                  <div className="results-field-list">
                    {columnDefinitions.map((column) => (
                      <label key={column.key} className="results-field-option">
                        <input
                          type="checkbox"
                          aria-label={`toggle-column-${column.key}`}
                          checked={visibleColumns.includes(column.key)}
                          onChange={() => toggleColumnVisibility(column.key)}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              onSelectAllMatching={handleSelectAllMatching}
              onClearSelection={handleClearSelection}
              onToggleFields={() => setFieldMenuOpen((current) => !current)}
              onRestoreDefaultColumns={handleRestoreDefaultColumns}
              onBatchDelete={() => void handleBatchDelete()}
              onDedupe={() => void handleDedupe()}
            />
          </div>
          {currentFilterState.advancedOpen ? (
            <div
              className="results-advanced-filter-panel"
              data-testid="results-advanced-filter-panel"
            >
              <div className="results-advanced-filter-panel-head">
                <div className="results-advanced-filter-panel-copy">
                  <div className="results-filter-title workbench-section-title">高级筛选</div>
                  <div className="kv">后端会先按整表筛选，再返回当前分页结果。</div>
                </div>
              </div>
              <ResultsFilterBuilder
                table={table}
                draftFilterTree={draftFilterTree}
                updateCondition={updateCondition}
                updateGroupRelation={updateGroupRelation}
                addConditionToGroup={addConditionToGroup}
                addGroupToGroup={addGroupToGroup}
                removeDraftNode={removeDraftNode}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section
        ref={workspaceLayoutRef}
        className={`results-main-workspace results-main-workspace-aligned${isResizingWorkspace ? " dragging" : ""}`}
        data-testid="results-main-workspace"
      >
        <ResultsDataTable
          table={table}
          tableLabel={tableLabel}
          visibleColumnCount={visibleColumnDefinitions.length}
          error={error}
          message={message}
          showSelectAllMatching={showSelectAllMatching}
          selectAllMatchingPrefix={TEXT.selectAllMatchingPrefix}
          allMatchingSelected={allMatchingSelected}
          allMatchingSelectedLabel={TEXT.allMatchingSelected}
          items={items}
          total={total}
          selectedCount={selectedCount}
          totalPages={totalPages}
          page={page}
          selectedOnPage={selectedOnPage}
          sortBy={sortBy}
          sortDir={sortDir}
          sortDirectionLabel={sortDirectionLabel}
          pageSize={pageSize}
          loading={loading}
          loadingLabel={TEXT.loading}
          prevPageLabel={TEXT.prevPage}
          nextPageLabel={TEXT.nextPage}
          selectPageLabel={TEXT.selectPage}
          emptyLabel={TEXT.empty}
          tableMinWidth={tableMinWidth}
          isResizingColumn={isResizingColumn}
          selectColumnWidth={RESULTS_SELECT_COLUMN_WIDTH}
          columns={resolvedVisibleColumnDefinitions}
          allSelectedOnPage={allSelectedOnPage}
          resizingColumnId={resizingColumnId}
          activeRowId={activeRowId}
          selectedIds={selectedIds}
          onPageChange={(nextPage) => load({ table, page: nextPage })}
          onSort={handleSort}
          onStartColumnResize={startColumnResize}
          onSetActiveRowId={setActiveRowId}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelected={toggleSelected}
        />

        {isSplitLayout && (
          <div
            className={`results-resizer${isResizingWorkspace ? " dragging" : ""}`}
            data-testid="results-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整结果区域宽度"
            onPointerDown={handleWorkspaceResizerPointerDown}
            onMouseDown={handleWorkspaceResizerMouseDown}
          />
        )}

        <aside className="results-detail-rail workbench-layer" data-testid="results-detail-rail">
          <ResultsDetailRail
            item={activeItem}
            table={table}
            tableLabel={tableLabel}
            total={total}
            onDelete={activeItem ? () => void handleDeleteOne(activeItem) : undefined}
            deleteDisabled={loading}
          />
        </aside>
      </section>
    </div>
  );
}
