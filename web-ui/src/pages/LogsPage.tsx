import { useEffect, useMemo, useState } from "react";
import { RunRecord, RuntimeLogFile, getRuntimeLogs, listRuns } from "../api";
import { formatUtcPlus8Time } from "../time";

const SERVICE_GROUPS = [
  { key: "api", label: "API" },
  { key: "scheduler", label: "Scheduler" },
  { key: "web-ui", label: "Web UI" },
] as const;

const UI_TEXT = {
  title: "运行日志",
  subtitle: "先看当前服务进程日志快照，再集中查看最近采集运行记录和错误详情。",
  refresh: "刷新",
  refreshing: "刷新中...",
  loading: "正在加载日志...",
  loadError: "日志加载失败",
  runtimeSnapshot: "服务快照",
  runtimeTitle: "服务进程日志",
  runtimeHint: "来自 runtime/logs 下的 current 文件，按 API、Scheduler 和 Web UI 分组展示。",
  runtimeNoSnapshot: "当前暂无可用日志快照",
  runsWorkbench: "运行工作台",
  runsTitle: "采集运行日志",
  runsHint: "来自 runtime/history/search_runs.jsonl，左侧浏览最近记录，右侧集中判读当前选中运行。",
  noRuns: "暂无采集运行记录",
  runWorkbench: "运行判读区",
  runWorkbenchHint: "集中查看当前选中运行的触发方式、统计摘要和错误内容。",
  runDetail: "运行详情",
  triggerType: "触发方式",
  status: "状态",
  job: "任务",
  startedAt: "开始时间",
  endedAt: "结束时间",
  statsSummary: "统计摘要",
  errorInfo: "错误信息",
  noError: "无错误",
  selectRun: "请选择一条运行记录",
  readError: "读取失败：",
  noLogContent: "当前无日志内容",
  groups: "服务分组",
  contentReady: "已有内容",
  readErrors: "读取异常",
  runRecords: "运行记录",
  selectedRun: "当前选中",
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

function serviceGroupFiles(allLogs: RuntimeLogFile[], key: string) {
  return allLogs.filter((item) => item.name.startsWith(key));
}

function serviceGroupTone(files: RuntimeLogFile[]) {
  if (files.some((file) => file.error)) return "danger";
  if (files.some((file) => file.content)) return "success";
  return "neutral";
}

function serviceGroupStatus(files: RuntimeLogFile[]) {
  const errorCount = files.filter((file) => file.error).length;
  if (errorCount) return `读取异常 ${errorCount}`;
  if (files.some((file) => file.content)) return "已有内容";
  if (files.length) return "暂无内容";
  return "尚未采集";
}

function latestUpdatedAt(files: RuntimeLogFile[]) {
  const values = files.map((file) => file.updated_at).filter(Boolean).sort();
  return values.length ? values[values.length - 1] : "";
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
  const runtimeErrorCount = runtimeLogs.filter((file) => file.error).length;
  const runtimeGroupsWithContent = SERVICE_GROUPS.filter((group) => serviceGroupFiles(runtimeLogs, group.key).some((file) => file.content)).length;

  return (
    <div className="logs-page" data-testid="logs-page">
      <section className="card logs-page-header workbench-page-header" data-testid="logs-page-header">
        <div className="logs-header-copy workbench-page-header-copy">
          <h3>{UI_TEXT.title}</h3>
          <p className="kv">{UI_TEXT.subtitle}</p>
        </div>
        <div className="logs-header-actions workbench-page-header-actions">
          <button type="button" onClick={() => load()}>
            {loading ? UI_TEXT.refreshing : UI_TEXT.refresh}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && (
        <div className="searching">
          <span className="spinner" /> {UI_TEXT.loading}
        </div>
      )}

      <section className="card logs-section logs-runtime-section workbench-layer" data-testid="logs-runtime-section">
        <div className="logs-section-header logs-section-header-workbench workbench-section-header">
          <div className="logs-section-copy workbench-section-copy">
            <div className="logs-section-eyebrow workbench-section-eyebrow">{UI_TEXT.runtimeSnapshot}</div>
            <h4 className="workbench-section-title">{UI_TEXT.runtimeTitle}</h4>
            <p className="kv">{UI_TEXT.runtimeHint}</p>
          </div>
          <div className="logs-summary-pills workbench-pill-row">
            <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.groups}：${SERVICE_GROUPS.length}`}</span>
            <span className={`dashboard-summary-pill workbench-pill ${runtimeGroupsWithContent ? "success" : "neutral"}`}>{`${UI_TEXT.contentReady}：${runtimeGroupsWithContent}`}</span>
            <span className={`dashboard-summary-pill workbench-pill ${runtimeErrorCount ? "danger" : "neutral"}`}>{`${UI_TEXT.readErrors}：${runtimeErrorCount}`}</span>
          </div>
        </div>

        <div className="logs-service-grid">
          {SERVICE_GROUPS.map((group) => {
            const files = serviceGroupFiles(runtimeLogs, group.key);
            const tone = serviceGroupTone(files);
            const latest = latestUpdatedAt(files);
            return (
              <section key={group.key} className="drawer-section logs-service-group">
                <div className="logs-service-group-hero">
                  <div className="logs-service-group-copy">
                    <h5>{group.label}</h5>
                    <p className="kv">{latest ? `最近更新：${formatUtcPlus8Time(latest)}` : UI_TEXT.runtimeNoSnapshot}</p>
                  </div>
                  <span className={`dashboard-summary-pill workbench-pill ${tone}`}>{serviceGroupStatus(files)}</span>
                </div>

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
              </section>
            );
          })}
        </div>
      </section>

      <section className="card logs-section logs-runs-section workbench-layer" data-testid="logs-runs-section">
        <div className="logs-section-header logs-section-header-workbench workbench-section-header">
          <div className="logs-section-copy workbench-section-copy">
            <div className="logs-section-eyebrow workbench-section-eyebrow">{UI_TEXT.runsWorkbench}</div>
            <h4 className="workbench-section-title">{UI_TEXT.runsTitle}</h4>
            <p className="kv">{UI_TEXT.runsHint}</p>
          </div>
          <div className="logs-summary-pills workbench-pill-row">
            <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.runRecords}：${runs.length}`}</span>
            <span className={`dashboard-summary-pill workbench-pill ${selectedRun ? statusClass(selectedRun.status) : "neutral"}`}>
              {selectedRun ? `${UI_TEXT.selectedRun}：#${selectedRun.id}` : `${UI_TEXT.selectedRun}：--`}
            </span>
          </div>
        </div>

        {!runs.length ? (
          <div className="drawer-empty">{UI_TEXT.noRuns}</div>
        ) : (
          <div className="logs-runs-layout">
            <div className="logs-runs-list">
              <div className="logs-runs-manager workbench-pill-row">
                <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.triggerType}：${selectedRun?.trigger_type || "--"}`}</span>
                <span className={`dashboard-summary-pill workbench-pill ${selectedRun ? statusClass(selectedRun.status) : "neutral"}`}>{`${UI_TEXT.status}：${selectedRun?.status || "--"}`}</span>
                <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.statsSummary}：${selectedRun ? summarizeStats(selectedRun.stats_json) : "--"}`}</span>
              </div>

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
            </div>

            {selectedRun ? (
              <aside className="drawer-section logs-run-detail" data-testid="logs-run-rail">
                <div className="logs-run-hero">
                  <div className="logs-section-eyebrow workbench-section-eyebrow">{UI_TEXT.runWorkbench}</div>
                  <h5 className="logs-run-title">{selectedRun.job_id ? `任务 #${selectedRun.job_id}` : `运行 #${selectedRun.id}`}</h5>
                  <p className="kv">{UI_TEXT.runWorkbenchHint}</p>
                  <div className="logs-run-pills workbench-pill-row">
                    <span className={`dashboard-summary-pill workbench-pill ${statusClass(selectedRun.status)}`}>{selectedRun.status}</span>
                    <span className="dashboard-summary-pill workbench-pill neutral">{selectedRun.trigger_type}</span>
                    <span className="dashboard-summary-pill workbench-pill neutral">{summarizeStats(selectedRun.stats_json)}</span>
                  </div>
                </div>

                <div className="logs-run-section-title">{UI_TEXT.runDetail}</div>
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
                  <div className="logs-run-section-title">{UI_TEXT.errorInfo}</div>
                  <pre className="logs-pre">{selectedRun.error_text || UI_TEXT.noError}</pre>
                </div>
                <div className="logs-detail-block">
                  <div className="logs-run-section-title">stats_json</div>
                  <pre className="logs-pre">{JSON.stringify(selectedRun.stats_json || {}, null, 2)}</pre>
                </div>
              </aside>
            ) : (
              <div className="drawer-section logs-run-detail">{UI_TEXT.selectRun}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
