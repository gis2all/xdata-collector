import type { CuratedItemRecord, ItemTable, RawItemRecord, ResultItemRecord } from "../../api";
import { formatUtcPlus8Time } from "../../time";

type ResultsDetailRailProps = {
  item: ResultItemRecord | null;
  table: ItemTable;
};

function renderFact(label: string, value: string) {
  return (
    <div className="results-detail-fact">
      <div className="results-detail-fact-label">{label}</div>
      <div className="results-detail-fact-value">{value || "--"}</div>
    </div>
  );
}

function renderCuratedItem(item: CuratedItemRecord) {
  const reasons = JSON.stringify(item.reasons_json ?? [], null, 2);
  const summary = item.summary_zh || item.excerpt || "--";
  const title = item.title || summary || "--";

  return (
    <div className="results-detail-body">
      <div className="results-detail-hero workbench-summary-panel">
        <div className="results-detail-eyebrow">{"\u7cbe\u9009\u7ed3\u679c\u5224\u8bfb"}</div>
        <h4 className="results-detail-title">{title}</h4>
        <div className="results-detail-meta">
          <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level || "--"}</span>
          <span className="kv">{`score=${item.score ?? "--"}`}</span>
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u5185\u5bb9\u6458\u8981"}</div>
        <p>{summary}</p>
      </section>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u547d\u4e2d\u7ebf\u7d22"}</div>
        <pre className="results-detail-code">{reasons}</pre>
      </section>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u7ed3\u679c\u4fe1\u606f"}</div>
        <div className="results-detail-fact-grid workbench-summary-grid">
          {renderFact("state", item.state || "--")}
          {renderFact("level", item.level || "--")}
          {renderFact("source_url", item.source_url || "--")}
          {renderFact("dedupe_key", item.dedupe_key || "--")}
        </div>
      </section>
    </div>
  );
}

function renderRawItem(item: RawItemRecord) {
  return (
    <div className="results-detail-body">
      <div className="results-detail-hero workbench-summary-panel">
        <div className="results-detail-eyebrow">{"\u539f\u59cb\u8bb0\u5f55\u8be6\u60c5"}</div>
        <h4 className="results-detail-title">{item.author || item.tweet_id || "--"}</h4>
        <div className="results-detail-meta">
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u539f\u59cb\u6b63\u6587"}</div>
        <p>{item.text || "--"}</p>
      </section>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u91c7\u96c6\u4fe1\u606f"}</div>
        <div className="results-detail-fact-grid workbench-summary-grid">
          {renderFact("query_name", item.query_name || "--")}
          {renderFact("run_id", String(item.run_id ?? "--"))}
          {renderFact("tweet_id", item.tweet_id || "--")}
          {renderFact("fetched_at", formatUtcPlus8Time(item.fetched_at))}
        </div>
      </section>

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u4e92\u52a8\u6307\u6807"}</div>
        <div className="results-detail-fact-grid">
          {renderFact("views", String(item.views ?? "--"))}
          {renderFact("likes", String(item.likes ?? "--"))}
          {renderFact("replies", String(item.replies ?? "--"))}
          {renderFact("retweets", String(item.retweets ?? "--"))}
        </div>
      </section>
    </div>
  );
}

export function ResultsDetailRail({ item, table }: ResultsDetailRailProps) {
  if (!item) {
    return (
      <div className="results-detail-empty">
        <div className="results-detail-eyebrow">{"\u53f3\u4fa7\u8be6\u60c5\u5224\u8bfb\u8f68"}</div>
        <h4 className="results-detail-title">{"\u5c1a\u672a\u9009\u62e9\u8bb0\u5f55"}</h4>
        <p>{"\u9009\u62e9\u4e00\u6761\u8bb0\u5f55\u540e\uff0c\u53ef\u5728\u53f3\u4fa7\u5feb\u901f\u5224\u8bfb\u8be6\u60c5\u3002"}</p>
        <div className="results-detail-guide workbench-layer">
          <div className="results-detail-guide-title">{"\u5224\u8bfb\u65b9\u5f0f"}</div>
          <div className="results-detail-guide-pills">
            <span className="results-summary-pill workbench-pill">{"\u5148\u626b\u8868\u683c"}</span>
            <span className="results-summary-pill workbench-pill">{"\u518d\u770b\u53f3\u4fa7"}</span>
          </div>
        </div>
      </div>
    );
  }

  if (table === "raw") {
    return renderRawItem(item as RawItemRecord);
  }

  return renderCuratedItem(item as CuratedItemRecord);
}
