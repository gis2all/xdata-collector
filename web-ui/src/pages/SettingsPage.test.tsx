import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("../api", () => ({
  getWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  exportWorkspace: vi.fn(),
  importWorkspace: vi.fn(),
}));

import { exportWorkspace, getWorkspace, importWorkspace, updateWorkspace } from "../api";

const getWorkspaceMock = vi.mocked(getWorkspace);
const updateWorkspaceMock = vi.mocked(updateWorkspace);
const exportWorkspaceMock = vi.mocked(exportWorkspace);
const importWorkspaceMock = vi.mocked(importWorkspace);

const workspacePayload = {
  version: 2,
  meta: { updated_at: "2026-04-14T00:00:00+00:00", next_job_id: 2 },
  environment: { db_path: "data/app.db", runtime_dir: "runtime", env_file: ".env", twitter_browser: "", twitter_chrome_profile: "" },
  jobs: [],
};

const TEXT = {
  title: "设置",
  summaryTitle: "当前配置",
  actionsTitle: "工作区操作",
  editorTitle: "配置 JSON",
  save: "保存 workspace.json",
} as const;

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getWorkspaceMock.mockResolvedValue(workspacePayload as any);
    exportWorkspaceMock.mockResolvedValue(workspacePayload as any);
    importWorkspaceMock.mockResolvedValue(workspacePayload as any);
    updateWorkspaceMock.mockResolvedValue(workspacePayload as any);
  });

  it("renders the settings workbench structure and workspace summary", async () => {
    render(<SettingsPage />);

    expect(await screen.findByTestId("settings-page-header")).toBeInTheDocument();
    expect(screen.getByTestId("settings-summary")).toBeInTheDocument();
    expect(screen.getByTestId("settings-actions")).toBeInTheDocument();
    expect(screen.getByTestId("settings-editor-section")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: TEXT.title })).toBeInTheDocument();
    expect(within(screen.getByTestId("settings-summary")).getByText(TEXT.summaryTitle)).toBeInTheDocument();
    expect(within(screen.getByTestId("settings-actions")).getByText(TEXT.actionsTitle)).toBeInTheDocument();
    expect(within(screen.getByTestId("settings-editor-section")).getByText(TEXT.editorTitle)).toBeInTheDocument();
    expect(screen.getByText("data/app.db")).toBeInTheDocument();
    expect(screen.getByText("runtime")).toBeInTheDocument();
    expect(screen.getByText(".env")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByLabelText("save-workspace")).toHaveClass("workbench-primary-action");
    expect(screen.getByLabelText("reload-workspace")).toHaveClass("workbench-secondary-action");
    expect(screen.getByLabelText("export-workspace")).toHaveClass("workbench-secondary-action");
  });

  it("loads workspace json and saves edited content", async () => {
    render(<SettingsPage />);

    const editor = await screen.findByLabelText("workspace-json");
    expect((editor as HTMLTextAreaElement).value).toContain('"version": 2');

    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({ ...workspacePayload, meta: { ...workspacePayload.meta, updated_at: "2030-01-01T00:00:00+00:00" } }, null, 2),
      },
    });
    fireEvent.click(screen.getByLabelText("save-workspace"));

    await waitFor(() => {
      expect(updateWorkspaceMock).toHaveBeenCalled();
    });

    expect(updateWorkspaceMock.mock.calls[0]?.[0].meta.updated_at).toBe("2030-01-01T00:00:00+00:00");
  });

  it("reloads editor content from export endpoint", async () => {
    render(<SettingsPage />);

    await screen.findByLabelText("workspace-json");
    fireEvent.click(screen.getByLabelText("export-workspace"));

    await waitFor(() => {
      expect(exportWorkspaceMock).toHaveBeenCalled();
    });
  });

  it("imports workspace files with a utf-8 bom", async () => {
    render(<SettingsPage />);

    await screen.findByLabelText("workspace-json");
    const fileInput = screen.getByLabelText("import-workspace-file") as HTMLInputElement;
    const fileContent = `﻿${JSON.stringify(workspacePayload)}`;
    const file = new File([fileContent], "workspace.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(fileContent) });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(importWorkspaceMock).toHaveBeenCalled();
    });
  });
});
