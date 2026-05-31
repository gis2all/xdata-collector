import { executionStatusLabel, executionStatusTone } from "../../runProgress";
import type { ManualSearchPageState } from "./useManualSearchPageState";

type ManualSearchPageHeaderProps = {
  state: ManualSearchPageState;
};

export function ManualSearchPageHeader({ state }: ManualSearchPageHeaderProps) {
  return (
    <>
      <header className="card collector-hero manual-page-header workbench-page-header" data-testid="manual-page-header">
        <div className="manual-page-header-copy workbench-page-header-copy">
          <h3>手动执行任务</h3>
          <p className="kv">当前页面编辑的是任务草稿，可直接执行，不需要先保存为任务包。</p>
        </div>
        <div className="manual-page-header-actions workbench-page-header-actions">
          <button
            type="button"
            className="workbench-primary-action"
            onClick={() => void state.onRun()}
            data-testid="manual-run-button"
            disabled={state.loading}
          >
            {state.loading ? "执行中..." : "立即执行任务"}
          </button>
          {state.runProgress.status === "running" ? (
            <button
              type="button"
              className="workbench-danger-action"
              onClick={() => void state.onStopRun()}
              data-testid="manual-stop-run-button"
            >
              停止执行
            </button>
          ) : null}
        </div>
      </header>

      {state.progressVisible ? (
        <section className="card manual-run-progress-card workbench-layer" data-testid="manual-run-progress">
          <div className="manual-run-progress-head">
            <div className="manual-run-progress-copy">
              <div className="workbench-section-eyebrow">执行进度</div>
              <div className="manual-run-progress-title">
                {state.runProgress.status === "success"
                  ? "本次执行已完成"
                  : state.runProgress.status === "failed"
                    ? "本次执行已结束"
                    : "正在按查询计划抓取"}
              </div>
              <div className="kv">
                {state.runProgress.totalQueries > 0
                  ? `已完成 ${state.progressQueryLabel} 个查询切片`
                  : state.runProgress.runId
                    ? `执行任务 #${state.runProgress.runId} 已启动，等待返回查询总数`
                    : "正在创建执行任务..."}
              </div>
            </div>
            <div className="manual-run-progress-side">
              <span className={`jobs-summary-pill workbench-pill ${executionStatusTone(state.runProgress.status)}`}>
                {executionStatusLabel(state.runProgress.status)}
              </span>
              <div className="manual-run-progress-percent">{state.progressPercentLabel}</div>
            </div>
          </div>
          {state.runProgress.status === "running" ? (
            <div className="collector-toolbar" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="workbench-danger-action"
                onClick={() => void state.onStopRun()}
                data-testid="manual-stop-run-progress-button"
              >
                停止执行
              </button>
            </div>
          ) : null}
          <div
            className="manual-run-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.runProgress.progressPercent}
          >
            <div className="manual-run-progress-fill" style={{ width: `${state.runProgress.progressPercent}%` }} />
          </div>
          <div className="manual-run-progress-meta">
            <span>{`查询 ${state.progressQueryLabel}`}</span>
            <span>{`raw ${state.runProgress.fetchedRaw}`}</span>
            <span>{`errors ${state.runProgress.queryErrors}`}</span>
          </div>
        </section>
      ) : null}

      {state.error ? (
        <div className="alert error" data-testid="manual-error">
          {state.error}
        </div>
      ) : null}
      {state.message ? <div className="alert success">{state.message}</div> : null}
    </>
  );
}
