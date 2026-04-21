import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogsPage } from "./LogsPage";
import { getRuntimeLogs, listRuns } from "../api";

vi.mock("../api", () => ({
  listRuns: vi.fn(),
  getRuntimeLogs: vi.fn(),
}));

const listRunsMock = vi.mocked(listRuns);
const getRuntimeLogsMock = vi.mocked(getRuntimeLogs);

const TEXT = {
  title: "运行日志",
  runtimeTitle: "服务进程日志",
  runsTitle: "采集运行日志",
  runDetail: "运行详情",
  noRuns: "暂无采集运行记录",
  noLogContent: "暂无内容",
  refresh: "刷新",
  runtimeSnapshot: "服务快照",
  runWorkbench: "当前运行",
} as const;

describe("LogsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the logs workbench structure with runtime panels above the run workbench", async () => {
    listRunsMock.mockResolvedValue({
      page: 1,
      page_size: 50,
      total: 1,
      items: [
        {
          id: 9,
          job_id: null,
          trigger_type: "manual",
          status: "failed",
          started_at: "2026-04-13T00:00:00.123456+00:00",
          ended_at: "2026-04-13T00:01:00.654321+00:00",
          error_text: "boom",
          stats_json: { matched: 0 },
        },
      ],
    });
    getRuntimeLogsMock.mockResolvedValue({
      items: [
        {
          name: "api.current.out.log",
          exists: true,
          size: 6,
          updated_at: "2026-04-13T00:00:00+00:00",
          content: "ready!",
        },
        {
          name: "api.current.err.log",
          exists: true,
          size: 0,
          updated_at: "",
          content: "",
          error: "read failed",
        },
      ],
    });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("logs-page-header")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: TEXT.refresh })).toHaveClass("workbench-primary-action");
    expect(screen.getByTestId("logs-runtime-section")).toBeInTheDocument();
    expect(screen.getByTestId("logs-runs-section")).toBeInTheDocument();
    expect(screen.getByTestId("logs-run-rail")).toBeInTheDocument();
    expect(screen.getByTestId("logs-runs-manager")).toHaveClass("workbench-summary-panel");
    expect(within(screen.getByTestId("logs-runtime-section")).getByText(TEXT.runtimeSnapshot)).toBeInTheDocument();
    expect(within(screen.getByTestId("logs-run-rail")).getByText(TEXT.runWorkbench)).toBeInTheDocument();
    expect(screen.getByText("读取失败：read failed").closest(".logs-file-state")).toHaveClass("logs-file-state-error");
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("api.current.out.log")).toBeInTheDocument();
    expect(screen.getByText("ready!")).toBeInTheDocument();
    expect(within(screen.getByTestId("logs-run-rail")).getAllByText("matched 0").length).toBeGreaterThan(0);
  });

  it("keeps service process logs above collection run logs in DOM order", async () => {
    listRunsMock.mockResolvedValue({
      page: 1,
      page_size: 50,
      total: 1,
      items: [
        {
          id: 9,
          job_id: null,
          trigger_type: "manual",
          status: "failed",
          started_at: "2026-04-13T00:00:00.123456+00:00",
          ended_at: "2026-04-13T00:01:00.654321+00:00",
          error_text: "boom",
          stats_json: { matched: 0 },
        },
      ],
    });
    getRuntimeLogsMock.mockResolvedValue({
      items: [
        {
          name: "api.current.out.log",
          exists: true,
          size: 6,
          updated_at: "2026-04-13T00:00:00+00:00",
          content: "ready!",
        },
      ],
    });

    render(<LogsPage />);

    const runtimeSection = await screen.findByTestId("logs-runtime-section");
    const runsSection = await screen.findByTestId("logs-runs-section");

    expect(runtimeSection.compareDocumentPosition(runsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders empty states when both sources are empty", async () => {
    listRunsMock.mockResolvedValue({ page: 1, page_size: 50, total: 0, items: [] });
    getRuntimeLogsMock.mockResolvedValue({
      items: [
        {
          name: "api.current.out.log",
          exists: true,
          size: 0,
          updated_at: "",
          content: "",
        },
      ],
    });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText(TEXT.noRuns)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("logs-run-rail")).not.toBeInTheDocument();
    const apiGroup = screen.getByRole("heading", { name: "API" }).closest(".logs-service-group");
    expect(apiGroup).not.toBeNull();
    expect(within(apiGroup as HTMLElement).getByText("稍后刷新再看。").closest(".logs-file-state")).toHaveClass("logs-file-state-empty");
    expect(screen.getAllByText(TEXT.noLogContent).length).toBeGreaterThanOrEqual(3);
  });

  it("renders request errors without leaving the page blank", async () => {
    listRunsMock.mockRejectedValue(new Error("network down"));
    getRuntimeLogsMock.mockResolvedValue({ items: [] });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText("network down")).toBeInTheDocument();
    });

    expect(screen.getByTestId("logs-page-header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
  });
});
