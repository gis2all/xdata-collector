import { type ReactNode } from "react";

type ResultsTableManagerProps = {
  selectedCount: number;
  allMatchingSelected: boolean;
  showSelectAllMatching: boolean;
  fieldsLabel: string;
  resetColumnsLabel: string;
  batchDeleteLabel: string;
  dedupeLabel: string;
  clearSelectionLabel: string;
  loading: boolean;
  batchDeleteDisabled?: boolean;
  allowBatchDeleteWithoutSelection?: boolean;
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
  selectedCount,
  allMatchingSelected,
  showSelectAllMatching,
  fieldsLabel,
  resetColumnsLabel,
  batchDeleteLabel,
  dedupeLabel,
  clearSelectionLabel,
  loading,
  batchDeleteDisabled = false,
  allowBatchDeleteWithoutSelection = false,
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
    <div className="results-manager-toolbar" data-testid="results-manager-toolbar">
      <div className="results-manager-view-actions" data-testid="results-manager-view-actions">
        <div className="results-field-picker">
          <button
            type="button"
            className="workbench-secondary-action"
            aria-haspopup="dialog"
            aria-expanded={fieldMenuOpen}
            onClick={onToggleFields}
          >
            {fieldsLabel}
          </button>
          {fieldMenu}
        </div>
        <button type="button" className="workbench-secondary-action" onClick={onRestoreDefaultColumns}>
          {resetColumnsLabel}
        </button>
      </div>

      <div className="results-manager-data-actions" data-testid="results-manager-data-actions">
        {showSelectAllMatching && (
          <button
            type="button"
            className="workbench-secondary-action"
            aria-label="select-all-matching"
            onClick={onSelectAllMatching}
          >
            选择全部匹配结果
          </button>
        )}
        {(selectedCount > 0 || allMatchingSelected) && (
          <button
            type="button"
            className="workbench-secondary-action"
            aria-label="clear-selection"
            onClick={onClearSelection}
          >
            {clearSelectionLabel}
          </button>
        )}
        <button
          type="button"
          className="workbench-danger-action"
          onClick={onBatchDelete}
          disabled={loading || (!selectedCount && !allowBatchDeleteWithoutSelection) || batchDeleteDisabled}
        >
          {batchDeleteLabel}
        </button>
        <button type="button" className="workbench-secondary-action" onClick={onDedupe} disabled={loading}>
          {dedupeLabel}
        </button>
      </div>
    </div>
  );
}
