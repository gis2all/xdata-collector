import type { JobBatchAction, JobRecord } from "../../api";
import { JobsTable, type ResolvedJobColumn } from "./JobsTable";
import type { ActiveJobRun, BatchActionSpec, JobStatusFilter } from "./jobsTableConfig";

export type JobsListPaneProps = {
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  queryInput: string;
  status: JobStatusFilter;
  manageSelectionSummary: string;
  showSelectAllMatching: boolean;
  selectedCount: number;
  batchActionSpecs: BatchActionSpec[];
  selectionWarning: string;
  jobsTableMinWidth: number;
  isResizingColumn: boolean;
  selectColumnWidth: number;
  columns: ResolvedJobColumn[];
  allPageSelected: boolean;
  resizingColumnId: string | null;
  jobs: JobRecord[];
  activeRunsByJobId: Record<number, ActiveJobRun>;
  selectedJobId: number | null;
  allMatchingSelected: boolean;
  selectedIds: number[];
  onQueryInputChange: (value: string) => void;
  onSubmitQuery: () => void;
  onStatusChange: (status: JobStatusFilter) => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onBatchAction: (action: JobBatchAction) => void;
  isBatchActionEnabled: (action: JobBatchAction) => boolean;
  onPageChange: (page: number) => void;
  onTogglePageSelection: () => void;
  onStartColumnResize: (leftColumn: ResolvedJobColumn, rightColumn: ResolvedJobColumn | undefined, clientX: number | undefined) => void;
  onOpenJobWorkspace: (job: JobRecord) => void;
  onToggleRowSelection: (job: JobRecord, checked: boolean) => void;
};

export function JobsListPane({
  total,
  page,
  totalPages,
  loading,
  queryInput,
  status,
  manageSelectionSummary,
  showSelectAllMatching,
  selectedCount,
  batchActionSpecs,
  selectionWarning,
  jobsTableMinWidth,
  isResizingColumn,
  selectColumnWidth,
  columns,
  allPageSelected,
  resizingColumnId,
  jobs,
  activeRunsByJobId,
  selectedJobId,
  allMatchingSelected,
  selectedIds,
  onQueryInputChange,
  onSubmitQuery,
  onStatusChange,
  onSelectAllMatching,
  onClearSelection,
  onBatchAction,
  isBatchActionEnabled,
  onPageChange,
  onTogglePageSelection,
  onStartColumnResize,
  onOpenJobWorkspace,
  onToggleRowSelection,
}: JobsListPaneProps) {
  return (
    <section className="jobs-list-pane">
      <div className="card jobs-list-tools workbench-layer">
        <div
          className="jobs-list-filterbar flat-actions"
          data-testid="jobs-filter-bar"
        >
          <div className="jobs-filter-query-group" data-testid="jobs-filter-query-group">
            <label className="field jobs-filter-field">
              <span>{"搜索任务"}</span>
              <input
                value={queryInput}
                onChange={(e) => onQueryInputChange(e.target.value)}
                placeholder={"按任务名称搜索"}
                aria-label="搜索任务"
              />
            </label>
            <div className="jobs-filter-actions">
              <button type="button" className="workbench-secondary-action" data-testid="jobs-search-button" onClick={onSubmitQuery}>{"搜索"}</button>
            </div>
            <label className="field jobs-filter-field jobs-filter-status">
              <span>{"状态"}</span>
              <select
                value={status}
                onChange={(e) => onStatusChange(e.target.value as JobStatusFilter)}
                aria-label="任务状态"
              >
                <option value="active">{"启用中"}</option>
                <option value="all">{"全部"}</option>
                <option value="deleted">{"已删除"}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="jobs-managebar" data-testid="jobs-manage-bar">
          <div className="jobs-managebar-copy">
            <div className="collector-subtitle">{"表格管理"}</div>
            <div className="kv">{manageSelectionSummary}</div>
          </div>
          <div className="jobs-managebar-actions">
            {showSelectAllMatching && (
              <button
                type="button"
                className="workbench-secondary-action"
                aria-label="select-all-matching-jobs"
                onClick={onSelectAllMatching}
              >
                {`已选中本页 ${jobs.length} 条。选择全部 ${total} 条匹配结果`}
              </button>
            )}
            {selectedCount > 0 && (
              <button
                type="button"
                className="workbench-secondary-action"
                aria-label="clear-job-selection"
                onClick={onClearSelection}
              >
                {"清空选择"}
              </button>
            )}
            {batchActionSpecs.map((item) => (
              <button
                key={item.action}
                type="button"
                className={
                  item.tone === "danger"
                    ? "workbench-danger-action"
                    : "workbench-secondary-action"
                }
                disabled={!isBatchActionEnabled(item.action)}
                onClick={() => onBatchAction(item.action)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectionWarning && <div className="alert error jobs-list-alert">{selectionWarning}</div>}

      <JobsTable
        total={total}
        page={page}
        totalPages={totalPages}
        loading={loading}
        jobsTableMinWidth={jobsTableMinWidth}
        isResizingColumn={isResizingColumn}
        selectColumnWidth={selectColumnWidth}
        columns={columns}
        allPageSelected={allPageSelected}
        resizingColumnId={resizingColumnId}
        jobs={jobs}
        activeRunsByJobId={activeRunsByJobId}
        selectedJobId={selectedJobId}
        allMatchingSelected={allMatchingSelected}
        selectedIds={selectedIds}
        status={status}
        onPageChange={onPageChange}
        onTogglePageSelection={onTogglePageSelection}
        onStartColumnResize={onStartColumnResize}
        onOpenJobWorkspace={onOpenJobWorkspace}
        onToggleRowSelection={onToggleRowSelection}
      />
    </section>
  );
}
