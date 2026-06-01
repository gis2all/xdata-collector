import type { ItemTable } from "../../api";
import { ResultsFieldMenu } from "./ResultsFieldMenu";
import { ResultsFilterBuilder } from "./ResultsFilterBuilder";
import { ResultsTableManager } from "./ResultsTableManager";
import type { UseResultsPageState } from "./useResultsPageState";

type ResultsControlLayerProps = {
  state: UseResultsPageState;
};

export function ResultsControlLayer({ state }: ResultsControlLayerProps) {
  const TEXT = state.TEXT;

  return (
    <section className="results-control-layer workbench-layer" data-testid="results-control-layer">
      <div className="results-control-summary flat-meta-strip" data-testid="results-control-summary">
        <div className="results-filter-copy workbench-section-copy">
          <div className="results-filter-title workbench-section-title">当前结果表</div>
        </div>
        <div className="results-filter-summary workbench-pill-row" data-testid="results-filter-summary">
          <div className="results-summary-pill workbench-pill">{`当前表：${state.tableLabel}`}</div>
          <div className="results-summary-pill workbench-pill">{`关键词：${state.activeKeywordLabel}`}</div>
        </div>
      </div>
      <div className="results-filter-toolbar-shell flat-actions" data-testid="results-filter-toolbar-shell">
        <div className="results-filter-controls results-filter-toolbar" data-testid="results-filter-toolbar">
          <div className="results-filter-browse" data-testid="results-filter-browse">
            <div className="segmented-control" role="tablist" aria-label="results-table-switcher">
              {(["curated", "raw"] as ItemTable[]).map((table) => (
                <button
                  key={table}
                  type="button"
                  className={state.table === table ? "active" : "ghost"}
                  onClick={() => void state.handleTableSwitch(table)}
                >
                  {table === "curated" ? TEXT.curatedTab : TEXT.rawTab}
                </button>
              ))}
            </div>
            <label className="field results-filter-keyword-field">
              <input
                placeholder={TEXT.keywordPlaceholder}
                value={state.keywordInput}
                onChange={(event) => state.handleKeywordInputChange(event.target.value)}
                aria-label={TEXT.keywordLabel}
              />
            </label>
          </div>
          <div className="results-filter-primary" data-testid="results-filter-primary">
            <div className="results-filter-primary-actions">
              <button
                type="button"
                className={`workbench-secondary-action${state.currentFilterState.advancedOpen ? " active" : ""}`}
                onClick={state.handleToggleAdvancedFilters}
                disabled={state.loading}
              >
                高级筛选
              </button>
              <button
                type="button"
                className="workbench-secondary-action"
                onClick={() => void state.handleRefresh()}
                disabled={state.loading}
              >
                应用筛选
              </button>
              <button
                type="button"
                className="workbench-secondary-action"
                onClick={() => void state.handleResetFilters()}
                disabled={state.loading}
              >
                重置筛选
              </button>
              <button
                type="button"
                className="workbench-primary-action"
                onClick={() => void state.handleRefresh()}
                disabled={state.loading}
              >
                {TEXT.refresh}
              </button>
            </div>
          </div>
          <ResultsTableManager
            selectedCount={state.selectedCount}
            allMatchingSelected={state.allMatchingSelected}
            showSelectAllMatching={state.showSelectAllMatching}
            fieldsLabel={TEXT.fields}
            resetColumnsLabel={TEXT.resetColumns}
            batchDeleteLabel={TEXT.batchDelete}
            dedupeLabel={TEXT.dedupe}
            clearSelectionLabel={TEXT.clearSelection}
            loading={state.loading}
            allowBatchDeleteWithoutSelection={state.hasAdvancedFilter && state.total > 0}
            fieldMenuOpen={state.fieldMenuOpen}
            fieldMenu={state.fieldMenuOpen ? (
              <ResultsFieldMenu
                columnDefinitions={state.columnDefinitions}
                visibleColumns={state.visibleColumns}
                visibleColumnCount={state.visibleColumnCount}
                onToggleColumn={state.toggleColumnVisibility}
              />
            ) : null}
            onSelectAllMatching={state.handleSelectAllMatching}
            onClearSelection={state.handleClearSelection}
            onToggleFields={state.handleToggleFieldMenu}
            onRestoreDefaultColumns={state.handleRestoreDefaultColumns}
            onBatchDelete={() => void state.handleBatchDelete()}
            onDedupe={() => void state.handleDedupe()}
          />
        </div>
        {state.currentFilterState.advancedOpen ? (
          <div className="results-advanced-filter-panel" data-testid="results-advanced-filter-panel">
            <div className="results-advanced-filter-panel-head">
              <div className="results-advanced-filter-panel-copy">
                <div className="results-filter-title workbench-section-title">高级筛选</div>
                <div className="kv">后端会先按整表筛选，再返回当前分页结果。</div>
              </div>
            </div>
            <ResultsFilterBuilder
              table={state.table}
              draftFilterTree={state.draftFilterTree}
              updateCondition={state.updateCondition}
              updateGroupRelation={state.updateGroupRelation}
              addConditionToGroup={state.addConditionToGroup}
              addGroupToGroup={state.addGroupToGroup}
              removeDraftNode={state.removeDraftNode}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
