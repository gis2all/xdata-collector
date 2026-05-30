import type {
  ItemTable,
  ResultsFilterConditionNode,
  ResultsFilterConditionOperator,
  ResultsFilterField,
  ResultsFilterGroupNode,
  ResultsFilterNode,
} from "../../api";

const RESULTS_FILTER_STATE_KEY = "results.filters.v1";

export type ResultsFilterFieldKind = "text" | "number" | "datetime" | "boolean" | "tags";

export type ResultsFilterFieldOption = {
  field: ResultsFilterField;
  label: string;
  kind: ResultsFilterFieldKind;
};

export type ResultsFilterState = {
  keywordInput: string;
  appliedKeyword: string;
  draftTree: ResultsFilterGroupNode;
  appliedTree: ResultsFilterGroupNode;
  advancedOpen: boolean;
};

export const EMPTY_RESULTS_FILTER_TREE: ResultsFilterGroupNode = {
  type: "group",
  relation: "AND",
  children: [],
};

export const RESULTS_FILTER_FIELD_OPTIONS: Record<ItemTable, ResultsFilterFieldOption[]> = {
  curated: [
    { field: "id", label: "id", kind: "number" },
    { field: "run_id", label: "run_id", kind: "number" },
    { field: "dedupe_key", label: "dedupe_key", kind: "text" },
    { field: "level", label: "level", kind: "text" },
    { field: "score", label: "score", kind: "number" },
    { field: "title", label: "title", kind: "text" },
    { field: "summary_zh", label: "summary_zh", kind: "text" },
    { field: "excerpt", label: "excerpt", kind: "text" },
    { field: "is_zero_cost", label: "is_zero_cost", kind: "boolean" },
    { field: "source_url", label: "source_url", kind: "text" },
    { field: "author_name", label: "author_name", kind: "text" },
    { field: "author", label: "author", kind: "text" },
    { field: "created_at_x", label: "created_at_x", kind: "datetime" },
    { field: "views", label: "views", kind: "number" },
    { field: "likes", label: "likes", kind: "number" },
    { field: "replies", label: "replies", kind: "number" },
    { field: "retweets", label: "retweets", kind: "number" },
    { field: "fetched_at", label: "fetched_at", kind: "datetime" },
    { field: "tags", label: "tags", kind: "tags" },
    { field: "reasons_json", label: "reasons_json", kind: "text" },
    { field: "rule_set_id", label: "rule_set_id", kind: "number" },
    { field: "state", label: "state", kind: "text" },
  ],
  raw: [
    { field: "id", label: "id", kind: "number" },
    { field: "run_id", label: "run_id", kind: "number" },
    { field: "tweet_id", label: "tweet_id", kind: "text" },
    { field: "canonical_url", label: "canonical_url", kind: "text" },
    { field: "author_name", label: "author_name", kind: "text" },
    { field: "author", label: "author", kind: "text" },
    { field: "text", label: "text", kind: "text" },
    { field: "created_at_x", label: "created_at_x", kind: "datetime" },
    { field: "views", label: "views", kind: "number" },
    { field: "likes", label: "likes", kind: "number" },
    { field: "replies", label: "replies", kind: "number" },
    { field: "retweets", label: "retweets", kind: "number" },
    { field: "query_name", label: "query_name", kind: "text" },
    { field: "fetched_at", label: "fetched_at", kind: "datetime" },
    { field: "tags", label: "tags", kind: "tags" },
  ],
};

export const TEXT_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "contains", label: "包含" },
  { value: "not_contains", label: "不包含" },
  { value: "equals", label: "等于" },
  { value: "not_equals", label: "不等于" },
  { value: "starts_with", label: "开头是" },
  { value: "ends_with", label: "结尾是" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
  { value: "length_gt", label: "长度 >" },
  { value: "length_gte", label: "长度 >=" },
  { value: "length_lt", label: "长度 <" },
  { value: "length_lte", label: "长度 <=" },
  { value: "length_between", label: "长度区间" },
];

export const NUMBER_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "eq", label: "等于" },
  { value: "neq", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "between", label: "区间" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

export const DATETIME_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "on_or_after", label: "在此之后" },
  { value: "on_or_before", label: "在此之前" },
  { value: "between", label: "区间" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

export const BOOLEAN_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "is_true", label: "是" },
  { value: "is_false", label: "否" },
];

export const TAG_FILTER_OPERATORS: Array<{ value: ResultsFilterConditionOperator; label: string }> = [
  { value: "has_any", label: "包含任一标签" },
  { value: "has_all", label: "包含全部标签" },
  { value: "is_empty", label: "为空" },
  { value: "is_not_empty", label: "不为空" },
];

export const DEFAULT_RESULTS_FILTER_STATE: ResultsFilterState = {
  keywordInput: "",
  appliedKeyword: "",
  draftTree: EMPTY_RESULTS_FILTER_TREE,
  appliedTree: EMPTY_RESULTS_FILTER_TREE,
  advancedOpen: false,
};

export function createEmptyResultsFilterTree(): ResultsFilterGroupNode {
  return {
    type: "group",
    relation: "AND",
    children: [],
  };
}

export function createDefaultResultsFilterState(): ResultsFilterState {
  return {
    keywordInput: "",
    appliedKeyword: "",
    draftTree: createEmptyResultsFilterTree(),
    appliedTree: createEmptyResultsFilterTree(),
    advancedOpen: false,
  };
}

export function cloneResultsFilterNode(node: ResultsFilterNode): ResultsFilterNode {
  if (node.type === "group") {
    return {
      type: "group",
      relation: node.relation === "OR" ? "OR" : "AND",
      children: Array.isArray(node.children) ? node.children.map((child) => cloneResultsFilterNode(child)) : [],
    };
  }
  return {
    type: "condition",
    field: node.field,
    operator: node.operator,
    ...(node.value !== undefined ? { value: node.value } : {}),
    ...(node.values ? { values: [...node.values] } : {}),
    ...(node.min !== undefined ? { min: node.min } : {}),
    ...(node.max !== undefined ? { max: node.max } : {}),
  };
}

export function cloneResultsFilterTree(tree?: ResultsFilterGroupNode | null): ResultsFilterGroupNode {
  if (!tree || tree.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return cloneResultsFilterNode(tree) as ResultsFilterGroupNode;
}

export function createFilterCondition(field: ResultsFilterField, kind: ResultsFilterFieldKind): ResultsFilterConditionNode {
  if (kind === "number") {
    return { type: "condition", field, operator: "gte", value: "" };
  }
  if (kind === "datetime") {
    return { type: "condition", field, operator: "on_or_after", value: "" };
  }
  if (kind === "boolean") {
    return { type: "condition", field, operator: "is_true" };
  }
  if (kind === "tags") {
    return { type: "condition", field, operator: "has_any", values: [] };
  }
  return { type: "condition", field, operator: "contains", value: "" };
}

export function getFilterFieldOption(table: ItemTable, field: ResultsFilterField) {
  return RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === field) ?? RESULTS_FILTER_FIELD_OPTIONS[table][0];
}

export function getFilterOperatorOptions(kind: ResultsFilterFieldKind) {
  if (kind === "number") return NUMBER_FILTER_OPERATORS;
  if (kind === "datetime") return DATETIME_FILTER_OPERATORS;
  if (kind === "boolean") return BOOLEAN_FILTER_OPERATORS;
  if (kind === "tags") return TAG_FILTER_OPERATORS;
  return TEXT_FILTER_OPERATORS;
}

export function getDefaultFilterOperator(kind: ResultsFilterFieldKind): ResultsFilterConditionOperator {
  return getFilterOperatorOptions(kind)[0]?.value ?? "contains";
}

function isResultsFilterNode(value: unknown): value is ResultsFilterNode {
  return Boolean(value) && typeof value === "object" && ("type" in (value as Record<string, unknown>));
}

export function parseFilterTagValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function filterOperatorNeedsRange(operator: ResultsFilterConditionOperator) {
  return operator === "between" || operator === "length_between";
}

export function filterOperatorNeedsArrayValue(operator: ResultsFilterConditionOperator) {
  return operator === "has_any" || operator === "has_all";
}

export function filterOperatorNeedsSingleValue(operator: ResultsFilterConditionOperator) {
  return !["is_empty", "is_not_empty", "is_true", "is_false", "between", "length_between", "has_any", "has_all"].includes(operator);
}

export function coerceFilterConditionForUi(table: ItemTable, node: unknown): ResultsFilterConditionNode | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const source = node as Partial<ResultsFilterConditionNode>;
  const field = String(source.field ?? "").trim() as ResultsFilterField;
  const fieldOption = RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === field);
  if (!fieldOption) {
    return null;
  }
  const operatorOptions = getFilterOperatorOptions(fieldOption.kind);
  const operator = operatorOptions.some((item) => item.value === source.operator)
    ? (source.operator as ResultsFilterConditionOperator)
    : getDefaultFilterOperator(fieldOption.kind);
  const next: ResultsFilterConditionNode = {
    type: "condition",
    field: fieldOption.field,
    operator,
  };
  if (filterOperatorNeedsArrayValue(operator)) {
    next.values = parseFilterTagValues(source.values ?? source.value);
    return next;
  }
  if (filterOperatorNeedsRange(operator)) {
    next.min = source.min ?? "";
    next.max = source.max ?? "";
    return next;
  }
  if (filterOperatorNeedsSingleValue(operator)) {
    next.value = source.value ?? "";
  }
  return next;
}

export function coerceFilterNodeForUi(table: ItemTable, node: unknown): ResultsFilterNode | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const source = node as Partial<ResultsFilterNode>;
  if (source.type === "group") {
    const children = Array.isArray(source.children)
      ? source.children.map((child) => coerceFilterNodeForUi(table, child)).filter((child): child is ResultsFilterNode => child != null)
      : [];
    return {
      type: "group",
      relation: source.relation === "OR" ? "OR" : "AND",
      children,
    };
  }
  return coerceFilterConditionForUi(table, source);
}

export function filterTreeHasConditions(tree: ResultsFilterGroupNode): boolean {
  return tree.children.some((child) => child.type === "condition" || filterTreeHasConditions(child));
}

export function normalizeFilterTreeForTable(table: ItemTable, tree: ResultsFilterGroupNode): ResultsFilterGroupNode {
  const next = coerceFilterNodeForUi(table, tree);
  if (!next || next.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return next;
}

export function sanitizeFilterTreeForSubmit(table: ItemTable, tree: ResultsFilterGroupNode): ResultsFilterGroupNode {
  function sanitizeNode(node: ResultsFilterNode): ResultsFilterNode | null {
    if (node.type === "group") {
      const children = node.children.map((child) => sanitizeNode(child)).filter((child): child is ResultsFilterNode => child != null);
      return {
        type: "group",
        relation: node.relation === "OR" ? "OR" : "AND",
        children,
      };
    }
    const fieldOption = RESULTS_FILTER_FIELD_OPTIONS[table].find((option) => option.field === node.field);
    if (!fieldOption) {
      return null;
    }
    const operatorOptions = getFilterOperatorOptions(fieldOption.kind);
    const operator = operatorOptions.some((item) => item.value === node.operator)
      ? node.operator
      : getDefaultFilterOperator(fieldOption.kind);
    const next: ResultsFilterConditionNode = {
      type: "condition",
      field: fieldOption.field,
      operator,
    };
    if (filterOperatorNeedsArrayValue(operator)) {
      const values = parseFilterTagValues(node.values ?? node.value);
      if (!values.length) {
        return null;
      }
      next.values = values;
      return next;
    }
    if (filterOperatorNeedsRange(operator)) {
      const minimum = String(node.min ?? "").trim();
      const maximum = String(node.max ?? "").trim();
      if (!minimum || !maximum) {
        return null;
      }
      next.min = minimum;
      next.max = maximum;
      return next;
    }
    if (filterOperatorNeedsSingleValue(operator)) {
      const value = String(node.value ?? "").trim();
      if (!value) {
        return null;
      }
      next.value = value;
    }
    return next;
  }

  const sanitized = sanitizeNode(tree);
  if (!sanitized || sanitized.type !== "group") {
    return createEmptyResultsFilterTree();
  }
  return sanitized;
}

export function createResultsFilterTreeTextValue(values?: string[]) {
  return (values ?? []).join(", ");
}

export function getFilterGroupAtPath(root: ResultsFilterGroupNode, path: number[]) {
  let current: ResultsFilterGroupNode = root;
  for (const index of path) {
    const child = current.children[index];
    if (!child || child.type !== "group") {
      return null;
    }
    current = child;
  }
  return current;
}

export function getFilterParentAtPath(root: ResultsFilterGroupNode, path: number[]) {
  if (!path.length) {
    return null;
  }
  const parentPath = path.slice(0, -1);
  const parent = getFilterGroupAtPath(root, parentPath);
  if (!parent) {
    return null;
  }
  return {
    parent,
    index: path[path.length - 1]!,
  };
}

export function readResultsFilterState(): Record<ItemTable, ResultsFilterState> {
  const fallback = {
    curated: createDefaultResultsFilterState(),
    raw: createDefaultResultsFilterState(),
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(RESULTS_FILTER_STATE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ItemTable, Partial<ResultsFilterState> & { filterTree?: ResultsFilterGroupNode }>>;
    const hydrate = (table: ItemTable): ResultsFilterState => {
      const source = parsed?.[table] || {};
      const sharedTree = isResultsFilterNode(source.filterTree) ? source.filterTree : createEmptyResultsFilterTree();
      const rawDraftTree = normalizeFilterTreeForTable(
        table,
        cloneResultsFilterTree((isResultsFilterNode(source.draftTree) ? source.draftTree : sharedTree) as ResultsFilterGroupNode),
      );
      const rawAppliedTree = normalizeFilterTreeForTable(
        table,
        cloneResultsFilterTree((isResultsFilterNode(source.appliedTree) ? source.appliedTree : sharedTree) as ResultsFilterGroupNode),
      );
      return {
        keywordInput: String(source.keywordInput ?? ""),
        appliedKeyword: String(source.appliedKeyword ?? ""),
        draftTree: rawDraftTree,
        appliedTree: sanitizeFilterTreeForSubmit(table, rawAppliedTree),
        advancedOpen: Boolean(source.advancedOpen),
      };
    };
    return {
      curated: hydrate("curated"),
      raw: hydrate("raw"),
    };
  } catch {
    return fallback;
  }
}

export function writeResultsFilterState(value: Record<ItemTable, ResultsFilterState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESULTS_FILTER_STATE_KEY, JSON.stringify(value));
}
