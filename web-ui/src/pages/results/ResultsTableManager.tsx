type ResultsTableManagerProps = {
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
      <div className="results-manager-copy">
        <div className="results-manager-title">表格管理</div>
        <div className="kv">围绕当前结果表执行字段控制、批量选择和整表操作。</div>
      </div>

      <div className="results-manager-summary">
        <div className="results-summary-pill">{`共 ${total} 条`}</div>
        <div className="results-summary-pill">{`已选 ${selectedCount} 条`}</div>
        {allMatchingSelected && <div className="results-summary-pill">已选全部匹配结果</div>}
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

      <div className="results-manager-note">{`全表去重会作用于当前整张 ${tableName} 表。`}</div>
    </section>
  );
}
