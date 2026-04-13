import { RuleCondition, RuleSetDefinition, ScoringRule, SearchSpec } from "./api";

export const DEFAULT_SEARCH_SPEC: SearchSpec = {
  all_keywords: ["BTC"],
  exact_phrases: [],
  any_keywords: [],
  exclude_keywords: [],
  authors_include: [],
  authors_exclude: [],
  language: "",
  days: 20,
  max_results: 40,
  metric_mode: "OR",
  min_metrics: {
    views: 200,
    likes: 0,
    replies: 1,
    retweets: 0,
  },
  include_retweets: false,
  include_replies: true,
  require_media: false,
  require_links: false,
  raw_query: "",
};

export const DEFAULT_RULE_SET_DEFINITION: RuleSetDefinition = {
  levels: [
    { id: "S", label: "强信号", min_score: 90, color: "#dc2626" },
    { id: "A", label: "高优先级", min_score: 60, color: "#ea580c" },
    { id: "B", label: "观察", min_score: 30, color: "#2563eb" },
  ],
  rules: [
    {
      id: "exclude-trade-gated",
      name: "排除交易门槛",
      enabled: true,
      operator: "AND",
      conditions: [{ type: "text_contains_any", values: ["trade", "stake", "充值", "交易"] }],
      effect: { action: "exclude", score: 0, level: "" },
    },
    {
      id: "trusted-author-action",
      name: "官方账号 + 行动词",
      enabled: true,
      operator: "AND",
      conditions: [
        { type: "author_in", values: ["galxe", "layer3xyz", "kaitoai"] },
        { type: "text_contains_any", values: ["claim", "quest", "airdrop", "积分", "空投"] },
      ],
      effect: { action: "score", score: 65, level: "A" },
    },
  ],
};

export function splitCommaLines(value: string): string[] {
  return value
    .split(/[，,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinCommaLines(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function cloneSearchSpec(spec?: SearchSpec): SearchSpec {
  return JSON.parse(JSON.stringify(spec || DEFAULT_SEARCH_SPEC));
}

export function cloneRuleDefinition(definition?: RuleSetDefinition): RuleSetDefinition {
  return JSON.parse(JSON.stringify(definition || DEFAULT_RULE_SET_DEFINITION));
}

export function buildQueryPreview(spec: SearchSpec): string {
  const parts: string[] = [];
  parts.push(...spec.all_keywords);
  parts.push(...spec.exact_phrases.map((phrase) => `"${phrase}"`));
  if (spec.any_keywords.length) parts.push(`(${spec.any_keywords.join(" OR ")})`);
  parts.push(...spec.exclude_keywords.map((word) => `-${word}`));
  if (spec.authors_include.length) parts.push(`(${spec.authors_include.map((author) => `from:${author}`).join(" OR ")})`);
  parts.push(...spec.authors_exclude.map((author) => `-from:${author}`));
  if (spec.language) parts.push(`lang:${spec.language}`);
  if (!spec.include_retweets) parts.push("-is:retweet");
  if (!spec.include_replies) parts.push("-is:reply");
  if (spec.require_media) parts.push("filter:media");
  if (spec.require_links) parts.push("filter:links");
  if (spec.raw_query) parts.push(spec.raw_query);
  return parts.filter(Boolean).join(" ");
}

export function newCondition(): RuleCondition {
  return { type: "text_contains_any", values: [""] };
}

export function newRule(levels: string[]): ScoringRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 8)}`,
    name: "新规则",
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

