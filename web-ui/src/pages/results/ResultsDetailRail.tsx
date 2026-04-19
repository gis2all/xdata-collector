import type { CuratedItemRecord, ItemTable, RawItemRecord, ResultItemRecord } from "../../api";
import { formatUtcPlus8Time } from "../../time";

type ResultsDetailRailProps = {
  item: ResultItemRecord | null;
  table: ItemTable;
  tableLabel: string;
  total: number;
  selectedCount: number;
  keywordLabel: string;
};

function renderFact(label: string, value: string) {
  return (
    <div className="results-detail-fact">
      <div className="results-detail-fact-label">{label}</div>
      <div className="results-detail-fact-value">{value || "--"}</div>
    </div>
  );
}

function renderContextPanel(
  tableLabel: string,
  keywordLabel: string,
  total: number,
  selectedCount: number,
  activeRecordLabel: string,
) {
  return (
    <section className="results-detail-context workbench-summary-panel">
      <div className="results-detail-context-header workbench-section-header">
        <div className="workbench-section-copy">
          <div className="workbench-section-eyebrow">{"\u5224\u8bfb\u4e0a\u4e0b\u6587"}</div>
          <h5 className="workbench-section-title">{"\u5f53\u524d\u6d4f\u89c8\u4e0e\u9009\u4e2d\u72b6\u6001"}</h5>
        </div>
      </div>
      <div className="results-detail-context-grid workbench-summary-grid" data-testid="results-detail-context-grid">
        {renderFact("\u5f53\u524d\u8868", tableLabel)}
        {renderFact("\u9009\u4e2d\u8bb0\u5f55", activeRecordLabel)}
        {renderFact("\u5f53\u524d\u5173\u952e\u8bcd", keywordLabel)}
        {renderFact("\u5f53\u524d\u603b\u6570", `${total} \u6761`)}
        {renderFact("\u5df2\u9009\u8bb0\u5f55", `${selectedCount} \u6761`)}
      </div>
    </section>
  );
}

function renderCuratedItem(
  item: CuratedItemRecord,
  tableLabel: string,
  keywordLabel: string,
  total: number,
  selectedCount: number,
) {
  const reasons = JSON.stringify(item.reasons_json ?? [], null, 2);
  const summary = item.summary_zh || item.excerpt || "--";
  const title = item.title || summary || "--";
  const heroLede = `${item.author || "--"} \u00b7 ${formatUtcPlus8Time(item.created_at_x)}`;

  return (
    <div className="results-detail-body">
      <div className="results-detail-hero workbench-summary-panel">
        <div className="results-detail-eyebrow">{"\u7cbe\u9009\u7ed3\u679c\u5224\u8bfb"}</div>
        <h4 className="results-detail-title">{title}</h4>
        <p className="results-detail-lede">{heroLede}</p>
        <div className="results-detail-hero-pills workbench-pill-row" data-testid="results-detail-hero-pills">
          <span className="results-summary-pill workbench-pill">{tableLabel}</span>
          <span className="results-summary-pill workbench-pill">{`\u8bb0\u5f55 #${item.id}`}</span>
          <span className="results-summary-pill workbench-pill">{`level ${item.level || "--"}`}</span>
          <span className="results-summary-pill workbench-pill">{`score ${item.score ?? "--"}`}</span>
        </div>
        <div className="results-detail-meta">
          <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level || "--"}</span>
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      {renderContextPanel(tableLabel, keywordLabel, total, selectedCount, `#${item.id}`)}

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

function renderRawItem(
  item: RawItemRecord,
  tableLabel: string,
  keywordLabel: string,
  total: number,
  selectedCount: number,
) {
  const title = item.author || item.tweet_id || "--";
  const body = item.text || "--";
  const heroLede = `${item.tweet_id || "--"} \u00b7 ${formatUtcPlus8Time(item.created_at_x)}`;

  return (
    <div className="results-detail-body">
      <div className="results-detail-hero workbench-summary-panel">
        <div className="results-detail-eyebrow">{"\u539f\u59cb\u8bb0\u5f55\u8be6\u60c5"}</div>
        <h4 className="results-detail-title">{title}</h4>
        <p className="results-detail-lede">{heroLede}</p>
        <div className="results-detail-hero-pills workbench-pill-row" data-testid="results-detail-hero-pills">
          <span className="results-summary-pill workbench-pill">{tableLabel}</span>
          <span className="results-summary-pill workbench-pill">{`\u8bb0\u5f55 #${item.id}`}</span>
          <span className="results-summary-pill workbench-pill">{`tweet ${item.tweet_id || "--"}`}</span>
        </div>
        <div className="results-detail-meta">
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      {renderContextPanel(tableLabel, keywordLabel, total, selectedCount, `#${item.id}`)}

      <section className="results-detail-section">
        <div className="results-detail-section-title">{"\u539f\u59cb\u6b63\u6587"}</div>
        <p>{body}</p>
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

export function ResultsDetailRail({
  item,
  table,
  tableLabel,
  total,
  selectedCount,
  keywordLabel,
}: ResultsDetailRailProps) {
  if (!item) {
    const emptyTitle = total > 0 ? "\u5c1a\u672a\u805a\u7126\u8bb0\u5f55" : "\u5f53\u524d\u8868\u6682\u65e0\u8bb0\u5f55";
    const emptyDescription =
      total > 0
        ? "\u4ece\u5de6\u4fa7\u8868\u683c\u70b9\u51fb\u4efb\u610f\u4e00\u6761\u8bb0\u5f55\uff0c\u53f3\u4fa7\u4f1a\u7acb\u5373\u5c55\u793a\u5224\u8bfb\u4e0a\u4e0b\u6587\u3001\u6b63\u6587\u548c\u5173\u952e\u4fe1\u606f\u3002"
        : "\u5f53\u524d\u6d4f\u89c8\u8303\u56f4\u8fd8\u6ca1\u6709\u53ef\u5224\u8bfb\u7684\u8bb0\u5f55\uff0c\u53ef\u5148\u8c03\u6574\u5173\u952e\u8bcd\u6216\u5237\u65b0\u5217\u8868\u3002";

    return (
      <div className="results-detail-empty">
        <div className="results-detail-eyebrow">{"\u53f3\u4fa7\u8be6\u60c5\u5224\u8bfb\u8f68"}</div>
        <h4 className="results-detail-title">{emptyTitle}</h4>
        <p>{emptyDescription}</p>
        {renderContextPanel(tableLabel, keywordLabel, total, selectedCount, "--")}
        <div className="results-detail-guide workbench-layer">
          <div className="results-detail-guide-title">{"\u4e0b\u4e00\u6b65\u5efa\u8bae"}</div>
          <ul className="results-detail-guide-list">
            <li>{total > 0 ? "\u5148\u5728\u5de6\u4fa7\u8868\u683c\u9009\u4e2d\u4e00\u6761\u8bb0\u5f55" : "\u5148\u8c03\u6574\u6d4f\u89c8\u8303\u56f4\u6216\u5237\u65b0\u5217\u8868"}</li>
            <li>{"\u518d\u5728\u53f3\u4fa7\u5feb\u901f\u5224\u8bfb\u6b63\u6587\u3001\u7ebf\u7d22\u548c\u5173\u952e\u5b57\u6bb5"}</li>
          </ul>
        </div>
      </div>
    );
  }

  if (table === "raw") {
    return renderRawItem(item as RawItemRecord, tableLabel, keywordLabel, total, selectedCount);
  }

  return renderCuratedItem(item as CuratedItemRecord, tableLabel, keywordLabel, total, selectedCount);
}
