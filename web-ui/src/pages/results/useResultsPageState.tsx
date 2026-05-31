import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  isAbortError,
  listItems,
  type ItemSortField,
  type ItemTable,
  type ResultsFilterConditionNode,
  type ResultsFilterGroupNode,
  type ResultsFilterRelation,
  type ResultItemRecord,
  type SortDirection,
} from "../../api";
import { usePagination } from "../../hooks/usePagination";
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
} from "./resultsTableConfig";
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
} from "./resultsFilterState";

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

type ResultsPageState = {
  table: ItemTable;
  tableLabel: string;
  activeKeywordLabel: string;
  keywordInput: string;
  appliedKeyword: string;
  draftFilterTree: ResultsFilterGroupNode;
  appliedFilterTree: ResultsFilterGroupNode;
  currentFilterState: ResultsFilterState;
  hasAdvancedFilter: boolean;
  fieldMenuOpen: boolean;
  tableName: string;
  visibleColumns: ItemSortField[];
  columnDefinitions: typeof COLUMN_DEFINITIONS_BY_TABLE.raw;
  visibleColumnDefinitions: ColumnDefinition[];
  currentColumnWidths: ColumnWidthsByTable[ItemTable] | undefined;
  resolvedVisibleColumnDefinitions: Array<ColumnDefinition & { currentWidth: number }>;
  sortFieldSet: Set<ItemSortField>;
  items: ResultItemRecord[];
  total: number;
  page: number;
  totalPages: number;
  selectedIds: number[];
  allMatchingSelected: boolean;
  selectedCount: number;
  selectedOnPage: number;
  allPageSelected: boolean;
  showSelectAllMatching: boolean;
  activeRowId: number | null;
  activeItem: ResultItemRecord | null;
  sortBy: ItemSortField;
  sortDir: SortDirection;
  sortDirectionLabel: string;
  pageSize: number;
  loading: boolean;
  error: string;
  message: string;
  visibleColumnCount: number;
  tableMinWidth: number;
  isResizingColumn: boolean;
  resizingColumnId: string | null;
  isSplitLayout: boolean;
  isResizingWorkspace: boolean;
  selectedItemCountLabel: string;
  dedupeConfirmText: string;
  batchDeleteConfirm: string;
  currentFilterStateSummaryLabel: string;
  currentTableSummaryLabel: string;
  currentColumnWidthCount: number;
  tableNameLabel: string;
  TEXT: typeof TEXT;
  fieldMenu: ReactNode;
  handleKeywordInputChange: (value: string) => void;
  handleToggleAdvancedFilters: () => void;
  addConditionToGroup: (path: number[]) => void;
  addGroupToGroup: (path: number[]) => void;
  removeDraftNode: (path: number[]) => void;
  updateGroupRelation: (path: number[], relation: ResultsFilterRelation) => void;
  updateCondition: (path: number[], updater: (current: ResultsFilterConditionNode) => ResultsFilterConditionNode) => void;
  handleSort: (field: ItemSortField, direction: SortDirection) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleResetFilters: () => Promise<void>;
  handleTableSwitch: (nextTable: ItemTable) => Promise<void>;
  handleDeleteOne: (item: ResultItemRecord) => Promise<void>;
  handleBatchDelete: () => Promise<void>;
  handleDedupe: () => Promise<void>;
  handleSelectAllMatching: () => void;
  handleClearSelection: () => void;
  toggleSelected: (id: number) => void;
  toggleSelectAll: () => void;
  toggleColumnVisibility: (key: ItemSortField) => void;
  handleRestoreDefaultColumns: () => void;
  startColumnResize: (
    leftColumn: ColumnDefinition & { currentWidth: number },
    rightColumn: (ColumnDefinition & { currentWidth: number }) | undefined,
    clientX: number | undefined,
  ) => void;
  handleWorkspaceResizerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleWorkspaceResizerMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  workspaceLayoutRef: RefObject<HTMLElement | null>;
};

export function useResultsPageState() {
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
  const [, setLeftPaneWidth] = useState<number | null>(null);
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const resizeStateRef = useRef<ColumnResizeState | null>(null);
  const workspaceLayoutRef = useRef<HTMLElement | null>(null);
  const workspaceDragBoundsRef = useRef<{ left: number; width: number } | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadRequestIdRef = useRef(0);

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
  const { totalPages } = usePagination(total, PAGE_SIZE);
  const selectedOnPage = allMatchingSelected ? items.length : items.filter((item) => selectedIds.includes(item.id)).length;
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const activeItem = useMemo(() => items.find((item) => item.id === activeRowId) ?? null, [activeRowId, items]);
  const allSelectedOnPage = items.length > 0 && selectedOnPage === items.length;
  const allPageSelected = allSelectedOnPage;
  const showSelectAllMatching = !hasAdvancedFilter && !allMatchingSelected && allSelectedOnPage && total > items.length;
  const sortDirectionLabel = sortDir === "asc" ? "升序" : "降序";
  const tableMinWidth = Math.max(
    960,
    RESULTS_SELECT_COLUMN_WIDTH + resolvedVisibleColumnDefinitions.reduce((sum, column) => sum + column.currentWidth, 0),
  );
  const tableName = TABLE_NAMES[table];
  const tableLabel = TABLE_LABELS[table];
  const activeKeywordLabel = appliedKeyword || "全部";
  const isSplitLayout = viewportWidth > RESULTS_SPLIT_LAYOUT_BREAKPOINT;
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

  function handleToggleFieldMenu() {
    setFieldMenuOpen((current) => !current);
  }

  function handleActivateRow(id: number) {
    setActiveRowId(id);
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

  const fieldMenu = (
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
  );

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
    fieldMenu,
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
