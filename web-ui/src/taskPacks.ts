import { RuleSetDefinition, SearchSpec } from "./api";
import { cloneRuleDefinition, cloneSearchSpec } from "./collector";

export type ImportedTaskPackDraft = {
  sourceName: string;
  metaName: string;
  description: string;
  searchSpec: SearchSpec;
  ruleSet: {
    id?: number | null;
    name: string;
    description: string;
    version: number;
    definition: RuleSetDefinition;
  };
};

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取任务包文件失败"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file, "utf-8");
  });
}

function normalizeImportedTaskPack(raw: unknown, sourceName: string): ImportedTaskPackDraft {
  if (!raw || typeof raw !== "object") {
    throw new Error("任务包文件格式无效");
  }

  const payload = raw as Record<string, unknown>;
  const meta = typeof payload.meta === "object" && payload.meta ? (payload.meta as Record<string, unknown>) : {};
  const rawRuleSet = typeof payload.rule_set === "object" && payload.rule_set ? (payload.rule_set as Record<string, unknown>) : null;

  if (!payload.search_spec || !rawRuleSet || !rawRuleSet.definition) {
    throw new Error("任务包文件缺少 search_spec 或 rule_set.definition");
  }

  const fallbackName = sourceName.replace(/\.json$/i, "") || "imported-task-pack";
  const metaName = String(meta.name || rawRuleSet.name || fallbackName).trim() || fallbackName;
  const description = String(meta.description || rawRuleSet.description || "").trim();

  return {
    sourceName,
    metaName,
    description,
    searchSpec: cloneSearchSpec(payload.search_spec as Partial<SearchSpec>),
    ruleSet: {
      id: rawRuleSet.id == null ? null : Number(rawRuleSet.id),
      name: String(rawRuleSet.name || metaName).trim() || metaName,
      description: String(rawRuleSet.description || description).trim(),
      version: Math.max(1, Number(rawRuleSet.version || 1) || 1),
      definition: cloneRuleDefinition(rawRuleSet.definition as RuleSetDefinition),
    },
  };
}

export async function readImportedTaskPack(file: File): Promise<ImportedTaskPackDraft> {
  const rawText = await readFileText(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("任务包文件不是有效 JSON");
  }
  return normalizeImportedTaskPack(parsed, file.name);
}
