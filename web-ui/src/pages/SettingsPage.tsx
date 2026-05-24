import { ChangeEvent, useMemo, useEffect, useState } from "react";
import { exportWorkspace, getWorkspace, importWorkspace, updateWorkspace, WorkspaceConfig } from "../api";
import { formatUtcPlus8Time } from "../time";

function prettyWorkspace(payload: WorkspaceConfig) {
  return JSON.stringify(payload, null, 2);
}

function parseWorkspaceText(raw: string) {
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as WorkspaceConfig;
}

function summarizeWorkspace(raw: string) {
  if (!raw.trim()) {
    return {
      workspace: null as WorkspaceConfig | null,
      status: "\u5c1a\u672a\u52a0\u8f7d",
      tone: "neutral",
    };
  }
  try {
    return {
      workspace: parseWorkspaceText(raw),
      status: "\u53ef\u89e3\u6790",
      tone: "success",
    };
  } catch {
    return {
      workspace: null as WorkspaceConfig | null,
      status: "\u683c\u5f0f\u9519\u8bef",
      tone: "danger",
    };
  }
}

export function SettingsPage() {
  const [editorText, setEditorText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadWorkspace() {
    setLoading(true);
    setError("");
    try {
      const payload = await getWorkspace();
      setEditorText(prettyWorkspace(payload));
      setMessage("workspace.json \u5df2\u52a0\u8f7d");
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u52a0\u8f7d workspace \u5931\u8d25");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace().catch(() => undefined);
  }, []);

  const workspaceSummary = useMemo(() => summarizeWorkspace(editorText), [editorText]);
  const draftWorkspace = workspaceSummary.workspace;
  const jobCount = draftWorkspace?.jobs.length ?? 0;

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const parsed = parseWorkspaceText(editorText);
      const payload = await updateWorkspace(parsed);
      setEditorText(prettyWorkspace(payload));
      setMessage("workspace.json \u5df2\u4fdd\u5b58");
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u4fdd\u5b58 workspace \u5931\u8d25");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportRefresh() {
    setError("");
    setMessage("");
    try {
      const payload = await exportWorkspace();
      setEditorText(prettyWorkspace(payload));
      setMessage("\u5df2\u4ece\u5bfc\u51fa\u63a5\u53e3\u5237\u65b0\u7f16\u8f91\u5668\u5185\u5bb9");
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u5bfc\u51fa\u5237\u65b0\u5931\u8d25");
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const raw = await file.text();
      const parsed = parseWorkspaceText(raw);
      const payload = await importWorkspace(parsed);
      setEditorText(prettyWorkspace(payload));
      setMessage(`\u5df2\u5bfc\u5165 ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u5bfc\u5165 workspace \u5931\u8d25");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="settings-page" data-testid="settings-page">
      <section className="card settings-page-header workbench-page-header" data-testid="settings-page-header">
        <div className="settings-page-header-copy workbench-page-header-copy">
          <h3>{"\u8bbe\u7f6e"}</h3>
          <p className="kv">{"\u8fd9\u91cc\u53ea\u7ef4\u62a4 config/workspace.json\uff0c\u4e3b\u8981\u5305\u542b\u73af\u5883\u53c2\u6570\u3001\u8fd0\u884c\u8def\u5f84\u548c\u81ea\u52a8\u4efb\u52a1\u5217\u8868\u3002"}</p>
        </div>
        <div className="settings-page-header-actions workbench-page-header-actions">
          <button
            type="button"
            className="workbench-primary-action"
            aria-label="save-workspace"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58 workspace.json"}
          </button>
        </div>
      </section>

      {error && (
        <div className="settings-compact-feedback settings-compact-feedback-danger" data-testid="settings-compact-feedback" role="status">
          <span>配置反馈</span>
          <strong>{error}</strong>
        </div>
      )}
      {message && (
        <div className="settings-compact-feedback settings-compact-feedback-success" data-testid="settings-compact-feedback" role="status">
          <span>配置反馈</span>
          <strong>{message}</strong>
        </div>
      )}

      <section className="card settings-summary workbench-layer" data-testid="settings-summary">
        <div className="settings-section-header workbench-section-header">
          <div className="settings-section-copy workbench-section-copy">
            <div className="settings-section-eyebrow workbench-section-eyebrow">{"\u914d\u7f6e\u6458\u8981"}</div>
            <h4 className="workbench-section-title">{"\u5f53\u524d\u914d\u7f6e"}</h4>
            <p className="kv">{"\u5148\u786e\u8ba4\u4e3b\u8981\u8def\u5f84\u548c\u4efb\u52a1\u6570\u91cf\uff0c\u518d\u8fdb\u5165 JSON \u7f16\u8f91\u3002"}</p>
          </div>
          <div className="settings-summary-pills workbench-pill-row">
            <span className="dashboard-summary-pill workbench-pill neutral">{`version\uff1a${draftWorkspace?.version ?? "--"}`}</span>
            <span className="dashboard-summary-pill workbench-pill neutral">{`jobs\uff1a${jobCount}`}</span>
            <span className={`dashboard-summary-pill workbench-pill ${workspaceSummary.tone}`}>{`\u914d\u7f6e\u72b6\u6001\uff1a${workspaceSummary.status}`}</span>
          </div>
        </div>

        <div className="flat-row-list settings-summary-grid" data-testid="settings-summary-list">
          <div className="flat-row">
            <span>{"\u6570\u636e\u5e93\u8def\u5f84"}</span>
            <strong>{draftWorkspace?.environment.db_path || "--"}</strong>
          </div>
          <div className="flat-row">
            <span>{"\u8fd0\u884c\u76ee\u5f55"}</span>
            <strong>{draftWorkspace?.environment.runtime_dir || "--"}</strong>
          </div>
          <div className="flat-row">
            <span>{".env \u6587\u4ef6"}</span>
            <strong>{draftWorkspace?.environment.env_file || "--"}</strong>
          </div>
          <div className="flat-row">
            <span>{"\u4efb\u52a1\u6570\u91cf"}</span>
            <strong>{jobCount}</strong>
          </div>
          <div className="flat-row">
            <span>{"\u4e0b\u4e00\u4e2a\u4efb\u52a1 ID"}</span>
            <strong>{draftWorkspace?.meta.next_job_id ?? "--"}</strong>
          </div>
          <div className="flat-row">
            <span>{"\u6700\u8fd1\u66f4\u65b0"}</span>
            <strong>{draftWorkspace ? formatUtcPlus8Time(draftWorkspace.meta.updated_at, "--") : "--"}</strong>
          </div>
        </div>
      </section>

      <section className="card settings-editor-section workbench-layer" data-testid="settings-editor-section">
        <div className="settings-section-header workbench-section-header">
          <div className="settings-section-copy workbench-section-copy">
            <div className="settings-section-eyebrow workbench-section-eyebrow">{"JSON \u7f16\u8f91"}</div>
            <h4 className="workbench-section-title">{"\u914d\u7f6e JSON"}</h4>
          </div>
        </div>

        <div className="flat-section settings-editor-surface" data-testid="settings-editor-surface">
          <label className="field">
            <span>workspace.json</span>
            <textarea
              aria-label="workspace-json"
              value={editorText}
              onChange={(event) => setEditorText(event.target.value)}
              spellCheck={false}
              rows={28}
              className="settings-editor"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </label>
        </div>
      </section>

      <section className="card settings-actions workbench-layer" data-testid="settings-actions">
        <div className="settings-section-header workbench-section-header">
          <div className="settings-section-copy workbench-section-copy">
            <div className="settings-section-eyebrow workbench-section-eyebrow">{"\u8f7b\u91cf\u914d\u7f6e"}</div>
            <h4 className="workbench-section-title">{"\u5de5\u4f5c\u533a\u64cd\u4f5c"}</h4>
          </div>
        </div>

        <div className="settings-actions-strip flat-actions" data-testid="settings-actions-strip">
          <div className="settings-action-group">
            <div className="settings-card-title">{"\u5237\u65b0\u4e0e\u5bf9\u9f50"}</div>
            <div className="collector-toolbar settings-card-actions">
              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-label="reload-workspace"
                onClick={() => loadWorkspace().catch(() => undefined)}
                disabled={loading}
              >
                {"\u91cd\u65b0\u52a0\u8f7d"}
              </button>
              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-label="export-workspace"
                onClick={handleExportRefresh}
                disabled={loading}
              >
                {"\u5bfc\u51fa\u5237\u65b0"}
              </button>
            </div>
          </div>

          <div className="settings-action-group">
            <div className="settings-card-title">{"\u5bfc\u5165\u914d\u7f6e"}</div>
            <label className="settings-import-button workbench-secondary-action" data-testid="settings-import-button">
              <span>{"\u9009\u62e9\u6587\u4ef6"}</span>
              <input
                className="settings-file-input-hidden"
                aria-label="import-workspace-file"
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
              />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
