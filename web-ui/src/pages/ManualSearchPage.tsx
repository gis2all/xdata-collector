import { useEffect, useMemo, useState } from "react";
import {
  CollectorRunResult,
  RuleSet,
  RuleSetDefinition,
  TaskPackSummary,
  createTaskPack,
  getTaskPack,
  listTaskPacks,
  runManual,
  updateTaskPack,
} from "../api";
import { DEFAULT_RULE_SET_DEFINITION, DEFAULT_SEARCH_SPEC, buildQueryPreview, cloneRuleDefinition, cloneSearchSpec } from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { RuleSetEditor } from "../components/RuleSetEditor";
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

export function ManualSearchPage() {
  const [searchSpec, setSearchSpec] = useState(() => cloneSearchSpec(DEFAULT_SEARCH_SPEC));
  const [result, setResult] = useState<CollectorRunResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPack, setSavingPack] = useState(false);
  const [taskPacks, setTaskPacks] = useState<TaskPackSummary[]>([]);
  const [selectedPackName, setSelectedPackName] = useState("");
  const [currentPackName, setCurrentPackName] = useState<string | null>(null);
  const [draftRuleName, setDraftRuleName] = useState("Default Rule Set");
  const [draftRuleDescription, setDraftRuleDescription] = useState("Built-in opportunity discovery rules.");
  const [draftDefinition, setDraftDefinition] = useState<RuleSetDefinition>(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));

  const ruleSetPreview = useMemo<RuleSet | null>(
    () => ({
      id: 1,
      name: draftRuleName,
      description: draftRuleDescription,
      is_enabled: true,
      is_builtin: currentPackName ? false : true,
      version: 1,
      definition_json: cloneRuleDefinition(draftDefinition),
    }),
    [currentPackName, draftDefinition, draftRuleDescription, draftRuleName],
  );

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
      setCurrentPackName(pack.pack_name);
      setSelectedPackName(pack.pack_name);
      setMessage(`已导入任务包 ${pack.meta.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入任务包失败");
    }
  }

  async function savePack(mode: "create" | "overwrite") {
    const suggestedName = currentPackName || draftRuleName || "task-pack";
    const targetName =
      mode === "overwrite" && currentPackName
        ? currentPackName
        : window.prompt("请输入任务包名称", suggestedName)?.trim();
    if (!targetName) return;

    setSavingPack(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPackPayload(targetName, draftRuleDescription, searchSpec, draftRuleName, draftRuleDescription, draftDefinition);
      const saved =
        mode === "overwrite" && currentPackName
          ? await updateTaskPack(currentPackName, payload)
          : await createTaskPack({ pack_name: targetName, ...payload });
      setCurrentPackName(saved.pack_name);
      setSelectedPackName(saved.pack_name);
      setDraftRuleName(saved.rule_set.name || targetName);
      setDraftRuleDescription(saved.rule_set.description || "");
      setDraftDefinition(cloneRuleDefinition(saved.rule_set.definition));
      setMessage(mode === "overwrite" ? "已覆盖当前任务包" : `已导出任务包 ${saved.pack_name}`);
      await refreshTaskPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务包失败");
    } finally {
      setSavingPack(false);
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
          <h3>{"\u624b\u52a8\u641c\u7d22"}</h3>
          <p className="kv">{"\u4efb\u52a1\u5305\u5f15\u5165\u53ea\u66ff\u6362\u5f53\u524d\u641c\u7d22\u6761\u4ef6\u548c\u89c4\u5219\uff0c\u7ee7\u7eed\u7f16\u8f91\u4e0d\u4f1a\u81ea\u52a8\u56de\u5199\u539f pack \u6587\u4ef6\u3002"}</p>
        </div>
        <div className="collector-toolbar">
          <button type="button" onClick={onRun} data-testid="manual-run-button" disabled={loading}>
            {loading ? "\u91c7\u96c6\u4e2d..." : "\u5f00\u59cb\u91c7\u96c6"}
          </button>
          <button type="button" className="ghost" onClick={() => setSearchSpec(cloneSearchSpec(DEFAULT_SEARCH_SPEC))}>
            {"\u91cd\u7f6e\u641c\u7d22\u914d\u7f6e"}
          </button>
          <button type="button" className="ghost" onClick={() => refreshTaskPacks().catch(() => undefined)}>
            {"\u5237\u65b0\u4efb\u52a1\u5305"}
          </button>
        </div>
      </div>

      {error && <div className="alert error" data-testid="manual-error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="collector-layout">
        <section className="card">
          <div className="collector-toolbar between">
            <div>
              <h4>{"\u641c\u7d22\u914d\u7f6e"}</h4>
              <div className="kv">{buildQueryPreview(searchSpec) || "--"}</div>
            </div>
            <div className="collector-toolbar">
              <select aria-label="manual-pack-select" value={selectedPackName} onChange={(e) => setSelectedPackName(e.target.value)}>
                <option value="">{"\u9009\u62e9\u4efb\u52a1\u5305"}</option>
                {taskPacks.map((item) => (
                  <option key={item.pack_name} value={item.pack_name}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost" aria-label="import-manual-pack" onClick={() => importSelectedPack().catch(() => undefined)}>
                {"\u5bfc\u5165\u4efb\u52a1\u5305"}
              </button>
              <button type="button" className="ghost" aria-label="export-manual-pack" onClick={() => savePack("create").catch(() => undefined)} disabled={savingPack}>
                {"\u5bfc\u51fa\u4e3a\u4efb\u52a1\u5305"}
              </button>
              <button type="button" aria-label="overwrite-manual-pack" onClick={() => savePack("overwrite").catch(() => undefined)} disabled={savingPack || !currentPackName}>
                {"\u8986\u76d6\u5f53\u524d\u4efb\u52a1\u5305"}
              </button>
            </div>
          </div>
          <SearchSpecEditor value={searchSpec} onChange={setSearchSpec} disabled={loading} />
        </section>

        <section className="card">
          <div className="collector-grid collector-grid-2" style={{ marginBottom: 12 }}>
            <label className="field">
              <span>{"\u89c4\u5219\u540d\u79f0"}</span>
              <input value={draftRuleName} onChange={(e) => setDraftRuleName(e.target.value)} />
            </label>
            <label className="field">
              <span>{"\u89c4\u5219\u8bf4\u660e"}</span>
              <input value={draftRuleDescription} onChange={(e) => setDraftRuleDescription(e.target.value)} />
            </label>
          </div>
          <RuleSetEditor
            ruleSet={ruleSetPreview}
            draft={draftDefinition}
            onDraftChange={setDraftDefinition}
            onSave={() => savePack(currentPackName ? "overwrite" : "create").catch(() => undefined)}
            onClone={() => savePack("create").catch(() => undefined)}
            onDelete={() => {
              setCurrentPackName(null);
              setMessage("已取消当前任务包绑定");
            }}
            saving={savingPack}
            deleting={false}
          />
        </section>
      </div>

      {loading && (
        <div className="searching" data-testid="manual-searching">
          <span className="spinner" /> {"\u6b63\u5728\u641c\u7d22\u5e76\u8bc4\u4f30\u7ed3\u679c..."}
        </div>
      )}

      {result && (
        <>
          <div className="card collector-summary-grid">
            <div className="dashboard-detail-item">
              <span>{"\u5b9e\u9645\u67e5\u8be2"}</span>
              <div>
                {(result.final_queries?.length ? result.final_queries : [result.final_query]).filter(Boolean).map((query) => (
                  <div key={query} className="collector-text-snippet">{query}</div>
                ))}
                {!result.final_queries?.length && !result.final_query && <strong>--</strong>}
              </div>
            </div>
            <div className="dashboard-detail-item">
              <span>{"\u89c4\u5219\u96c6"}</span>
              <strong>{result.rule_set_summary?.name || "--"}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>{"\u539f\u59cb\u7ed3\u679c"}</span>
              <strong>{result.raw_total}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>{"\u547d\u4e2d\u7ed3\u679c"}</span>
              <strong>{result.matched_total}</strong>
            </div>
          </div>

          <div className="collector-result-grid">
            <section className="card">
              <div className="collector-toolbar between">
                <h4>{"\u539f\u59cb\u91c7\u96c6\u7ed3\u679c"}</h4>
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
                <h4>{"\u547d\u4e2d\u7ed3\u679c"}</h4>
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
                        {"\u672c\u6b21\u91c7\u96c6\u6709\u539f\u59cb\u7ed3\u679c\uff0c\u4f46\u5f53\u524d\u89c4\u5219\u672a\u547d\u4e2d\u4efb\u4f55\u7ebf\u7d22\u3002"}
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
