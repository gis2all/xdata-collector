import type { ReactNode } from "react";

import type { CuratedItemRecord, ItemTable, RawItemRecord, ResultItemRecord } from "../../api";
import { formatUtcPlus8Time } from "../../time";

type ResultsDetailRailProps = {
  item: ResultItemRecord | null;
  table: ItemTable;
  tableLabel: string;
  total: number;
};

function renderFact(label: string, value: string) {
  return (
    <div className="results-detail-fact">
      <div className="results-detail-fact-label">{label}</div>
      <div className="results-detail-fact-value">{value || "--"}</div>
    </div>
  );
}

function renderSection(title: string, content: ReactNode, testId?: string) {
  return (
    <section className="results-detail-section results-detail-card" data-testid={testId}>
      <div className="results-detail-section-head">
        <div className="results-detail-section-title">{title}</div>
      </div>
      <div className="results-detail-section-body">{content}</div>
    </section>
  );
}

function renderCuratedItem(item: CuratedItemRecord, tableLabel: string) {
  const reasons = JSON.stringify(item.reasons_json ?? [], null, 2);
  const summary = item.summary_zh || item.excerpt || "--";
  const title = item.title || summary || "--";
  const heroMeta = `${item.author || "--"} · ${formatUtcPlus8Time(item.created_at_x)}`;

  return (
    <div className="results-detail-body">
      <div
        className="results-detail-hero results-detail-card results-detail-card-accent workbench-summary-panel"
        data-testid="results-detail-hero"
      >
        <div className="results-detail-eyebrow">筛选结果详情</div>
        <h4 className="results-detail-title">{title}</h4>
        <div className="results-detail-meta">
          <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level || "--"}</span>
          <span className="kv">{heroMeta}</span>
        </div>
        <div className="results-detail-hero-pills workbench-pill-row" data-testid="results-detail-hero-pills">
          <span className="results-summary-pill workbench-pill">{tableLabel}</span>
          <span className="results-summary-pill workbench-pill">{`记录 #${item.id}`}</span>
          <span className="results-summary-pill workbench-pill">{`等级 ${item.level || "--"}`}</span>
          <span className="results-summary-pill workbench-pill">{`分数 ${item.score ?? "--"}`}</span>
        </div>
      </div>

      {renderSection(
        "内容摘要",
        <p className="results-detail-copy">{summary}</p>,
        "results-detail-summary-section",
      )}

      {renderSection(
        "命中线索",
        <pre className="results-detail-code">{reasons}</pre>,
        "results-detail-clues-section",
      )}

      {renderSection(
        "记录信息",
        <div className="results-detail-fact-grid workbench-summary-grid">
          {renderFact("状态", item.state || "--")}
          {renderFact("等级", item.level || "--")}
          {renderFact("来源链接", item.source_url || "--")}
          {renderFact("去重键", item.dedupe_key || "--")}
        </div>,
        "results-detail-info-section",
      )}
    </div>
  );
}

function renderRawItem(item: RawItemRecord, tableLabel: string) {
  const title = item.author || item.tweet_id || "--";
  const body = item.text || "--";
  const heroMeta = `${item.author || "--"} · ${formatUtcPlus8Time(item.created_at_x)}`;

  return (
    <div className="results-detail-body">
      <div
        className="results-detail-hero results-detail-card results-detail-card-accent workbench-summary-panel"
        data-testid="results-detail-hero"
      >
        <div className="results-detail-eyebrow">原始记录详情</div>
        <h4 className="results-detail-title">{title}</h4>
        <div className="results-detail-meta">
          <span className="kv">{heroMeta}</span>
        </div>
        <div className="results-detail-hero-pills workbench-pill-row" data-testid="results-detail-hero-pills">
          <span className="results-summary-pill workbench-pill">{tableLabel}</span>
          <span className="results-summary-pill workbench-pill">{`记录 #${item.id}`}</span>
          <span className="results-summary-pill workbench-pill">{`推文 ${item.tweet_id || "--"}`}</span>
        </div>
      </div>

      {renderSection(
        "原始正文",
        <p className="results-detail-copy">{body}</p>,
        "results-detail-body-section",
      )}

      {renderSection(
        "采集信息",
        <div className="results-detail-fact-grid workbench-summary-grid">
          {renderFact("查询名称", item.query_name || "--")}
          {renderFact("运行 ID", String(item.run_id ?? "--"))}
          {renderFact("推文 ID", item.tweet_id || "--")}
          {renderFact("采集时间", formatUtcPlus8Time(item.fetched_at))}
        </div>,
        "results-detail-collect-section",
      )}

      {renderSection(
        "互动指标",
        <div className="results-detail-fact-grid workbench-summary-grid">
          {renderFact("浏览", String(item.views ?? "--"))}
          {renderFact("点赞", String(item.likes ?? "--"))}
          {renderFact("回复", String(item.replies ?? "--"))}
          {renderFact("转推", String(item.retweets ?? "--"))}
        </div>,
        "results-detail-metrics-section",
      )}
    </div>
  );
}

export function ResultsDetailRail({ item, table, tableLabel, total }: ResultsDetailRailProps) {
  if (!item) {
    const emptyTitle = total > 0 ? "尚未聚焦记录" : "当前表暂无记录";
    const emptyDescription =
      total > 0
        ? "从左侧选择记录后，这里会显示正文、线索和关键信息。"
        : "当前范围内暂无可读记录，可先调整关键词或刷新列表。";

    return (
      <div className="results-detail-empty">
        <div
          className="results-detail-hero results-detail-card results-detail-card-accent workbench-summary-panel"
          data-testid="results-detail-hero"
        >
          <div className="results-detail-eyebrow">右侧详情</div>
          <h4 className="results-detail-title">{emptyTitle}</h4>
          <p className="results-detail-copy">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  if (table === "raw") {
    return renderRawItem(item as RawItemRecord, tableLabel);
  }

  return renderCuratedItem(item as CuratedItemRecord, tableLabel);
}
