export type MetricMode = "OR" | "AND";
export type LanguageMode = "zh" | "en" | "zh_en";
export type RangeMode = "any" | "gte" | "lte" | "between";

export type RangeFilter = {
  mode: RangeMode;
  min?: number | null;
  max?: number | null;
};

export type MetricFilters = {
  views: RangeFilter;
  likes: RangeFilter;
  replies: RangeFilter;
  retweets: RangeFilter;
};

export type Thresholds = { views: number; replies: number; retweets: number; likes?: number; mode: MetricMode };
export type HealthTarget = {
  configured: boolean;
  connected: boolean;
  last_checked_at: string;
  last_error: string;
};
export type DatabaseHealth = HealthTarget & {
  db_path: string;
  db_exists: boolean;
  job_count: number;
  run_count: number;
};
export type XHealth = HealthTarget & {
  auth_source: string;
  browser_hint: string;
  account_hint: string;
};
export type HealthSnapshot = {
  summary: {
    updated_at: string;
    source: string;
  };
  db: DatabaseHealth;
  x: XHealth;
};

export type SearchSpec = {
  all_keywords: string[];
  exact_phrases: string[];
  any_keywords: string[];
  exclude_keywords: string[];
  authors_include: string[];
  authors_exclude: string[];
  language_mode: LanguageMode;
  days_filter: RangeFilter;
  metric_filters: MetricFilters;
  metric_filters_explicit: boolean;
  max_results: number;
  include_retweets: boolean;
  include_replies: boolean;
  require_media: boolean;
  require_links: boolean;
  raw_query: string;
  language?: string;
  days?: number;
  metric_mode?: MetricMode;
  min_metrics?: {
    views: number;
    likes: number;
    replies: number;
    retweets: number;
  };
};

export type RuleLevel = {
  id: string;
  label: string;
  min_score: number;
  color: string;
};

export type RuleCondition = {
  type:
    | "text_contains_any"
    | "text_not_contains_any"
    | "author_in"
    | "author_not_in"
    | "author_contains_any"
    | "metric_at_least"
    | "has_link"
    | "has_media"
    | "has_hashtag"
    | "has_cashtag"
    | "has_emoji"
    | "is_retweet"
    | "is_reply"
    | "language_is"
    | "age_within_days";
  values?: string[];
  metric?: "views" | "likes" | "replies" | "retweets";
  value?: string | number;
};

export type ScoringRule = {
  id: string;
  name: string;
  enabled: boolean;
  operator: "AND" | "OR";
  conditions: RuleCondition[];
  effect: {
    action: "score" | "exclude";
    score: number;
    level: string;
  };
};

export type RuleSetDefinition = {
  levels: RuleLevel[];
  rules: ScoringRule[];
};

export type RuleSet = {
  id: number;
  name: string;
  description: string;
  is_enabled: number | boolean;
  is_builtin: number | boolean;
  version: number;
  definition_json: RuleSetDefinition;
  created_at?: string;
  updated_at?: string;
};

export type RuleSetSummary = {
  id: number | null;
  name: string;
  description: string;
  version: number;
  is_builtin: boolean;
};

export type WorkspaceMeta = {
  updated_at: string;
  next_job_id: number;
};

export type WorkspaceEnvironment = {
  db_path: string;
  runtime_dir: string;
  env_file: string;
  twitter_browser: string;
  twitter_chrome_profile: string;
};

export type JobRegistryRecord = {
  id: number;
  name: string;
  enabled: number;
  interval_minutes: number;
  pack_name: string;
  pack_path: string;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type WorkspaceConfig = {
  version: number;
  meta: WorkspaceMeta;
  environment: WorkspaceEnvironment;
  jobs: JobRegistryRecord[];
};

export type TaskPackSummary = {
  pack_name: string;
  pack_path: string;
  name: string;
  description: string;
  updated_at: string;
  rule_set_summary?: RuleSetSummary | null;
  query_preview?: string;
};

export type TaskPackFile = {
  version: number;
  kind: "task_pack";
  pack_name: string;
  pack_path: string;
  meta: {
    name: string;
    description: string;
    updated_at: string;
  };
  search_spec: SearchSpec;
  rule_set: {
    id?: number | null;
    name: string;
    description: string;
    version: number;
    definition: RuleSetDefinition;
  };
  rule_set_summary?: RuleSetSummary | null;
  query_preview?: string;
};

export type CollectorResultItem = {
  query_name: string;
  query: string;
  tweet_id: string;
  url: string;
  text: string;
  author: string;
  created_at: string;
  raw: Record<string, unknown>;
  metrics: Record<string, number>;
  flags: {
    has_media: boolean;
    has_link: boolean;
    has_hashtag: boolean;
    has_cashtag: boolean;
    has_emoji: boolean;
    is_retweet: boolean;
    is_reply: boolean;
  };
  language: string;
  score?: number;
  level?: string;
  title?: string;
  summary?: string;
  reasons?: Array<{
    rule_id: string;
    rule_name: string;
    action: string;
    score: number;
    level: string;
    matched_conditions: string[];
  }>;
};

export type CollectorRunResult = {
  run_id: number;
  status: string;
  search_spec: SearchSpec;
  final_query: string;
  final_queries: string[];
  rule_set_summary: RuleSetSummary;
  raw_total: number;
  matched_total: number;
  raw_items: CollectorResultItem[];
  matched_items: CollectorResultItem[];
  stats: Record<string, number>;
  errors: string[];
};

export type JobRecord = {
  id: number;
  name: string;
  keywords_json: string[];
  interval_minutes: number;
  days: number;
  thresholds_json: Thresholds;
  levels_json: string[];
  search_spec_json: SearchSpec;
  rule_set_id?: number | null;
  rule_set_summary?: RuleSetSummary | null;
  pack_name: string;
  pack_path: string;
  pack_meta?: {
    name?: string;
    description?: string;
    updated_at?: string;
  };
  enabled: number;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  last_run_id?: number | null;
  last_run_status?: string | null;
  last_run_started_at?: string | null;
  last_run_ended_at?: string | null;
  last_run_error_text?: string | null;
  last_run_stats?: Record<string, unknown>;
};

export type JobBatchAction = "enable" | "disable" | "run_now" | "delete" | "restore" | "purge";

export type JobBatchFailureItem = {
  id: number;
  name: string;
  error: string;
};

export type JobBatchRequest =
  | {
      action: JobBatchAction;
      ids: number[];
    }
  | {
      action: JobBatchAction;
      mode: "all_matching";
      query?: string;
      status?: "active" | "all" | "deleted";
    };

export type JobBatchResponse = {
  action: JobBatchAction;
  mode: "ids" | "all_matching";
  total_targeted: number;
  succeeded: number;
  failed: number;
  succeeded_ids: number[];
  failed_items: JobBatchFailureItem[];
};

export type RunRecord = {
  id: number;
  job_id: number | null;
  trigger_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  error_text: string | null;
  stats_json: Record<string, number>;
};

export type RuntimeLogFile = {
  name: string;
  exists: boolean;
  size: number;
  updated_at: string;
  content: string;
  error?: string;
};

export type SortDirection = "asc" | "desc";
export type ItemTable = "curated" | "raw";

export type CuratedItemSortField =
  | "id"
  | "run_id"
  | "dedupe_key"
  | "level"
  | "score"
  | "title"
  | "summary_zh"
  | "excerpt"
  | "is_zero_cost"
  | "source_url"
  | "author"
  | "created_at_x"
  | "reasons_json"
  | "rule_set_id"
  | "state";

export type RawItemSortField =
  | "id"
  | "run_id"
  | "tweet_id"
  | "canonical_url"
  | "author"
  | "text"
  | "created_at_x"
  | "views"
  | "likes"
  | "replies"
  | "retweets"
  | "query_name"
  | "fetched_at";

export type ItemSortField = CuratedItemSortField | RawItemSortField;

export type CuratedItemRecord = {
  id: number;
  run_id: number;
  dedupe_key: string;
  level: string;
  score: number;
  title: string;
  summary_zh: string;
  excerpt: string;
  is_zero_cost: number;
  source_url: string;
  author: string;
  created_at_x: string | null;
  reasons_json: unknown;
  rule_set_id: number | null;
  state: string;
};

export type RawItemRecord = {
  id: number;
  run_id: number;
  tweet_id: string;
  canonical_url: string;
  author: string;
  text: string;
  created_at_x: string | null;
  views: number;
  likes: number;
  replies: number;
  retweets: number;
  query_name: string;
  fetched_at: string | null;
};

export type ResultItemRecord = CuratedItemRecord | RawItemRecord;

export type DeleteItemResponse = {
  id: number;
  deleted: number;
};

export type DeleteItemsRequest =
  | { ids: number[]; table: ItemTable }
  | { mode: "all_matching"; keyword?: string; level?: string; table: ItemTable };

export type DeleteItemsResponse = {
  ids: number[];
  deleted: number;
};

export type DedupeItemsResponse = {
  groups: number;
  deleted: number;
  kept: number;
  rows_before: number;
  rows_after: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8765";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function health() {
  return req<HealthSnapshot>("/health");
}

export async function healthSnapshot() {
  const res = await fetch(`${API_BASE}/health/snapshot`, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<HealthSnapshot>;
}


export function getWorkspace() {
  return req<WorkspaceConfig>("/workspace");
}

export function updateWorkspace(payload: WorkspaceConfig) {
  return req<WorkspaceConfig>("/workspace", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function importWorkspace(payload: WorkspaceConfig) {
  return req<WorkspaceConfig>("/workspace/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function exportWorkspace() {
  return req<WorkspaceConfig>("/workspace/export");
}

export function listTaskPacks() {
  return req<{ items: TaskPackSummary[] }>("/task-packs");
}

export function getTaskPack(packName: string) {
  return req<TaskPackFile>(`/task-packs/${encodeURIComponent(packName)}`);
}

export function createTaskPack(payload: {
  pack_name?: string;
  meta: { name: string; description?: string; updated_at?: string };
  search_spec: SearchSpec;
  rule_set: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
}) {
  return req<TaskPackFile>("/task-packs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTaskPack(
  packName: string,
  payload: {
    meta: { name: string; description?: string; updated_at?: string };
    search_spec: SearchSpec;
    rule_set: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
  },
) {
  return req<TaskPackFile>(`/task-packs/${encodeURIComponent(packName)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTaskPack(packName: string) {
  return req<{ pack_name: string; deleted: number }>(`/task-packs/${encodeURIComponent(packName)}/delete`, {
    method: "POST",
    body: "{}",
  });
}

export function listJobs(params: { page?: number; page_size?: number; query?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.query) q.set("query", params.query);
  if (params.status) q.set("status", params.status);
  return req<{ total: number; page: number; page_size: number; items: JobRecord[] }>(`/jobs?${q.toString()}`);
}

export function getJob(id: number) {
  return req<JobRecord>(`/jobs/${id}`);
}

export function runManual(payload: { search_spec: SearchSpec; rule_set_id?: number | null; rule_set?: Partial<RuleSet> }) {
  return req<CollectorRunResult>("/manual/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRuns(params: { page?: number; page_size?: number }) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  return req<{ total: number; page: number; page_size: number; items: RunRecord[] }>(`/runs?${q.toString()}`);
}

export function getRuntimeLogs() {
  return req<{ items: RuntimeLogFile[] }>("/logs/runtime");
}

export function listItems(params: {
  table?: ItemTable;
  page?: number;
  page_size?: number;
  keyword?: string;
  level?: string;
  sort_by?: ItemSortField;
  sort_dir?: SortDirection;
}) {
  const q = new URLSearchParams();
  q.set("table", params.table ?? "curated");
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.keyword) q.set("keyword", params.keyword);
  if (params.level) q.set("level", params.level);
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);
  return req<{ total: number; page: number; page_size: number; items: ResultItemRecord[] }>(`/items?${q.toString()}`);
}

export function deleteItem(id: number, table: ItemTable = "curated") {
  return req<DeleteItemResponse>(`/items/${id}/delete`, { method: "POST", body: JSON.stringify({ table }) });
}

export function deleteItems(payload: DeleteItemsRequest) {
  return req<DeleteItemsResponse>("/items/delete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function dedupeItems(payload: { table: ItemTable }) {
  return req<DedupeItemsResponse>("/items/dedupe", { method: "POST", body: JSON.stringify(payload) });
}

export function createJob(payload: {
  name: string;
  interval_minutes: number;
  enabled: boolean;
  search_spec: SearchSpec;
  rule_set?: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
  rule_set_id?: number | null;
}) {
  return req<JobRecord>("/jobs/create", { method: "POST", body: JSON.stringify(payload) });
}

export function updateJob(
  id: number,
  payload: Partial<{
    name: string;
    interval_minutes: number;
    enabled: boolean;
    search_spec: SearchSpec;
    rule_set?: { id?: number | null; name: string; description?: string; version?: number; definition: RuleSetDefinition };
    rule_set_id: number | null;
  }>,
) {
  return req<JobRecord>(`/jobs/${id}/update`, { method: "POST", body: JSON.stringify(payload) });
}

export function toggleJob(id: number, enabled: boolean) {
  return req<JobRecord>(`/jobs/${id}/toggle`, { method: "POST", body: JSON.stringify({ enabled }) });
}

export function runJobNow(id: number) {
  return req<CollectorRunResult>(`/jobs/${id}/run-now`, { method: "POST", body: "{}" });
}

export function deleteJob(id: number) {
  return req<JobRecord>(`/jobs/${id}/delete`, { method: "POST", body: "{}" });
}

export function restoreJob(id: number) {
  return req<JobRecord>(`/jobs/${id}/restore`, { method: "POST", body: "{}" });
}

export function purgeJob(id: number) {
  return req<JobRecord>(`/jobs/${id}/purge`, { method: "POST", body: "{}" });
}

export function batchJobs(payload: JobBatchRequest) {
  return req<JobBatchResponse>("/jobs/batch", { method: "POST", body: JSON.stringify(payload) });
}

export function listRuleSets() {
  return req<{ items: RuleSet[] }>("/rule-sets");
}

export function getRuleSet(id: number) {
  return req<RuleSet>(`/rule-sets/${id}`);
}

export function createRuleSet(payload: { name: string; description: string; is_enabled?: boolean; version?: number; definition: RuleSetDefinition }) {
  return req<RuleSet>("/rule-sets", { method: "POST", body: JSON.stringify(payload) });
}

export function updateRuleSet(id: number, payload: Partial<{ name: string; description: string; is_enabled: boolean; version: number; definition: RuleSetDefinition }>) {
  return req<RuleSet>(`/rule-sets/${id}/update`, { method: "POST", body: JSON.stringify(payload) });
}

export function deleteRuleSet(id: number) {
  return req<RuleSet>(`/rule-sets/${id}/delete`, { method: "POST", body: "{}" });
}

export function cloneRuleSet(id: number) {
  return req<RuleSet>(`/rule-sets/${id}/clone`, { method: "POST", body: "{}" });
}
