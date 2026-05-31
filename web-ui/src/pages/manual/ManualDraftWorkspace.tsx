import { SearchSpecEditor } from "../../components/SearchSpecEditor";
import { RuleSetEditor } from "../../components/RuleSetEditor";
import { ManualSectionHeader } from "../manualSearchModel";
import type { ManualSearchPageState } from "./useManualSearchPageState";

type ManualDraftWorkspaceProps = {
  state: ManualSearchPageState;
};

export function ManualDraftWorkspace({ state }: ManualDraftWorkspaceProps) {
  return (
    <div className="manual-editor-pane">
      <section className="card manual-section-card manual-section-card-muted workbench-layer">
        <ManualSectionHeader
          title="任务包操作"
          description="先确定草稿来源，再决定是否保存为任务包。"
          aside={
            <div className="collector-toolbar">
              <button
                type="button"
                className="workbench-secondary-action"
                data-testid="manual-reset-draft"
                onClick={state.resetDraft}
              >
                {state.currentPack ? "恢复任务包内容" : "清空当前草稿"}
              </button>
              <button
                type="button"
                className="workbench-secondary-action"
                data-testid="manual-refresh-task-packs"
                onClick={() => void state.refreshTaskPacks()}
              >
                刷新任务包列表
              </button>
            </div>
          }
        />
        <div className="manual-pack-context-hint flat-meta-strip" data-testid="manual-pack-context-hint">
          <div className="workbench-pill-row">
            <span className="jobs-summary-pill workbench-pill">{`当前来源：${state.packSourceLabel}`}</span>
            <span className="jobs-summary-pill workbench-pill">{`当前绑定：${state.currentPack?.pack_name || "--"}`}</span>
            <span className="jobs-summary-pill workbench-pill">{`tags：${state.draftTags.length ? state.draftTags.join(", ") : "--"}`}</span>
            <span className="jobs-summary-pill workbench-pill">{`草稿状态：${state.packDraftLabel}`}</span>
          </div>
        </div>
        <div className="collector-grid collector-grid-2 manual-pack-actions-grid">
          <div className="manual-action-card flat-section" data-testid="manual-pack-load-card">
            <div className="manual-action-card-head">
              <div className="manual-action-card-copy">
                <div className="manual-action-card-eyebrow">草稿来源</div>
                <div className="collector-subtitle">载入到当前草稿</div>
              </div>
            </div>
            <div className="kv manual-pack-note">可从任务包列表载入，或从本地 JSON 导入。</div>
            <div className="manual-action-group">
              <div className="manual-action-group-label">载入已有任务包</div>
              <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                <select
                  aria-label="manual-pack-select"
                  value={state.selectedPackName}
                  onChange={(event) => state.handleSelectedPackNameChange(event.target.value)}
                >
                  <option value={state.defaultDraftPackName}>{state.defaultDraftPackLabel}</option>
                  {state.taskPacks.map((item) => (
                    <option key={item.pack_name} value={item.pack_name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  data-testid="manual-load-pack"
                  onClick={() => void state.importSelectedPack()}
                >
                  载入任务包
                </button>
              </div>
            </div>
            <div className="manual-action-group">
              <div className="manual-action-group-label">从本地文件导入</div>
              <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                <button
                  type="button"
                  className="workbench-secondary-action"
                  data-testid="manual-import-file-pack"
                  onClick={state.handleImportFileClick}
                >
                  从文件导入
                </button>
                <button
                  type="button"
                  className="workbench-secondary-action"
                  data-testid="manual-import-and-save-pack"
                  onClick={state.handleImportAndSaveClick}
                >
                  导入并保存为新任务包
                </button>
                <input
                  ref={state.fileInputRef}
                  data-testid="manual-pack-file-input"
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={state.handlePackFileInputChange}
                />
              </div>
              <div className="kv manual-pack-note">从文件导入只替换当前草稿。</div>
              <div className="kv manual-pack-note">导入并保存会新建并绑定任务包。</div>
            </div>
            <div className="manual-action-group">
              <div className="manual-action-group-label">tags</div>
              <textarea
                className="workbench-textarea"
                rows={3}
                value={state.draftTagsText}
                onChange={(event) => state.handleDraftTagsTextChange(event.target.value)}
                placeholder="逗号或换行分隔，如：alpha, defi, wallet"
                aria-label="manual-pack-tags"
              />
            </div>
          </div>

          <div className="manual-action-card flat-section" data-testid="manual-pack-save-card">
            <div className="manual-action-card-head">
              <div className="manual-action-card-copy">
                <div className="manual-action-card-eyebrow">草稿落盘</div>
                <div className="collector-subtitle">保存当前草稿</div>
              </div>
            </div>
            <div className="kv manual-pack-note">可另存为新任务包，或保存回当前任务包。</div>
            <div className="manual-action-group">
              <div className="manual-action-group-label">创建或覆盖</div>
              <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                <button
                  type="button"
                  className="workbench-secondary-action"
                  data-testid="manual-save-as-pack"
                  onClick={() => void state.handleSaveAsPack()}
                  disabled={state.savingPack}
                >
                  另存为新任务包
                </button>
                <button
                  type="button"
                  className="workbench-primary-action"
                  data-testid="manual-save-current-pack"
                  onClick={() => void state.handleSaveCurrentPack()}
                  disabled={state.savingPack || !state.currentPack?.pack_name}
                >
                  保存到当前任务包
                </button>
              </div>
            </div>
            <div className="manual-action-group manual-action-group-danger">
              <div className="manual-action-group-label">删除当前绑定任务包</div>
              <div className="kv manual-pack-note">默认任务包和仍被引用的任务包不能在此删除。</div>
              <div className="collector-toolbar manual-pack-toolbar manual-action-toolbar">
                <button
                  type="button"
                  className="workbench-danger-action"
                  data-testid="manual-delete-pack"
                  onClick={() => void state.handleDeleteCurrentPack()}
                  disabled={
                    state.deletingPack ||
                    !state.currentPack?.pack_name ||
                    state.selectedPackName === state.defaultDraftPackName
                  }
                >
                  {state.deletingPack ? "删除中..." : "删除当前任务包"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card manual-section-card workbench-layer">
        <ManualSectionHeader
          title="任务正文摘要"
          description="任务正文由搜索条件和规则组成，这里先给出当前草稿的查询摘要，再进入详细编辑。"
          aside={
            <div className="chiprow">
              <span className="collector-query-chip">任务包 = 搜索条件 + 规则</span>
            </div>
          }
        />
        <div className="manual-body-overview">
          <div className="collector-query-preview manual-body-preview">
            <div className="collector-subtitle">查询摘要</div>
            <code>{state.queryPreview}</code>
          </div>
          <div className="manual-body-detail-grid flat-row-list">
            <div className="flat-row">
              <span>关键词片段</span>
              <strong>{`${state.keywordCount} 项`}</strong>
            </div>
            <div className="flat-row">
              <span>作者约束</span>
              <strong>{`${state.authorConstraintCount} 项`}</strong>
            </div>
            <div className="flat-row">
              <span>规则条数</span>
              <strong>{`${state.ruleCount} 条`}</strong>
            </div>
            <div className="flat-row">
              <span>等级数</span>
              <strong>{`${state.levelCount} 层`}</strong>
            </div>
            <div className="flat-row flat-row-wide">
              <span>规则名称</span>
              <strong>{state.draftRuleName || "--"}</strong>
            </div>
            <div className="flat-row flat-row-wide">
              <span>规则说明</span>
              <strong>{state.draftRuleDescription || "未填写规则说明"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="card manual-section-card workbench-layer">
        <ManualSectionHeader
          title="搜索条件"
          description="这里定义这个任务要去搜什么。"
          aside={
            <div className="workbench-pill-row">
              <span className="jobs-summary-pill workbench-pill">{`关键词片段：${state.keywordCount}`}</span>
              <span className="jobs-summary-pill workbench-pill">{`作者约束：${state.authorConstraintCount}`}</span>
            </div>
          }
        />
        <div className="manual-editor-surface" data-testid="manual-search-editor-surface">
          <div className="manual-editor-surface-head">
            <div className="manual-editor-surface-copy">
              <div className="collector-subtitle">搜索输入面板</div>
              <div className="kv">直接编辑搜索条件，顶部任务正文摘要会同步反映当前查询内容。</div>
            </div>
          </div>
          <div className="collector-panel manual-editor-panel">
            <SearchSpecEditor value={state.searchSpec} onChange={state.setSearchSpec} disabled={state.loading} />
          </div>
        </div>
      </section>

      <section className="card manual-section-card workbench-layer">
        <ManualSectionHeader
          title="规则"
          description="这里定义原始结果如何筛选、打分和分级。"
          aside={
            <div className="workbench-pill-row">
              <span className="jobs-summary-pill workbench-pill">{`规则：${state.ruleCount}`}</span>
              <span className="jobs-summary-pill workbench-pill">{`等级：${state.levelCount}`}</span>
            </div>
          }
        />
        <div className="manual-editor-surface" data-testid="manual-rule-editor-surface">
          <div className="manual-editor-surface-head">
            <div className="manual-editor-surface-copy">
              <div className="collector-subtitle">筛选与打分规则</div>
              <div className="kv">先维护规则名称和说明，再在下方编辑等级、规则项和命中条件。</div>
            </div>
          </div>
          <div className="collector-grid collector-grid-2 manual-rule-meta-grid">
            <label className="field">
              <span>规则名称</span>
              <input
                value={state.draftRuleName}
                onChange={(event) => state.handleDraftRuleNameChange(event.target.value)}
              />
            </label>
            <label className="field">
              <span>规则说明</span>
              <input
                value={state.draftRuleDescription}
                onChange={(event) => state.handleDraftRuleDescriptionChange(event.target.value)}
              />
            </label>
          </div>
          <RuleSetEditor
            ruleSet={state.ruleSetPreview}
            draft={state.draftDefinition}
            onDraftChange={state.setDraftDefinition}
            disabled={state.loading}
          />
        </div>
      </section>
    </div>
  );
}
