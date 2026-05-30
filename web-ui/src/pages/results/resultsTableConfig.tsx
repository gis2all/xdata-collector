import type { ReactNode } from "react";

import type { CuratedItemRecord, ItemSortField, ItemTable, RawItemRecord, ResultItemRecord, SortDirection } from "../../api";
import { TagPills } from "../../components/TagPills";
import { formatUtcPlus8Time } from "../../time";

const RESULTS_COLUMN_WIDTHS_KEY = "results.columnWidths.v1";

export type ColumnDefinition = {
  key: ItemSortField;
  label: string;
  defaultVisible: boolean;
  width?: number;
  render: (item: ResultItemRecord) => ReactNode;
};

export type ColumnWidthsByTable = Record<ItemTable, Partial<Record<ItemSortField, number>>>;

export type ColumnResizeState = {
  table: ItemTable;
  leftKey: ItemSortField;
  rightKey: ItemSortField;
  startX: number;
  leftStartWidth: number;
  rightStartWidth: number;
  leftMinWidth: number;
  rightMinWidth: number;
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

export const COLUMN_DEFINITIONS_BY_TABLE: Record<ItemTable, ColumnDefinition[]> = {
  curated: CURATED_COLUMN_DEFINITIONS,
  raw: RAW_COLUMN_DEFINITIONS,
};

export const DEFAULT_VISIBLE_COLUMNS_BY_TABLE: Record<ItemTable, ItemSortField[]> = {
  curated: ["level", "score", "title", "source_url", "author_name", "tags", "created_at_x", "views", "likes", "replies", "fetched_at"],
  raw: ["author_name", "tags", "text", "created_at_x", "views", "likes", "replies", "fetched_at"],
};

export function orderVisibleColumns(table: ItemTable, keys: Iterable<ItemSortField>) {
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

export function readColumnWidths(): ColumnWidthsByTable {
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

export function writeColumnWidths(widths: ColumnWidthsByTable) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RESULTS_COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

export function getColumnMinWidth(column: ColumnDefinition) {
  const width = column.width ?? 160;
  if (width <= 90) return 72;
  if (width <= 120) return 88;
  if (width <= 160) return 120;
  return 140;
}

export function resolveColumnWidth(column: ColumnDefinition, storedWidth?: number) {
  const minWidth = getColumnMinWidth(column);
  const width = typeof storedWidth === "number" && Number.isFinite(storedWidth) ? storedWidth : column.width ?? minWidth;
  return Math.max(minWidth, Math.round(width));
}

export function renderSortButtons(
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

export function getCellContentClass(field: ItemSortField) {
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
