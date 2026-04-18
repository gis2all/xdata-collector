import { useEffect, useMemo, useState } from "react";
import { RunRecord, RuntimeLogFile, getRuntimeLogs, listRuns } from "../api";
import { formatUtcPlus8Time } from "../time";

const SERVICE_GROUPS = [
  { key: "api", label: "API" },
  { key: "scheduler", label: "Scheduler" },
  { key: "web-ui", label: "Web UI" },
] as const;

const UI_TEXT = {
  title: "\u8fd0\u884c\u65e5\u5fd7",
  subtitle: "\u67e5\u770b\u6700\u8fd1\u91c7\u96c6\u8fd0\u884c\u8bb0\u5f55\uff0c\u4ee5\u53ca\u5f53\u524d API\u3001Scheduler \u548c Web UI \u7684\u65e5\u5fd7\u5feb\u7167\u3002",
  refresh: "\u5237\u65b0",
  loading: "\u6b63\u5728\u52a0\u8f7d\u65e5\u5fd7...",
  loadError: "\u65e5\u5fd7\u52a0\u8f7d\u5931\u8d25",
  runsTitle: "\u91c7\u96c6\u8fd0\u884c\u65e5\u5fd7",
  runsHint: "\u6765\u81ea runtime/history/search_runs.jsonl\uff0c\u5c55\u793a\u6700\u8fd1\u6267\u884c\u8bb0\u5f55\u548c\u57fa\u7840\u8fd0\u884c\u7ed3\u679c\u3002",
  noRuns: "\u6682\u65e0\u91c7\u96c6\u8fd0\u884c\u8bb0\u5f55",
  runDetail: "\u8fd0\u884c\u8be6\u60c5",
  triggerType: "\u89e6\u53d1\u65b9\u5f0f",
  status: "\u72b6\u6001",
  job: "\u4efb\u52a1",
  startedAt: "\u5f00\u59cb\u65f6\u95f4",
  endedAt: "\u7ed3\u675f\u65f6\u95f4",
  statsSummary: "\u7edf\u8ba1\u6458\u8981",
  errorInfo: "\u9519\u8bef\u4fe1\u606f",
  noError: "\u65e0\u9519\u8bef",
  selectRun: "\u8bf7\u9009\u62e9\u4e00\u6761\u8fd0\u884c\u8bb0\u5f55",
  runtimeTitle: "\u670d\u52a1\u8fdb\u7a0b\u65e5\u5fd7",
  runtimeHint: "\u6765\u81ea runtime/logs \u4e0b\u7684 current \u6587\u4ef6\uff0c\u6309 API\u3001Scheduler \u548c Web UI \u5206\u7ec4\u5c55\u793a\u3002",
  readError: "\u8bfb\u53d6\u5931\u8d25\uff1a",
  noLogContent: "\u5f53\u524d\u65e0\u65e5\u5fd7\u5185\u5bb9",
} as const;

function statusClass(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") return "success";
  if (normalized === "failed") return "failed";
  if (normalized === "running") return "running";
  return "neutral";
}

function summarizeStats(stats: Record<string, number> | undefined) {
  if (!stats || Object.keys(stats).length === 0) return "--";
  const parts = ["raw", "matched", "excluded"]
    .filter((key) => typeof stats[key] === "number")
    .map((key) => `${key} ${stats[key]}`);
  return parts.length ? parts.join(" / ") : JSON.stringify(stats);
}

function logKind(name: string) {
  return name.includes(".err.") ? "stderr" : "stdout";
}

export function LogsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogFile[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [runData, logData] = await Promise.all([listRuns({ page: 1, page_size: 50 }), getRuntimeLogs()]);
      const nextRuns = runData.items || [];
      setRuns(nextRuns);
      setRuntimeLogs(logData.items || []);
      setSelectedRunId((current) => {
        if (!nextRuns.length) return null;
        if (current && nextRuns.some((item) => item.id === current)) return current;
        return nextRuns[0].id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.loadError);
      setRuns([]);
      setRuntimeLogs([]);
      setSelectedRunId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {
      setError(UI_TEXT.loadError);
    });
  }, []);

  const selectedRun = useMemo(() => runs.find((item) => item.id === selectedRunId) ?? null, [runs, selectedRunId]);

  return (
    <div className="logs-page" data-testid="logs-page">
      <div className="card logs-header">
        <div>
          <h3>{UI_TEXT.title}</h3>
          <p className="kv">{UI_TEXT.subtitle}</p>
        </div>
        <button type="button" onClick={() => load()}>
          {UI_TEXT.refresh}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && (
        <div className="searching">
          <span className="spinner" /> {UI_TEXT.loading}
        </div>
      )}

      <section className="card logs-section">
        <div className="logs-section-header">
          <div>
            <h4>{UI_TEXT.runsTitle}</h4>
            <p className="kv">{UI_TEXT.runsHint}</p>
          </div>
        </div>

        {!runs.length ? (
          <div className="drawer-empty">{UI_TEXT.noRuns}</div>
        ) : (
          <div className="logs-runs-layout">
            <div className="logs-table-wrap">
              <table className="table logs-table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>{UI_TEXT.triggerType}</th>
                    <th>{UI_TEXT.status}</th>
                    <th>{UI_TEXT.job}</th>
                    <th>{UI_TEXT.startedAt}</th>
                    <th>{UI_TEXT.endedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className={selectedRunId === run.id ? "logs-row active" : "logs-row"}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <td>#{run.id}</td>
                      <td>{run.trigger_type}</td>
                      <td>
                        <span className={`badge ${statusClass(run.status)}`}>{run.status}</span>
                      </td>
                      <td>{run.job_id ? `#${run.job_id}` : "--"}</td>
                      <td>{formatUtcPlus8Time(run.started_at)}</td>
                      <td>{formatUtcPlus8Time(run.ended_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="drawer-section logs-run-detail">
              {selectedRun ? (
                <>
                  <h5>{UI_TEXT.runDetail}</h5>
                  <div className="logs-detail-grid">
                    <div className="dashboard-detail-item">
                      <span>Run ID</span>
                      <strong>#{selectedRun.id}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{UI_TEXT.triggerType}</span>
                      <strong>{selectedRun.trigger_type}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{UI_TEXT.status}</span>
                      <strong>{selectedRun.status}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{UI_TEXT.job}</span>
                      <strong>{selectedRun.job_id ? `#${selectedRun.job_id}` : "--"}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{UI_TEXT.startedAt}</span>
                      <strong>{formatUtcPlus8Time(selectedRun.started_at)}</strong>
                    </div>
                    <div className="dashboard-detail-item">
                      <span>{UI_TEXT.endedAt}</span>
                      <strong>{formatUtcPlus8Time(selectedRun.ended_at)}</strong>
                    </div>
                    <div className="dashboard-detail-item dashboard-detail-item-wide">
                      <span>{UI_TEXT.statsSummary}</span>
                      <strong>{summarizeStats(selectedRun.stats_json)}</strong>
                    </div>
                  </div>
                  <div className="logs-detail-block">
                    <div className="collector-subtitle">{UI_TEXT.errorInfo}</div>
                    <pre className="logs-pre">{selectedRun.error_text || UI_TEXT.noError}</pre>
                  </div>
                  <div className="logs-detail-block">
                    <div className="collector-subtitle">stats_json</div>
                    <pre className="logs-pre">{JSON.stringify(selectedRun.stats_json || {}, null, 2)}</pre>
                  </div>
                </>
              ) : (
                <div className="drawer-empty">{UI_TEXT.selectRun}</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card logs-section">
        <div className="logs-section-header">
          <div>
            <h4>{UI_TEXT.runtimeTitle}</h4>
            <p className="kv">{UI_TEXT.runtimeHint}</p>
          </div>
        </div>

        <div className="logs-service-grid">
          {SERVICE_GROUPS.map((group) => {
            const files = runtimeLogs.filter((item) => item.name.startsWith(group.key));
            return (
              <div key={group.key} className="drawer-section logs-service-group">
                <h5>{group.label}</h5>
                <div className="logs-service-stack">
                  {files.map((file) => (
                    <div key={file.name} className="logs-file-card">
                      <div className="logs-file-meta">
                        <div>
                          <strong>{file.name}</strong>
                          <div className="kv">
                            {logKind(file.name)} / {file.size} bytes / {formatUtcPlus8Time(file.updated_at)}
                          </div>
                        </div>
                      </div>
                      {file.error ? (
                        <div className="alert error">{`${UI_TEXT.readError}${file.error}`}</div>
                      ) : file.content ? (
                        <pre className="logs-pre logs-pre-compact">{file.content}</pre>
                      ) : (
                        <div className="drawer-empty">{UI_TEXT.noLogContent}</div>
                      )}
                    </div>
                  ))}
                  {!files.length && <div className="drawer-empty">{UI_TEXT.noLogContent}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
