import { type ReactNode } from "react";

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
  fieldMenu?: ReactNode;
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
  fieldMenu,
  onSelectAllMatching,
  onClearSelection,
  onToggleFields,
  onRestoreDefaultColumns,
  onBatchDelete,
  onDedupe,
}: ResultsTableManagerProps) {
  return (
    <section className="results-manager-layer workbench-layer" data-testid="results-manager-layer">
      <div className="results-manager-summary-panel workbench-summary-panel" data-testid="results-manager-summary-panel">
        <div className="results-manager-copy workbench-section-copy">
          <div className="workbench-section-eyebrow">结果管理</div>
          <div className="results-manager-title workbench-section-title">表格管理</div>
          <div className="kv">围绕当前结果表执行字段控制、批量选择和整表操作。</div>
        </div>

        <div className="results-manager-summary workbench-pill-row">
          <div className="results-summary-pill workbench-pill">{`共 ${total} 条`}</div>
          <div className="results-summary-pill workbench-pill">{`已选 ${selectedCount} 条`}</div>
          {allMatchingSelected && <div className="results-summary-pill workbench-pill">已选全部匹配结果</div>}
        </div>
      </div>

      <div
        className="results-manager-toolbar-shell workbench-subsurface workbench-subsurface-muted"
        data-testid="results-manager-toolbar-shell"
      >
        <div className="results-manager-toolbar" data-testid="results-manager-toolbar">
          <div className="results-manager-view-actions" data-testid="results-manager-view-actions">
            <div className="results-field-picker">
              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-haspopup="dialog"
                aria-expanded={fieldMenuOpen}
                onClick={onToggleFields}
              >
                {fieldsLabel}
              </button>
              {fieldMenu}
            </div>
            <button type="button" className="ghost workbench-secondary-action" onClick={onRestoreDefaultColumns}>
              {resetColumnsLabel}
            </button>
          </div>

          <div className="results-manager-data-actions" data-testid="results-manager-data-actions">
            {showSelectAllMatching && (
              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-label="select-all-matching"
                onClick={onSelectAllMatching}
              >
                选择全部匹配结果
              </button>
            )}
            {(selectedCount > 0 || allMatchingSelected) && (
              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-label="clear-selection"
                onClick={onClearSelection}
              >
                {clearSelectionLabel}
              </button>
            )}
            <button
              type="button"
              className="danger workbench-danger-action"
              onClick={onBatchDelete}
              disabled={loading || !selectedCount}
            >
              {batchDeleteLabel}
            </button>
            <button
              type="button"
              className="ghost workbench-secondary-action"
              onClick={onDedupe}
              disabled={loading}
            >
              {dedupeLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="results-manager-note">{`全表去重会作用于当前整张 ${tableName} 表。`}</div>
    </section>
  );
}
