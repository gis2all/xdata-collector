import type { ItemSortField, ItemTable, ResultItemRecord, SortDirection } from "../../api";
import { getCellContentClass, renderSortButtons, type ColumnDefinition } from "./resultsTableConfig";

export type ResultsResolvedColumnDefinition = ColumnDefinition & { currentWidth: number };

type ResultsDataTableProps = {
  table: ItemTable;
  tableLabel: string;
  visibleColumnCount: number;
  error: string;
  message: string;
  showSelectAllMatching: boolean;
  selectAllMatchingPrefix: string;
  allMatchingSelected: boolean;
  allMatchingSelectedLabel: string;
  items: ResultItemRecord[];
  total: number;
  selectedCount: number;
  totalPages: number;
  page: number;
  selectedOnPage: number;
  sortBy: ItemSortField;
  sortDir: SortDirection;
  sortDirectionLabel: string;
  pageSize: number;
  loading: boolean;
  loadingLabel: string;
  prevPageLabel: string;
  nextPageLabel: string;
  selectPageLabel: string;
  emptyLabel: string;
  tableMinWidth: number;
  isResizingColumn: boolean;
  selectColumnWidth: number;
  columns: ResultsResolvedColumnDefinition[];
  allSelectedOnPage: boolean;
  resizingColumnId: string | null;
  activeRowId: number | null;
  selectedIds: number[];
  onPageChange: (page: number) => void | Promise<void>;
  onSort: (field: ItemSortField, direction: SortDirection) => void | Promise<void>;
  onStartColumnResize: (
    leftColumn: ResultsResolvedColumnDefinition,
    rightColumn: ResultsResolvedColumnDefinition | undefined,
    clientX: number | undefined,
  ) => void;
  onSetActiveRowId: (id: number) => void;
  onToggleSelectAll: () => void;
  onToggleSelected: (id: number) => void;
};

export function ResultsDataTable({
  table,
  tableLabel,
  visibleColumnCount,
  error,
  message,
  showSelectAllMatching,
  selectAllMatchingPrefix,
  allMatchingSelected,
  allMatchingSelectedLabel,
  items,
  total,
  selectedCount,
  totalPages,
  page,
  selectedOnPage,
  sortBy,
  sortDir,
  sortDirectionLabel,
  pageSize,
  loading,
  loadingLabel,
  prevPageLabel,
  nextPageLabel,
  selectPageLabel,
  emptyLabel,
  tableMinWidth,
  isResizingColumn,
  selectColumnWidth,
  columns,
  allSelectedOnPage,
  resizingColumnId,
  activeRowId,
  selectedIds,
  onPageChange,
  onSort,
  onStartColumnResize,
  onSetActiveRowId,
  onToggleSelectAll,
  onToggleSelected,
}: ResultsDataTableProps) {
  return (
    <div className="results-table-pane" data-testid="results-table-pane">
      <div className="results-table-strip flat-meta-strip" data-testid="results-table-headband">
        <div className="results-table-strip-copy">
          <div className="results-table-strip-title">{"当前结果表"}</div>
        </div>
        <div className="results-table-strip-meta workbench-pill-row">
          <span className="results-summary-pill workbench-pill">{`可见列 ${visibleColumnCount} 个`}</span>
          <span className="results-summary-pill workbench-pill">{`当前表：${tableLabel}`}</span>
          <span className="results-summary-pill workbench-pill">{`列宽：可拖动调整`}</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {showSelectAllMatching && (
        <div className="results-selection-banner row">
          <span className="kv">{`${selectAllMatchingPrefix} ${items.length} \u6761\u3002`}</span>
        </div>
      )}

      {allMatchingSelected && total > 0 && (
        <div className="results-selection-banner row">
          <span className="kv">{`${allMatchingSelectedLabel} ${total} \u6761\u3002`}</span>
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
          <span>{loadingLabel}</span>
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
              onClick={() => void onPageChange(page - 1)}
            >
              {prevPageLabel}
            </button>
            <span className="kv">{`\u7b2c ${page} / ${totalPages} \u9875`}</span>
            <button
              type="button"
              className="workbench-secondary-action"
              aria-label="results-next-page"
              disabled={loading || page >= totalPages}
              onClick={() => void onPageChange(page + 1)}
            >
              {nextPageLabel}
            </button>
          </div>
        </div>
      )}

      <div className={`results-table-wrap${isResizingColumn ? " dragging" : ""}`} data-testid="results-table-wrap">
        <table className="table results-table" style={{ minWidth: tableMinWidth, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: selectColumnWidth }} />
            {columns.map((column) => (
              <col key={`results-col-${table}-${column.key}`} style={{ width: column.currentWidth }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="results-th-cell table-select-cell" style={{ width: selectColumnWidth, minWidth: selectColumnWidth }}>
                <label className="row">
                  <input
                    type="checkbox"
                    aria-label={selectPageLabel}
                    checked={allSelectedOnPage}
                    onChange={onToggleSelectAll}
                  />
                </label>
              </th>
              {columns.map((column, index) => {
                const nextColumn = columns[index + 1];
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
                        void onSort(field, direction);
                      })}
                    </div>
                    {canResize ? (
                      <div
                        className={`results-column-resizer${resizingColumnId === `${table}:${column.key}` ? " dragging" : ""}`}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`resize-column-${column.key}`}
                        onPointerDown={(event) => {
                          onStartColumnResize(column, nextColumn, event.clientX);
                          event.preventDefault();
                        }}
                        onMouseDown={(event) => {
                          onStartColumnResize(column, nextColumn, event.clientX);
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
                onClick={() => onSetActiveRowId(item.id)}
              >
                <td className="table-select-cell" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`select-item-${item.id}`}
                    checked={allMatchingSelected || selectedIds.includes(item.id)}
                    onChange={() => {
                      onSetActiveRowId(item.id);
                      onToggleSelected(item.id);
                    }}
                  />
                </td>
                {columns.map((column) => (
                  <td key={`${item.id}-${column.key}`}>
                    <div className={getCellContentClass(column.key)}>{column.render(item)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 && <div className="drawer-empty">{emptyLabel}</div>}
    </div>
  );
}
