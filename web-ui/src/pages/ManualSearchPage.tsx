import { useEffect, useMemo, useState } from "react";
import { CollectorRunResult, RuleSet, RuleSetDefinition, SearchSpec, createRuleSet, deleteRuleSet, listRuleSets, runManual, updateRuleSet, cloneRuleSet as cloneRuleSetApi } from "../api";
import { DEFAULT_RULE_SET_DEFINITION, DEFAULT_SEARCH_SPEC, buildQueryPreview, cloneRuleDefinition, cloneSearchSpec } from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";
import { RuleSetEditor } from "../components/RuleSetEditor";
import { formatUtcPlus8Time } from "../time";

const STORAGE_KEY = "x-collector-workbench-settings-v2";

type StoredState = {
  searchSpec: SearchSpec;
  selectedRuleSetId: number | null;
};

function readStoredState(): StoredState {
  if (typeof window === "undefined") {
    return { searchSpec: cloneSearchSpec(DEFAULT_SEARCH_SPEC), selectedRuleSetId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { searchSpec: cloneSearchSpec(DEFAULT_SEARCH_SPEC), selectedRuleSetId: null };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      searchSpec: cloneSearchSpec(parsed.searchSpec),
      selectedRuleSetId: typeof parsed.selectedRuleSetId === "number" ? parsed.selectedRuleSetId : null,
    };
  } catch {
    return { searchSpec: cloneSearchSpec(DEFAULT_SEARCH_SPEC), selectedRuleSetId: null };
  }
}

function metricValue(item: any, key: string) {
  return Number(item?.metrics?.[key] || 0);
}

export function ManualSearchPage() {
  const [searchSpec, setSearchSpec] = useState<SearchSpec>(() => readStoredState().searchSpec);
  const [result, setResult] = useState<CollectorRunResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<number | null>(() => readStoredState().selectedRuleSetId);
  const [draftRuleName, setDraftRuleName] = useState("自定义规则集");
  const [draftRuleDescription, setDraftRuleDescription] = useState("在 UI 中自由配置机会发现规则。");
  const [draftDefinition, setDraftDefinition] = useState<RuleSetDefinition>(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));
  const [savingRuleSet, setSavingRuleSet] = useState(false);
  const [deletingRuleSet, setDeletingRuleSet] = useState(false);

  const selectedRuleSet = useMemo(() => ruleSets.find((item) => item.id === selectedRuleSetId) || null, [ruleSets, selectedRuleSetId]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchSpec,
        selectedRuleSetId,
      }),
    );
  }, [searchSpec, selectedRuleSetId]);

  async function loadRuleSets() {
    const data = await listRuleSets();
    const items = data.items || [];
    setRuleSets(items);
    const nextSelected = selectedRuleSetId && items.some((item) => item.id === selectedRuleSetId) ? selectedRuleSetId : items[0]?.id ?? null;
    setSelectedRuleSetId(nextSelected);
    const active = items.find((item) => item.id === nextSelected) || items[0] || null;
    if (active) {
      setDraftRuleName(active.name);
      setDraftRuleDescription(active.description);
      setDraftDefinition(cloneRuleDefinition(active.definition_json));
    }
  }

  useEffect(() => {
    loadRuleSets().catch((err) => setError(err instanceof Error ? err.message : "加载规则集失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRuleSet) return;
    setDraftRuleName(selectedRuleSet.name);
    setDraftRuleDescription(selectedRuleSet.description);
    setDraftDefinition(cloneRuleDefinition(selectedRuleSet.definition_json));
  }, [selectedRuleSet]);

  async function onRun() {
    setError("");
    setLoading(true);
    try {
      const data = await runManual({
        search_spec: searchSpec,
        rule_set_id: selectedRuleSetId,
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveRuleSet() {
    setSavingRuleSet(true);
    setError("");
    try {
      if (selectedRuleSet) {
        const updated = await updateRuleSet(selectedRuleSet.id, {
          name: draftRuleName,
          description: draftRuleDescription,
          definition: draftDefinition,
        });
        await loadRuleSets();
        setSelectedRuleSetId(updated.id);
      } else {
        const created = await createRuleSet({
          name: draftRuleName,
          description: draftRuleDescription,
          definition: draftDefinition,
        });
        await loadRuleSets();
        setSelectedRuleSetId(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存规则集失败");
    } finally {
      setSavingRuleSet(false);
    }
  }

  async function cloneCurrentRuleSet() {
    if (!selectedRuleSet) return;
    setError("");
    try {
      const cloned = await cloneRuleSetApi(selectedRuleSet.id);
      await loadRuleSets();
      setSelectedRuleSetId(cloned.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制规则集失败");
    }
  }

  async function deleteCurrentRuleSet() {
    if (!selectedRuleSet || selectedRuleSet.is_builtin) return;
    if (!window.confirm(`确定删除规则集「${selectedRuleSet.name}」吗？`)) return;
    setDeletingRuleSet(true);
    setError("");
    try {
      await deleteRuleSet(selectedRuleSet.id);
      await loadRuleSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除规则集失败");
    } finally {
      setDeletingRuleSet(false);
    }
  }

  function startNewRuleSet() {
    setSelectedRuleSetId(null);
    setDraftRuleName("新规则集");
    setDraftRuleDescription("从当前页面创建的新规则集");
    setDraftDefinition(cloneRuleDefinition(DEFAULT_RULE_SET_DEFINITION));
  }

  return (
    <div className="collector-workbench" data-testid="manual-search-page">
      <div className="card collector-hero">
        <div>
          <h3>X 采集器工作台</h3>
          <p className="kv">高级搜索、规则可视化编排、原始结果与命中结果双列表都在这里完成。</p>
        </div>
        <div className="collector-toolbar">
          <button type="button" onClick={onRun} data-testid="manual-run-button" disabled={loading}>
            {loading ? "采集中..." : "开始采集"}
          </button>
          <button type="button" className="ghost" onClick={() => setSearchSpec(cloneSearchSpec(DEFAULT_SEARCH_SPEC))}>
            重置搜索配置
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error" data-testid="manual-error">
          {error}
        </div>
      )}

      <div className="collector-layout">
        <section className="card">
          <div className="collector-toolbar between">
            <div>
              <h4>高级搜索配置</h4>
              <div className="kv">最终查询会直接展示在下方，方便你确认系统到底在怎么搜。</div>
            </div>
            <div className="collector-query-chip">{buildQueryPreview(searchSpec) || "--"}</div>
          </div>
          <SearchSpecEditor value={searchSpec} onChange={setSearchSpec} disabled={loading} />
        </section>

        <section className="card">
          <div className="collector-toolbar between">
            <div>
              <h4>规则集</h4>
              <div className="kv">规则不再写死在代码里，你可以直接在这里调整条件、权重和等级。</div>
            </div>
            <div className="collector-toolbar">
              <select value={selectedRuleSetId ?? ""} onChange={(e) => setSelectedRuleSetId(e.target.value ? Number(e.target.value) : null)}>
                {ruleSets.map((ruleSet) => (
                  <option key={ruleSet.id} value={ruleSet.id}>
                    {ruleSet.name}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost" onClick={startNewRuleSet}>新建规则集</button>
            </div>
          </div>

          <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
            <label className="field">
              <span>规则集名称</span>
              <input value={draftRuleName} onChange={(e) => setDraftRuleName(e.target.value)} />
            </label>
            <label className="field">
              <span>说明</span>
              <input value={draftRuleDescription} onChange={(e) => setDraftRuleDescription(e.target.value)} />
            </label>
          </div>

          <RuleSetEditor
            ruleSet={selectedRuleSet}
            draft={draftDefinition}
            onDraftChange={setDraftDefinition}
            onSave={saveRuleSet}
            onClone={cloneCurrentRuleSet}
            onDelete={deleteCurrentRuleSet}
            saving={savingRuleSet}
            deleting={deletingRuleSet}
          />
        </section>
      </div>

      {loading && (
        <div className="searching" data-testid="manual-searching">
          <span className="spinner" /> 正在搜索、评估规则并整理结果...
        </div>
      )}

      {result && (
        <>
          <div className="card collector-summary-grid">
            <div className="dashboard-detail-item">
              <span>最终查询</span>
              <strong>{result.final_query || "--"}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>规则集</span>
              <strong>{result.rule_set_summary?.name || "临时规则"}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>原始结果数</span>
              <strong>{result.raw_total}</strong>
            </div>
            <div className="dashboard-detail-item">
              <span>命中结果数</span>
              <strong>{result.matched_total}</strong>
            </div>
          </div>

          <div className="collector-result-grid">
            <section className="card">
              <div className="collector-toolbar between">
                <h4>原始采集结果</h4>
                <span className="kv">共 {result.raw_items.length} 条展示</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>作者 / 时间</th>
                    <th>内容</th>
                    <th>互动</th>
                    <th>标记</th>
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
                        <a href={item.url} target="_blank" rel="noreferrer">查看原文</a>
                      </td>
                      <td>
                        <div>views {metricValue(item, "views")}</div>
                        <div>likes {metricValue(item, "likes")}</div>
                        <div>replies {metricValue(item, "replies")}</div>
                        <div>retweets {metricValue(item, "retweets")}</div>
                      </td>
                      <td>
                        <div className="collector-flag-list">
                          {item.flags.has_link && <span className="badge">链接</span>}
                          {item.flags.has_media && <span className="badge">媒体</span>}
                          {item.flags.is_reply && <span className="badge">回复</span>}
                          {item.flags.is_retweet && <span className="badge">转推</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <div className="collector-toolbar between">
                <h4>命中结果</h4>
                <span className="kv">共 {result.matched_items.length} 条展示</span>
              </div>
              <table className="table collector-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>等级 / 分数</th>
                    <th>命中原因</th>
                    <th>作者 / 时间</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched_items.map((item) => (
                    <tr key={`${item.tweet_id}-${item.url}-matched`}>
                      <td>
                        <div className="job-name">{item.title || item.text}</div>
                        <div className="collector-text-snippet">{item.summary || item.text}</div>
                        <a href={item.url} target="_blank" rel="noreferrer">查看原文</a>
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
                              <div className="kv">{reason.matched_conditions.join(" · ")}</div>
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
                        这次采集拿到了原始结果，但当前规则集没有命中任何机会线索。
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

