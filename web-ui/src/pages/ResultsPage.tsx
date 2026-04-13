import { useEffect, useState, type ReactNode } from "react";

import {
  dedupeItems,
  deleteItem,
  deleteItems,
  listItems,
  type ItemSortField,
  type ResultItemRecord,
  type SortDirection,
} from "../api";
import { formatUtcPlus8Time } from "../time";

const RESULTS_VISIBLE_COLUMNS_KEY = "results.visibleColumns.v1";

const TEXT = {
  title: "结果查询",
  subtitle: "保留关键词查询与刷新，同时增加删除、排序和全表去重能力。",
  keywordLabel: "keyword",
  keywordPlaceholder: "输入关键词，按 title / excerpt 检索",
  refresh: "刷新列表",
  fields: "字段",
  resetColumns: "恢复默认",
  batchDelete: "批量删除",
  dedupe: "全表去重",
  loading: "加载中...",
  empty: "暂无结果记录",
  selectAll: "当前页全选",
  operation: "操作",
  delete: "删除",
  chooseFirst: "请先勾选要删除的记录",
  batchDeleteConfirm: "确定硬删除已勾选的记录吗？此操作无法恢复。",
  dedupeConfirm: "确定对整个 x_items_curated 表执行去重吗？此操作会删除重复行。",
  fullTableHint: "“全表去重”作用于整张 x_items_curated 表",
} as const;

type ColumnDefinition = {
  key: ItemSortField;
  label: string;
  defaultVisible: boolean;
  width?: number;
  render: (item: ResultItemRecord) => ReactNode;
};

function truncate(value: unknown, maxLength = 120) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!text) return "--";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function stringifyReasons(value: unknown) {
  if (value == null) return "[]";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "id", label: "id", defaultVisible: false, width: 88, render: (item) => item.id },
  { key: "run_id", label: "run_id", defaultVisible: false, width: 88, render: (item) => item.run_id },
  {
    key: "dedupe_key",
    label: "dedupe_key",
    defaultVisible: false,
    width: 180,
    render: (item) => <span title={item.dedupe_key}>{truncate(item.dedupe_key, 40)}</span>,
  },
  {
    key: "level",
    label: "level",
    defaultVisible: true,
    width: 90,
    render: (item) => <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level || "--"}</span>,
  },
  { key: "score", label: "score", defaultVisible: true, width: 90, render: (item) => item.score },
  {
    key: "title",
    label: "title",
    defaultVisible: true,
    width: 220,
    render: (item) => <span title={item.title}>{truncate(item.title, 72)}</span>,
  },
  {
    key: "summary_zh",
    label: "summary_zh",
    defaultVisible: true,
    width: 260,
    render: (item) => <span title={item.summary_zh}>{truncate(item.summary_zh, 120)}</span>,
  },
  {
    key: "excerpt",
    label: "excerpt",
    defaultVisible: false,
    width: 260,
    render: (item) => <span title={item.excerpt}>{truncate(item.excerpt, 120)}</span>,
  },
  {
    key: "is_zero_cost",
    label: "is_zero_cost",
    defaultVisible: false,
    width: 110,
    render: (item) => (item.is_zero_cost ? "1" : "0"),
  },
  {
    key: "source_url",
    label: "source_url",
    defaultVisible: true,
    width: 240,
    render: (item) =>
      item.source_url ? (
        <a href={item.source_url} target="_blank" rel="noreferrer" title={item.source_url}>
          {truncate(item.source_url, 56)}
        </a>
      ) : (
        "--"
      ),
  },
  {
    key: "author",
    label: "author",
    defaultVisible: true,
    width: 140,
    render: (item) => item.author || "--",
  },
  {
    key: "created_at_x",
    label: "created_at_x",
    defaultVisible: true,
    width: 200,
    render: (item) => formatUtcPlus8Time(item.created_at_x),
  },
  {
    key: "reasons_json",
    label: "reasons_json",
    defaultVisible: false,
    width: 280,
    render: (item) => {
      const text = stringifyReasons(item.reasons_json);
      return <span title={text}>{truncate(text, 140)}</span>;
    },
  },
  {
    key: "rule_set_id",
    label: "rule_set_id",
    defaultVisible: false,
    width: 110,
    render: (item) => item.rule_set_id ?? "--",
  },
  {
    key: "state",
    label: "state",
    defaultVisible: false,
    width: 120,
    render: (item) => item.state || "--",
  },
];

const COLUMN_KEYS = COLUMN_DEFINITIONS.map((column) => column.key);
const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFINITIONS.filter((column) => column.defaultVisible).map((column) => column.key);

function orderVisibleColumns(keys: Iterable<ItemSortField>) {
  const keySet = new Set(keys);
  return COLUMN_KEYS.filter((key) => keySet.has(key));
}

function normalizeStoredVisibleColumns(value: unknown): ItemSortField[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const selected: ItemSortField[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    if (COLUMN_KEYS.includes(entry as ItemSortField)) {
      selected.push(entry as ItemSortField);
    }
  }
  return orderVisibleColumns(selected);
}

function readVisibleColumns(): ItemSortField[] {
  if (typeof window === "undefined") {
    return DEFAULT_VISIBLE_COLUMNS;
  }
  const raw = window.localStorage.getItem(RESULTS_VISIBLE_COLUMNS_KEY);
  if (raw == null) {
    return DEFAULT_VISIBLE_COLUMNS;
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeStoredVisibleColumns(parsed) ?? DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function writeVisibleColumns(visibleColumns: ItemSortField[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RESULTS_VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
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
  const [items, setItems] = useState<ResultItemRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ItemSortField[]>(() => readVisibleColumns());
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ItemSortField>("id");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const visibleColumnDefinitions = COLUMN_DEFINITIONS.filter((column) => visibleColumns.includes(column.key));
  const selectedOnPage = items.filter((item) => selectedIds.includes(item.id)).length;
  const allSelected = items.length > 0 && selectedOnPage === items.length;
  const tableMinWidth = Math.max(960, visibleColumnDefinitions.length * 180 + 220);

  useEffect(() => {
    writeVisibleColumns(visibleColumns);
  }, [visibleColumns]);

  async function load(options?: { keyword?: string; sortBy?: ItemSortField; sortDir?: SortDirection; preserveMessage?: boolean }) {
    const nextKeyword = options?.keyword ?? keyword;
    const nextSortBy = options?.sortBy ?? sortBy;
    const nextSortDir = options?.sortDir ?? sortDir;
    setLoading(true);
    setError("");
    if (!options?.preserveMessage) {
      setMessage("");
    }
    try {
      const data = await listItems({
        page: 1,
        page_size: 100,
        keyword: nextKeyword || undefined,
        sort_by: nextSortBy,
        sort_dir: nextSortDir,
      });
      const nextItems = data.items || [];
      setItems(nextItems);
      setTotal(data.total || 0);
      setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
    } catch (err) {
      setItems([]);
      setTotal(0);
      setSelectedIds([]);
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // initial page load only; refresh and sorting are explicit actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSort(field: ItemSortField, direction: SortDirection) {
    setSortBy(field);
    setSortDir(direction);
    await load({ sortBy: field, sortDir: direction });
  }

  async function handleRefresh() {
    await load();
  }

  async function handleDeleteOne(item: ResultItemRecord) {
    if (!window.confirm(`确定硬删除记录 #${item.id} 吗？此操作无法恢复。`)) {
      return;
    }
    setError("");
    try {
      const result = await deleteItem(item.id);
      setMessage(`已删除记录 #${result.id}`);
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      await load({ preserveMessage: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  async function handleBatchDelete() {
    if (!selectedIds.length) {
      setError(TEXT.chooseFirst);
      return;
    }
    if (!window.confirm(TEXT.batchDeleteConfirm)) {
      return;
    }
    setError("");
    try {
      const ids = [...selectedIds];
      const result = await deleteItems(ids);
      setMessage(`已删除 ${result.deleted} 条记录`);
      setSelectedIds([]);
      await load({ preserveMessage: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  async function handleDedupe() {
    if (!window.confirm(TEXT.dedupeConfirm)) {
      return;
    }
    setError("");
    try {
      const summary = await dedupeItems();
      setMessage(`去重完成：${summary.groups} 组重复，删除 ${summary.deleted} 条，保留 ${summary.kept} 条`);
      setSelectedIds([]);
      await load({ preserveMessage: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
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
      return orderVisibleColumns([...current, key]);
    });
  }

  function handleRestoreDefaultColumns() {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
  }

  return (
    <div className="card results-page" data-testid="results-page">
      <div className="results-header">
        <div>
          <h3>{TEXT.title}</h3>
          <div className="kv">{TEXT.subtitle}</div>
        </div>
        <div className="results-summary">
          <div className="kv">{`total=${total}`}</div>
          <div className="kv">{`selected=${selectedIds.length}`}</div>
          <div className="kv">{`sort=${sortBy} ${sortDir}`}</div>
        </div>
      </div>

      <div className="results-toolbar">
        <label className="field">
          <span>{TEXT.keywordLabel}</span>
          <input
            placeholder={TEXT.keywordPlaceholder}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            aria-label={TEXT.keywordLabel}
          />
        </label>
        <button type="button" onClick={() => void handleRefresh()} disabled={loading}>
          {TEXT.refresh}
        </button>
        <div className="results-field-picker">
          <button
            type="button"
            className="ghost"
            aria-haspopup="dialog"
            aria-expanded={fieldMenuOpen}
            onClick={() => setFieldMenuOpen((current) => !current)}
          >
            {TEXT.fields}
          </button>
          {fieldMenuOpen && (
            <div className="results-field-menu">
              <div className="results-field-list">
                {COLUMN_DEFINITIONS.map((column) => (
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
              <div className="results-field-actions">
                <button type="button" className="ghost" onClick={handleRestoreDefaultColumns}>
                  {TEXT.resetColumns}
                </button>
              </div>
            </div>
          )}
        </div>
        <button type="button" className="danger" onClick={() => void handleBatchDelete()} disabled={loading || !selectedIds.length}>
          {TEXT.batchDelete}
        </button>
        <button type="button" className="ghost" onClick={() => void handleDedupe()} disabled={loading}>
          {TEXT.dedupe}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="results-meta row">
        <span className="kv">{`page-size=100`}</span>
        <span className="kv">{`selected-on-page=${selectedOnPage}`}</span>
        <span className="kv">{TEXT.fullTableHint}</span>
      </div>

      <div className="results-table-wrap">
        <table className="table results-table" style={{ marginTop: 10, minWidth: tableMinWidth }}>
          <thead>
            <tr>
              <th>
                <label className="row">
                  <input
                    type="checkbox"
                    aria-label={TEXT.selectAll}
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                  <span>select</span>
                </label>
              </th>
              {visibleColumnDefinitions.map((column) => (
                <th key={column.key} style={column.width ? { minWidth: column.width } : undefined}>
                  <div className="results-th">
                    <span>{column.label}</span>
                    {renderSortButtons(column.key, sortBy, sortDir, (field, direction) => {
                      void handleSort(field, direction);
                    })}
                  </div>
                </th>
              ))}
              <th>{TEXT.operation}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`select-item-${item.id}`}
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                </td>
                {visibleColumnDefinitions.map((column) => (
                  <td key={`${item.id}-${column.key}`}>{column.render(item)}</td>
                ))}
                <td>
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

      {loading && (
        <div className="searching">
          <span className="spinner" />
          {TEXT.loading}
        </div>
      )}
      {!loading && items.length === 0 && <div className="drawer-empty">{TEXT.empty}</div>}
    </div>
  );
}
