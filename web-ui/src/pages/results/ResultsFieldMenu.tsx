import type { ItemSortField } from "../../api";
import type { ColumnDefinition } from "./resultsTableConfig";

type ResultsFieldMenuProps = {
  columnDefinitions: ColumnDefinition[];
  visibleColumns: ItemSortField[];
  visibleColumnCount: number;
  onToggleColumn: (key: ItemSortField) => void;
};

export function ResultsFieldMenu({
  columnDefinitions,
  visibleColumns,
  visibleColumnCount,
  onToggleColumn,
}: ResultsFieldMenuProps) {
  return (
    <div className="results-field-menu" data-testid="results-field-menu">
      <div className="results-field-menu-header">
        <div className="results-field-menu-copy">
          <div className="results-field-menu-title">列显示</div>
          <div className="kv">隐藏列会保留宽度设置，重新显示时会恢复。</div>
        </div>
        <span className="results-summary-pill workbench-pill">{`已选 ${visibleColumnCount} 列`}</span>
      </div>
      <div className="results-field-list">
        {columnDefinitions.map((column) => (
          <label key={column.key} className="results-field-option">
            <input
              type="checkbox"
              aria-label={`toggle-column-${column.key}`}
              checked={visibleColumns.includes(column.key)}
              onChange={() => onToggleColumn(column.key)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
