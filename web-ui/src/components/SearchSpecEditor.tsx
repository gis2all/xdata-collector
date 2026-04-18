import { LanguageMode, RangeFilter, RangeMode, SearchSpec } from "../api";
import { buildQueryPreview, joinCommaLines, splitCommaLines } from "../collector";

type Props = {
  value: SearchSpec;
  onChange: (next: SearchSpec) => void;
  disabled?: boolean;
};

const LANGUAGE_OPTIONS: Array<{ value: LanguageMode; label: string }> = [
  { value: "zh", label: "\u4e2d\u6587" },
  { value: "en", label: "\u82f1\u6587" },
  { value: "zh_en", label: "\u4e2d\u6587 + \u82f1\u6587" },
];

const RANGE_MODE_OPTIONS: Array<{ value: RangeMode; label: string }> = [
  { value: "any", label: "\u4e0d\u9650" },
  { value: "gte", label: "\u81f3\u5c11" },
  { value: "lte", label: "\u81f3\u591a" },
  { value: "between", label: "\u533a\u95f4" },
];

const TEXT = {
  allKeywords: "\u5305\u542b\u5173\u952e\u8bcd",
  exactPhrases: "\u7cbe\u786e\u77ed\u8bed",
  anyKeywords: "\u4efb\u610f\u8bcd (OR)",
  excludeKeywords: "\u6392\u9664\u8bcd",
  authorsInclude: "\u4f5c\u8005\u767d\u540d\u5355",
  authorsExclude: "\u4f5c\u8005\u9ed1\u540d\u5355",
  language: "\u8bed\u8a00",
  publishedRange: "\u53d1\u5e03\u65f6\u95f4\u8303\u56f4",
  maxDaysHint: "\u6700\u5927 100 \u5929",
  maxResults: "\u6700\u5927\u7ed3\u679c\u6570",
  views: "\u6d4f\u89c8\u91cf",
  likes: "\u70b9\u8d5e\u6570",
  replies: "\u56de\u590d\u6570",
  retweets: "\u8f6c\u63a8\u6570",
  includeRetweets: "\u5305\u542b\u8f6c\u63a8",
  includeReplies: "\u5305\u542b\u56de\u590d",
  requireMedia: "\u5fc5\u987b\u542b\u5a92\u4f53",
  requireLinks: "\u5fc5\u987b\u542b\u94fe\u63a5",
  rawQuery: "\u9644\u52a0\u539f\u751f X \u641c\u7d22\u8bed\u6cd5",
  rawQueryPlaceholder: "\u4f8b\u5982 min_faves:20",
  querySummary: "\u67e5\u8be2\u6458\u8981",
  between: "\u5230",
} as const;

function normalizeNumberInput(value: string, maximum?: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.max(0, Math.trunc(parsed));
  return typeof maximum === "number" ? Math.min(maximum, normalized) : normalized;
}

function buildRangeValue(mode: RangeMode, current: RangeFilter, nextRaw: Partial<RangeFilter>, maximum?: number): RangeFilter {
  const min = normalizeNumberInput(String(nextRaw.min ?? current.min ?? ""), maximum);
  const max = normalizeNumberInput(String(nextRaw.max ?? current.max ?? ""), maximum);
  if (mode === "gte") return { mode, min: min ?? 0, max: null };
  if (mode === "lte") return { mode, min: null, max: max ?? 0 };
  if (mode === "between") {
    const left = min ?? 0;
    const right = max ?? left;
    return left <= right ? { mode, min: left, max: right } : { mode, min: right, max: left };
  }
  return { mode: "any", min: null, max: null };
}

type RangeFieldProps = {
  label: string;
  value: RangeFilter;
  onChange: (next: RangeFilter) => void;
  disabled: boolean;
  maximum?: number;
  hint?: string;
};

function RangeField({ label, value, onChange, disabled, maximum, hint }: RangeFieldProps) {
  const mode = value.mode || "any";

  return (
    <label className="field">
      <span>{label}</span>
      <div className="collector-range-field">
        <select
          aria-label={`${label}-mode`}
          value={mode}
          onChange={(e) => onChange(buildRangeValue(e.target.value as RangeMode, value, {}, maximum))}
          disabled={disabled}
        >
          {RANGE_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {mode === "gte" && (
          <input
            aria-label={`${label}-min`}
            type="number"
            value={value.min ?? 0}
            onChange={(e) => onChange(buildRangeValue("gte", value, { min: e.target.value }, maximum))}
            disabled={disabled}
          />
        )}
        {mode === "lte" && (
          <input
            aria-label={`${label}-max`}
            type="number"
            value={value.max ?? 0}
            onChange={(e) => onChange(buildRangeValue("lte", value, { max: e.target.value }, maximum))}
            disabled={disabled}
          />
        )}
        {mode === "between" && (
          <>
            <input
              aria-label={`${label}-min`}
              type="number"
              value={value.min ?? 0}
              onChange={(e) => onChange(buildRangeValue("between", value, { min: e.target.value }, maximum))}
              disabled={disabled}
            />
            <span className="kv">{TEXT.between}</span>
            <input
              aria-label={`${label}-max`}
              type="number"
              value={value.max ?? 0}
              onChange={(e) => onChange(buildRangeValue("between", value, { max: e.target.value }, maximum))}
              disabled={disabled}
            />
          </>
        )}
      </div>
      {hint && <div className="kv">{hint}</div>}
    </label>
  );
}

export function SearchSpecEditor({ value, onChange, disabled = false }: Props) {
  function update<K extends keyof SearchSpec>(key: K, next: SearchSpec[K]) {
    onChange({ ...value, [key]: next });
  }

  function updateMetric(metric: keyof SearchSpec["metric_filters"], next: RangeFilter) {
    onChange({
      ...value,
      metric_filters: {
        ...value.metric_filters,
        [metric]: next,
      },
      metric_filters_explicit: true,
    });
  }

  return (
    <div className="collector-panel">
      <div className="collector-grid collector-grid-2">
        <label className="field">
          <span>{TEXT.allKeywords}</span>
          <textarea value={joinCommaLines(value.all_keywords)} onChange={(e) => update("all_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>{TEXT.exactPhrases}</span>
          <textarea value={joinCommaLines(value.exact_phrases)} onChange={(e) => update("exact_phrases", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>{TEXT.anyKeywords}</span>
          <textarea value={joinCommaLines(value.any_keywords)} onChange={(e) => update("any_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>{TEXT.excludeKeywords}</span>
          <textarea value={joinCommaLines(value.exclude_keywords)} onChange={(e) => update("exclude_keywords", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>{TEXT.authorsInclude}</span>
          <textarea value={joinCommaLines(value.authors_include)} onChange={(e) => update("authors_include", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
        <label className="field">
          <span>{TEXT.authorsExclude}</span>
          <textarea value={joinCommaLines(value.authors_exclude)} onChange={(e) => update("authors_exclude", splitCommaLines(e.target.value))} disabled={disabled} />
        </label>
      </div>

      <div className="collector-grid collector-grid-3" style={{ marginTop: 12 }}>
        <label className="field">
          <span>{TEXT.language}</span>
          <select value={value.language_mode} onChange={(e) => update("language_mode", e.target.value as LanguageMode)} disabled={disabled}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <RangeField
          label={TEXT.publishedRange}
          value={value.days_filter}
          onChange={(next) => update("days_filter", next)}
          disabled={disabled}
          maximum={100}
          hint={TEXT.maxDaysHint}
        />
        <label className="field">
          <span>{TEXT.maxResults}</span>
          <input type="number" value={value.max_results} onChange={(e) => update("max_results", Number(e.target.value))} disabled={disabled} />
        </label>
      </div>

      <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
        <RangeField label={TEXT.views} value={value.metric_filters.views} onChange={(next) => updateMetric("views", next)} disabled={disabled} />
        <RangeField label={TEXT.likes} value={value.metric_filters.likes} onChange={(next) => updateMetric("likes", next)} disabled={disabled} />
        <RangeField label={TEXT.replies} value={value.metric_filters.replies} onChange={(next) => updateMetric("replies", next)} disabled={disabled} />
        <RangeField label={TEXT.retweets} value={value.metric_filters.retweets} onChange={(next) => updateMetric("retweets", next)} disabled={disabled} />
      </div>

      <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
        <label className="field checkbox-row">
          <span>{TEXT.includeRetweets}</span>
          <input type="checkbox" checked={value.include_retweets} onChange={(e) => update("include_retweets", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>{TEXT.includeReplies}</span>
          <input type="checkbox" checked={value.include_replies} onChange={(e) => update("include_replies", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>{TEXT.requireMedia}</span>
          <input type="checkbox" checked={value.require_media} onChange={(e) => update("require_media", e.target.checked)} disabled={disabled} />
        </label>
        <label className="field checkbox-row">
          <span>{TEXT.requireLinks}</span>
          <input type="checkbox" checked={value.require_links} onChange={(e) => update("require_links", e.target.checked)} disabled={disabled} />
        </label>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span>{TEXT.rawQuery}</span>
        <input value={value.raw_query} onChange={(e) => update("raw_query", e.target.value)} disabled={disabled} placeholder={TEXT.rawQueryPlaceholder} />
      </label>

      <div className="collector-query-preview" style={{ marginTop: 12 }}>
        <div className="collector-subtitle">{TEXT.querySummary}</div>
        <code>{buildQueryPreview(value) || "--"}</code>
      </div>
    </div>
  );
}
