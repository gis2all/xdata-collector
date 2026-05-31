import { ReactNode } from "react";

import { CollectorRunResult, RuleSetDefinition, TaskPackFile } from "../api";
import { cloneRuleDefinition, cloneSearchSpec } from "../collector";

export function metricValue(item: any, key: string) {
  return Number(item?.metrics?.[key] || 0);
}

export function buildPackPayload(
  name: string,
  description: string,
  tags: string[],
  searchSpec: ReturnType<typeof cloneSearchSpec>,
  ruleName: string,
  ruleDescription: string,
  draftDefinition: RuleSetDefinition,
) {
  return {
    meta: {
      name,
      description,
    },
    tags,
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim() || name,
      description: ruleDescription.trim(),
      version: 1,
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

export function buildDraftComparable(
  tags: string[],
  searchSpec: ReturnType<typeof cloneSearchSpec>,
  ruleName: string,
  ruleDescription: string,
  draftDefinition: RuleSetDefinition,
) {
  return {
    tags: [...tags],
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim(),
      description: ruleDescription.trim(),
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

export function buildPackComparable(pack: TaskPackFile) {
  return {
    tags: [...(pack.tags || [])],
    search_spec: cloneSearchSpec(pack.search_spec),
    rule_set: {
      name: String(pack.rule_set.name || "").trim(),
      description: String(pack.rule_set.description || "").trim(),
      definition: cloneRuleDefinition(pack.rule_set.definition),
    },
  };
}

export type DraftSourceKind = "blank" | "pack" | "file";
export type ExecutionStatus = "idle" | "running" | "success" | "failed" | "cancelled";

export const DEFAULT_DRAFT_PACK_NAME = "__default_draft__";
export const DEFAULT_DRAFT_PACK_LABEL = "默认草稿";

export type ExecutionSummary = {
  status: ExecutionStatus;
  executedAt: string | null;
  rawTotal: number;
  matchedTotal: number;
  errorCount: number;
  errorText: string;
};

export const EMPTY_EXECUTION_SUMMARY: ExecutionSummary = {
  status: "idle",
  executedAt: null,
  rawTotal: 0,
  matchedTotal: 0,
  errorCount: 0,
  errorText: "",
};

export type ManualRunProgress = {
  runId: number | null;
  status: ExecutionStatus;
  totalQueries: number;
  completedQueries: number;
  progressPercent: number;
  fetchedRaw: number;
  queryErrors: number;
  startedAt: string | null;
  endedAt: string | null;
};

export function draftSourceLabel(kind: DraftSourceKind) {
  if (kind === "pack") return "任务包载入";
  if (kind === "file") return "文件导入";
  return "默认草稿";
}

export function buildExecutionSummary(
  status: Extract<ExecutionStatus, "success" | "failed" | "cancelled">,
  executedAt: string,
  result: CollectorRunResult | null,
  fallbackError: string,
): ExecutionSummary {
  const errors = Array.isArray(result?.errors) ? result?.errors : [];
  const errorText = fallbackError || errors[0] || "";
  return {
    status,
    executedAt,
    rawTotal: Number(result?.raw_total || 0),
    matchedTotal: Number(result?.matched_total || 0),
    errorCount: errors.length || (errorText ? 1 : 0),
    errorText,
  };
}

export function formatAuthorDisplay(authorName?: string | null, author?: string | null) {
  const name = String(authorName || "").trim();
  const handle = String(author || "").trim();
  if (name && handle) return `${name} @${handle.replace(/^@+/, "")}`;
  if (name) return name;
  if (handle) return `@${handle.replace(/^@+/, "")}`;
  return "--";
}

export function ManualSectionHeader(props: { title: string; description: string; aside?: ReactNode }) {
  return (
    <div className="manual-section-header workbench-section-header">
      <div className="manual-section-copy workbench-section-copy">
        <h4 className="workbench-section-title">{props.title}</h4>
        <p className="kv manual-section-description">{props.description}</p>
      </div>
      {props.aside ? <div className="manual-section-aside">{props.aside}</div> : null}
    </div>
  );
}
