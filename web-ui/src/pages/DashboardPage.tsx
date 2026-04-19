import { useState } from "react";
import { DatabaseHealth, HealthSnapshot, XHealth, health } from "../api";
import { formatUtcPlus8Time } from "../time";

const DASHBOARD_HEALTH_STATE_KEY = "dashboard.healthSnapshot.v1";

function healthStatus(target: { configured: boolean; connected: boolean; last_error: string }) {
  if (!target.configured) return "未配置";
  if (target.connected && target.last_error) return "最近成功";
  if (target.connected) return "已连接";
  if (target.last_error) return "最近校验失败";
  return "已配置";
}

function healthTone(target: { configured: boolean; connected: boolean; last_error: string }) {
  if (!target.configured) return "neutral";
  if (target.connected) return "success";
  if (target.last_error) return "danger";
  return "neutral";
}

function renderDatabaseInfo(info: DatabaseHealth) {
  return (
    <div className="dashboard-detail-grid">
      <div className="dashboard-detail-item">
        <span>{"数据库路径"}</span>
        <strong>{info.db_path || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"文件存在"}</span>
        <strong>{info.db_exists ? "是" : "否"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"任务数"}</span>
        <strong>{info.job_count}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"运行数"}</span>
        <strong>{info.run_count}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"最近校验"}</span>
        <strong>{formatUtcPlus8Time(info.last_checked_at, "尚未校验")}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"最近错误"}</span>
        <strong>{info.last_error || "无"}</strong>
      </div>
    </div>
  );
}

function renderXInfo(info: XHealth) {
  return (
    <div className="dashboard-detail-grid">
      <div className="dashboard-detail-item">
        <span>{"认证来源"}</span>
        <strong>{info.auth_source || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"浏览器提示"}</span>
        <strong>{info.browser_hint || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"账号摘要"}</span>
        <strong>{info.account_hint || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>{"最近校验"}</span>
        <strong>{formatUtcPlus8Time(info.last_checked_at, "尚未校验")}</strong>
      </div>
      <div className="dashboard-detail-item dashboard-detail-item-wide">
        <span>{"最近错误"}</span>
        <strong>{info.last_error || "无"}</strong>
      </div>
    </div>
  );
}

function readStoredDashboardHealth() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as HealthSnapshot;
  } catch {
    window.localStorage.removeItem(DASHBOARD_HEALTH_STATE_KEY);
    return null;
  }
}

function writeStoredDashboardHealth(snapshot: HealthSnapshot) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(snapshot));
}

export function DashboardPage() {
  const [state, setState] = useState<HealthSnapshot | null>(() => readStoredDashboardHealth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);
    try {
      const next = await health();
      setState(next);
      writeStoredDashboardHealth(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const summaryTitle = state ? "运行总览快照" : "尚未校验";
  const summaryDescription = state
    ? "当前页面保持上一次主动“重新加载”后的展示状态，页面刷新不会自动重新校验。"
    : "页面刷新不会自动重新校验，只有点击“重新加载”后才会更新当前展示状态。";
  const updatedAtLabel = state?.summary.source === "runtime_snapshot"
    ? "运行快照更新"
    : "当前展示更新";
  const updatedAtValue = state
    ? `${updatedAtLabel}：${formatUtcPlus8Time(state.summary.updated_at, "尚未校验")}`
    : "页面刷新不会自动重新校验";
  const dbStatusLabel = state ? healthStatus(state.db) : "尚未校验";
  const xStatusLabel = state ? healthStatus(state.x) : "尚未校验";
  const dbStatusTone = state ? healthTone(state.db) : "neutral";
  const xStatusTone = state ? healthTone(state.x) : "neutral";

  return (
    <div className="dashboard-page" data-testid="dashboard-page">
      <section className="card dashboard-page-header" data-testid="dashboard-page-header">
        <div className="dashboard-page-header-copy">
          <h3>{"运行总览"}</h3>
          <p className="kv">{"快速查看本地数据库与 X 会话的上次已知状态，只有点击“重新加载”才会主动重新校验。"}</p>
        </div>
        <div className="dashboard-page-header-actions">
          <button type="button" onClick={loadHealth} disabled={loading}>
            {loading ? "重新加载中..." : "重新加载"}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{`错误: ${error}`}</div>}

      <section className="card dashboard-summary" data-testid="dashboard-summary">
        <div className="dashboard-summary-hero">
          <div className="dashboard-summary-copy">
            <div className="dashboard-summary-eyebrow">{"当前状态"}</div>
            <h4 className="dashboard-summary-title">{summaryTitle}</h4>
            <p className="kv">{summaryDescription}</p>
          </div>
          <div className="dashboard-summary-pills">
            <span className={`dashboard-summary-pill ${dbStatusTone}`}>{`本地数据库：${dbStatusLabel}`}</span>
            <span className={`dashboard-summary-pill ${xStatusTone}`}>{`X 会话：${xStatusLabel}`}</span>
            <span className="dashboard-summary-pill neutral">{updatedAtValue}</span>
          </div>
        </div>
      </section>

      {state && (
        <section className="dashboard-panels" data-testid="dashboard-panels">
          <section className="card dashboard-status-card" data-testid="dashboard-db-info">
            <div className="dashboard-status-card-hero">
              <div className="dashboard-status-card-copy">
                <div className="dashboard-status-eyebrow">{"本地数据库"}</div>
                <h4>{"DB 连接与运行数据"}</h4>
                <p className="kv">{"聚合路径、文件存在、任务数、运行数和最近校验结果。"}</p>
              </div>
              <span className={`dashboard-summary-pill ${dbStatusTone}`}>{dbStatusLabel}</span>
            </div>
            {renderDatabaseInfo(state.db)}
          </section>

          <section className="card dashboard-status-card" data-testid="dashboard-x-info">
            <div className="dashboard-status-card-hero">
              <div className="dashboard-status-card-copy">
                <div className="dashboard-status-eyebrow">{"X 会话"}</div>
                <h4>{"认证与会话状态"}</h4>
                <p className="kv">{"聚合认证来源、账号摘要、浏览器提示与最近校验结果。"}</p>
              </div>
              <span className={`dashboard-summary-pill ${xStatusTone}`}>{xStatusLabel}</span>
            </div>
            {renderXInfo(state.x)}
          </section>
        </section>
      )}
    </div>
  );
}
