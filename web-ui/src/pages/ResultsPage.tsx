import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  listItems,
  type CuratedItemRecord,
  type ItemSortField,
  type ItemTable,
  type RawItemRecord,
  type ResultItemRecord,
  type SortDirection,
} from "../api";
import { ResultsDetailRail } from "./results/ResultsDetailRail";
import { ResultsPageHeader } from "./results/ResultsPageHeader";
import { ResultsTableManager } from "./results/ResultsTableManager";
import { formatUtcPlus8Time } from "../time";

const RESULTS_VISIBLE_COLUMNS_KEY = "results.visibleColumns.v1";
const RESULTS_COLUMN_WIDTHS_KEY = "results.columnWidths.v1";
const PAGE_SIZE = 100;
const RESULTS_SELECT_COLUMN_WIDTH = 92;
const RESULTS_OPERATION_COLUMN_WIDTH = 88;

const TEXT = {
  title: "\u7ed3\u679c\u67e5\u8be2",
  subtitle: "\u4fdd\u7559\u5173\u952e\u8bcd\u67e5\u8be2\u4e0e\u5237\u65b0\uff0c\u540c\u65f6\u652f\u6301\u7b5b\u9009\u7ed3\u679c\u4e0e\u539f\u59cb\u7ed3\u679c\u53cc\u8868\u6d4f\u89c8\u3002",
  curatedTab: "\u7b5b\u9009\u7ed3\u679c",
  rawTab: "\u539f\u59cb\u7ed3\u679c",
  keywordLabel: "keyword",
  keywordPlaceholder: "\u8f93\u5165\u5173\u952e\u8bcd\uff0c\u6309\u5f53\u524d\u8868\u53ef\u89c1\u6587\u672c\u5b57\u6bb5\u68c0\u7d22",
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

type ColumnDefinition = {
  key: ItemSortField;
  label: string;
  defaultVisible: boolean;
  width?: number;
  render: (item: ResultItemRecord) => ReactNode;
};

type ColumnWidthsByTable = Record<ItemTable, Partial<Record<ItemSortField, number>>>;

type ColumnResizeState = {
  table: ItemTable;
  key: ItemSortField;
  startX: number;
  startWidth: number;
  minWidth: number;
};

function truncate(value: unknown, maxLength = 120) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!text) return "--";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function stringifyValue(value: unknown) {
  if (value == null) return "[]";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const CURATED_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "id", label: "id", defaultVisible: false, width: 88, render: (item) => (item as CuratedItemRecord).id },
  { key: "run_id", label: "run_id", defaultVisible: false, width: 88, render: (item) => (item as CuratedItemRecord).run_id },
  {
    key: "dedupe_key",
    label: "dedupe_key",
    defaultVisible: false,
    width: 180,
    render: (item) => {
      const value = (item as CuratedItemRecord).dedupe_key;
      return <span title={value}>{truncate(value, 40)}</span>;
    },
  },
  {
    key: "level",
    label: "level",
    defaultVisible: true,
    width: 90,
    render: (item) => {
      const value = (item as CuratedItemRecord).level;
      return <span className={`badge ${String(value || "").toLowerCase()}`}>{value || "--"}</span>;
    },
  },
  { key: "score", label: "score", defaultVisible: true, width: 90, render: (item) => (item as CuratedItemRecord).score },
  {
    key: "title",
    label: "title",
    defaultVisible: true,
    width: 220,
    render: (item) => {
      const value = (item as CuratedItemRecord).title;
      return <span title={value}>{truncate(value, 72)}</span>;
    },
  },
  {
    key: "summary_zh",
    label: "summary_zh",
    defaultVisible: true,
    width: 260,
    render: (item) => {
      const value = (item as CuratedItemRecord).summary_zh;
      return <span title={value}>{truncate(value, 120)}</span>;
    },
  },
  {
    key: "excerpt",
    label: "excerpt",
    defaultVisible: false,
    width: 260,
    render: (item) => {
      const value = (item as CuratedItemRecord).excerpt;
      return <span title={value}>{truncate(value, 120)}</span>;
    },
  },
  {
    key: "is_zero_cost",
    label: "is_zero_cost",
    defaultVisible: false,
    width: 110,
    render: (item) => (((item as CuratedItemRecord).is_zero_cost ? 1 : 0).toString()),
  },
  {
    key: "source_url",
    label: "source_url",
    defaultVisible: true,
    width: 240,
    render: (item) => {
      const value = (item as CuratedItemRecord).source_url;
      return value ? (
        <a href={value} target="_blank" rel="noreferrer" title={value}>
          {truncate(value, 56)}
        </a>
      ) : (
        "--"
      );
    },
  },
  {
    key: "author",
    label: "author",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as CuratedItemRecord).author || "--",
  },
  {
    key: "created_at_x",
    label: "created_at_x",
    defaultVisible: true,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as CuratedItemRecord).created_at_x),
  },
  {
    key: "reasons_json",
    label: "reasons_json",
    defaultVisible: false,
    width: 280,
    render: (item) => {
      const value = stringifyValue((item as CuratedItemRecord).reasons_json);
      return <span title={value}>{truncate(value, 140)}</span>;
    },
  },
  {
    key: "rule_set_id",
    label: "rule_set_id",
    defaultVisible: false,
    width: 110,
    render: (item) => (item as CuratedItemRecord).rule_set_id ?? "--",
  },
  {
    key: "state",
    label: "state",
    defaultVisible: false,
    width: 120,
    render: (item) => (item as CuratedItemRecord).state || "--",
  },
];

const RAW_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "id", label: "id", defaultVisible: false, width: 88, render: (item) => (item as RawItemRecord).id },
  { key: "run_id", label: "run_id", defaultVisible: false, width: 88, render: (item) => (item as RawItemRecord).run_id },
  {
    key: "tweet_id",
    label: "tweet_id",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as RawItemRecord).tweet_id || "--",
  },
  {
    key: "canonical_url",
    label: "canonical_url",
    defaultVisible: true,
    width: 240,
    render: (item) => {
      const value = (item as RawItemRecord).canonical_url;
      return value ? (
        <a href={value} target="_blank" rel="noreferrer" title={value}>
          {truncate(value, 56)}
        </a>
      ) : (
        "--"
      );
    },
  },
  {
    key: "author",
    label: "author",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as RawItemRecord).author || "--",
  },
  {
    key: "text",
    label: "text",
    defaultVisible: true,
    width: 280,
    render: (item) => {
      const value = (item as RawItemRecord).text;
      return <span title={value}>{truncate(value, 140)}</span>;
    },
  },
  {
    key: "created_at_x",
    label: "created_at_x",
    defaultVisible: true,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as RawItemRecord).created_at_x),
  },
  { key: "views", label: "views", defaultVisible: true, width: 90, render: (item) => (item as RawItemRecord).views },
  { key: "likes", label: "likes", defaultVisible: true, width: 90, render: (item) => (item as RawItemRecord).likes },
  { key: "replies", label: "replies", defaultVisible: true, width: 90, render: (item) => (item as RawItemRecord).replies },
  { key: "retweets", label: "retweets", defaultVisible: true, width: 90, render: (item) => (item as RawItemRecord).retweets },
  {
    key: "query_name",
    label: "query_name",
    defaultVisible: false,
    width: 140,
    render: (item) => (item as RawItemRecord).query_name || "--",
  },
  {
    key: "fetched_at",
    label: "fetched_at",
    defaultVisible: false,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as RawItemRecord).fetched_at),
  },
];

const COLUMN_DEFINITIONS_BY_TABLE: Record<ItemTable, ColumnDefinition[]> = {
  curated: CURATED_COLUMN_DEFINITIONS,
  raw: RAW_COLUMN_DEFINITIONS,
};

const DEFAULT_VISIBLE_COLUMNS_BY_TABLE: Record<ItemTable, ItemSortField[]> = {
  curated: CURATED_COLUMN_DEFINITIONS.filter((column) => column.defaultVisible).map((column) => column.key),
  raw: RAW_COLUMN_DEFINITIONS.filter((column) => column.defaultVisible).map((column) => column.key),
};

function orderVisibleColumns(table: ItemTable, keys: Iterable<ItemSortField>) {
  const allowed = COLUMN_DEFINITIONS_BY_TABLE[table].map((column) => column.key);
  const keySet = new Set(keys);
  return allowed.filter((key) => keySet.has(key));
}

function normalizeVisibleColumnsForTable(table: ItemTable, value: unknown): ItemSortField[] {
  if (!Array.isArray(value)) {
    return DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table];
  }
  const allowed = new Set(COLUMN_DEFINITIONS_BY_TABLE[table].map((column) => column.key));
  const selected = value.filter((entry): entry is ItemSortField => typeof entry === "string" && allowed.has(entry as ItemSortField));
  const ordered = orderVisibleColumns(table, selected);
  return ordered.length ? ordered : DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table];
}

function readVisibleColumns(table: ItemTable) {
  if (typeof window === "undefined") {
    return DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table];
  }
  const raw = window.localStorage.getItem(RESULTS_VISIBLE_COLUMNS_KEY);
  if (raw == null) {
    return DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table];
  }
  try {
    return normalizeVisibleColumnsForTable(table, JSON.parse(raw));
  } catch {
    return DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table];
  }
}

function writeVisibleColumns(visibleColumns: ItemSortField[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RESULTS_VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
}

function emptyColumnWidths(): ColumnWidthsByTable {
  return {
    curated: {},
    raw: {},
  };
}

function normalizeColumnWidthsForTable(table: ItemTable, value: unknown): Partial<Record<ItemSortField, number>> {
  if (value == null || typeof value !== "object") {
    return {};
  }
  const allowed = new Set(COLUMN_DEFINITIONS_BY_TABLE[table].map((column) => column.key));
  const result: Partial<Record<ItemSortField, number>> = {};
  for (const [key, rawWidth] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key as ItemSortField)) {
      continue;
    }
    if (typeof rawWidth !== "number" || !Number.isFinite(rawWidth) || rawWidth <= 0) {
      continue;
    }
    result[key as ItemSortField] = Math.round(rawWidth);
  }
  return result;
}

function readColumnWidths(): ColumnWidthsByTable {
  if (typeof window === "undefined") {
    return emptyColumnWidths();
  }
  const raw = window.localStorage.getItem(RESULTS_COLUMN_WIDTHS_KEY);
  if (!raw) {
    return emptyColumnWidths();
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      curated: normalizeColumnWidthsForTable("curated", parsed?.curated),
      raw: normalizeColumnWidthsForTable("raw", parsed?.raw),
    };
  } catch {
    return emptyColumnWidths();
  }
}

function writeColumnWidths(widths: ColumnWidthsByTable) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RESULTS_COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

function getColumnMinWidth(column: ColumnDefinition) {
  const width = column.width ?? 160;
  if (width <= 90) return 72;
  if (width <= 120) return 88;
  if (width <= 160) return 120;
  return 140;
}

function resolveColumnWidth(column: ColumnDefinition, storedWidth?: number) {
  const minWidth = getColumnMinWidth(column);
  const width = typeof storedWidth === "number" && Number.isFinite(storedWidth) ? storedWidth : column.width ?? minWidth;
  return Math.max(minWidth, Math.round(width));
}

function renderSortButtons(
  field: ItemSortField,
  activeField: ItemSortField,
  activeDir: SortDirection,
  onSort: (field: ItemSortField, dir: SortDirection) => void,
) {
  return (
    <span className="results-sort-controls results-sort-controls-inline">
      <button
        type="button"
        className={`ghost results-sort-button${activeField === field && activeDir === "asc" ? " active" : ""}`}
        aria-label={`${field} asc`}
        onClick={() => onSort(field, "asc")}
      >
        {"\u2191"}
      </button>
      <button
        type="button"
        className={`ghost results-sort-button${activeField === field && activeDir === "desc" ? " active" : ""}`}
        aria-label={`${field} desc`}
        onClick={() => onSort(field, "desc")}
      >
        {"\u2193"}
      </button>
    </span>
  );
}

export function ResultsPage() {
  const [table, setTable] = useState<ItemTable>("curated");
  const [items, setItems] = useState<ResultItemRecord[]>([]);
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ItemSortField[]>(() => readVisibleColumns("curated"));
  const [columnWidthsByTable, setColumnWidthsByTable] = useState<ColumnWidthsByTable>(() => readColumnWidths());
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ItemSortField>("id");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const resizeStateRef = useRef<ColumnResizeState | null>(null);

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
  const showSelectAllMatching = !allMatchingSelected && allSelectedOnPage && total > items.length;
  const tableMinWidth = Math.max(
    960,
    RESULTS_SELECT_COLUMN_WIDTH +
      RESULTS_OPERATION_COLUMN_WIDTH +
      resolvedVisibleColumnDefinitions.reduce((sum, column) => sum + column.currentWidth, 0),
  );
  const tableName = TABLE_NAMES[table];
  const dedupeConfirmText = `\u786e\u5b9a\u5bf9\u6574\u4e2a ${tableName} \u8868\u6267\u884c\u53bb\u91cd\u5417\uff1f\u6b64\u64cd\u4f5c\u4f1a\u5220\u9664\u91cd\u590d\u884c\u3002`;
  const fullTableHint = `\u201c\u5168\u8868\u53bb\u91cd\u201d\u4f5c\u7528\u4e8e\u6574\u5f20 ${tableName} \u8868`;
  const batchDeleteConfirm = allMatchingSelected
    ? "\u786e\u5b9a\u786c\u5220\u9664\u5f53\u524d\u7b5b\u9009\u7ed3\u679c\u7684\u5168\u90e8\u8bb0\u5f55\u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u6062\u590d\u3002"
    : "\u786e\u5b9a\u786c\u5220\u9664\u5df2\u52fe\u9009\u7684\u8bb0\u5f55\u5417\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u6062\u590d\u3002";

  useEffect(() => {
    writeVisibleColumns(visibleColumns);
  }, [visibleColumns]);

  useEffect(() => {
    writeColumnWidths(columnWidthsByTable);
  }, [columnWidthsByTable]);

  useEffect(() => {
    function updateResizedColumnWidth(clientX: number | undefined) {
      const resizeState = resizeStateRef.current;
      if (!resizeState || typeof clientX !== "number" || Number.isNaN(clientX)) {
        return;
      }
      const nextWidth = Math.max(
        resizeState.minWidth,
        Math.round(resizeState.startWidth + (clientX - resizeState.startX)),
      );
      setColumnWidthsByTable((current) => {
        const tableWidths = current[resizeState.table];
        if (tableWidths?.[resizeState.key] === nextWidth) {
          return current;
        }
        return {
          ...current,
          [resizeState.table]: {
            ...tableWidths,
            [resizeState.key]: nextWidth,
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

  async function load(options?: {
    table?: ItemTable;
    page?: number;
    keyword?: string;
    sortBy?: ItemSortField;
    sortDir?: SortDirection;
    preserveMessage?: boolean;
    allowPageFallback?: boolean;
    clearSelection?: boolean;
  }) {
    const nextTable = options?.table ?? table;
    const nextPage = options?.page ?? page;
    const nextKeyword = options?.keyword ?? appliedKeyword;
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
          });
          nextItems = fallback.items || [];
          totalItems = fallback.total || 0;
          currentPage = fallback.page || fallbackPage;
        }
      }

      setItems(nextItems);
      setTotal(totalItems);
      setPage(currentPage);
      setActiveRowId((current) => (current != null && nextItems.some((item) => item.id === current) ? current : null));
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
    void load({ table: "curated", page: 1, keyword: appliedKeyword, sortBy, sortDir });
    // initial page load only; refresh and sorting are explicit actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSort(field: ItemSortField, direction: SortDirection) {
    setSortBy(field);
    setSortDir(direction);
    await load({ table, page, sortBy: field, sortDir: direction });
  }

  async function handleRefresh() {
    const nextKeyword = keywordInput.trim();
    const keywordChanged = nextKeyword !== appliedKeyword;
    setAppliedKeyword(nextKeyword);
    await load({
      table,
      page: keywordChanged ? 1 : page,
      keyword: nextKeyword,
      clearSelection: keywordChanged,
    });
  }

  async function handleTableSwitch(nextTable: ItemTable) {
    if (nextTable === table) {
      return;
    }
    setFieldMenuOpen(false);
    const targetColumns = COLUMN_DEFINITIONS_BY_TABLE[nextTable].map((column) => column.key);
    const hasInvalidVisibleColumns = visibleColumns.some((column) => !targetColumns.includes(column));
    const nextVisibleColumns = hasInvalidVisibleColumns
      ? DEFAULT_VISIBLE_COLUMNS_BY_TABLE[nextTable]
      : normalizeVisibleColumnsForTable(nextTable, visibleColumns);
    const nextSortBy = sortFieldSet.has(sortBy) && targetColumns.includes(sortBy) ? sortBy : "id";
    const nextSortDir = sortFieldSet.has(sortBy) && targetColumns.includes(sortBy) ? sortDir : "desc";

    setTable(nextTable);
    setVisibleColumns(nextVisibleColumns);
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setSelectedIds([]);
    setAllMatchingSelected(false);
    await load({
      table: nextTable,
      page,
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
      await load({ table, preserveMessage: true, allowPageFallback: true, clearSelection: allMatchingSelected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  async function handleBatchDelete() {
    if (!selectedCount) {
      setError(TEXT.chooseFirst);
      return;
    }
    if (!window.confirm(batchDeleteConfirm)) {
      return;
    }
    setError("");
    try {
      const result = allMatchingSelected
        ? await deleteItems({ mode: "all_matching", keyword: appliedKeyword || undefined, table })
        : await deleteItems({ ids: [...selectedIds], table });
      setMessage(`\u5df2\u5220\u9664 ${result.deleted} \u6761\u8bb0\u5f55`);
      await load({ table, preserveMessage: true, allowPageFallback: true, clearSelection: true });
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
      await load({ table, preserveMessage: true, allowPageFallback: true, clearSelection: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  function handleSelectAllMatching() {
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
    setVisibleColumns((current) => {
      if (current.includes(key)) {
        return current.filter((field) => field !== key);
      }
      return orderVisibleColumns(table, [...current, key]);
    });
  }

  function handleRestoreDefaultColumns() {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS_BY_TABLE[table]);
  }

  function startColumnResize(column: ColumnDefinition & { currentWidth: number }, clientX: number | undefined) {
    if (typeof clientX !== "number" || Number.isNaN(clientX)) {
      return;
    }
    resizeStateRef.current = {
      table,
      key: column.key,
      startX: clientX,
      startWidth: column.currentWidth,
      minWidth: getColumnMinWidth(column),
    };
    setIsResizingColumn(true);
    setResizingColumnId(`${table}:${column.key}`);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  return (
    <div className="card results-page" data-testid="results-page">
      <ResultsPageHeader
        title={TEXT.title}
        subtitle={TEXT.subtitle}
        curatedLabel={TEXT.curatedTab}
        rawLabel={TEXT.rawTab}
        refreshLabel={TEXT.refresh}
        table={table}
        loading={loading}
        onSwitchTable={(nextTable) => void handleTableSwitch(nextTable)}
        onRefresh={() => void handleRefresh()}
      />

      <section className="results-filter-layer" data-testid="results-filter-layer">
        <label className="field">
          <span>{TEXT.keywordLabel}</span>
          <input
            placeholder={TEXT.keywordPlaceholder}
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            aria-label={TEXT.keywordLabel}
          />
        </label>
      </section>

      <ResultsTableManager
        table={table}
        tableName={tableName}
        total={total}
        selectedCount={selectedCount}
        allMatchingSelected={allMatchingSelected}
        showSelectAllMatching={showSelectAllMatching}
        fieldsLabel={TEXT.fields}
        resetColumnsLabel={TEXT.resetColumns}
        batchDeleteLabel={TEXT.batchDelete}
        dedupeLabel={TEXT.dedupe}
        clearSelectionLabel={TEXT.clearSelection}
        loading={loading}
        fieldMenuOpen={fieldMenuOpen}
        onSelectAllMatching={handleSelectAllMatching}
        onClearSelection={handleClearSelection}
        onToggleFields={() => setFieldMenuOpen((current) => !current)}
        onRestoreDefaultColumns={handleRestoreDefaultColumns}
        onBatchDelete={() => void handleBatchDelete()}
        onDedupe={() => void handleDedupe()}
      />

      <section className="results-main-workspace" data-testid="results-main-workspace">
        <div className="results-table-pane" data-testid="results-table-pane">
          {fieldMenuOpen && (
            <div className="results-field-menu">
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
          )}

          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert success">{message}</div>}

          {showSelectAllMatching && (
            <div className="results-selection-banner row">
              <span className="kv">{`${TEXT.selectAllMatchingPrefix} ${items.length} \u6761\u3002`}</span>
            </div>
          )}

          {allMatchingSelected && total > 0 && (
            <div className="results-selection-banner row">
              <span className="kv">{`${TEXT.allMatchingSelected} ${total} \u6761\u3002`}</span>
            </div>
          )}

          <div className="results-meta row">
            <span className="kv">{`loaded=${items.length}`}</span>
            <span className="kv">{`page=${page}/${totalPages}`}</span>
            <span className="kv">{`sort=${sortBy} ${sortDir}`}</span>
            <span className="kv">{`page-size=${pageSize}`}</span>
            <span className="kv">{`selected-on-page=${selectedOnPage}`}</span>
            <span className="kv">{fullTableHint}</span>
          </div>

          <div className={`results-table-wrap${isResizingColumn ? " dragging" : ""}`}>
            <table className="table results-table" style={{ marginTop: 10, minWidth: tableMinWidth, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: RESULTS_SELECT_COLUMN_WIDTH }} />
                {resolvedVisibleColumnDefinitions.map((column) => (
                  <col key={`results-col-${table}-${column.key}`} style={{ width: column.currentWidth }} />
                ))}
                <col style={{ width: RESULTS_OPERATION_COLUMN_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="results-th-cell" style={{ width: RESULTS_SELECT_COLUMN_WIDTH, minWidth: RESULTS_SELECT_COLUMN_WIDTH }}>
                    <label className="row">
                      <input
                        type="checkbox"
                        aria-label={TEXT.selectPage}
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAll}
                      />
                      <span>{TEXT.selectPage}</span>
                    </label>
                  </th>
                  {resolvedVisibleColumnDefinitions.map((column) => (
                    <th
                      key={column.key}
                      className="results-th-cell"
                      style={{ width: column.currentWidth, minWidth: column.currentWidth }}
                    >
                      <div className="results-th">
                        <span className="results-th-label">{column.label}</span>
                        {renderSortButtons(column.key, sortBy, sortDir, (field, direction) => {
                          void handleSort(field, direction);
                        })}
                      </div>
                      <div
                        className={`results-column-resizer${resizingColumnId === `${table}:${column.key}` ? " dragging" : ""}`}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`resize-column-${column.key}`}
                        onPointerDown={(event) => {
                          startColumnResize(column, event.clientX);
                          event.preventDefault();
                        }}
                        onMouseDown={(event) => {
                          startColumnResize(column, event.clientX);
                          event.preventDefault();
                        }}
                      />
                    </th>
                  ))}
                  <th className="results-th-cell" style={{ width: RESULTS_OPERATION_COLUMN_WIDTH, minWidth: RESULTS_OPERATION_COLUMN_WIDTH }}>
                    {TEXT.operation}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={activeRowId === item.id ? "active" : ""}
                    data-row-active={activeRowId === item.id ? "true" : "false"}
                    onClick={() => setActiveRowId(item.id)}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`select-item-${item.id}`}
                        checked={allMatchingSelected || selectedIds.includes(item.id)}
                        onChange={() => {
                          setActiveRowId(item.id);
                          toggleSelected(item.id);
                        }}
                      />
                    </td>
                    {resolvedVisibleColumnDefinitions.map((column) => (
                      <td key={`${item.id}-${column.key}`}>{column.render(item)}</td>
                    ))}
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="danger"
                          aria-label={`delete-item-${item.id}`}
                          onClick={() => void handleDeleteOne(item)}
                          disabled={loading}
                        >
                          {TEXT.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="jobs-pagination">
              <span className="kv">{`\u5171 ${total} \u6761`}</span>
              <div className="row">
                <button
                  type="button"
                  className="ghost"
                  aria-label="results-prev-page"
                  disabled={loading || page <= 1}
                  onClick={() => void load({ table, page: page - 1 })}
                >
                  {TEXT.prevPage}
                </button>
                <span className="kv">{`\u7b2c ${page} / ${totalPages} \u9875`}</span>
                <button
                  type="button"
                  className="ghost"
                  aria-label="results-next-page"
                  disabled={loading || page >= totalPages}
                  onClick={() => void load({ table, page: page + 1 })}
                >
                  {TEXT.nextPage}
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="searching">
              <span className="spinner" />
              {TEXT.loading}
            </div>
          )}
          {!loading && items.length === 0 && <div className="drawer-empty">{TEXT.empty}</div>}
        </div>

        <aside className="results-detail-rail" data-testid="results-detail-rail">
          <ResultsDetailRail item={activeItem} table={table} />
        </aside>
      </section>
    </div>
  );
}
