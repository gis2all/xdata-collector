import type { CuratedItemRecord, ItemTable, RawItemRecord, ResultItemRecord } from "../../api";
import { formatUtcPlus8Time } from "../../time";

type ResultsDetailRailProps = {
  item: ResultItemRecord | null;
  table: ItemTable;
};

function renderCuratedItem(item: CuratedItemRecord) {
  const reasons = JSON.stringify(item.reasons_json ?? []);

  return (
    <div className="results-detail-body">
      <div className="results-detail-header">
        <h4>{item.title || item.summary_zh || "--"}</h4>
        <div className="results-detail-meta">
          <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level || "--"}</span>
          <span className="kv">{`score=${item.score ?? "--"}`}</span>
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      <section className="results-detail-section">
        <div className="kv">摘要</div>
        <p>{item.summary_zh || item.excerpt || "--"}</p>
      </section>

      <section className="results-detail-section">
        <div className="kv">判定依据</div>
        <pre>{reasons}</pre>
      </section>
    </div>
  );
}

function renderRawItem(item: RawItemRecord) {
  return (
    <div className="results-detail-body">
      <div className="results-detail-header">
        <h4>{item.author || item.tweet_id || "--"}</h4>
        <div className="results-detail-meta">
          <span className="kv">{item.author || "--"}</span>
          <span className="kv">{formatUtcPlus8Time(item.created_at_x)}</span>
        </div>
      </div>

      <section className="results-detail-section">
        <div className="kv">原始正文</div>
        <p>{item.text || "--"}</p>
      </section>

      <section className="results-detail-section">
        <div className="kv">互动指标</div>
        <div className="results-detail-meta">
          <span className="kv">{String(item.views ?? "--")}</span>
          <span className="kv">{String(item.likes ?? "--")}</span>
          <span className="kv">{String(item.replies ?? "--")}</span>
          <span className="kv">{String(item.retweets ?? "--")}</span>
        </div>
      </section>

      <section className="results-detail-section">
        <div className="kv">补充信息</div>
        <div className="results-detail-meta">
          <span className="kv">{`run_id=${item.run_id}`}</span>
          <span className="kv">{`query_name=${item.query_name || "--"}`}</span>
          <span className="kv">{`tweet_id=${item.tweet_id || "--"}`}</span>
        </div>
      </section>
    </div>
  );
}

export function ResultsDetailRail({ item, table }: ResultsDetailRailProps) {
  if (!item) {
    return (
      <div className="results-detail-empty">
        <div className="kv">尚未选择记录</div>
        <p>选择一条记录后，可在右侧快速判读详情。</p>
      </div>
    );
  }

  if (table === "raw") {
    return renderRawItem(item as RawItemRecord);
  }

  return renderCuratedItem(item as CuratedItemRecord);
}
