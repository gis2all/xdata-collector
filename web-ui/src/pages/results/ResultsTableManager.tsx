import type { ItemTable } from "../../api";

type ResultsTableManagerProps = {
  table: ItemTable;
  tableName: string;
  total: number;
  selectedCount: number;
  allMatchingSelected: boolean;
  showSelectAllMatching: boolean;
  fieldsLabel: string;
  resetColumnsLabel: string;
  batchDeleteLabel: string;
  dedupeLabel: string;
  clearSelectionLabel: string;
  loading: boolean;
  fieldMenuOpen: boolean;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onToggleFields: () => void;
  onRestoreDefaultColumns: () => void;
  onBatchDelete: () => void;
  onDedupe: () => void;
};

export function ResultsTableManager({
  tableName,
  total,
  selectedCount,
  allMatchingSelected,
  showSelectAllMatching,
  fieldsLabel,
  resetColumnsLabel,
  batchDeleteLabel,
  dedupeLabel,
  clearSelectionLabel,
  loading,
  fieldMenuOpen,
  onSelectAllMatching,
  onClearSelection,
  onToggleFields,
  onRestoreDefaultColumns,
  onBatchDelete,
  onDedupe,
}: ResultsTableManagerProps) {
  return (
    <section className="results-manager-layer" data-testid="results-manager-layer">
      <div className="results-manager-summary">
        <div className="kv">{`table=${tableName}`}</div>
        <div className="kv">{`total=${total}`}</div>
        <div className="kv">{`selected=${selectedCount}`}</div>
        {allMatchingSelected && <div className="kv">all-matching</div>}
      </div>
      <div className="results-manager-actions">
        {showSelectAllMatching && (
          <button type="button" className="ghost" aria-label="select-all-matching" onClick={onSelectAllMatching}>
            选择全部匹配结果
          </button>
        )}
        {(selectedCount > 0 || allMatchingSelected) && (
          <button type="button" className="ghost" aria-label="clear-selection" onClick={onClearSelection}>
            {clearSelectionLabel}
          </button>
        )}
        <div className="results-field-picker">
          <button
            type="button"
            className="ghost"
            aria-haspopup="dialog"
            aria-expanded={fieldMenuOpen}
            onClick={onToggleFields}
          >
            {fieldsLabel}
          </button>
        </div>
        <button type="button" className="ghost" onClick={onRestoreDefaultColumns}>
          {resetColumnsLabel}
        </button>
        <button type="button" className="danger" onClick={onBatchDelete} disabled={loading || !selectedCount}>
          {batchDeleteLabel}
        </button>
        <button type="button" className="ghost" onClick={onDedupe} disabled={loading}>
          {dedupeLabel}
        </button>
      </div>
    </section>
  );
}
