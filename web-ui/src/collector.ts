import { LanguageMode, MetricFilters, RangeFilter, RangeMode, RuleCondition, RuleSetDefinition, ScoringRule, SearchSpec } from "./api";

const RANGE_MODES: RangeMode[] = ["any", "gte", "lte", "between"];
const METRIC_KEYS = ["views", "likes", "replies", "retweets"] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

export function defaultRangeFilter(mode: RangeMode = "any", min: number | null = null, max: number | null = null): RangeFilter {
  return { mode, min, max };
}

export function defaultMetricFilters(): MetricFilters {
  return {
    views: defaultRangeFilter("gte", 200, null),
    likes: defaultRangeFilter(),
    replies: defaultRangeFilter("gte", 1, null),
    retweets: defaultRangeFilter(),
  };
}

export const DEFAULT_SEARCH_SPEC: SearchSpec = {
  all_keywords: ["BTC"],
  exact_phrases: [],
  any_keywords: [],
  exclude_keywords: [],
  authors_include: [],
  authors_exclude: [],
  language_mode: "zh_en",
  days_filter: defaultRangeFilter("lte", null, 20),
  metric_filters: defaultMetricFilters(),
  metric_filters_explicit: true,
  max_results: 40,
  include_retweets: false,
  include_replies: true,
  require_media: false,
  require_links: false,
  raw_query: "",
  language: "",
  days: 20,
  metric_mode: "OR",
  min_metrics: {
    views: 200,
    likes: 0,
    replies: 1,
    retweets: 0,
  },
};

export const DEFAULT_RULE_SET_DEFINITION: RuleSetDefinition = {
  levels: [
    { id: "S", label: "\u5f3a\u4fe1\u53f7", min_score: 90, color: "#dc2626" },
    { id: "A", label: "\u9ad8\u4f18\u5148\u7ea7", min_score: 60, color: "#ea580c" },
    { id: "B", label: "\u89c2\u5bdf", min_score: 30, color: "#2563eb" },
  ],
  rules: [
    {
      id: "exclude-trade-gated",
      name: "\u6392\u9664\u4ea4\u6613\u95e8\u69db",
      enabled: true,
      operator: "AND",
      conditions: [{ type: "text_contains_any", values: ["trade", "stake", "\u5145\u503c", "\u4ea4\u6613"] }],
      effect: { action: "exclude", score: 0, level: "" },
    },
    {
      id: "trusted-author-action",
      name: "\u5b98\u65b9\u8d26\u53f7 + \u884c\u52a8\u8bcd",
      enabled: true,
      operator: "AND",
      conditions: [
        { type: "author_in", values: ["galxe", "layer3xyz", "kaitoai"] },
        { type: "text_contains_any", values: ["claim", "quest", "airdrop", "\u79ef\u5206", "\u7a7a\u6295"] },
      ],
      effect: { action: "score", score: 65, level: "A" },
    },
  ],
};

export function splitCommaLines(value: string): string[] {
  return value
    .split(/[\uFF0C,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinCommaLines(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function clampNonNegative(value: unknown, fallback = 0, maximum?: number): number {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
  return typeof maximum === "number" ? Math.min(maximum, normalized) : normalized;
}

function normalizeLanguageMode(value: unknown): LanguageMode {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\+/g, "_")
    .replace(/,/g, "_");
  if (!cleaned || cleaned === "zh_en" || cleaned === "en_zh") return "zh_en";
  if (cleaned === "zh" || cleaned === "en") return cleaned;
  return "zh_en";
}

function normalizeRangeFilter(
  value: Partial<RangeFilter> | undefined,
  fallback: RangeFilter,
  options?: { maximum?: number; legacyValue?: number | null; legacyMode?: Extract<RangeMode, "gte" | "lte"> },
): RangeFilter {
  const maximum = options?.maximum;
  if (value && typeof value === "object") {
    const mode = RANGE_MODES.includes((value.mode as RangeMode) || "any") ? ((value.mode as RangeMode) || "any") : fallback.mode;
    if (mode === "gte") {
      return defaultRangeFilter("gte", clampNonNegative(value.min ?? value.max ?? fallback.min ?? 0, fallback.min ?? 0, maximum), null);
    }
    if (mode === "lte") {
      return defaultRangeFilter("lte", null, clampNonNegative(value.max ?? value.min ?? fallback.max ?? 0, fallback.max ?? 0, maximum));
    }
    if (mode === "between") {
      let min = clampNonNegative(value.min ?? fallback.min ?? 0, fallback.min ?? 0, maximum);
      let max = clampNonNegative(value.max ?? fallback.max ?? min, fallback.max ?? min, maximum);
      if (min > max) [min, max] = [max, min];
      return defaultRangeFilter("between", min, max);
    }
    return defaultRangeFilter("any", null, null);
  }

  if (typeof options?.legacyValue === "number" && options.legacyValue > 0) {
    const numeric = clampNonNegative(options.legacyValue, 0, maximum);
    return options.legacyMode === "gte" ? defaultRangeFilter("gte", numeric, null) : defaultRangeFilter("lte", null, numeric);
  }

  return defaultRangeFilter(fallback.mode, fallback.min ?? null, fallback.max ?? null);
}

function deriveLegacyDaysValue(filter: RangeFilter): number {
  if (filter.mode === "gte") return clampNonNegative(filter.min ?? 0);
  if (filter.mode === "lte" || filter.mode === "between") return clampNonNegative(filter.max ?? 0);
  return 20;
}

function deriveLegacyMinMetrics(filters: MetricFilters) {
  return {
    views: filters.views.mode === "gte" || filters.views.mode === "between" ? clampNonNegative(filters.views.min ?? 0) : 0,
    likes: filters.likes.mode === "gte" || filters.likes.mode === "between" ? clampNonNegative(filters.likes.min ?? 0) : 0,
    replies: filters.replies.mode === "gte" || filters.replies.mode === "between" ? clampNonNegative(filters.replies.min ?? 0) : 0,
    retweets: filters.retweets.mode === "gte" || filters.retweets.mode === "between" ? clampNonNegative(filters.retweets.min ?? 0) : 0,
  };
}

function normalizeMetricFilters(spec?: Partial<SearchSpec>): MetricFilters {
  const fallback = defaultMetricFilters();
  const legacy = spec?.min_metrics;
  return {
    views: normalizeRangeFilter(spec?.metric_filters?.views, fallback.views, { legacyValue: legacy?.views, legacyMode: "gte" }),
    likes: normalizeRangeFilter(spec?.metric_filters?.likes, fallback.likes, { legacyValue: legacy?.likes, legacyMode: "gte" }),
    replies: normalizeRangeFilter(spec?.metric_filters?.replies, fallback.replies, { legacyValue: legacy?.replies, legacyMode: "gte" }),
    retweets: normalizeRangeFilter(spec?.metric_filters?.retweets, fallback.retweets, { legacyValue: legacy?.retweets, legacyMode: "gte" }),
  };
}

export function normalizeSearchSpecForUi(spec?: Partial<SearchSpec> | null): SearchSpec {
  const source = spec || {};
  const languageMode = normalizeLanguageMode(source.language_mode ?? source.language);
  const metricFilters = normalizeMetricFilters(source);
  const metricFiltersExplicit = Boolean(source.metric_filters_explicit) || Boolean(source.metric_filters);
  const daysFilter = normalizeRangeFilter(source.days_filter, DEFAULT_SEARCH_SPEC.days_filter, {
    maximum: 100,
    legacyValue: typeof source.days === "number" ? source.days : null,
    legacyMode: "lte",
  });

  return {
    ...DEFAULT_SEARCH_SPEC,
    all_keywords: Array.isArray(source.all_keywords) ? [...source.all_keywords] : [...DEFAULT_SEARCH_SPEC.all_keywords],
    exact_phrases: Array.isArray(source.exact_phrases) ? [...source.exact_phrases] : [],
    any_keywords: Array.isArray(source.any_keywords) ? [...source.any_keywords] : [],
    exclude_keywords: Array.isArray(source.exclude_keywords) ? [...source.exclude_keywords] : [],
    authors_include: Array.isArray(source.authors_include) ? [...source.authors_include] : [],
    authors_exclude: Array.isArray(source.authors_exclude) ? [...source.authors_exclude] : [],
    language_mode: languageMode,
    days_filter: daysFilter,
    metric_filters: metricFilters,
    metric_filters_explicit: metricFiltersExplicit,
    max_results: Math.min(100, Math.max(1, clampNonNegative(source.max_results ?? DEFAULT_SEARCH_SPEC.max_results, DEFAULT_SEARCH_SPEC.max_results))),
    include_retweets: typeof source.include_retweets === "boolean" ? source.include_retweets : DEFAULT_SEARCH_SPEC.include_retweets,
    include_replies: typeof source.include_replies === "boolean" ? source.include_replies : DEFAULT_SEARCH_SPEC.include_replies,
    require_media: Boolean(source.require_media),
    require_links: Boolean(source.require_links),
    raw_query: String(source.raw_query ?? "").trim(),
    language: languageMode === "zh_en" ? "" : languageMode,
    days: deriveLegacyDaysValue(daysFilter),
    metric_mode: source.metric_mode === "AND" ? "AND" : "OR",
    min_metrics: deriveLegacyMinMetrics(metricFilters),
  };
}

export function cloneSearchSpec(spec?: Partial<SearchSpec>): SearchSpec {
  return normalizeSearchSpecForUi(JSON.parse(JSON.stringify(spec || DEFAULT_SEARCH_SPEC)));
}

export function cloneRuleDefinition(definition?: RuleSetDefinition): RuleSetDefinition {
  return JSON.parse(JSON.stringify(definition || DEFAULT_RULE_SET_DEFINITION));
}

export function languageModeLabel(mode: LanguageMode): string {
  if (mode === "zh") return "\u4e2d\u6587";
  if (mode === "en") return "\u82f1\u6587";
  return "\u4e2d\u6587 + \u82f1\u6587";
}

export function rangeFilterLabel(filter: RangeFilter, unit = ""): string {
  if (filter.mode === "gte") return `\u81f3\u5c11 ${filter.min ?? 0}${unit}`;
  if (filter.mode === "lte") return `\u81f3\u591a ${filter.max ?? 0}${unit}`;
  if (filter.mode === "between") return `${filter.min ?? 0}${unit} - ${filter.max ?? 0}${unit}`;
  return "\u4e0d\u9650";
}

function metricLabel(key: MetricKey): string {
  if (key === "views") return "\u6d4f\u89c8";
  if (key === "likes") return "\u70b9\u8d5e";
  if (key === "replies") return "\u56de\u590d";
  return "\u8f6c\u63a8";
}

export function buildQueryPreview(spec: SearchSpec): string {
  const normalized = normalizeSearchSpecForUi(spec);
  const segments: string[] = [
    `\u8bed\u8a00: ${languageModeLabel(normalized.language_mode)}`,
    `\u5929\u6570: ${rangeFilterLabel(normalized.days_filter, "\u5929")}`,
  ];

  for (const key of METRIC_KEYS) {
    segments.push(`${metricLabel(key)}: ${rangeFilterLabel(normalized.metric_filters[key])}`);
  }
  if (normalized.all_keywords.length) segments.push(`\u5305\u542b: ${normalized.all_keywords.join(" / ")}`);
  if (normalized.exact_phrases.length) segments.push(`\u77ed\u8bed: ${normalized.exact_phrases.join(" / ")}`);
  if (normalized.any_keywords.length) segments.push(`\u4efb\u610f\u8bcd: ${normalized.any_keywords.join(" / ")}`);
  if (normalized.exclude_keywords.length) segments.push(`\u6392\u9664\u8bcd: ${normalized.exclude_keywords.join(" / ")}`);
  if (normalized.authors_include.length) segments.push(`\u4f5c\u8005\u767d\u540d\u5355: ${normalized.authors_include.join(" / ")}`);
  if (normalized.authors_exclude.length) segments.push(`\u4f5c\u8005\u9ed1\u540d\u5355: ${normalized.authors_exclude.join(" / ")}`);
  if (normalized.raw_query) segments.push(`\u9644\u52a0\u8bed\u6cd5: ${normalized.raw_query}`);
  if (!normalized.include_retweets) segments.push("\u6392\u9664\u8f6c\u63a8");
  if (!normalized.include_replies) segments.push("\u6392\u9664\u56de\u590d");
  if (normalized.require_media) segments.push("\u5fc5\u987b\u542b\u5a92\u4f53");
  if (normalized.require_links) segments.push("\u5fc5\u987b\u542b\u94fe\u63a5");
  return segments.join(" | ");
}

export function newCondition(): RuleCondition {
  return { type: "text_contains_any", values: [""] };
}

export function newRule(levels: string[]): ScoringRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 8)}`,
    name: "\u65b0\u89c4\u5219",
    enabled: true,
    operator: "AND",
    conditions: [newCondition()],
    effect: {
      action: "score",
      score: 20,
      level: levels[0] || "",
    },
  };
}
