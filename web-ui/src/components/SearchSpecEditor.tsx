import { SearchSpec } from "../api";
import { buildQueryPreview, splitCommaLines, joinCommaLines } from "../collector";

type Props = {
  value: SearchSpec;
  onChange: (next: SearchSpec) => void;
  disabled?: boolean;
};

export function SearchSpecEditor({ value, onChange, disabled = false }: Props) {
  function update<K extends keyof SearchSpec>(key: K, next: SearchSpec[K]) {
    onChange({ ...value, [key]: next });
  }

  function updateMetric(key: keyof SearchSpec["min_metrics"], next: number) {
    onChange({
      ...value,
      min_metrics: {
        ...value.min_metrics,
        [key]: next,
      },
    });
  }

  return (
    <div className="collector-panel">
      <div className="collector-grid collector-grid-2">
        <label className="field">
          <span>包含关键词</span>
          <textarea value={joinCommaLines(value.all_keywords)} onChange={(e) => update("all_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>精确短语</span>
          <textarea value={joinCommaLines(value.exact_phrases)} onChange={(e) => update("exact_phrases", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>任意词（OR）</span>
          <textarea value={joinCommaLines(value.any_keywords)} onChange={(e) => update("any_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>排除词</span>
          <textarea value={joinCommaLines(value.exclude_keywords)} onChange={(e) => update("exclude_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>作者白名单</span>
          <textarea value={joinCommaLines(value.authors_include)} onChange={(e) => update("authors_include", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>作者黑名单</span>
          <textarea value={joinCommaLines(value.authors_exclude)} onChange={(e) => update("authors_exclude", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
      </div>

      <div className="collector-grid collector-grid-4" style={{ marginTop: 12 }}>
        <label className="field">
          <span>语言</span>
          <input value={value.language} onChange={(e) => update("language", e.target.value)} placeholder="如 en / zh" disabled={disabled} />
        </label>
        <label className="field">
          <span>最近天数</span>
          <input type="number" value={value.days} onChange={(e) => update("days", Number(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>最大结果数</span>
          <input type="number" value={value.max_results} onChange={(e) => update("max_results", Number(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>互动条件模式</span>
          <select value={value.metric_mode} onChange={(e) => update("metric_mode", e.target.value as SearchSpec["metric_mode"])} disabled={disabled}>
            <option value="OR">OR</option>
            <option value="AND">AND</option>
          </select>
        </label>
      </div>

      <div className="collector-grid collector-grid-4" style={{ marginTop: 12 }}>
        <label className="field">
          <span>最小浏览</span>
          <input type="number" value={value.min_metrics.views} onChange={(e) => updateMetric("views", Number(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>最小点赞</span>
          <input type="number" value={value.min_metrics.likes} onChange={(e) => updateMetric("likes", Number(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>最小回复</span>
          <input type="number" value={value.min_metrics.replies} onChange={(e) => updateMetric("replies", Number(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>最小转推</span>
          <input type="number" value={value.min_metrics.retweets} onChange={(e) => updateMetric("retweets", Number(e.target.value))} disabled={disabled} />
        </label>
      </div>

      <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
        <label className="field checkbox-row">
          <span>包含转推</span>
          <input type="checkbox" checked={value.include_retweets} onChange={(e) => update("include_retweets", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>包含回复</span>
          <input type="checkbox" checked={value.include_replies} onChange={(e) => update("include_replies", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>必须含媒体</span>
          <input type="checkbox" checked={value.require_media} onChange={(e) => update("require_media", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>必须含链接</span>
          <input type="checkbox" checked={value.require_links} onChange={(e) => update("require_links", e.target.checked)} disabled={disabled} />
        </label>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span>附加原生 X 搜索语法</span>
        <input value={value.raw_query} onChange={(e) => update("raw_query", e.target.value)} disabled={disabled} placeholder="例如 min_faves:20" />
      </label>

      <div className="collector-query-preview" style={{ marginTop: 12 }}>
        <div className="collector-subtitle">最终查询语句</div>
        <code>{buildQueryPreview(value) || "--"}</code>
      </div>
    </div>
  );
}
