import { ResultsDataTable } from "./ResultsDataTable";
import { ResultsDetailRail } from "./ResultsDetailRail";
import { RESULTS_SELECT_COLUMN_WIDTH, type UseResultsPageState } from "./useResultsPageState";

type ResultsWorkspaceProps = {
  state: UseResultsPageState;
};

export function ResultsWorkspace({ state }: ResultsWorkspaceProps) {
  return (
    <section
      ref={state.workspaceLayoutRef}
      className={`results-main-workspace results-main-workspace-aligned${state.isResizingWorkspace ? " dragging" : ""}`}
      data-testid="results-main-workspace"
    >
      <ResultsDataTable
        table={state.table}
        tableLabel={state.tableLabel}
        visibleColumnCount={state.visibleColumnCount}
        error={state.error}
        message={state.message}
        showSelectAllMatching={state.showSelectAllMatching}
        selectAllMatchingPrefix={state.TEXT.selectAllMatchingPrefix}
        allMatchingSelected={state.allMatchingSelected}
        allMatchingSelectedLabel={state.TEXT.allMatchingSelected}
        items={state.items}
        total={state.total}
        selectedCount={state.selectedCount}
        totalPages={state.totalPages}
        page={state.page}
        selectedOnPage={state.selectedOnPage}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        sortDirectionLabel={state.sortDirectionLabel}
        pageSize={state.pageSize}
        loading={state.loading}
        loadingLabel={state.TEXT.loading}
        prevPageLabel={state.TEXT.prevPage}
        nextPageLabel={state.TEXT.nextPage}
        selectPageLabel={state.TEXT.selectPage}
        emptyLabel={state.TEXT.empty}
        tableMinWidth={state.tableMinWidth}
        isResizingColumn={state.isResizingColumn}
        selectColumnWidth={RESULTS_SELECT_COLUMN_WIDTH}
        columns={state.resolvedVisibleColumnDefinitions}
        allSelectedOnPage={state.allPageSelected}
        resizingColumnId={state.resizingColumnId}
        activeRowId={state.activeRowId}
        selectedIds={state.selectedIds}
        onPageChange={state.handlePageChange}
        onSort={state.handleSort}
        onStartColumnResize={state.startColumnResize}
        onSetActiveRowId={state.handleActivateRow}
        onToggleSelectAll={state.toggleSelectAll}
        onToggleSelected={state.toggleSelected}
      />

      {state.isSplitLayout && (
        <div
          className={`results-resizer${state.isResizingWorkspace ? " dragging" : ""}`}
          data-testid="results-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整结果区域宽度"
          onPointerDown={state.handleWorkspaceResizerPointerDown}
          onMouseDown={state.handleWorkspaceResizerMouseDown}
        />
      )}

      <aside className="results-detail-rail workbench-layer" data-testid="results-detail-rail">
        <ResultsDetailRail
          item={state.activeItem}
          table={state.table}
          tableLabel={state.tableLabel}
          total={state.total}
          onDelete={state.activeItem ? () => void state.handleDeleteOne(state.activeItem) : undefined}
          deleteDisabled={state.loading}
        />
      </aside>
    </section>
  );
}
