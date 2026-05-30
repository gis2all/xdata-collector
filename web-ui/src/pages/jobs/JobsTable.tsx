import type { JobRecord } from "../../api";
import type { ActiveJobRun, JobTableColumnDefinition } from "./jobsTableConfig";

export type ResolvedJobColumn = JobTableColumnDefinition & { currentWidth: number };

type JobsTableProps = {
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  jobsTableMinWidth: number;
  isResizingColumn: boolean;
  selectColumnWidth: number;
  columns: ResolvedJobColumn[];
  allPageSelected: boolean;
  resizingColumnId: string | null;
  jobs: JobRecord[];
  activeRunsByJobId: Record<number, ActiveJobRun>;
  selectedJobId?: number | null;
  allMatchingSelected: boolean;
  selectedIds: number[];
  status: "active" | "all" | "deleted";
  onPageChange: (page: number) => void;
  onTogglePageSelection: () => void;
  onStartColumnResize: (leftColumn: ResolvedJobColumn, rightColumn: ResolvedJobColumn | undefined, clientX: number | undefined) => void;
  onOpenJobWorkspace: (job: JobRecord) => void;
  onToggleRowSelection: (job: JobRecord, checked: boolean) => void;
};

export function JobsTable({
  total,
  page,
  totalPages,
  loading,
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
  status,
  onPageChange,
  onTogglePageSelection,
  onStartColumnResize,
  onOpenJobWorkspace,
  onToggleRowSelection,
}: JobsTableProps) {
  return (
    <div className="card jobs-table-card">
      <div className="jobs-pagination" data-testid="jobs-pagination">
        <span className="kv">{"共 "}{total}{" 条"}</span>
        <div className="row">
          <button
            type="button"
            className="workbench-secondary-action"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {"上一页"}
          </button>
          <span className="kv">{"第 "}{page}{" / "}{totalPages}{" 页"}</span>
          <button
            type="button"
            className="workbench-secondary-action"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {"下一页"}
          </button>
        </div>
      </div>

      <div className={`jobs-table-wrap${isResizingColumn ? " dragging" : ""}`} data-testid="jobs-table-wrap">
        {loading ? (
          <div className="searching"><span className="spinner" /> {"??????..."}</div>
        ) : (
          <table className="table jobs-table" style={{ minWidth: jobsTableMinWidth, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: selectColumnWidth }} />
              {columns.map((column) => (
                <col key={`jobs-col-${column.key}`} style={{ width: column.currentWidth }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="jobs-th-cell table-select-cell" style={{ width: selectColumnWidth, minWidth: selectColumnWidth }}>
                  <label className="field checkbox-row jobs-select-page-label">
                    <input aria-label="jobs-select-page" type="checkbox" checked={allPageSelected} onChange={onTogglePageSelection} />
                  </label>
                </th>
                {columns.map((column, index) => {
                  const nextColumn = columns[index + 1];
                  const canResize = nextColumn != null;
                  return (
                    <th
                      key={column.key}
                      className="jobs-th-cell"
                      style={{ width: column.currentWidth, minWidth: column.currentWidth }}
                    >
                      <div className="jobs-th">
                        <span className="jobs-th-label">{column.label}</span>
                      </div>
                      {canResize ? (
                        <div
                          className={`jobs-column-resizer${resizingColumnId === column.key ? " dragging" : ""}`}
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`resize-job-column-${column.key}`}
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
              {jobs.map((job) => {
                const activeRun = activeRunsByJobId[job.id];

                return (
                  <tr
                    key={job.id}
                    className={`${job.deleted_at ? "row-deleted" : ""}${selectedJobId === job.id ? " active" : ""}`}
                    data-job-active={selectedJobId === job.id ? "true" : "false"}
                    onClick={() => onOpenJobWorkspace(job)}
                  >
                    <td className="table-select-cell" onClick={(event) => event.stopPropagation()}>
                      <input
                        aria-label={`select-job-${job.id}`}
                        type="checkbox"
                        checked={allMatchingSelected || selectedIds.includes(job.id)}
                        onChange={(event) => onToggleRowSelection(job, event.target.checked)}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={`${job.id}-${column.key}`}>
                        {column.render(job, activeRun)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!jobs.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#64748b" }}>{status === "deleted" ? "???????" : "????"}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
