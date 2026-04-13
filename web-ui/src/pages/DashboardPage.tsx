import { useEffect, useState } from "react";
import { DatabaseHealth, HealthSnapshot, XHealth, health } from "../api";
import { formatUtcPlus8Time } from "../time";

function healthStatus(target: { configured: boolean; connected: boolean; last_error: string }) {
  if (!target.configured) return "未配置";
  if (target.connected && target.last_error) return "最近成功";
  if (target.connected) return "已连接";
  if (target.last_error) return "最近校验失败";
  return "已配置";
}

function renderDatabaseInfo(info: DatabaseHealth) {
  return (
    <div className="dashboard-detail-grid">
      <div className="dashboard-detail-item">
        <span>数据库路径</span>
        <strong>{info.db_path || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>文件存在</span>
        <strong>{info.db_exists ? "是" : "否"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>任务数</span>
        <strong>{info.job_count}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>运行数</span>
        <strong>{info.run_count}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>最近校验</span>
        <strong>{formatUtcPlus8Time(info.last_checked_at, "\u5c1a\u672a\u6821\u9a8c")}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>最近错误</span>
        <strong>{info.last_error || "无"}</strong>
      </div>
    </div>
  );
}

function renderXInfo(info: XHealth) {
  return (
    <div className="dashboard-detail-grid">
      <div className="dashboard-detail-item">
        <span>认证来源</span>
        <strong>{info.auth_source || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>浏览器提示</span>
        <strong>{info.browser_hint || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>账号摘要</span>
        <strong>{info.account_hint || "unknown"}</strong>
      </div>
      <div className="dashboard-detail-item">
        <span>最近校验</span>
        <strong>{formatUtcPlus8Time(info.last_checked_at, "\u5c1a\u672a\u6821\u9a8c")}</strong>
      </div>
      <div className="dashboard-detail-item dashboard-detail-item-wide">
        <span>最近错误</span>
        <strong>{info.last_error || "无"}</strong>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [state, setState] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setError(null);
    try {
      const next = await health();
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth().catch(() => {});
  }, []);

  return (
    <>
      <div className="card" data-testid="dashboard-health">
        <h3>运行总览</h3>
        <div className="grid-3">
          <div className="kv">
            <b>{state ? healthStatus(state.db) : loading ? "加载中" : "尚未校验"}</b>
            本地数据库
          </div>
          <div className="kv">
            <b>{state ? healthStatus(state.x) : loading ? "加载中" : "尚未校验"}</b>
            X 会话
          </div>
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          {error
            ? `错误: ${error}`
            : state
              ? `后端快照更新时间: ${formatUtcPlus8Time(state.summary.updated_at, "\u5c1a\u672a\u6821\u9a8c")}`
              : loading
                ? "正在读取后端快照..."
                : "尚未刷新"}
        </div>
      </div>

      {state && (
        <>
          <div className="card" data-testid="dashboard-db-info">
            <h3>数据库基本信息</h3>
            {renderDatabaseInfo(state.db)}
          </div>

          <div className="card" data-testid="dashboard-x-info">
            <h3>X 基本信息</h3>
            {renderXInfo(state.x)}
          </div>
        </>
      )}

      <div className="card" data-testid="dashboard-actions">
        <h3>快速操作</h3>
        <div className="row">
          <button type="button" onClick={loadHealth} disabled={loading}>
            {loading ? "刷新中..." : "重新加载"}
          </button>
        </div>
      </div>
    </>
  );
}
