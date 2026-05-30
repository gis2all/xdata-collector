import type { Dispatch, MutableRefObject, ReactNode, RefObject, SetStateAction } from "react";

import type { JobRecord, RuleSet, TaskPackFile, TaskPackSummary } from "../../api";
import { buildQueryPreview } from "../../collector";
import { RuleSetEditor } from "../../components/RuleSetEditor";
import { SearchSpecEditor } from "../../components/SearchSpecEditor";
import { executionStatusLabel, executionStatusTone, type RunProgress } from "../../runProgress";
import { formatUtcPlus8Time } from "../../time";
import type { ActiveJobRun } from "./jobsTableConfig";
import type { JobFormState } from "./jobDraft";

type PendingFileAction = "draft" | "save_new";

type JobWorkspaceProps = {
  drawerOpen: boolean;
  isCreateWorkspace: boolean;
  selectedJob: JobRecord | null;
  selectedJobActiveRun: ActiveJobRun | null;
  workspaceTitle: string;
  workspaceMeta: string;
  drawerDisabled: boolean;
  currentTaskEyebrow: string;
  currentTaskHeroTitle: string;
  currentTaskHeroDescription: string;
  currentStatusLabel: string;
  nextRunLabel: string;
  lastRunLabel: string;
  lastRunTimeLabel: string;
  currentTaskPackName: string | null;
  currentTaskPackBindingLabel: string;
  currentTaskPackDraftLabel: string;
  formTags: string[];
  taskPacks: TaskPackSummary[];
  currentTaskPack: TaskPackFile | null;
  form: JobFormState;
  taskKeywordCount: number;
  taskAuthorConstraintCount: number;
  taskRuleCount: number;
  taskLevelCount: number;
  currentRuleSetPreview: RuleSet | null;
  saving: boolean;
  savingPack: boolean;
  deletingPack: boolean;
  loading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  pendingFileActionRef: MutableRefObject<PendingFileAction>;
  updateForm: <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => void;
  setForm: Dispatch<SetStateAction<JobFormState>>;
  handleSave: () => void | Promise<void>;
  handleRestore: (job: JobRecord) => void | Promise<void>;
  handlePurge: (job: JobRecord) => void | Promise<void>;
  handleRunNow: (job: JobRecord) => void | Promise<void>;
  handleStopRun: (job: JobRecord, runId: number) => void | Promise<void>;
  handleToggle: (job: JobRecord) => void | Promise<void>;
  handleDelete: (job: JobRecord) => void | Promise<void>;
  handleImportPack: () => Promise<void>;
  handleSavePack: (mode: "create" | "overwrite") => Promise<void>;
  handleDeleteCurrentPack: () => Promise<void>;
  handleImportPackFile: (file: File | null | undefined) => Promise<void>;
  handleImportAndSavePackFile: (file: File | null | undefined) => Promise<void>;
  onClose: () => void;
  onOpenCreate: () => void;
  onRefreshEmpty: () => void;
};

function JobsSectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="jobs-section-header workbench-section-header">
      <div className="workbench-section-copy">
        <h5 className="workbench-section-title">{title}</h5>
        {description ? <p className="kv jobs-section-description">{description}</p> : null}
      </div>
      {actions ? <div className="jobs-section-actions">{actions}</div> : null}
    </div>
  );
}

function renderJobRunProgress(progress: RunProgress) {
  const progressQueryLabel = progress.totalQueries > 0 ? `${progress.completedQueries} / ${progress.totalQueries}` : "-- / --";
  return (
    <section className="card manual-run-progress-card workbench-layer" data-testid="job-run-progress">
      <div className="manual-run-progress-head">
        <div className="manual-run-progress-copy">
          <div className="workbench-section-eyebrow">执行进度</div>
          <div className="manual-run-progress-title">
            {progress.status === "success" ? "本次自动任务已完成" : progress.status === "failed" ? "本次自动任务已结束" : "自动任务正在按查询计划抓取"}
          </div>
          <div className="kv">
            {progress.totalQueries > 0
              ? `已完成 ${progressQueryLabel} 个查询切片`
              : progress.runId
                ? `执行任务 #${progress.runId} 已启动，等待返回查询总数`
                : "正在创建执行任务..."}
          </div>
        </div>
        <div className="manual-run-progress-side">
          <span className={`jobs-summary-pill workbench-pill ${executionStatusTone(progress.status)}`}>
            {executionStatusLabel(progress.status)}
          </span>
          <div className="manual-run-progress-percent">{`${progress.progressPercent}%`}</div>
        </div>
      </div>
      <div
        className="manual-run-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progressPercent}
      >
        <div className="manual-run-progress-fill" style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <div className="manual-run-progress-meta">
        <span>{`查询 ${progressQueryLabel}`}</span>
        <span>{`raw ${progress.fetchedRaw}`}</span>
        <span>{`errors ${progress.queryErrors}`}</span>
      </div>
    </section>
  );
}

export function JobWorkspace({
  drawerOpen,
  isCreateWorkspace,
  selectedJob,
  selectedJobActiveRun,
  workspaceTitle,
  workspaceMeta,
  drawerDisabled,
  currentTaskEyebrow,
  currentTaskHeroTitle,
  currentTaskHeroDescription,
  currentStatusLabel,
  nextRunLabel,
  lastRunLabel,
  lastRunTimeLabel,
  currentTaskPackName,
  currentTaskPackBindingLabel,
  currentTaskPackDraftLabel,
  formTags,
  taskPacks,
  currentTaskPack,
  form,
  taskKeywordCount,
  taskAuthorConstraintCount,
  taskRuleCount,
  taskLevelCount,
  currentRuleSetPreview,
  saving,
  savingPack,
  deletingPack,
  loading,
  fileInputRef,
  pendingFileActionRef,
  updateForm,
  setForm,
  handleSave,
  handleRestore,
  handlePurge,
  handleRunNow,
  handleStopRun,
  handleToggle,
  handleDelete,
  handleImportPack,
  handleSavePack,
  handleDeleteCurrentPack,
  handleImportPackFile,
  handleImportAndSavePackFile,
  onClose,
  onOpenCreate,
  onRefreshEmpty,
}: JobWorkspaceProps) {
  const workspaceActionBar = (
    <div className="drawer-footer" data-testid="jobs-primary-actions">
      {!selectedJob ? (
        <button type="button" className="workbench-primary-action" aria-label="submit-job" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存任务"}</button>
      ) : selectedJob.deleted_at ? (
        <>
          <button type="button" className="workbench-secondary-action" onClick={() => handleRestore(selectedJob)}>{"恢复任务"}</button>
          <button type="button" className="workbench-danger-action" onClick={() => handlePurge(selectedJob)}>{"彻底删除"}</button>
        </>
      ) : (
        <>
          <button type="button" className="workbench-primary-action" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存任务"}</button>
          <button
            type="button"
            className="workbench-secondary-action"
            onClick={() => handleRunNow(selectedJob)}
            disabled={!selectedJob.enabled || selectedJobActiveRun?.progress.status === "running"}
          >
            {"立即运行"}
          </button>
          {selectedJobActiveRun?.progress.status === "running" ? (
            <button
              type="button"
              className="workbench-danger-action"
              onClick={() => handleStopRun(selectedJob, selectedJobActiveRun.run.id)}
            >
              {"停止运行"}
            </button>
          ) : null}
          <button type="button" className="workbench-secondary-action" onClick={() => handleToggle(selectedJob)}>{selectedJob.enabled ? "停用任务" : "启用任务"}</button>
          <button type="button" className="workbench-danger-action" onClick={() => handleDelete(selectedJob)}>{"删除任务"}</button>
        </>
      )}
    </div>
  );

  return (
    <aside className={`jobs-drawer${drawerOpen ? " open" : ""}${drawerOpen ? "" : " jobs-drawer-empty"}${isCreateWorkspace ? " jobs-drawer-create" : ""}`}>
      {drawerOpen ? (
        <div className={`jobs-workspace${isCreateWorkspace ? " jobs-workspace-create" : ""}`}>
          <div className="drawer-header">
            <div>
              <h4>{workspaceTitle}</h4>
              <div className="kv">{workspaceMeta}</div>
            </div>
            <div className="drawer-header-actions">
              <button
                type="button"
                className="workbench-secondary-action"
                data-testid="jobs-close-workspace"
                onClick={onClose}
              >
                {"关闭"}
              </button>
            </div>
          </div>

          {workspaceActionBar}

          <div className="jobs-current-task-section flat-section workbench-layer">
            <JobsSectionHeader
              title="当前任务"
              description="先确认调度状态和基础设置，再继续调整任务正文。"
            />
            {selectedJobActiveRun ? renderJobRunProgress(selectedJobActiveRun.progress) : null}
            <div className="jobs-current-task-hero flat-section">
              <div className="jobs-current-task-copy">
                <div className="jobs-current-task-eyebrow">{currentTaskEyebrow}</div>
                <div className="jobs-current-task-name">{currentTaskHeroTitle}</div>
                <p className="kv jobs-current-task-note">{currentTaskHeroDescription}</p>
              </div>
              <div className="jobs-current-task-pills workbench-pill-row">
                <span className="jobs-summary-pill workbench-pill">{`当前状态：${currentStatusLabel}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`下次运行：${nextRunLabel}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`最近运行：${lastRunLabel}`}</span>
              </div>
              <div className="jobs-current-task-meta">
                <span>{`最近运行时间：${lastRunTimeLabel}`}</span>
                {selectedJob?.deleted_at ? <span>{`删除时间：${formatUtcPlus8Time(selectedJob.deleted_at)}`}</span> : null}
              </div>
              <div className="jobs-current-task-summary-grid flat-row-list">
                <div className="flat-row">
                  <span>{"当前状态"}</span>
                  <strong>{currentStatusLabel}</strong>
                </div>
                <div className="flat-row">
                  <span>{"最近运行状态"}</span>
                  <strong>{lastRunLabel}</strong>
                </div>
                <div className="flat-row">
                  <span>{"最近运行时间"}</span>
                  <strong>{lastRunTimeLabel}</strong>
                </div>
              </div>
            </div>
            <div className="collector-grid collector-grid-2 jobs-current-task-form">
              <label className="field">
                <span>{"任务名称"}</span>
                <input aria-label="job-name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} disabled={drawerDisabled} />
              </label>
              <label className="field">
                <span>{"分组"}</span>
                <input
                  aria-label="job-group-name"
                  value={form.group_name}
                  onChange={(e) => updateForm("group_name", e.target.value)}
                  disabled={drawerDisabled}
                  placeholder="如：Alpha / Exchange / Research"
                />
              </label>
              <label className="field">
                <span>{"执行间隔（分钟）"}</span>
                <input aria-label="job-interval" type="number" value={form.interval_minutes} onChange={(e) => updateForm("interval_minutes", Number(e.target.value))} disabled={drawerDisabled} />
              </label>
              <label className="field checkbox-row jobs-current-task-toggle">
                <span>{"\u542f\u7528"}</span>
                <input type="checkbox" checked={form.enabled} onChange={(e) => updateForm("enabled", e.target.checked)} disabled={drawerDisabled} />
              </label>
            </div>
          </div>
          <div className="flat-section workbench-layer">
            <JobsSectionHeader
              title="任务包操作"
              description="载入、导入或保存当前任务包。"
            />
            <div className="jobs-pack-context-hint flat-meta-strip" data-testid="jobs-pack-context-hint">
              <div className="workbench-pill-row">
                <span className="jobs-summary-pill workbench-pill">{`当前绑定：${currentTaskPackName || "--"}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`绑定状态：${currentTaskPackBindingLabel}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`tags：${formTags.length ? formTags.join(", ") : "--"}`}</span>
                <span className="jobs-summary-pill workbench-pill">{`草稿状态：${currentTaskPackDraftLabel}`}</span>
              </div>
            </div>
            <div className="collector-grid collector-grid-2 jobs-pack-manager-grid jobs-pack-actions-grid">
              <div className="jobs-pack-action-group flat-section">
                <div className="collector-subtitle">{"载入到当前草稿"}</div>
                <div className="kv" style={{ marginTop: 6 }}>{"可从任务包列表载入，或从本地 JSON 导入。"}</div>
                <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                  <select aria-label="job-pack-select" value={form.import_pack_name} onChange={(e) => updateForm("import_pack_name", e.target.value)} disabled={drawerDisabled}>
                    <option value="">{"选择任务包"}</option>
                    {taskPacks.map((item) => (
                      <option key={item.pack_name} value={item.pack_name}>{item.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="job-load-pack"
                    onClick={() => handleImportPack().catch(() => undefined)}
                    disabled={drawerDisabled}
                  >
                    {"载入任务包"}
                  </button>
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="job-import-file-pack"
                    onClick={() => { pendingFileActionRef.current = "draft"; fileInputRef.current?.click(); }}
                    disabled={drawerDisabled}
                  >
                    {"从文件导入"}
                  </button>
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="job-import-and-save-pack"
                    onClick={() => { pendingFileActionRef.current = "save_new"; fileInputRef.current?.click(); }}
                    disabled={drawerDisabled || savingPack}
                  >
                    {"导入并保存为新任务包"}
                  </button>
                  <input
                    ref={fileInputRef}
                    data-testid="job-pack-file-input"
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void (pendingFileActionRef.current === "save_new" ? handleImportAndSavePackFile(file) : handleImportPackFile(file));
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
                <div className="kv jobs-pack-note">{"从文件导入只替换当前草稿。"}</div>
                <div className="kv jobs-pack-note">{"导入并保存会新建并绑定任务包。"}</div>
              </div>
              <div className="jobs-pack-action-group flat-section">
                <div className="collector-subtitle">{"保存当前草稿"}</div>
                <div className="kv" style={{ marginTop: 6 }}>{"可另存为新任务包，或保存回当前任务包。"}</div>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>{"tags"}</span>
                  <textarea
                    className="workbench-textarea"
                    rows={3}
                    aria-label="job-pack-tags"
                    value={form.tagsText}
                    onChange={(event) => updateForm("tagsText", event.target.value)}
                    disabled={drawerDisabled}
                    placeholder="逗号或换行分隔，如：alpha, defi, wallet"
                  />
                </label>
                <div className="collector-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="workbench-secondary-action"
                    aria-label="job-save-as-pack"
                    onClick={() => handleSavePack("create").catch(() => undefined)}
                    disabled={drawerDisabled || savingPack}
                  >
                    {"另存为新任务包"}
                  </button>
                  <button type="button" className="workbench-primary-action" aria-label="job-save-current-pack" onClick={() => handleSavePack("overwrite").catch(() => undefined)} disabled={drawerDisabled || savingPack || !form.pack_name}>{"保存到当前任务包"}</button>
                  <button
                    type="button"
                    className="workbench-danger-action"
                    aria-label="job-delete-pack"
                    onClick={() => handleDeleteCurrentPack().catch(() => undefined)}
                    disabled={drawerDisabled || deletingPack || !currentTaskPack?.pack_name}
                  >
                    {deletingPack ? "删除中..." : "删除当前任务包"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flat-section workbench-layer">
            <JobsSectionHeader
              title="任务正文摘要"
              description="这里先快速预览当前草稿会形成的搜索表达，再继续深入编辑搜索条件和规则。"
            />
            <div className="jobs-task-body-summary">
              <div className="collector-query-preview jobs-pack-query-preview">
                <div className="collector-subtitle">{"查询摘要"}</div>
                <code>{buildQueryPreview(form.search_spec) || "--"}</code>
              </div>
              <div className="jobs-task-body-grid flat-row-list">
                <div className="flat-row">
                  <span>{"关键词片段"}</span>
                  <strong>{`${taskKeywordCount} 项`}</strong>
                </div>
                <div className="flat-row">
                  <span>{"作者约束"}</span>
                  <strong>{`${taskAuthorConstraintCount} 项`}</strong>
                </div>
                <div className="flat-row">
                  <span>{"规则条数"}</span>
                  <strong>{`${taskRuleCount} 条`}</strong>
                </div>
                <div className="flat-row">
                  <span>{"等级数"}</span>
                  <strong>{`${taskLevelCount} 层`}</strong>
                </div>
                <div className="flat-row flat-row-wide">
                  <span>{"规则名称"}</span>
                  <strong>{form.rule_set.name || "--"}</strong>
                </div>
                <div className="flat-row flat-row-wide">
                  <span>{"规则说明"}</span>
                  <strong>{form.rule_set.description || "未填写规则说明"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="flat-section workbench-layer">
            <JobsSectionHeader
              title="搜索条件"
              description="这里定义自动任务具体要去搜什么。"
            />
            <SearchSpecEditor value={form.search_spec} onChange={(next) => updateForm("search_spec", next)} disabled={drawerDisabled} />
          </div>

          <div className="flat-section workbench-layer">
            <JobsSectionHeader
              title="规则"
              description="这里定义原始结果如何筛选、打分和分级。"
            />
            <div className="collector-grid collector-grid-2" style={{ marginTop: 12, marginBottom: 12 }}>
              <label className="field">
                <span>{"规则名称"}</span>
                <input
                  value={form.rule_set.name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      rule_set: { ...prev.rule_set, name: e.target.value },
                    }))
                  }
                  disabled={drawerDisabled}
                />
              </label>
              <label className="field">
                <span>{"规则说明"}</span>
                <input
                  value={form.rule_set.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      rule_set: { ...prev.rule_set, description: e.target.value },
                    }))
                  }
                  disabled={drawerDisabled}
                />
              </label>
            </div>
            <RuleSetEditor
              ruleSet={currentRuleSetPreview}
              draft={form.rule_set.definition}
              onDraftChange={(next) =>
                setForm((prev) => ({
                  ...prev,
                  rule_set: { ...prev.rule_set, definition: next },
                }))
              }
              disabled={drawerDisabled}
            />
          </div>

          {selectedJob?.last_run_stats && (
            <div className="flat-section workbench-layer">
              <JobsSectionHeader title="最近运行统计" description="保留最近一次任务执行的统计输出，便于快速复盘。" />
              <pre className="drawer-json">{JSON.stringify(selectedJob.last_run_stats, null, 2)}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className="jobs-empty-shell" data-testid="jobs-empty-shell">
          <div className="drawer-empty jobs-empty-workspace" data-testid="jobs-empty-workspace">
            <div className="jobs-empty-hero flat-section">
              <div>
                <div className="jobs-empty-eyebrow">{"任务工作区"}</div>
                <h4>{"选择任务"}</h4>
              </div>
              <div className="workbench-pill-row">
                <span className="jobs-summary-pill workbench-pill">{`可用任务包：${taskPacks.length}`}</span>
              </div>
              <div className="jobs-empty-actions">
                <button type="button" className="workbench-primary-action" onClick={onOpenCreate}>{"新建任务"}</button>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  data-testid="jobs-refresh-empty"
                  onClick={onRefreshEmpty}
                  disabled={loading}
                >
                  {"刷新列表"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
