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
      <section className="card settings-page-header" data-testid="settings-page-header">
        <div className="settings-page-header-copy">
          <h3>{"\u8bbe\u7f6e"}</h3>
          <p className="kv">{"\u8fd9\u91cc\u53ea\u7ef4\u62a4\u8f7b\u91cf config/workspace.json\uff1aenvironment \u53c2\u6570\u3001\u8fd0\u884c\u8def\u5f84\u548c\u81ea\u52a8\u4efb\u52a1 registry\u3002\u4efb\u52a1\u6b63\u6587\u4ecd\u7136\u5728 config/packs/*.json \u4e2d\u7ba1\u7406\u3002"}</p>
        </div>
        <div className="settings-page-header-actions">
          <button type="button" aria-label="save-workspace" onClick={handleSave} disabled={loading || saving}>
            {saving ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58 workspace.json"}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="card settings-summary" data-testid="settings-summary">
        <div className="settings-section-header">
          <div className="settings-section-copy">
            <div className="settings-section-eyebrow">{"workspace \u6458\u8981"}</div>
            <h4>{"\u5f53\u524d workspace"}</h4>
            <p className="kv">{"\u5148\u786e\u8ba4 environment \u8def\u5f84\u3001jobs registry \u6570\u91cf\u548c\u8349\u7a3f\u89e3\u6790\u72b6\u6001\uff0c\u518d\u8fdb\u5165 JSON \u7f16\u8f91\u3002"}</p>
          </div>
          <div className="settings-summary-pills">
            <span className="dashboard-summary-pill neutral">{`version\uff1a${draftWorkspace?.version ?? "--"}`}</span>
            <span className="dashboard-summary-pill neutral">{`jobs\uff1a${jobCount}`}</span>
            <span className={`dashboard-summary-pill ${workspaceSummary.tone}`}>{`\u8349\u7a3f\u72b6\u6001\uff1a${workspaceSummary.status}`}</span>
          </div>
        </div>

        <div className="dashboard-detail-grid settings-summary-grid">
          <div className="dashboard-detail-item">
            <span>{"db_path"}</span>
            <strong>{draftWorkspace?.environment.db_path || "--"}</strong>
          </div>
          <div className="dashboard-detail-item">
            <span>{"runtime_dir"}</span>
            <strong>{draftWorkspace?.environment.runtime_dir || "--"}</strong>
          </div>
          <div className="dashboard-detail-item">
            <span>{"env_file"}</span>
            <strong>{draftWorkspace?.environment.env_file || "--"}</strong>
          </div>
          <div className="dashboard-detail-item">
            <span>{"\u4efb\u52a1\u6570\u91cf"}</span>
            <strong>{jobCount}</strong>
          </div>
          <div className="dashboard-detail-item">
            <span>{"next_job_id"}</span>
            <strong>{draftWorkspace?.meta.next_job_id ?? "--"}</strong>
          </div>
          <div className="dashboard-detail-item">
            <span>{"\u6700\u8fd1\u66f4\u65b0"}</span>
            <strong>{draftWorkspace ? formatUtcPlus8Time(draftWorkspace.meta.updated_at, "--") : "--"}</strong>
          </div>
        </div>
      </section>

      <section className="card settings-actions" data-testid="settings-actions">
        <div className="settings-section-header">
          <div className="settings-section-copy">
            <div className="settings-section-eyebrow">{"\u8f7b\u91cf\u914d\u7f6e"}</div>
            <h4>{"\u5de5\u4f5c\u533a\u64cd\u4f5c"}</h4>
            <p className="kv">{"\u91cd\u65b0\u52a0\u8f7d\u7528\u4e8e\u53d6\u56de\u5f53\u524d workspace\uff0c\u5bfc\u51fa\u5237\u65b0\u7528\u4e8e\u540c\u6b65\u670d\u52a1\u7aef\u5f53\u524d\u89c6\u56fe\uff0c\u5bfc\u5165\u5219\u4f1a\u76f4\u63a5\u66ff\u6362\u5f53\u524d\u7f16\u8f91\u5668\u8349\u7a3f\u3002"}</p>
          </div>
        </div>

        <div className="collector-grid collector-grid-2 settings-actions-grid">
          <div className="collector-card settings-action-card">
            <div className="settings-card-title">{"\u5237\u65b0\u4e0e\u5bf9\u9f50"}</div>
            <div className="collector-toolbar settings-card-actions">
              <button type="button" className="ghost" aria-label="reload-workspace" onClick={() => loadWorkspace().catch(() => undefined)} disabled={loading}>
                {"\u91cd\u65b0\u52a0\u8f7d"}
              </button>
              <button type="button" className="ghost" aria-label="export-workspace" onClick={handleExportRefresh} disabled={loading}>
                {"\u5bfc\u51fa\u5237\u65b0"}
              </button>
            </div>
          </div>

          <div className="collector-card settings-action-card">
            <div className="settings-card-title">{"\u5bfc\u5165\u65b0\u8349\u7a3f"}</div>
            <label className="field">
              <span>{"\u5bfc\u5165 workspace \u6587\u4ef6"}</span>
              <input aria-label="import-workspace-file" type="file" accept="application/json,.json" onChange={handleImportFile} />
            </label>
            <label className="field">
              <span>{"\u63d0\u793a"}</span>
              <input value={"workspace \u53ea\u4fdd\u7559 environment + jobs registry"} readOnly />
            </label>
          </div>
        </div>
      </section>

      <section className="card settings-editor-section" data-testid="settings-editor-section">
        <div className="settings-section-header">
          <div className="settings-section-copy">
            <div className="settings-section-eyebrow">{"JSON \u7f16\u8f91"}</div>
            <h4>{"workspace.json \u7f16\u8f91\u5668"}</h4>
            <p className="kv">{"\u8fd9\u91cc\u7ef4\u6301\u5b8c\u6574 JSON \u7f16\u8f91\u80fd\u529b\uff0c\u4f46\u9875\u9762\u4e0a\u65b9\u7684\u6458\u8981\u533a\u4f1a\u5e2e\u4f60\u5148\u786e\u8ba4\u5f53\u524d workspace \u8fb9\u754c\u662f\u5426\u6b63\u786e\u3002"}</p>
          </div>
        </div>

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
      </section>
    </div>
  );
}
