import { executionStatusLabel, executionStatusTone } from "../../runProgress";
import { ManualSectionHeader } from "../manualSearchModel";
import type { ManualSearchPageState } from "./useManualSearchPageState";

type ManualExecutionRailProps = {
  state: ManualSearchPageState;
};

export function ManualExecutionRail({ state }: ManualExecutionRailProps) {
  return (
    <aside className="card manual-execution-rail workbench-layer" data-testid="manual-execution-rail">
      <ManualSectionHeader title="执行摘要" description="这里只展示草稿状态和最近一次执行结果。" />
      <div className="manual-rail-hero flat-section">
        <div className="manual-rail-pills workbench-pill-row">
          <span className="jobs-summary-pill workbench-pill">{`当前草稿：${state.currentDraftStatusLabel}`}</span>
          <span className="jobs-summary-pill workbench-pill">{`最近状态：${state.lastExecutionStatusLabel}`}</span>
          <span className="jobs-summary-pill workbench-pill">{`最近执行：${state.lastExecutionTimeLabel}`}</span>
        </div>
        <div className={`manual-execution-note ${state.lastExecution.status === "failed" ? "failed" : ""}`}>
          {state.lastExecution.status === "idle"
            ? "尚未执行"
            : state.lastExecution.status === "failed"
              ? state.lastExecution.errorText || "最近执行失败，请检查任务正文后重试。"
              : "最近执行完成，可查看下方结果。"}
        </div>
      </div>
      <div className="manual-rail-grid flat-row-list">
        <div className="flat-row">
          <span>草稿状态</span>
          <strong>{state.currentDraftStatusLabel}</strong>
        </div>
        <div className="flat-row">
          <span>最近执行</span>
          <strong>{state.lastExecutionTimeLabel}</strong>
        </div>
        <div className="flat-row">
          <span>最近一次结果</span>
          <strong>
            <span className={`badge ${executionStatusTone(state.lastExecution.status)}`}>
              {executionStatusLabel(state.lastExecution.status)}
            </span>
          </strong>
        </div>
        <div className="flat-row">
          <span>raw_total</span>
          <strong>{state.lastExecution.status === "idle" ? "--" : `${state.lastExecution.rawTotal} 条`}</strong>
        </div>
        <div className="flat-row">
          <span>matched_total</span>
          <strong>{state.lastExecution.status === "idle" ? "--" : `${state.lastExecution.matchedTotal} 条`}</strong>
        </div>
        <div className="flat-row">
          <span>errors</span>
          <strong>{state.lastExecution.status === "idle" ? "--" : `${state.lastExecution.errorCount} 条`}</strong>
        </div>
      </div>
      <div className="manual-rail-footer">
        <div className="kv manual-rail-caption">完整执行输出会在下方全宽结果区展开，不会挤压右侧执行轨。</div>
        <button
          type="button"
          className="manual-results-link workbench-secondary-action"
          data-testid="manual-scroll-results"
          onClick={state.scrollToResults}
        >
          查看执行结果
        </button>
      </div>
    </aside>
  );
}
