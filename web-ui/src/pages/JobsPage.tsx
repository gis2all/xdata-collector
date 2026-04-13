import { useEffect, useMemo, useState } from "react";
import {
  JobRecord,
  RuleSet,
  createJob,
  deleteJob,
  getJob,
  listJobs,
  listRuleSets,
  purgeJob,
  restoreJob,
  runJobNow,
  toggleJob,
  updateJob,
} from "../api";
import { DEFAULT_SEARCH_SPEC, buildQueryPreview, cloneSearchSpec } from "../collector";
import { SearchSpecEditor } from "../components/SearchSpecEditor";

type JobStatusFilter = "active" | "all" | "deleted";
type DrawerMode = "create" | "view" | "edit";
type RefreshOptions = {
  page?: number;
  query?: string;
  status?: JobStatusFilter;
  keepDrawer?: boolean;
  reloadSelected?: boolean;
};

type JobFormState = {
  name: string;
  interval_minutes: number;
  enabled: boolean;
  rule_set_id: number | null;
  search_spec: ReturnType<typeof cloneSearchSpec>;
};

const DEFAULT_FORM: JobFormState = {
  name: "mining-watch",
  interval_minutes: 60,
  enabled: true,
  rule_set_id: null,
  search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC),
};

function jobToForm(job: JobRecord): JobFormState {
  return {
    name: job.name,
    interval_minutes: job.interval_minutes,
    enabled: Boolean(job.enabled),
    rule_set_id: job.rule_set_id ?? null,
    search_spec: cloneSearchSpec(job.search_spec_json),
  };
}

function formatTime(value?: string | null) {
  if (!value) return "--";
  return value.replace("T", " ").replace("+00:00", " UTC");
}

function jobState(job: JobRecord) {
  if (job.deleted_at) return "已删除";
  return job.enabled ? "启用中" : "已停用";
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [status, setStatus] = useState<JobStatusFilter>("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<JobFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function loadRuleSets() {
    const data = await listRuleSets();
    const items = data.items || [];
    setRuleSets(items);
    setForm((prev) => ({ ...prev, rule_set_id: prev.rule_set_id ?? items[0]?.id ?? null }));
  }

  async function loadJobs(nextPage = page, nextQuery = query, nextStatus = status, allowPageFallback = false) {
    setLoading(true);
    setError("");
    try {
      const data = await listJobs({ page: nextPage, page_size: pageSize, query: nextQuery || undefined, status: nextStatus });
      let items = data.items || [];
      let totalItems = data.total || 0;
      let currentPage = data.page || nextPage;

      if (allowPageFallback && currentPage > 1 && items.length === 0 && totalItems > 0) {
        const fallback = await listJobs({ page: 1, page_size: pageSize, query: nextQuery || undefined, status: nextStatus });
        items = fallback.items || [];
        totalItems = fallback.total || 0;
        currentPage = fallback.page || 1;
      }

      setJobs(items);
      setTotal(totalItems);
      setPage(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setJobs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRuleSets().catch(() => {});
    loadJobs(1, query, status).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setSelectedJob(null);
    setDrawerMode("create");
    setForm({ ...DEFAULT_FORM, rule_set_id: ruleSets[0]?.id ?? null, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC) });
    setDrawerOpen(true);
  }

  async function openJob(job: JobRecord, mode: DrawerMode = "view") {
    try {
      const detail = await getJob(job.id);
      setSelectedJob(detail);
      setDrawerMode(mode);
      setForm(jobToForm(detail));
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取任务详情失败");
    }
  }

  function updateForm<K extends keyof JobFormState>(key: K, value: JobFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refreshJobs(options: RefreshOptions = {}) {
    const nextPage = options.page ?? page;
    const nextQuery = options.query ?? query;
    const nextStatus = options.status ?? status;
    const keepDrawer = options.keepDrawer ?? true;
    const reloadSelected = options.reloadSelected ?? true;

    await loadJobs(nextPage, nextQuery, nextStatus, true);
    if (!keepDrawer) {
      setSelectedJob(null);
      setDrawerMode("create");
      setForm({ ...DEFAULT_FORM, rule_set_id: ruleSets[0]?.id ?? null, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC) });
      return;
    }
    if (reloadSelected && selectedJob) {
      const fresh = await getJob(selectedJob.id).catch(() => null);
      if (fresh) {
        setSelectedJob(fresh);
        setForm(jobToForm(fresh));
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (!form.name.trim()) throw new Error("任务名不能为空");
      if (!form.rule_set_id) throw new Error("请选择规则集");
      if (!form.search_spec.all_keywords.length && !form.search_spec.raw_query.trim()) throw new Error("至少填写关键词或原生搜索语法");
      const payload = {
        name: form.name.trim(),
        interval_minutes: Number(form.interval_minutes),
        enabled: form.enabled,
        search_spec: form.search_spec,
        rule_set_id: form.rule_set_id,
      };
      if (drawerMode === "create") {
        const created = await createJob(payload);
        setSelectedJob(created);
        setDrawerMode("view");
        setForm(jobToForm(created));
        setDrawerOpen(true);
        setStatus("active");
        setQuery("");
        setQueryInput("");
        setPage(1);
        setJobs([created]);
        setTotal((prev) => Math.max(1, prev + 1));
        await refreshJobs({ page: 1, query: "", status: "active", reloadSelected: false });
      } else if (selectedJob) {
        const updated = await updateJob(selectedJob.id, payload);
        setSelectedJob(updated);
        setDrawerMode("view");
        setForm(jobToForm(updated));
        setDrawerOpen(true);
        await refreshJobs();
      }
      setActionMessage("已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(job: JobRecord) {
    if (!window.confirm(`确定删除任务「${job.name}」吗？删除后会进入回收站。`)) {
      return;
    }
    setError("");
    try {
      await deleteJob(job.id);
      setActionMessage("任务已删除");
      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
        setDrawerMode("create");
        setForm({ ...DEFAULT_FORM, rule_set_id: ruleSets[0]?.id ?? null, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC) });
        setDrawerOpen(false);
      }
      await refreshJobs({ keepDrawer: false, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleRestore(job: JobRecord) {
    setError("");
    try {
      const restored = await restoreJob(job.id);
      setActionMessage("任务已恢复");
      setSelectedJob(restored);
      setForm(jobToForm(restored));
      setDrawerMode("view");
      setDrawerOpen(true);
      const nextStatus = status === "deleted" ? "active" : status;
      if (status === "deleted") setStatus("active");
      await refreshJobs({ page: 1, status: nextStatus, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    }
  }

  async function handlePurge(job: JobRecord) {
    if (!window.confirm(`确定彻底删除任务「${job.name}」吗？此操作无法恢复。`)) {
      return;
    }
    setError("");
    try {
      await purgeJob(job.id);
      setActionMessage("任务已彻底删除");
      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
        setDrawerMode("create");
        setForm({ ...DEFAULT_FORM, rule_set_id: ruleSets[0]?.id ?? null, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC) });
        setDrawerOpen(false);
      }
      await refreshJobs({ keepDrawer: false, reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "彻底删除失败");
    }
  }

  async function handleRunNow(job: JobRecord) {
    setError("");
    try {
      await runJobNow(job.id);
      setActionMessage(`任务 ${job.name} 已执行`);
      if (selectedJob?.id === job.id) {
        const fresh = await getJob(job.id);
        setSelectedJob(fresh);
        setForm(jobToForm(fresh));
        setDrawerOpen(true);
      }
      await refreshJobs({ reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "立即执行失败");
    }
  }

  async function handleToggle(job: JobRecord) {
    setError("");
    try {
      const updated = await toggleJob(job.id, !Boolean(job.enabled));
      setActionMessage(updated.enabled ? "任务已启用" : "任务已停用");
      if (selectedJob?.id === job.id) {
        setSelectedJob(updated);
        setForm(jobToForm(updated));
        setDrawerOpen(true);
      }
      await refreshJobs({ reloadSelected: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态切换失败");
    }
  }

  function submitQuery() {
    setQuery(queryInput.trim());
    refreshJobs({ page: 1, query: queryInput.trim() }).catch(() => {});
  }

  function renderActions(job: JobRecord) {
    if (job.deleted_at) {
      return (
        <div className="table-actions">
          <button type="button" className="ghost" onClick={() => openJob(job, "view")}>
            查看
          </button>
          <button type="button" onClick={() => handleRestore(job)}>
            恢复
          </button>
          <button type="button" className="danger" onClick={() => handlePurge(job)}>
            彻底删除
          </button>
        </div>
      );
    }
    return (
      <div className="table-actions">
        <button type="button" className="ghost" onClick={() => openJob(job, "view")}>
          查看
        </button>
        <button type="button" className="ghost" onClick={() => openJob(job, "edit")}>
          编辑
        </button>
        <button type="button" onClick={() => handleRunNow(job)}>
          立即执行
        </button>
        <button type="button" className="ghost" onClick={() => handleToggle(job)}>
          {job.enabled ? "停用" : "启用"}
        </button>
        <button type="button" className="danger" onClick={() => handleDelete(job)}>
          删除
        </button>
      </div>
    );
  }

  const drawerDisabled = Boolean(selectedJob?.deleted_at) && drawerMode !== "create";

  return (
    <div className="card jobs-page" data-testid="jobs-page">
      <div className="jobs-header">
        <div>
          <h3>自动任务</h3>
          <p className="kv">自动任务现在基于搜索配置 + 规则集模板来运行，和采集器工作台保持一致。</p>
        </div>
        <div className="jobs-toolbar">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="按任务名或关键词搜索"
            aria-label="任务搜索"
          />
          <select
            value={status}
            onChange={(e) => {
              const nextStatus = e.target.value as JobStatusFilter;
              setStatus(nextStatus);
              refreshJobs({ page: 1, status: nextStatus }).catch(() => {});
            }}
            aria-label="任务状态"
          >
            <option value="active">有效任务</option>
            <option value="all">全部任务</option>
            <option value="deleted">回收站</option>
          </select>
          <button type="button" onClick={submitQuery}>查询</button>
          <button type="button" data-testid="create-job-button" onClick={openCreate}>新建任务</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {actionMessage && <div className="alert success">{actionMessage}</div>}

      <div className="jobs-layout">
        <div className="jobs-table-wrap">
          {loading ? (
            <div className="searching"><span className="spinner" /> 正在加载任务列表...</div>
          ) : (
            <table className="table jobs-table">
              <thead>
                <tr>
                  <th>任务名</th>
                  <th>规则集</th>
                  <th>查询预览</th>
                  <th>间隔</th>
                  <th>状态</th>
                  <th>下次执行</th>
                  <th>最近执行</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className={job.deleted_at ? "row-deleted" : ""}>
                    <td>
                      <div className="job-name">{job.name}</div>
                      <div className="kv">#{job.id}</div>
                    </td>
                    <td>
                      <div>{job.rule_set_summary?.name || "--"}</div>
                      <div className="kv">{job.rule_set_summary?.description || ""}</div>
                    </td>
                    <td>
                      <div className="collector-text-snippet">{buildQueryPreview(job.search_spec_json) || "--"}</div>
                    </td>
                    <td>{job.interval_minutes} 分钟</td>
                    <td>
                      <span className={`badge ${job.deleted_at ? "b" : job.enabled ? "a" : ""}`}>{jobState(job)}</span>
                    </td>
                    <td>{formatTime(job.next_run_at)}</td>
                    <td>
                      <div>{job.last_run_status || "--"}</div>
                      <div className="kv">{formatTime(job.last_run_ended_at || job.last_run_started_at)}</div>
                    </td>
                    <td>{renderActions(job)}</td>
                  </tr>
                ))}
                {!jobs.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#64748b" }}>
                      {status === "deleted" ? "回收站里暂无任务" : "暂无任务"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          <div className="jobs-pagination">
            <span className="kv">共 {total} 条</span>
            <div className="row">
              <button type="button" className="ghost" disabled={page <= 1} onClick={() => refreshJobs({ page: page - 1 }).catch(() => {})}>上一页</button>
              <span className="kv">第 {page} / {totalPages} 页</span>
              <button type="button" className="ghost" disabled={page >= totalPages} onClick={() => refreshJobs({ page: page + 1 }).catch(() => {})}>下一页</button>
            </div>
          </div>
        </div>

        <aside className={`jobs-drawer ${drawerOpen ? "open" : ""}`}>
          {drawerOpen ? (
            <>
              <div className="drawer-header">
                <div>
                  <h4>{drawerMode === "create" ? "新建任务" : drawerMode === "edit" ? "编辑任务" : "任务详情"}</h4>
                  <div className="kv">{selectedJob ? `任务 #${selectedJob.id}` : "新建一条任务模板"}</div>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSelectedJob(null);
                    setDrawerMode("create");
                    setForm({ ...DEFAULT_FORM, rule_set_id: ruleSets[0]?.id ?? null, search_spec: cloneSearchSpec(DEFAULT_SEARCH_SPEC) });
                    setDrawerOpen(false);
                  }}
                >
                  关闭
                </button>
              </div>

              {selectedJob && (
                <div className="drawer-section">
                  <div className="kv">状态：{jobState(selectedJob)}</div>
                  <div className="kv">最近运行：{selectedJob.last_run_status || "--"}</div>
                  <div className="kv">下次执行：{formatTime(selectedJob.next_run_at)}</div>
                  {selectedJob.deleted_at && <div className="kv">删除时间：{formatTime(selectedJob.deleted_at)}</div>}
                </div>
              )}

              <div className="drawer-section">
                <div className="collector-grid collector-grid-2">
                  <label className="field">
                    <span>任务名</span>
                    <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} disabled={drawerDisabled} />
                  </label>
                  <label className="field">
                    <span>规则集</span>
                    <select value={form.rule_set_id ?? ""} onChange={(e) => updateForm("rule_set_id", e.target.value ? Number(e.target.value) : null)} disabled={drawerDisabled}>
                      {ruleSets.map((ruleSet) => (
                        <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="collector-grid collector-grid-2" style={{ marginTop: 8 }}>
                  <label className="field">
                    <span>间隔（分钟）</span>
                    <input type="number" value={form.interval_minutes} onChange={(e) => updateForm("interval_minutes", Number(e.target.value))} disabled={drawerDisabled} />
                  </label>
                  <label className="field checkbox-row">
                    <span>启用</span>
                    <input type="checkbox" checked={form.enabled} onChange={(e) => updateForm("enabled", e.target.checked)} disabled={drawerDisabled} />
                  </label>
                </div>
                <div className="collector-query-preview" style={{ marginTop: 12 }}>
                  <div className="collector-subtitle">查询预览</div>
                  <code>{buildQueryPreview(form.search_spec) || "--"}</code>
                </div>
              </div>

              <div className="drawer-section">
                <h5>搜索配置</h5>
                <SearchSpecEditor value={form.search_spec} onChange={(next) => updateForm("search_spec", next)} disabled={drawerDisabled} />
              </div>

              {selectedJob?.last_run_stats && (
                <div className="drawer-section">
                  <h5>最近执行统计</h5>
                  <pre className="drawer-json">{JSON.stringify(selectedJob.last_run_stats, null, 2)}</pre>
                </div>
              )}

              <div className="drawer-footer">
                {!selectedJob ? (
                  <button type="button" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "创建任务"}</button>
                ) : selectedJob.deleted_at ? (
                  <>
                    <button type="button" onClick={() => handleRestore(selectedJob)}>恢复任务</button>
                    <button type="button" className="danger" onClick={() => handlePurge(selectedJob)}>彻底删除</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存修改"}</button>
                    <button type="button" className="ghost" onClick={() => handleRunNow(selectedJob)}>立即执行</button>
                    <button type="button" className="ghost" onClick={() => handleToggle(selectedJob)}>{selectedJob.enabled ? "停用任务" : "启用任务"}</button>
                    <button type="button" className="danger" onClick={() => handleDelete(selectedJob)}>删除任务</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="drawer-empty">
              <h4>任务详情</h4>
              <p>选择一条任务查看和编辑，或者点击“新建任务”创建一个新的自动任务。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
