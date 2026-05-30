import type { RuleSetDefinition, TaskPackFile } from "../../api";
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  cloneRuleDefinition,
  cloneSearchSpec,
  splitCommaLines,
} from "../../collector";

export type JobFormState = {
  name: string;
  group_name: string;
  interval_minutes: number;
  enabled: boolean;
  pack_name: string | null;
  import_pack_name: string;
  tagsText: string;
  search_spec: ReturnType<typeof cloneSearchSpec>;
  rule_set: {
    id?: number | null;
    name: string;
    description: string;
    version: number;
    definition: RuleSetDefinition;
  };
};

export const DEFAULT_FORM: JobFormState = {
  name: "mining-watch",
  group_name: "",
  interval_minutes: 60,
  enabled: true,
  pack_name: null,
  import_pack_name: "",
  tagsText: "",
  search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
  rule_set: {
    id: 1,
    name: "Default Rule Set",
    description: "Built-in opportunity discovery rules.",
    version: 1,
    definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
  },
};

export function buildJobDraftComparable(form: JobFormState) {
  const tags = splitCommaLines(form.tagsText);
  return {
    tags,
    search_spec: cloneSearchSpec(form.search_spec),
    rule_set: {
      name: form.rule_set.name.trim(),
      description: form.rule_set.description.trim(),
      definition: cloneRuleDefinition(form.rule_set.definition),
    },
  };
}

export function buildJobPackComparable(pack: TaskPackFile) {
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

export function buildPackPayload(form: JobFormState, packName: string) {
  return {
    meta: {
      name: packName,
      description: form.rule_set.description,
    },
    tags: splitCommaLines(form.tagsText),
    search_spec: cloneSearchSpec(form.search_spec),
    rule_set: {
      id: form.rule_set.id ?? null,
      name: form.rule_set.name,
      description: form.rule_set.description,
      version: form.rule_set.version,
      definition: cloneRuleDefinition(form.rule_set.definition),
    },
  };
}

export type DraftSourceKind = "blank" | "pack" | "file";

export function draftSourceLabel(kind: DraftSourceKind) {
  if (kind === "pack") return "任务包载入";
  if (kind === "file") return "文件导入";
  return "默认空白";
}
