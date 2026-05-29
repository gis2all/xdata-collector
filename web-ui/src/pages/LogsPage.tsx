import { useEffect, useMemo, useState } from "react";
import { RunRecord, RuntimeLogFile, cancelRun, getRuntimeLogs, listRuns } from "../api";
import { buildRunProgress, executionStatusLabel, executionStatusTone } from "../runProgress";
import { formatUtcPlus8Time } from "../time";

const SERVICE_GROUPS = [
  { key: "api", label: "API" },
  { key: "scheduler", label: "Scheduler" },
  { key: "web-ui", label: "Web UI" },
] as const;

const UI_TEXT = {
  title: "运行日志",
  subtitle: "服务日志与采集记录。",
  refresh: "刷新",
  refreshing: "刷新中...",
  loading: "正在加载日志...",
  loadError: "日志加载失败",
  runtimeSnapshot: "服务快照",
  runtimeTitle: "服务进程日志",
  runtimeHint: "API、Scheduler、Web UI 当前日志。",
  runtimeNoSnapshot: "暂无快照",
  runsWorkbench: "运行记录",
  runsTitle: "采集运行日志",
  runsHint: "最近采集运行记录。",
  noRuns: "暂无采集运行记录",
  runWorkbench: "当前运行",
  runWorkbenchHint: "集中查看当前运行的触发方式、统计摘要和错误内容。",
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
  noLogContent: "暂无内容",
  noLogGenerated: "尚未产生日志",
  groups: "服务分组",
  contentReady: "已有内容",
  readErrors: "读取异常",
  runRecords: "运行记录",
  selectedRun: "当前选中",
  stopRun: "停止运行",
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
  const parts = ["raw", "matched", "excluded", "progress_percent"]
    .filter((key) => typeof stats[key] === "number")
    .map((key) => (key === "progress_percent" ? `${stats[key]}%` : `${key} ${stats[key]}`));
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
  return UI_TEXT.noLogGenerated;
}

function latestUpdatedAt(files: RuntimeLogFile[]) {
  const values = files.map((file) => file.updated_at).filter(Boolean).sort();
  return values.length ? values[values.length - 1] : "";
}

function renderLogFileState(error: string | undefined, content: string | undefined) {
  if (error) {
    return (
      <div className="logs-file-state logs-file-state-error">
        <div className="logs-file-state-eyebrow">读取失败</div>
        <strong>{`${UI_TEXT.readError}${error}`}</strong>
        <p>当前文件未能正常读取，可先查看同组其他日志或直接刷新重试。</p>
      </div>
    );
  }

  if (content) {
    return <pre className="logs-pre logs-pre-compact">{content}</pre>;
  }

  return (
    <div className="logs-file-state logs-file-state-empty">
      <strong>{UI_TEXT.noLogGenerated}</strong>
    </div>
  );
}

function serviceGroupFileLabel(files: RuntimeLogFile[]) {
  if (!files.length) return "--";
  return `${files.length} files`;
}

export function LogsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogFile[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load(options?: { silent?: boolean; preserveDataOnError?: boolean }) {
    const silent = options?.silent ?? false;
    const preserveDataOnError = options?.preserveDataOnError ?? false;
    if (!silent) {
      setLoading(true);
    }
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
      if (!preserveDataOnError) {
        setRuns([]);
        setRuntimeLogs([]);
        setSelectedRunId(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load().catch(() => {
      setError(UI_TEXT.loadError);
    });
  }, []);

  useEffect(() => {
    const hasRunning = runs.some((item) => String(item.status || "").toLowerCase() === "running");
    if (!hasRunning) return;
    const timer = window.setTimeout(() => {
      void load({ silent: true, preserveDataOnError: true });
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [runs]);

  const selectedRun = useMemo(() => runs.find((item) => item.id === selectedRunId) ?? null, [runs, selectedRunId]);
  const selectedRunProgress = selectedRun ? buildRunProgress(selectedRun) : null;
  const runtimeErrorCount = runtimeLogs.filter((file) => file.error).length;
  const runtimeGroupsWithContent = SERVICE_GROUPS.filter((group) => serviceGroupFiles(runtimeLogs, group.key).some((file) => file.content)).length;

  async function handleStopRun(run: RunRecord) {
    setError("");
    setStoppingRunId(run.id);
    try {
      await cancelRun(run.id);
      await load({ silent: true, preserveDataOnError: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止运行失败");
    } finally {
      setStoppingRunId(null);
    }
  }

  return (
    <div className="logs-page" data-testid="logs-page">
      <section className="card logs-page-header workbench-page-header" data-testid="logs-page-header">
        <div className="logs-header-copy workbench-page-header-copy">
          <h3>{UI_TEXT.title}</h3>
          <p className="kv">{UI_TEXT.subtitle}</p>
        </div>
        <div className="logs-header-actions workbench-page-header-actions">
          <button type="button" className="workbench-primary-action" onClick={() => load()}>
            {loading ? UI_TEXT.refreshing : UI_TEXT.refresh}
          </button>
        </div>
      </section>

      {error && (
        <div className="workbench-feedback workbench-feedback-danger" role="status">
          <div className="workbench-feedback-copy">
            <div className="workbench-feedback-eyebrow">读取反馈</div>
            <strong>{error}</strong>
            <p>保留页面框架和刷新入口，方便直接继续重试。</p>
          </div>
        </div>
      )}
      {loading && (
        <div className="workbench-feedback workbench-feedback-neutral">
          <div className="workbench-feedback-copy">
            <div className="workbench-feedback-eyebrow">运行中</div>
            <strong className="searching">
              <span className="spinner" /> {UI_TEXT.loading}
            </strong>
            <p>并行读取服务快照和采集运行记录。</p>
          </div>
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

        <div className="logs-service-summary-table workbench-table-shell" data-testid="logs-service-summary-table">
          <table className="table">
            <thead>
              <tr>
                <th>服务</th>
                <th>状态</th>
                <th>文件</th>
                <th>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {SERVICE_GROUPS.map((group) => {
                const files = serviceGroupFiles(runtimeLogs, group.key);
                const tone = serviceGroupTone(files);
                const latest = latestUpdatedAt(files);
                return (
                  <tr key={group.key} data-testid={`logs-service-summary-${group.key}`}>
                    <td>{group.label}</td>
                    <td>
                      <span className={`dashboard-summary-pill workbench-pill ${tone}`}>{serviceGroupStatus(files)}</span>
                    </td>
                    <td>{serviceGroupFileLabel(files)}</td>
                    <td>{latest ? formatUtcPlus8Time(latest) : UI_TEXT.runtimeNoSnapshot}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="logs-service-grid">
          {SERVICE_GROUPS.map((group) => {
            const files = serviceGroupFiles(runtimeLogs, group.key);
            const tone = serviceGroupTone(files);
            const latest = latestUpdatedAt(files);
            const visibleFiles = files.filter((file) => file.content || file.error);
            if (!visibleFiles.length) {
              return null;
            }
            return (
              <section key={group.key} className="logs-service-group flat-section">
                <div className="logs-service-group-hero">
                  <div className="logs-service-group-copy">
                    <h5>{group.label}</h5>
                    <p className="kv">{latest ? `更新：${formatUtcPlus8Time(latest)}` : UI_TEXT.runtimeNoSnapshot}</p>
                  </div>
                  <span className={`dashboard-summary-pill workbench-pill ${tone}`}>{serviceGroupStatus(files)}</span>
                </div>

                <div className="logs-service-stack">
                  {visibleFiles.map((file) => (
                    <div key={file.name} className="logs-file-row flat-row">
                      <div className="logs-file-meta">
                        <div>
                          <strong>{file.name}</strong>
                          <div className="kv">
                            {`${logKind(file.name)} · ${file.size} bytes · ${formatUtcPlus8Time(file.updated_at)}`}
                          </div>
                        </div>
                      </div>
                      {renderLogFileState(file.error, file.content)}
                    </div>
                  ))}
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
              <div className="logs-runs-manager flat-meta-strip" data-testid="logs-runs-manager">
                <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.triggerType}：${selectedRun?.trigger_type || "--"}`}</span>
                <span className={`dashboard-summary-pill workbench-pill ${selectedRun ? statusClass(selectedRun.status) : "neutral"}`}>{`${UI_TEXT.status}：${selectedRun?.status || "--"}`}</span>
                <span className="dashboard-summary-pill workbench-pill neutral">{`${UI_TEXT.statsSummary}：${selectedRun ? summarizeStats(selectedRun.stats_json) : "--"}`}</span>
              </div>

              <div className="logs-table-wrap workbench-table-shell">
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
                          <span className={`badge workbench-badge ${statusClass(run.status)}`}>{run.status}</span>
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
              <aside className="logs-run-detail flat-section" data-testid="logs-run-rail">
                <div className="logs-run-hero">
                  <div className="logs-section-eyebrow workbench-section-eyebrow">{UI_TEXT.runWorkbench}</div>
                  <h5 className="logs-run-title">{selectedRun.job_id ? `任务 #${selectedRun.job_id}` : `运行 #${selectedRun.id}`}</h5>
                  <p className="kv">{UI_TEXT.runWorkbenchHint}</p>
                  <div className="logs-run-pills workbench-pill-row">
                    <span className={`dashboard-summary-pill workbench-pill ${statusClass(selectedRun.status)}`}>{selectedRun.status}</span>
                    <span className="dashboard-summary-pill workbench-pill neutral">{selectedRun.trigger_type}</span>
                    <span className="dashboard-summary-pill workbench-pill neutral">{summarizeStats(selectedRun.stats_json)}</span>
                  </div>
                  {selectedRunProgress?.status === "running" ? (
                    <div className="collector-toolbar" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="workbench-danger-action"
                        onClick={() => handleStopRun(selectedRun)}
                        disabled={stoppingRunId === selectedRun.id}
                      >
                        {stoppingRunId === selectedRun.id ? "停止中..." : UI_TEXT.stopRun}
                      </button>
                    </div>
                  ) : null}
                </div>

                {selectedRunProgress ? (
                  <section className="card manual-run-progress-card workbench-layer" data-testid="logs-run-progress">
                    <div className="manual-run-progress-head">
                      <div className="manual-run-progress-copy">
                        <div className="workbench-section-eyebrow">执行进度</div>
                        <div className="manual-run-progress-title">
                          {selectedRunProgress.status === "success"
                            ? "当前运行已完成"
                            : selectedRunProgress.status === "failed"
                              ? "当前运行已结束"
                              : "当前运行正在抓取"}
                        </div>
                        <div className="kv">
                          {selectedRunProgress.totalQueries > 0
                            ? `已完成 ${selectedRunProgress.completedQueries} / ${selectedRunProgress.totalQueries} 个查询切片`
                            : "等待返回查询总数"}
                        </div>
                      </div>
                      <div className="manual-run-progress-side">
                        <span className={`dashboard-summary-pill workbench-pill ${executionStatusTone(selectedRunProgress.status)}`}>
                          {executionStatusLabel(selectedRunProgress.status)}
                        </span>
                        <div className="manual-run-progress-percent">{`${selectedRunProgress.progressPercent}%`}</div>
                      </div>
                    </div>
                    <div
                      className="manual-run-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={selectedRunProgress.progressPercent}
                    >
                      <div className="manual-run-progress-fill" style={{ width: `${selectedRunProgress.progressPercent}%` }} />
                    </div>
                    <div className="manual-run-progress-meta">
                      <span>{`查询 ${selectedRunProgress.completedQueries} / ${selectedRunProgress.totalQueries}`}</span>
                      <span>{`raw ${selectedRunProgress.fetchedRaw}`}</span>
                      <span>{`errors ${selectedRunProgress.queryErrors}`}</span>
                    </div>
                  </section>
                ) : null}

                <div className="logs-run-section-title">{UI_TEXT.runDetail}</div>
                <div className="logs-detail-grid">
                  <div className="flat-row">
                    <span>Run ID</span>
                    <strong>#{selectedRun.id}</strong>
                  </div>
                  <div className="flat-row">
                    <span>{UI_TEXT.triggerType}</span>
                    <strong>{selectedRun.trigger_type}</strong>
                  </div>
                  <div className="flat-row">
                    <span>{UI_TEXT.status}</span>
                    <strong>{selectedRun.status}</strong>
                  </div>
                  <div className="flat-row">
                    <span>{UI_TEXT.job}</span>
                    <strong>{selectedRun.job_id ? `#${selectedRun.job_id}` : "--"}</strong>
                  </div>
                  <div className="flat-row">
                    <span>{UI_TEXT.startedAt}</span>
                    <strong>{formatUtcPlus8Time(selectedRun.started_at)}</strong>
                  </div>
                  <div className="flat-row">
                    <span>{UI_TEXT.endedAt}</span>
                    <strong>{formatUtcPlus8Time(selectedRun.ended_at)}</strong>
                  </div>
                  <div className="flat-row flat-row-wide">
                    <span>{UI_TEXT.statsSummary}</span>
                    <strong>{summarizeStats(selectedRun.stats_json)}</strong>
                  </div>
                </div>
                <div className="logs-detail-block flat-section">
                  <div className="logs-run-section-title">{UI_TEXT.errorInfo}</div>
                  <pre className="logs-pre">{selectedRun.error_text || UI_TEXT.noError}</pre>
                </div>
                <div className="logs-detail-block flat-section">
                  <div className="logs-run-section-title">stats_json</div>
                  <pre className="logs-pre">{JSON.stringify(selectedRun.stats_json || {}, null, 2)}</pre>
                </div>
              </aside>
            ) : (
              <div className="logs-run-detail flat-section">{UI_TEXT.selectRun}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
