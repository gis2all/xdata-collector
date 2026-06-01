import { useState, type Dispatch, type SetStateAction } from "react";

import {
  createTaskPack,
  deleteTaskPack,
  getTaskPack,
  listTaskPacks,
  updateTaskPack,
  type TaskPackFile,
  type TaskPackSummary,
} from "../../api";
import {
  DEFAULT_RULE_SET_DEFINITION,
  DEFAULT_SEARCH_SPEC,
  cloneRuleDefinition,
  cloneSearchSpec,
  joinCommaLinesForTextarea,
} from "../../collector";
import { readImportedTaskPack } from "../../taskPacks";
import { buildPackPayload, type JobFormState } from "./jobDraft";
import type { JobStatusFilter } from "./jobsTableConfig";

type RefreshJobsOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
  silent?: boolean;
};

type UseJobsTaskPacksParams = {
  form: JobFormState;
  setForm: Dispatch<SetStateAction<JobFormState>>;
  setError: Dispatch<SetStateAction<string>>;
  setActionMessage: Dispatch<SetStateAction<string>>;
  refreshJobs: (options?: RefreshJobsOptions) => Promise<void>;
};

export function useJobsTaskPacks({
  form,
  setForm,
  setError,
  setActionMessage,
  refreshJobs,
}: UseJobsTaskPacksParams) {
  const [taskPacks, setTaskPacks] = useState<TaskPackSummary[]>([]);
  const [savingPack, setSavingPack] = useState(false);
  const [deletingPack, setDeletingPack] = useState(false);
  const [currentTaskPack, setCurrentTaskPack] = useState<TaskPackFile | null>(null);

  async function loadTaskPacks() {
    const data = await listTaskPacks();
    const items = data.items || [];
    setTaskPacks(items);
    setForm((prev) => ({ ...prev, import_pack_name: prev.import_pack_name || items[0]?.pack_name || "" }));
  }

  function clearCurrentTaskPack() {
    setCurrentTaskPack(null);
  }

  function resetTaskBodyToDraft() {
    setForm((prev) => ({
      ...prev,
      pack_name: null,
      import_pack_name: taskPacks[0]?.pack_name || "",
      tagsText: "",
      search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
      rule_set: {
        ...prev.rule_set,
        id: 1,
        name: "Default Rule Set",
        description: "Built-in opportunity discovery rules.",
        version: 1,
        definition: cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION),
      },
    }));
    setCurrentTaskPack(null);
  }

  async function handleImportPack() {
    if (!form.import_pack_name) return;
    setError("");
    try {
      const pack = await getTaskPack(form.import_pack_name);
      setCurrentTaskPack(pack);
      setForm((prev) => ({
        ...prev,
        search_spec: cloneSearchSpec(pack.search_spec),
        tagsText: joinCommaLinesForTextarea(pack.tags || []),
        rule_set: {
          id: pack.rule_set.id ?? null,
          name: pack.rule_set.name,
          description: pack.rule_set.description || "",
          version: pack.rule_set.version || 1,
          definition: cloneRuleDefinition(pack.rule_set.definition),
        },
        pack_name: pack.pack_name,
      }));
      setActionMessage(`已载入任务包 ${pack.meta.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包失败");
    }
  }

  async function handleSavePack(mode: "create" | "overwrite") {
    const suggestedName = form.pack_name || form.name || "task-pack";
    const targetName = mode === "overwrite" && form.pack_name ? form.pack_name : window.prompt("请输入任务包名称", suggestedName)?.trim();
    if (!targetName) return;

    setSavingPack(true);
    setError("");
    try {
      const payload = buildPackPayload(form, targetName);
      const saved = mode === "overwrite" && form.pack_name ? await updateTaskPack(form.pack_name, payload) : await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentTaskPack(saved);
      setForm((prev) => ({ ...prev, pack_name: saved.pack_name, import_pack_name: saved.pack_name, tagsText: joinCommaLinesForTextarea(saved.tags || []) }));
      setActionMessage(mode === "overwrite" ? "已保存到当前任务包" : `已另存为新任务包 ${saved.pack_name}`);
      await loadTaskPacks();
      await refreshJobs({ keepDrawer: true, reloadSelected: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleImportPackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      const imported = await readImportedTaskPack(file);
      setCurrentTaskPack(null);
      setForm((prev) => ({
        ...prev,
        pack_name: null,
        import_pack_name: taskPacks[0]?.pack_name || "",
        tagsText: joinCommaLinesForTextarea(imported.tags || []),
        search_spec: cloneSearchSpec(imported.searchSpec),
        rule_set: {
          id: imported.ruleSet.id ?? null,
          name: imported.ruleSet.name,
          description: imported.ruleSet.description || imported.description,
          version: imported.ruleSet.version || 1,
          definition: cloneRuleDefinition(imported.ruleSet.definition),
        },
      }));
      setActionMessage(`已从文件导入任务包 ${imported.sourceName}，当前仍是未绑定草稿`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包文件失败");
    }
  }

  async function handleImportAndSavePackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      const imported = await readImportedTaskPack(file);
      const suggestedName = imported.metaName || imported.sourceName.replace(/\.json$/i, "") || "task-pack";
      const targetName = window.prompt("请输入新任务包名称", suggestedName)?.trim();
      if (!targetName) return;
      setSavingPack(true);
      const payload = {
        meta: {
          name: targetName,
          description: imported.ruleSet.description || imported.description,
        },
        tags: imported.tags,
        search_spec: cloneSearchSpec(imported.searchSpec),
        rule_set: {
          id: imported.ruleSet.id ?? null,
          name: imported.ruleSet.name,
          description: imported.ruleSet.description || imported.description,
          version: imported.ruleSet.version,
          definition: cloneRuleDefinition(imported.ruleSet.definition),
        },
      };
      const saved = await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentTaskPack(saved);
      setForm((prev) => ({
        ...prev,
        pack_name: saved.pack_name,
        import_pack_name: saved.pack_name,
        search_spec: cloneSearchSpec(saved.search_spec),
        tagsText: joinCommaLinesForTextarea(saved.tags || []),
        rule_set: {
          id: saved.rule_set.id ?? null,
          name: saved.rule_set.name,
          description: saved.rule_set.description || "",
          version: saved.rule_set.version || 1,
          definition: cloneRuleDefinition(saved.rule_set.definition),
        },
      }));
      setActionMessage(`已从文件导入并保存为新任务包 ${saved.pack_name}`);
      await loadTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入并保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleDeleteCurrentPack() {
    if (!currentTaskPack?.pack_name) return;
    if (!window.confirm(`确认删除当前任务包 ${currentTaskPack.pack_name} 吗？`)) return;

    setDeletingPack(true);
    setError("");
    try {
      const deletedPackName = currentTaskPack.pack_name;
      await deleteTaskPack(deletedPackName);
      resetTaskBodyToDraft();
      setActionMessage(`已删除任务包 ${deletedPackName}`);
      await loadTaskPacks();
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "删除任务包失败";
      if (fallback.includes("referenced by existing jobs")) {
        setError("当前任务包仍被自动任务使用，请先更换绑定后再删除");
      } else if (fallback.includes("default task pack cannot be deleted")) {
        setError("默认规则任务包不可删除");
      } else {
        setError(fallback);
      }
    } finally {
      setDeletingPack(false);
    }
  }

  return {
    taskPacks,
    savingPack,
    deletingPack,
    currentTaskPack,
    setCurrentTaskPack,
    clearCurrentTaskPack,
    loadTaskPacks,
    resetTaskBodyToDraft,
    handleImportPack,
    handleSavePack,
    handleImportPackFile,
    handleImportAndSavePackFile,
    handleDeleteCurrentPack,
  };
}
