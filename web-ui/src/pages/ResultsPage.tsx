import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  listItems,
  type CuratedItemRecord,
  type ItemSortField,
  type ItemTable,
  type ResultsFilterConditionNode,
  type ResultsFilterConditionOperator,
  type ResultsFilterField,
  type ResultsFilterGroupNode,
  type ResultsFilterNode,
  type ResultsFilterRelation,
  type RawItemRecord,
  type ResultItemRecord,
  type SortDirection,
} from "../api";
import { ResultsDetailRail } from "./results/ResultsDetailRail";
import { ResultsPageHeader } from "./results/ResultsPageHeader";
import { ResultsTableManager } from "./results/ResultsTableManager";
import { TagPills } from "../components/TagPills";
import { formatUtcPlus8Time } from "../time";

const RESULTS_COLUMN_WIDTHS_KEY = "results.columnWidths.v1";
const PAGE_SIZE = 100;
const RESULTS_SELECT_COLUMN_WIDTH = 48;
const RESULTS_SPLIT_LAYOUT_BREAKPOINT = 1180;
const RESULTS_MIN_TABLE_PANE_WIDTH = 720;
const RESULTS_MIN_DETAIL_PANE_WIDTH = 380;
const RESULTS_RESIZER_WIDTH = 20;
const RESULTS_FILTER_STATE_KEY = "results.filters.v1";

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
  leftKey: ItemSortField;
  rightKey: ItemSortField;
  startX: number;
  leftStartWidth: number;
  rightStartWidth: number;
  leftMinWidth: number;
  rightMinWidth: number;
};

type ResultsFilterFieldKind = "text" | "number" | "datetime" | "boolean" | "tags";

type ResultsFilterFieldOption = {
  field: ResultsFilterField;
  label: string;
  kind: ResultsFilterFieldKind;
};

type ResultsFilterState = {
  keywordInput: string;
  appliedKeyword: string;
  draftTree: ResultsFilterGroupNode;
  appliedTree: ResultsFilterGroupNode;
  advancedOpen: boolean;
};

const EMPTY_RESULTS_FILTER_TREE: ResultsFilterGroupNode = {
  type: "group",
  relation: "AND",
  children: [],
};

const RESULTS_FILTER_FIELD_OPTIONS: Record<ItemTable, ResultsFilterFieldOption[]> = {
  curated: [
    { field: "id", label: "id", kind: "number" },
    { field: "run_id", label: "run_id", kind: "number" },
    { field: "dedupe_key", label: "dedupe_key", kind: "text" },
    { field: "level", label: "level", kind: "text" },
    { field: "score", label: "score", kind: "number" },
    { field: "title", label: "title", kind: "text" },
    { field: "summary_zh", label: "summary_zh", kind: "text" },
    { field: "excerpt", label: "excerpt", kind: "text" },
    { field: "is_zero_cost", label: "is_zero_cost", kind: "boolean" },
    { field: "source_url", label: "source_url", kind: "text" },
    { field: "author_name", label: "author_name", kind: "text" },
    { field: "author", label: "author", kind: "text" },
    { field: "created_at_x", label: "created_at_x", kind: "datetime" },
    { field: "views", label: "views", kind: "number" },
    { field: "likes", label: "likes", kind: "number" },
    { field: "replies", label: "replies", kind: "number" },
    { field: "retweets", label: "retweets", kind: "number" },
    { field: "fetched_at", label: "fetched_at", kind: "datetime" },
    { field: "tags", label: "tags", kind: "tags" },
    { field: "reasons_json", label: "reasons_json", kind: "text" },
    { field: "rule_set_id", label: "rule_set_id", kind: "number" },
    { field: "state", label: "state", kind: "text" },
  ],
  raw: [
    { field: "id", label: "id", kind: "number" },
    { field: "run_id", label: "run_id", kind: "number" },
    { field: "tweet_id", label: "tweet_id", kind: "text" },
    { field: "canonical_url", label: "canonical_url", kind: "text" },
    { field: "author_name", label: "author_name", kind: "text" },
    { field: "author", label: "author", kind: "text" },
    { field: "text", label: "text", kind: "text" },
    { field: "created_at_x", label: "created_at_x", kind: "datetime" },
    { field: "views", label: "views", kind: "number" },
    { field: "likes", label: "likes", kind: "number" },
    { field: "replies", label: "replies", kind: "number" },
    { field: "retweets", label: "retweets", kind: "number" },
    { field: "query_name", label: "query_name", kind: "text" },
    { field: "fetched_at", label: "fetched_at", kind: "datetime" },
    { field: "tags", label: "tags", kind: "tags" },
  ],
};

const TEXT_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "contains", label: "包含" },
  { value: "not_contains", label: "不包含" },
  { value: "equals", label: "等于" },
  { value: "not_equals", label: "不等于" },
  { value: "starts_with", label: "开头是" },
  { value: "ends_with", label: "结尾是" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
  { value: "length_gt", label: "长度 >" },
  { value: "length_gte", label: "长度 >=" },
  { value: "length_lt", label: "长度 <" },
  { value: "length_lte", label: "长度 <=" },
  { value: "length_between", label: "长度区间" },
];

const NUMBER_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "eq", label: "等于" },
  { value: "neq", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "between", label: "区间" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

const DATETIME_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "on_or_after", label: "在此之后" },
  { value: "on_or_before", label: "在此之前" },
  { value: "between", label: "区间" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

const BOOLEAN_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "is_true", label: "是" },
  { value: "is_false", label: "否" },
];

const TAG_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "has_any", label: "包含任一标签" },
  { value: "has_all", label: "包含全部标签" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

const DEFAULT_RESULTS_FILTER_STATE: ResultsFilterState = {
  keywordInput: "",
  appliedKeyword: "",
  draftTree: EMPTY_RESULTS_FILTER_TREE,
  appliedTree: EMPTY_RESULTS_FILTER_TREE,
  advancedOpen: false,
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

function formatAuthorDisplay(authorName?: string | null, author?: string | null) {
  const name = String(authorName || "").trim();
  const handle = String(author || "").trim();
  if (name && handle) return `${name} @${handle.replace(/^@+/, "")}`;
  if (name) return name;
  if (handle) return `@${handle.replace(/^@+/, "")}`;
  return "--";
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
    key: "author_name",
    label: "author_name",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as CuratedItemRecord).author_name || "--",
  },
  {
    key: "author",
    label: "author",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as CuratedItemRecord).author || "--",
  },
  {
    key: "tags",
    label: "tags",
    defaultVisible: true,
    width: 180,
    render: (item) => <TagPills tags={(item as CuratedItemRecord).tags} />,
  },
  {
    key: "created_at_x",
    label: "created_at_x",
    defaultVisible: true,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as CuratedItemRecord).created_at_x),
  },
  { key: "views", label: "views", defaultVisible: true, width: 90, render: (item) => (item as CuratedItemRecord).views },
  { key: "likes", label: "likes", defaultVisible: true, width: 90, render: (item) => (item as CuratedItemRecord).likes },
  { key: "replies", label: "replies", defaultVisible: true, width: 90, render: (item) => (item as CuratedItemRecord).replies },
  { key: "retweets", label: "retweets", defaultVisible: true, width: 90, render: (item) => (item as CuratedItemRecord).retweets },
  {
    key: "fetched_at",
    label: "fetched_at",
    defaultVisible: true,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as CuratedItemRecord).fetched_at),
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
    defaultVisible: false,
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
    key: "author_name",
    label: "author_name",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as RawItemRecord).author_name || "--",
  },
  {
    key: "author",
    label: "author",
    defaultVisible: true,
    width: 140,
    render: (item) => (item as RawItemRecord).author || "--",
  },
  {
    key: "tags",
    label: "tags",
    defaultVisible: true,
    width: 180,
    render: (item) => <TagPills tags={(item as RawItemRecord).tags} />,
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
    defaultVisible: true,
    width: 220,
    render: (item) => formatUtcPlus8Time((item as RawItemRecord).fetched_at),
  },
];

const COLUMN_DEFINITIONS_BY_TABLE: Record<ItemTable, ColumnDefinition[]> = {
  curated: CURATED_COLUMN_DEFINITIONS,
  raw: RAW_COLUMN_DEFINITIONS,
};

const DEFAULT_VISIBLE_COLUMNS_BY_TABLE: Record<ItemTable, ItemSortField[]> = {
  curated: ["level", "score", "title", "source_url", "author_name", "tags", "created_at_x", "views", "likes", "replies", "fetched_at"],
  raw: ["author_name", "tags", "text", "created_at_x", "views", "likes", "replies", "fetched_at"],
};

function orderVisibleColumns(table: ItemTable, keys: Iterable<ItemSortField>) {
  const allowed = COLUMN_DEFINITIONS_BY_TABLE[table].map((column) => column.key);
  const keySet = new Set(keys);
  if (table === "curated" && keySet.has("author") && !keySet.has("author_name")) {
    keySet.add("author_name");
  }
  if (table === "curated" && keySet.has("author_name") && !keySet.has("author")) {
    keySet.add("author");
  }
  return allowed.filter((key) => keySet.has(key));
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

function getCellContentClass(field: ItemSortField) {
  if (["title", "summary_zh", "excerpt", "text"].includes(field)) {
    return "results-cell-content results-cell-content-text";
  }
  if (["source_url", "canonical_url"].includes(field)) {
    return "results-cell-content results-cell-content-link";
  }
  if (["id", "run_id", "score", "views", "likes", "replies", "retweets", "rule_set_id"].includes(field)) {
    return "results-cell-content results-cell-content-compact";
  }
  if (field === "level") {
    return "results-cell-content results-cell-content-badge";
  }
  return "results-cell-content results-cell-content-meta";
}

function createEmptyResultsFilterTree(): ResultsFilterGroupNode {
  return {
    type: "group",
    relation: "AND",
    children: [],
  };
}

function createDefaultResultsFilterState(): ResultsFilterState {
  return {
    keywordInput: "",
    appliedKeyword: "",
    draftTree: createEmptyResultsFilterTree(),
    appliedTree: createEmptyResultsFilterTree(),
    advancedOpen: false,
  };
}

function cloneResultsFilterNode(node: ResultsFilterNode): ResultsFilterNode {
  if (node.type === "group") {
    return {
      type: "group",
      relation: node.relation === "OR" ? "OR" : "AND",
      children: Array.isArray(node.children) ? node.children.map((child) => cloneResultsFilterNode(child)) : [],
    };
  }
  return {
    type: "condition",
    field: node.field,
    operator: node.operator,
    ...(node.value !== undefined ? { value: node.value } : {}),
    ...(node.values ? { values: [...node.values] } : {}),
    ...(node.min !== undefined ? { min: node.min } : {}),
    ...(node.max !== undefined ? { max: node.max } : {}),
  };
}

function cloneResultsFilterTree(tree?: ResultsFilterGroupNode | null): ResultsFilterGroupNode {
  if (!tree || tree.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return cloneResultsFilterNode(tree) as ResultsFilterGroupNode;
}

function createFilterCondition(field: ResultsFilterField, kind: ResultsFilterFieldKind): ResultsFilterConditionNode {
  if (kind === "number") {
    return { type: "condition", field, operator: "gte", value: "" };
  }
  if (kind === "datetime") {
    return { type: "condition", field, operator: "on_or_after", value: "" };
  }
  if (kind === "boolean") {
    return { type: "condition", field, operator: "is_true" };
  }
  if (kind === "tags") {
    return { type: "condition", field, operator: "has_any", values: [] };
  }
  return { type: "condition", field, operator: "contains", value: "" };
}

function getFilterFieldOption(table: ItemTable, field: ResultsFilterField) {
  return RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === field) ?? RESULTS_FILTER_FIELD_OPTIONS[table][0];
}

function getFilterOperatorOptions(kind: ResultsFilterFieldKind) {
  if (kind === "number") return NUMBER_FILTER_OPERATORS;
  if (kind === "datetime") return DATETIME_FILTER_OPERATORS;
  if (kind === "boolean") return BOOLEAN_FILTER_OPERATORS;
  if (kind === "tags") return TAG_FILTER_OPERATORS;
  return TEXT_FILTER_OPERATORS;
}

function getDefaultFilterOperator(kind: ResultsFilterFieldKind): ResultsFilterConditionOperator {
  return getFilterOperatorOptions(kind)[0]?.value ?? "contains";
}

function isResultsFilterNode(value: unknown): value is ResultsFilterNode {
  return Boolean(value) && typeof value === "object" && ("type" in (value as Record<string, unknown>));
}

function parseFilterTagValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterOperatorNeedsRange(operator: ResultsFilterConditionOperator) {
  return operator === "between" || operator === "length_between";
}

function filterOperatorNeedsArrayValue(operator: ResultsFilterConditionOperator) {
  return operator === "has_any" || operator === "has_all";
}

function filterOperatorNeedsSingleValue(operator: ResultsFilterConditionOperator) {
  return !["is_empty", "is_not_empty", "is_true", "is_false", "between", "length_between", "has_any", "has_all"].includes(operator);
}

function coerceFilterConditionForUi(table: ItemTable, node: unknown): ResultsFilterConditionNode | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const source = node as Partial<ResultsFilterConditionNode>;
  const field = String(source.field ?? "").trim() as ResultsFilterField;
  const fieldOption = RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === field);
  if (!fieldOption) {
    return null;
  }
  const operatorOptions = getFilterOperatorOptions(fieldOption.kind);
  const operator = operatorOptions.some((item) => item.value === source.operator)
    ? (source.operator as ResultsFilterConditionOperator)
    : getDefaultFilterOperator(fieldOption.kind);
  const next: ResultsFilterConditionNode = {
    type: "condition",
    field: fieldOption.field,
    operator,
  };
  if (filterOperatorNeedsArrayValue(operator)) {
    next.values = parseFilterTagValues(source.values ?? source.value);
    return next;
  }
  if (filterOperatorNeedsRange(operator)) {
    next.min = source.min ?? "";
    next.max = source.max ?? "";
    return next;
  }
  if (filterOperatorNeedsSingleValue(operator)) {
    next.value = source.value ?? "";
  }
  return next;
}

function coerceFilterNodeForUi(table: ItemTable, node: unknown): ResultsFilterNode | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const source = node as Partial<ResultsFilterNode>;
  if (source.type === "group") {
    const children = Array.isArray(source.children)
      ? source.children.map((child) => coerceFilterNodeForUi(table, child)).filter((child): child is ResultsFilterNode => child != null)
      : [];
    return {
      type: "group",
      relation: source.relation === "OR" ? "OR" : "AND",
      children,
    };
  }
  return coerceFilterConditionForUi(table, source);
}

function filterTreeHasConditions(tree: ResultsFilterGroupNode) {
  return tree.children.some((child) => child.type === "condition" || filterTreeHasConditions(child));
}

function normalizeFilterTreeForTable(table: ItemTable, tree: ResultsFilterGroupNode): ResultsFilterGroupNode {
  const next = coerceFilterNodeForUi(table, tree);
  if (!next || next.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return next;
}

function sanitizeFilterTreeForSubmit(table: ItemTable, tree: ResultsFilterGroupNode): ResultsFilterGroupNode {
  function sanitizeNode(node: ResultsFilterNode): ResultsFilterNode | null {
    if (node.type === "group") {
      const children = node.children.map((child) => sanitizeNode(child)).filter((child): child is ResultsFilterNode => child != null);
      return {
        type: "group",
        relation: node.relation === "OR" ? "OR" : "AND",
        children,
      };
    }
    const fieldOption = RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === node.field);
    if (!fieldOption) {
      return null;
    }
    const operatorOptions = getFilterOperatorOptions(fieldOption.kind);
    const operator = operatorOptions.some((item) => item.value === node.operator)
      ? node.operator
      : getDefaultFilterOperator(fieldOption.kind);
    const next: ResultsFilterConditionNode = {
      type: "condition",
      field: fieldOption.field,
      operator,
    };
    if (filterOperatorNeedsArrayValue(operator)) {
      const values = parseFilterTagValues(node.values ?? node.value);
      if (!values.length) {
        return null;
      }
      next.values = values;
      return next;
    }
    if (filterOperatorNeedsRange(operator)) {
      const minimum = String(node.min ?? "").trim();
      const maximum = String(node.max ?? "").trim();
      if (!minimum || !maximum) {
        return null;
      }
      next.min = minimum;
      next.max = maximum;
      return next;
    }
    if (filterOperatorNeedsSingleValue(operator)) {
      const value = String(node.value ?? "").trim();
      if (!value) {
        return null;
      }
      next.value = value;
    }
    return next;
  }

  const sanitized = sanitizeNode(tree);
  if (!sanitized || sanitized.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return sanitized;
}

function createResultsFilterTreeTextValue(values?: string[]) {
  return (values ?? []).join(", ");
}

function getFilterGroupAtPath(root: ResultsFilterGroupNode, path: number[]) {
  let current: ResultsFilterGroupNode = root;
  for (const index of path) {
    const child = current.children[index];
    if (!child || child.type !== "group") {
      return null;
    }
    current = child;
  }
  return current;
}

function getFilterParentAtPath(root: ResultsFilterGroupNode, path: number[]) {
  if (!path.length) {
    return null;
  }
  const parentPath = path.slice(0, -1);
  const parent = getFilterGroupAtPath(root, parentPath);
  if (!parent) {
    return null;
  }
  return {
    parent,
    index: path[path.length - 1]!,
  };
}

function readResultsFilterState(): Record<ItemTable, ResultsFilterState> {
  const fallback = {
    curated: createDefaultResultsFilterState(),
    raw: createDefaultResultsFilterState(),
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(RESULTS_FILTER_STATE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ItemTable, Partial<ResultsFilterState> & { filterTree?: ResultsFilterGroupNode }>>;
    const hydrate = (table: ItemTable): ResultsFilterState => {
      const source = parsed?.[table] || {};
      const sharedTree = isResultsFilterNode(source.filterTree) ? source.filterTree : createEmptyResultsFilterTree();
      const rawDraftTree = normalizeFilterTreeForTable(
        table,
        cloneResultsFilterTree((isResultsFilterNode(source.draftTree) ? source.draftTree : sharedTree) as ResultsFilterGroupNode),
      );
      const rawAppliedTree = normalizeFilterTreeForTable(
        table,
        cloneResultsFilterTree((isResultsFilterNode(source.appliedTree) ? source.appliedTree : sharedTree) as ResultsFilterGroupNode),
      );
      return {
        keywordInput: String(source.keywordInput ?? ""),
        appliedKeyword: String(source.appliedKeyword ?? ""),
        draftTree: rawDraftTree,
        appliedTree: sanitizeFilterTreeForSubmit(table, rawAppliedTree),
        advancedOpen: Boolean(source.advancedOpen),
      };
    };
    return {
      curated: hydrate("curated"),
      raw: hydrate("raw"),
    };
  } catch {
    return fallback;
  }
}

function writeResultsFilterState(value: Record<ItemTable, ResultsFilterState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESULTS_FILTER_STATE_KEY, JSON.stringify(value));
}

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
              {renderFilterGroup(draftFilterTree)}
            </div>
          ) : null}
        </div>
      </section>

      <section
        ref={workspaceLayoutRef}
        className={`results-main-workspace results-main-workspace-aligned${isResizingWorkspace ? " dragging" : ""}`}
        data-testid="results-main-workspace"
      >
        <div className="results-table-pane" data-testid="results-table-pane">
          <div className="results-table-strip flat-meta-strip" data-testid="results-table-headband">
            <div className="results-table-strip-copy">
              <div className="results-table-strip-title">{"当前结果表"}</div>
            </div>
            <div className="results-table-strip-meta workbench-pill-row">
              <span className="results-summary-pill workbench-pill">{`可见列 ${visibleColumnDefinitions.length} 个`}</span>
              <span className="results-summary-pill workbench-pill">{`当前表：${tableLabel}`}</span>
              <span className="results-summary-pill workbench-pill">{`列宽：可拖动调整`}</span>
            </div>
          </div>

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

          <div className="results-table-status workbench-pill-row" data-testid="results-table-status">
            <span className="results-summary-pill workbench-pill">{`共 ${total} 条`}</span>
            <span className="results-summary-pill workbench-pill">{`已选 ${selectedCount} 条`}</span>
            {allMatchingSelected && <span className="results-summary-pill workbench-pill">已选全部匹配结果</span>}
            <span className="results-summary-pill workbench-pill">{`\u5f53\u524d\u7b2c ${page} / ${totalPages} \u9875`}</span>
            <span className="results-summary-pill workbench-pill">{`\u672c\u9875 ${items.length} \u6761`}</span>
            <span className="results-summary-pill workbench-pill">{`\u672c\u9875\u5df2\u9009 ${selectedOnPage} \u6761`}</span>
            <span className="results-summary-pill workbench-pill">{`\u6392\u5e8f\uff1a${sortBy} \u00b7 ${sortDirectionLabel}`}</span>
            <span className="results-summary-pill workbench-pill">{`\u6bcf\u9875 ${pageSize} \u6761`}</span>
          </div>

          {loading && (
            <div
              className="results-table-feedback results-table-feedback-loading flat-meta-strip"
              data-testid="results-table-loading-state"
              role="status"
              aria-live="polite"
            >
              <span className="spinner" />
              <span>{TEXT.loading}</span>
            </div>
          )}

          {total > 0 && (
            <div className="results-pagination flat-meta-strip" data-testid="results-pagination">
              <span className="kv">{`\u5171 ${total} \u6761`}</span>
              <div className="row">
                <button
                  type="button"
                  className="workbench-secondary-action"
                  aria-label="results-prev-page"
                  disabled={loading || page <= 1}
                  onClick={() => void load({ table, page: page - 1 })}
                >
                  {TEXT.prevPage}
                </button>
                <span className="kv">{`\u7b2c ${page} / ${totalPages} \u9875`}</span>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  aria-label="results-next-page"
                  disabled={loading || page >= totalPages}
                  onClick={() => void load({ table, page: page + 1 })}
                >
                  {TEXT.nextPage}
                </button>
              </div>
            </div>
          )}

          <div className={`results-table-wrap${isResizingColumn ? " dragging" : ""}`} data-testid="results-table-wrap">
            <table className="table results-table" style={{ minWidth: tableMinWidth, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: RESULTS_SELECT_COLUMN_WIDTH }} />
                {resolvedVisibleColumnDefinitions.map((column) => (
                  <col key={`results-col-${table}-${column.key}`} style={{ width: column.currentWidth }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="results-th-cell table-select-cell" style={{ width: RESULTS_SELECT_COLUMN_WIDTH, minWidth: RESULTS_SELECT_COLUMN_WIDTH }}>
                    <label className="row">
                      <input
                        type="checkbox"
                        aria-label={TEXT.selectPage}
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAll}
                      />
                    </label>
                  </th>
                  {resolvedVisibleColumnDefinitions.map((column, index) => {
                    const nextColumn = resolvedVisibleColumnDefinitions[index + 1];
                    const canResize = nextColumn != null;
                    return (
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
                        {canResize ? (
                          <div
                            className={`results-column-resizer${resizingColumnId === `${table}:${column.key}` ? " dragging" : ""}`}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`resize-column-${column.key}`}
                            onPointerDown={(event) => {
                              startColumnResize(column, nextColumn, event.clientX);
                              event.preventDefault();
                            }}
                            onMouseDown={(event) => {
                              startColumnResize(column, nextColumn, event.clientX);
                              event.preventDefault();
                            }}
                          />
                        ) : null}
                      </th>
                    );
                  })}
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
                    <td className="table-select-cell" onClick={(event) => event.stopPropagation()}>
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
                      <td key={`${item.id}-${column.key}`}>
                        <div className={getCellContentClass(column.key)}>{column.render(item)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && items.length === 0 && <div className="drawer-empty">{TEXT.empty}</div>}
        </div>

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
