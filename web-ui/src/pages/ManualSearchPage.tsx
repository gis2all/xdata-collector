import { useEffect, useMemo, useRef, useState } from "react";
import {
  CollectorRunResult,
  RuleSet,
  RuleSetDefinition,
  TaskPackFile,
  TaskPackSummary,
  createTaskPack,
  deleteTaskPack,
  getTaskPack,
  listTaskPacks,
  runManual,
  updateTaskPack,
} from "../api";
import { DEFAULT_RULE_SET_DEFINITION, DEFAULT_SEARCH_SPEC, buildQueryPreview, cloneRuleDefinition, cloneSearchSpec } from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { RuleSetEditor } from "../components/RuleSetEditor";
import { ImportedTaskPackDraft, readImportedTaskPack } from "../taskPacks";
import { formatUtcPlus8Time } from "../time";

function metricValue(item: any, key: string) {
  return Number(item?.metrics?.[key] || 0);
}

function buildPackPayload(
  name: string,
  description: string,
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
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim() || name,
      description: ruleDescription.trim(),
      version: 1,
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

function buildDraftComparable(
  searchSpec: ReturnType<typeof cloneSearchSpec>,
  ruleName: string,
  ruleDescription: string,
  draftDefinition: RuleSetDefinition,
) {
  return {
    search_spec: cloneSearchSpec(searchSpec),
    rule_set: {
      name: ruleName.trim(),
      description: ruleDescription.trim(),
      definition: cloneRuleDefinition(draftDefinition),
    },
  };
}

function buildPackComparable(pack: TaskPackFile) {
  return {
    search_spec: cloneSearchSpec(pack.search_spec),
    rule_set: {
      name: String(pack.rule_set.name || "").trim(),
      description: String(pack.rule_set.description || "").trim(),
      definition: cloneRuleDefinition(pack.rule_set.definition),
    },
  };
}

type DraftSourceKind = "blank" | "pack" | "file";

function draftSourceLabel(kind: DraftSourceKind) {
  if (kind === "pack") return "任务包载入";
  if (kind === "file") return "文件导入";
  return "默认空白";
}

export function ManualSearchPage() {
  const [searchSpec, setSearchSpec] = useState(() => cloneSearchSpec(DEFAULT_SEARCH_SPEC));
  const [result, setResult] = useState<CollectorRunResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPack, setSavingPack] = useState(false);
  const [deletingPack, setDeletingPack] = useState(false);
  const [taskPacks, setTaskPacks] = useState<TaskPackSummary[]>([]);
  const [selectedPackName, setSelectedPackName] = useState("");
  const [currentPack, setCurrentPack] = useState<TaskPackFile | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSourceKind>("blank");
  const [draftRuleName, setDraftRuleName] = useState("Default Rule Set");
  const [draftRuleDescription, setDraftRuleDescription] = useState("Built-in opportunity discovery rules.");
  const [draftDefinition, setDraftDefinition] = useState<RuleSetDefinition>(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileActionRef = useRef<"draft" | "save_new">("draft");

  const ruleSetPreview = useMemo<RuleSet | null>(
    () => ({
      id: 1,
      name: draftRuleName,
      description: draftRuleDescription,
      is_enabled: true,
      is_builtin: currentPack ? false : true,
      version: 1,
      definition_json: cloneRuleDefinition(draftDefinition),
    }),
    [currentPack, draftDefinition, draftRuleDescription, draftRuleName],
  );

  const currentPackComparable = useMemo(() => (currentPack ? buildPackComparable(currentPack) : null), [currentPack]);
  const currentDraftComparable = useMemo(
    () => buildDraftComparable(searchSpec, draftRuleName, draftRuleDescription, draftDefinition),
    [searchSpec, draftRuleName, draftRuleDescription, draftDefinition],
  );
  const draftDirty = useMemo(() => {
    if (!currentPackComparable) return false;
    return JSON.stringify(currentPackComparable) !== JSON.stringify(currentDraftComparable);
  }, [currentPackComparable, currentDraftComparable]);

  function resetToBlankDraft() {
    setSearchSpec(cloneSearchSpec(DEFAULT_SEARCH_SPEC));
    setDraftRuleName("Default Rule Set");
    setDraftRuleDescription("Built-in opportunity discovery rules.");
    setDraftDefinition(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));
    setCurrentPack(null);
    setSelectedPackName("");
    setDraftSource("blank");
  }

  function resetDraft() {
    if (currentPack) {
      setSearchSpec(cloneSearchSpec(currentPack.search_spec));
      setDraftRuleName(currentPack.rule_set.name || currentPack.meta.name);
      setDraftRuleDescription(currentPack.rule_set.description || currentPack.meta.description || "");
      setDraftDefinition(cloneRuleDefinition(currentPack.rule_set.definition));
      setMessage("已恢复当前任务包草稿");
      return;
    }
    resetToBlankDraft();
    setMessage("已重置为默认空白任务");
  }

  async function refreshTaskPacks() {
    const payload = await listTaskPacks();
    const items = payload.items || [];
    setTaskPacks(items);
    setSelectedPackName((prev) => prev || items[0]?.pack_name || "");
  }

  useEffect(() => {
    refreshTaskPacks().catch((err) => setError(err instanceof Error ? err.message : "加载任务包失败"));
  }, []);

  async function importSelectedPack() {
    if (!selectedPackName) return;
    setError("");
    setMessage("");
    try {
      const pack = await getTaskPack(selectedPackName);
      setSearchSpec(cloneSearchSpec(pack.search_spec));
      setDraftRuleName(pack.rule_set.name || pack.meta.name);
      setDraftRuleDescription(pack.rule_set.description || pack.meta.description || "");
      setDraftDefinition(cloneRuleDefinition(pack.rule_set.definition));
      setCurrentPack(pack);
      setSelectedPackName(pack.pack_name);
      setDraftSource("pack");
      setMessage(`已载入任务包 ${pack.meta.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包失败");
    }
  }

  async function savePack(mode: "create" | "overwrite") {
    const suggestedName = currentPack?.pack_name || draftRuleName || "task-pack";
    const targetName =
      mode === "overwrite" && currentPack?.pack_name
        ? currentPack.pack_name
        : window.prompt("请输入任务包名称", suggestedName)?.trim();
    if (!targetName) return;

    setSavingPack(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPackPayload(targetName, draftRuleDescription, searchSpec, draftRuleName, draftRuleDescription, draftDefinition);
      const saved =
        mode === "overwrite" && currentPack?.pack_name
          ? await updateTaskPack(currentPack.pack_name, payload)
          : await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentPack(saved);
      setSelectedPackName(saved.pack_name);
      setDraftSource("pack");
      setDraftRuleName(saved.rule_set.name || targetName);
      setDraftRuleDescription(saved.rule_set.description || "");
      setDraftDefinition(cloneRuleDefinition(saved.rule_set.definition));
      setMessage(mode === "overwrite" ? "已保存到当前任务包" : `已另存为新任务包 ${saved.pack_name}`);
      await refreshTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function importPackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const imported = await readImportedTaskPack(file);
      setSearchSpec(imported.searchSpec);
      setDraftRuleName(imported.ruleSet.name);
      setDraftRuleDescription(imported.ruleSet.description || imported.description);
      setDraftDefinition(cloneRuleDefinition(imported.ruleSet.definition));
      setCurrentPack(null);
      setSelectedPackName("");
      setMessage(`已从文件导入任务包 ${imported.sourceName}，当前仍是未绑定草稿`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包文件失败");
    }
  }

  async function importAndSavePackFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const imported = await readImportedTaskPack(file);
      const suggestedName = imported.metaName || imported.sourceName.replace(/\.json$/i, "") || "task-pack";
      const targetName = window.prompt("请输入新任务包名称", suggestedName)?.trim();
      if (!targetName) return;
      setSavingPack(true);
      const payload = buildPackPayload(
        targetName,
        imported.description,
        imported.searchSpec,
        imported.ruleSet.name,
        imported.ruleSet.description,
        imported.ruleSet.definition,
      );
      const saved = await createTaskPack({ pack_name: targetName, ...payload });
      setSearchSpec(cloneSearchSpec(saved.search_spec));
      setDraftRuleName(saved.rule_set.name || targetName);
      setDraftRuleDescription(saved.rule_set.description || "");
      setDraftDefinition(cloneRuleDefinition(saved.rule_set.definition));
      setCurrentPack(saved);
      setSelectedPackName(saved.pack_name);
      setDraftSource("pack");
      setMessage(`已从文件导入并保存为新任务包 ${saved.pack_name}`);
      await refreshTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入并保存任务包失败");
    } finally {
      setSavingPack(false);
    }
  }

  async function handleDeleteCurrentPack() {
    if (!currentPack?.pack_name) return;
    if (!window.confirm(`确认删除当前任务包 ${currentPack.pack_name} 吗？`)) return;

    setDeletingPack(true);
    setError("");
    setMessage("");
    try {
      const deletedPackName = currentPack.pack_name;
      await deleteTaskPack(deletedPackName);
      resetToBlankDraft();
      setMessage(`已删除任务包 ${deletedPackName}`);
      await refreshTaskPacks();
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

  async function onRun() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const data = await runManual({
        search_spec: searchSpec,
        rule_set: {
          name: draftRuleName,
          description: draftRuleDescription,
          version: 1,
          definition: cloneRuleDefinition(draftDefinition),
        },
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "采集失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="collector-workbench" data-testid="manual-search-page">
      <div className="card collector-hero">
        <div>
          <h3>{"手动执行任务"}</h3>
          <p className="kv">{"当前页面编辑的是任务草稿。你可以直接执行草稿，不需要先保存为任务包。"}</p>
        </div>
        <div className="collector-toolbar">
          <button type="button" onClick={onRun} data-testid="manual-run-button" disabled={loading}>
            {loading ? "执行中..." : "立即执行任务"}
          </button>
          <button type="button" className="ghost" onClick={resetDraft}>
            {currentPack ? "恢复任务包内容" : "清空当前草稿"}
          </button>
          <button type="button" className="ghost" onClick={() => refreshTaskPacks().catch(() => undefined)}>
            {"刷新任务包列表"}
          </button>
        </div>
      </div>

      {error && <div className="alert error" data-testid="manual-error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="card">
        <div className="collector-toolbar between">
          <div>
            <h4>{"当前任务包"}</h4>
            <div className="kv">{"先载入任务包到当前草稿，再决定是另存为新任务包，还是保存回当前任务包。"}</div>
          </div>
        </div>
        <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
          <div className="collector-card">
            <div className="collector-subtitle">{"任务包名称"}</div>
            <div className="job-name" style={{ marginTop: 6 }}>{currentPack?.meta.name || "未绑定"}</div>
            <div className="kv" style={{ marginTop: 8 }}>{currentPack?.meta.description || "当前正在编辑一个未绑定的临时任务草稿。"}</div>
            <div className="kv" style={{ marginTop: 8 }}>{`pack_name=${currentPack?.pack_name || "--"}`}</div>
            <div className="kv">{`pack_path=${currentPack?.pack_path || "--"}`}</div>
          </div>
          <div className="collector-card">
            <div className="collector-grid collector-grid-3">
              <div className="dashboard-detail-item">
                <span>{"绑定状态"}</span>
                <strong>{currentPack ? "已绑定本地任务包" : "未绑定"}</strong>
              </div>
              <div className="dashboard-detail-item">
                <span>{"草稿状态"}</span>
                <strong>{currentPack ? (draftDirty ? "已修改未保存" : "未修改") : "未绑定"}</strong>
              </div>
              <div className="dashboard-detail-item">
                <span>{"草稿来源"}</span>
                <strong>{draftSourceLabel(draftSource)}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
          <div className="collector-card">
            <div className="collector-subtitle">{"载入到当前草稿"}</div>
            <div className="kv" style={{ marginTop: 6 }}>{"可以从任务包列表载入，也可以直接从本地 JSON 文件导入到当前草稿。"}</div>
            <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <select aria-label="manual-pack-select" value={selectedPackName} onChange={(e) => setSelectedPackName(e.target.value)}>
                <option value="">{"选择任务包"}</option>
                {taskPacks.map((item) => (
                  <option key={item.pack_name} value={item.pack_name}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost" aria-label="manual-load-pack" onClick={() => importSelectedPack().catch(() => undefined)}>
                {"载入任务包"}
              </button>
              <button
                type="button"
                className="ghost"
                aria-label="manual-import-file-pack"
                onClick={() => {
                  pendingFileActionRef.current = "draft";
                  fileInputRef.current?.click();
                }}
              >
                {"从文件导入"}
              </button>
              <button
                type="button"
                className="ghost"
                aria-label="manual-import-and-save-pack"
                onClick={() => {
                  pendingFileActionRef.current = "save_new";
                  fileInputRef.current?.click();
                }}
              >
                {"导入并保存为新任务包"}
              </button>
              <input
                ref={fileInputRef}
                data-testid="manual-pack-file-input"
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void (pendingFileActionRef.current === "save_new" ? importAndSavePackFile(file) : importPackFile(file));
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <div className="kv" style={{ marginTop: 10 }}>{"从文件导入：只替换当前草稿，不会创建任务包。"}</div>
            <div className="kv">{"导入并保存为新任务包：会先导入文件，再立刻保存成新的本地任务包并绑定。"}</div>
          </div>
          <div className="collector-card">
            <div className="collector-subtitle">{"保存当前草稿"}</div>
            <div className="kv" style={{ marginTop: 6 }}>{"把当前草稿另存为新任务包，或保存回当前绑定任务包。"}</div>
            <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="ghost" aria-label="manual-save-as-pack" onClick={() => savePack("create").catch(() => undefined)} disabled={savingPack}>
                {"另存为新任务包"}
              </button>
              <button type="button" aria-label="manual-save-current-pack" onClick={() => savePack("overwrite").catch(() => undefined)} disabled={savingPack || !currentPack?.pack_name}>
                {"保存到当前任务包"}
              </button>
              <button
                type="button"
                className="danger"
                aria-label="manual-delete-pack"
                onClick={() => handleDeleteCurrentPack().catch(() => undefined)}
                disabled={deletingPack || !currentPack?.pack_name}
              >
                {deletingPack ? "删除中..." : "删除当前任务包"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="collector-toolbar between">
          <div>
            <h4>{"任务正文"}</h4>
            <div className="kv">{buildQueryPreview(searchSpec) || "--"}</div>
          </div>
          <div className="chiprow" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="collector-query-chip">{"任务包 = 搜索条件 + 规则"}</span>
          </div>
        </div>
        <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
          <section className="collector-card">
            <h5>{"搜索条件"}</h5>
            <div className="kv">{"这里定义这个任务要去搜什么。"}</div>
            <div className="collector-panel">
              <SearchSpecEditor value={searchSpec} onChange={setSearchSpec} disabled={loading} />
            </div>
          </section>
          <section className="collector-card collector-rule-card">
            <h5>{"规则"}</h5>
            <div className="kv">{"这里定义原始结果如何筛选、打分和分级。"}</div>
            <div className="collector-grid collector-grid-2" style={{ marginTop: 12, marginBottom: 12 }}>
              <label className="field">
                <span>{"规则名称"}</span>
                <input value={draftRuleName} onChange={(e) => setDraftRuleName(e.target.value)} />
              </label>
              <label className="field">
                <span>{"规则说明"}</span>
                <input value={draftRuleDescription} onChange={(e) => setDraftRuleDescription(e.target.value)} />
              </label>
            </div>
            <RuleSetEditor
              ruleSet={ruleSetPreview}
              draft={draftDefinition}
              onDraftChange={setDraftDefinition}
              disabled={loading}
            />
          </section>
        </div>
      </section>

      {loading && (
        <div className="searching" data-testid="manual-searching">
          <span className="spinner" /> {"正在执行任务并评估结果..."}
        </div>
      )}

      {result && (
        <>
          <section className="card">
            <div className="collector-toolbar between">
              <div>
                <h4>{"执行结果"}</h4>
                <div className="kv">{"当前任务执行完成后，系统会展示原始结果、命中结果和命中原因。"}</div>
              </div>
            </div>
          </section>
          <div className="card collector-summary-grid">
            <div className="dashboard-detail-item">
              <span>{"实际查询"}</span>
              <div>
                {(result.final_queries?.length ? result.final_queries : [result.final_query]).filter(Boolean).map((query) => (
                  <div key={query} className="collector-text-snippet">{query}</div>
                ))}
                {!result.final_queries?.length && !result.final_query && <strong>--</strong>}
              </div>
            </div>
            <div className="dashboard-detail-item">
              <span>{"本次执行规则"}</span>
              <strong>{result.rule_set_summary?.name || "--"}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>{"原始结果"}</span>
              <strong>{result.raw_total}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>{"命中结果"}</span>
              <strong>{result.matched_total}</strong>
            </div>
          </div>

          <div className="collector-result-grid">
            <section className="card">
              <div className="collector-toolbar between">
                <h4>{"原始结果"}</h4>
                <span className="kv">{`total=${result.raw_items.length}`}</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>{"\u4f5c\u8005 / \u65f6\u95f4"}</th>
                    <th>{"\u5185\u5bb9"}</th>
                    <th>{"\u4e92\u52a8"}</th>
                    <th>{"\u6807\u8bb0"}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.raw_items.map((item) => (
                    <tr key={`${item.tweet_id}-${item.url}`}>
                      <td>
                        <div className="job-name">{item.author || "unknown"}</div>
                        <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                      </td>
                      <td>
                        <div className="collector-text-snippet">{item.text || "--"}</div>
                        <a href={item.url} target="_blank" rel="noreferrer">{"\u67e5\u770b\u539f\u6587"}</a>
                      </td>
                      <td>
                        <div>views {metricValue(item, "views")}</div>
                        <div>likes {metricValue(item, "likes")}</div>
                        <div>replies {metricValue(item, "replies")}</div>
                        <div>retweets {metricValue(item, "retweets")}</div>
                      </td>
                      <td>
                        <div className="collector-flag-list">
                          {item.flags.has_link && <span className="badge">link</span>}
                          {item.flags.has_media && <span className="badge">media</span>}
                          {item.flags.is_reply && <span className="badge">reply</span>}
                          {item.flags.is_retweet && <span className="badge">retweet</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <div className="collector-toolbar between">
                <h4>{"命中结果"}</h4>
                <span className="kv">{`total=${result.matched_items.length}`}</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>{"\u6807\u9898"}</th>
                    <th>{"\u7b49\u7ea7 / \u5206\u6570"}</th>
                    <th>{"\u547d\u4e2d\u539f\u56e0"}</th>
                    <th>{"\u4f5c\u8005 / \u65f6\u95f4"}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched_items.map((item) => (
                    <tr key={`${item.tweet_id}-${item.url}-matched`}>
                      <td>
                        <div className="job-name">{item.title || item.text}</div>
                        <div className="collector-text-snippet">{item.summary || item.text}</div>
                        <a href={item.url} target="_blank" rel="noreferrer">{"\u67e5\u770b\u539f\u6587"}</a>
                      </td>
                      <td>
                        <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level}</span>
                        <div className="kv">score {item.score || 0}</div>
                      </td>
                      <td>
                        <div className="collector-reason-list">
                          {item.reasons?.map((reason) => (
                            <div key={`${item.tweet_id}-${reason.rule_id}`} className="collector-reason-item">
                              <strong>{reason.rule_name}</strong>
                              <div className="kv">{reason.matched_conditions.join(" / ")}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="job-name">{item.author || "unknown"}</div>
                        <div className="kv">{formatUtcPlus8Time(item.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                  {!result.matched_items.length && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#64748b" }}>
                        {"本次执行有原始结果，但当前任务正文中的规则没有命中任何线索。"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
