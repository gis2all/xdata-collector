import { ChangeEvent, useEffect, useState } from "react";
import { exportWorkspace, getWorkspace, importWorkspace, updateWorkspace, WorkspaceConfig } from "../api";

function prettyWorkspace(payload: WorkspaceConfig) {
  return JSON.stringify(payload, null, 2);
}

function parseWorkspaceText(raw: string) {
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as WorkspaceConfig;
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
    <div className="card" data-testid="settings-page">
      <div className="collector-toolbar between" style={{ alignItems: "flex-start" }}>
        <div>
          <h3>{"\u8bbe\u7f6e"}</h3>
          <p className="kv">{"\u8fd9\u91cc\u53ea\u7ef4\u62a4\u8f7b\u91cf config/workspace.json \uff1a\u73af\u5883\u53c2\u6570\u3001\u8fd0\u884c\u8def\u5f84\u548c\u81ea\u52a8\u4efb\u52a1\u6ce8\u518c\u8868\u3002\u641c\u7d22\u914d\u7f6e\u4e0e\u89c4\u5219\u6b63\u6587\u5df2\u6536\u53e3\u5230 config/packs/*.json\u3002"}</p>
        </div>
        <div className="collector-toolbar">
          <button type="button" className="ghost" aria-label="reload-workspace" onClick={() => loadWorkspace().catch(() => undefined)} disabled={loading}>
            {"\u91cd\u65b0\u52a0\u8f7d"}
          </button>
          <button type="button" className="ghost" aria-label="export-workspace" onClick={handleExportRefresh} disabled={loading}>
            {"\u5bfc\u51fa\u5237\u65b0"}
          </button>
          <button type="button" aria-label="save-workspace" onClick={handleSave} disabled={loading || saving}>
            {saving ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58 workspace.json"}
          </button>
        </div>
      </div>

      <div className="collector-grid collector-grid-2" style={{ marginTop: 12 }}>
        <label className="field">
          <span>{"\u5bfc\u5165 workspace \u6587\u4ef6"}</span>
          <input type="file" accept="application/json,.json" onChange={handleImportFile} />
        </label>
        <label className="field">
          <span>{"\u63d0\u793a"}</span>
          <input value={"workspace \u53ea\u4fdd\u7559 environment + jobs registry"} readOnly />
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <label className="field" style={{ marginTop: 12 }}>
        <span>workspace.json</span>
        <textarea
          aria-label="workspace-json"
          value={editorText}
          onChange={(event) => setEditorText(event.target.value)}
          spellCheck={false}
          rows={28}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        />
      </label>
    </div>
  );
}
