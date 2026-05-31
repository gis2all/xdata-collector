import { executionStatusTone } from "../../runProgress";
import { formatUtcPlus8Time } from "../../time";
import { ManualSectionHeader, formatAuthorDisplay, metricValue } from "../manualSearchModel";
import type { ManualSearchPageState } from "./useManualSearchPageState";

type ManualResultsSectionProps = {
  state: ManualSearchPageState;
};

export function ManualResultsSection({ state }: ManualResultsSectionProps) {
  return (
    <section ref={state.resultsRef} className="card manual-results-section workbench-layer">
      <ManualSectionHeader
        title="执行结果"
        description="完整执行输出仍放在页面下方全宽区域，包含最终查询、原始结果和命中结果。"
      />
      <div className="manual-results-hero flat-meta-strip" data-testid="manual-results-summary-card">
        <div className="manual-results-hero-copy">
          <div className="workbench-section-eyebrow">执行概览</div>
          <div className="collector-subtitle">结果区只负责承载完整输出</div>
          <div className="kv">未执行时保留清晰空状态；执行后在这里先给出状态摘要，再展开完整结果。</div>
        </div>
        <div className="manual-results-hero-pills workbench-pill-row">
          <span className={`jobs-summary-pill workbench-pill ${executionStatusTone(state.lastExecution.status)}`}>
            {state.resultsSummaryStatusLabel}
          </span>
          <span className="jobs-summary-pill workbench-pill">{state.resultsSummaryRawLabel}</span>
          <span className="jobs-summary-pill workbench-pill">{state.resultsSummaryMatchedLabel}</span>
          <span className="jobs-summary-pill workbench-pill">{state.resultsSummaryErrorLabel}</span>
        </div>
      </div>

      {state.loading ? (
        <div className="searching" data-testid="manual-searching">
          <span className="spinner" /> 正在执行任务并评估结果...
        </div>
      ) : state.result ? (
        <div className="collector-stack">
          <div className="collector-summary-grid flat-row-list">
            <div className="flat-row">
              <span>实际查询</span>
              <div>
                {state.displayedResultQueries.map((query) => (
                  <div key={query} className="collector-text-snippet">
                    {query}
                  </div>
                ))}
                {state.hiddenResultQueryCount > 0 ? (
                  <div className="kv">{`还有 ${state.hiddenResultQueryCount} 条时间切片查询未展开`}</div>
                ) : null}
                {!state.resultQueries.length ? <strong>--</strong> : null}
              </div>
            </div>
            <div className="flat-row">
              <span>本次执行规则</span>
              <strong>{state.result.rule_set_summary?.name || "--"}</strong>
            </div>
            <div className="flat-row">
              <span>原始结果</span>
              <strong>{state.result.raw_total}</strong>
            </div>
            <div className="flat-row">
              <span>命中结果</span>
              <strong>{state.result.matched_total}</strong>
            </div>
          </div>

          <div className="collector-result-grid">
            <section className="card">
              <div className="collector-toolbar between">
                <h4>原始结果</h4>
                <span className="kv">{`total=${state.result.raw_items.length}`}</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>作者 / 时间</th>
                    <th>内容</th>
                    <th>互动</th>
                    <th>标记</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.raw_items.map((item) => (
                    <tr key={`${item.tweet_id}-${item.url}`}>
                      <td>
                        <div className="job-name">{formatAuthorDisplay(item.author_name, item.author)}</div>
                        <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                      </td>
                      <td>
                        <div className="collector-text-snippet">{item.text || "--"}</div>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          查看原文
                        </a>
                      </td>
                      <td>
                        <div>views {metricValue(item, "views")}</div>
                        <div>likes {metricValue(item, "likes")}</div>
                        <div>replies {metricValue(item, "replies")}</div>
                        <div>retweets {metricValue(item, "retweets")}</div>
                      </td>
                      <td>
                        <div className="collector-flag-list">
                          {item.flags.has_link ? <span className="badge">link</span> : null}
                          {item.flags.has_media ? <span className="badge">media</span> : null}
                          {item.flags.is_reply ? <span className="badge">reply</span> : null}
                          {item.flags.is_retweet ? <span className="badge">retweet</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <div className="collector-toolbar between">
                <h4>命中结果</h4>
                <span className="kv">{`total=${state.result.matched_items.length}`}</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>等级 / 分数</th>
                    <th>命中原因</th>
                    <th>作者 / 时间</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.matched_items.map((item) => (
                    <tr key={`${item.tweet_id}-${item.url}-matched`}>
                      <td>
                        <div className="job-name">{item.title || item.text}</div>
                        <div className="collector-text-snippet">{item.summary || item.text}</div>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          查看原文
                        </a>
                      </td>
                      <td>
                        <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level}</span>
                        <div className="kv">score {item.score || 0}</div>
                      </td>
                      <td>
                        <div className="collector-reason-list">
                          {item.reasons?.map((reason) => (
                            <div key={`${item.tweet_id}-${reason.rule_id}`} className="collector-reason-item">
                              <strong>{reason.rule_name}</strong>
                              <div className="kv">{reason.matched_conditions.join(" / ")}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="job-name">{formatAuthorDisplay(item.author_name, item.author)}</div>
                        <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                  {!state.result.matched_items.length ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#64748b" }}>
                        本次执行有原始结果，但当前任务正文中的规则没有命中任何线索。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      ) : (
        <div className="manual-results-empty">
          <strong>{state.lastExecution.status === "failed" ? "最近一次执行失败" : "等待执行"}</strong>
          <p className="kv">
            {state.lastExecution.status === "failed"
              ? state.lastExecution.errorText || "最近执行失败，请修正任务正文后重试。"
              : "执行后，这里会展示最终查询、原始结果和命中结果。"}
          </p>
        </div>
      )}
    </section>
  );
}
