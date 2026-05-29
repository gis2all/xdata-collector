import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogsPage } from "./LogsPage";
import { cancelRun, getRuntimeLogs, listRuns } from "../api";

vi.mock("../api", () => ({
  listRuns: vi.fn(),
  getRuntimeLogs: vi.fn(),
  cancelRun: vi.fn(),
}));

const listRunsMock = vi.mocked(listRuns);
const getRuntimeLogsMock = vi.mocked(getRuntimeLogs);
const cancelRunMock = vi.mocked(cancelRun);

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
  stopRun: "停止运行",
} as const;

describe("LogsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cancelRunMock.mockResolvedValue({ id: 11, status: "cancelled", cancel_requested: true } as any);
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
    expect(screen.getByTestId("logs-runs-manager")).toHaveClass("flat-meta-strip");
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
    expect(screen.getByTestId("logs-service-summary-table")).toBeInTheDocument();
    const apiRow = screen.getByTestId("logs-service-summary-api");
    expect(within(apiRow).getByText("API")).toBeInTheDocument();
    expect(within(apiRow).getByText("尚未产生日志")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "API" })?.closest(".logs-service-group") ?? null).toBeNull();
    expect(screen.queryAllByText(TEXT.noLogContent)).toHaveLength(0);
  });

  it("keeps runtime log empty states compact and non-repetitive", async () => {
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

    expect(screen.queryAllByText("当前状态")).toHaveLength(0);
    expect(screen.queryAllByText("稍后刷新再看。")).toHaveLength(0);
    expect(screen.queryAllByText(TEXT.noLogContent)).toHaveLength(0);
    expect(screen.getAllByText("尚未产生日志")).toHaveLength(3);
    expect(screen.queryAllByText("api.current.out.log")).toHaveLength(0);
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

  it("auto-refreshes while a run is still running and shows progress summary", async () => {
    listRunsMock
      .mockResolvedValueOnce({
        page: 1,
        page_size: 50,
        total: 1,
        items: [
          {
            id: 11,
            job_id: 7,
            trigger_type: "auto",
            status: "running",
            started_at: "2026-04-13T00:00:00.123456+00:00",
            ended_at: null,
            error_text: null,
            stats_json: { total_queries: 24, completed_queries: 10, progress_percent: 42, fetched_raw: 13, query_errors: 1 },
          },
        ],
      } as any)
      .mockResolvedValue({
        page: 1,
        page_size: 50,
        total: 1,
        items: [
          {
            id: 11,
            job_id: 7,
            trigger_type: "auto",
            status: "success",
            started_at: "2026-04-13T00:00:00.123456+00:00",
            ended_at: "2026-04-13T00:05:00.654321+00:00",
            error_text: null,
            stats_json: { total_queries: 24, completed_queries: 24, progress_percent: 100, fetched_raw: 20, query_errors: 1 },
          },
        ],
      } as any);
    getRuntimeLogsMock.mockResolvedValue({ items: [] });

    render(<LogsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("logs-run-progress")).getByText("42%")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("logs-run-progress")).getByText("已完成 10 / 24 个查询切片")).toBeInTheDocument();
    expect(within(screen.getByTestId("logs-run-rail")).getAllByText("running").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(listRunsMock).toHaveBeenCalledTimes(2);
    }, { timeout: 2500 });
    expect(within(screen.getByTestId("logs-run-rail")).getAllByText("success").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("logs-run-progress")).getByText(/100%/)).toBeInTheDocument();
  });

  it("does not flash the full loading state during background auto refresh", async () => {
    listRunsMock
      .mockResolvedValueOnce({
        page: 1,
        page_size: 50,
        total: 1,
        items: [
          {
            id: 11,
            job_id: 7,
            trigger_type: "auto",
            status: "running",
            started_at: "2026-04-13T00:00:00.123456+00:00",
            ended_at: null,
            error_text: null,
            stats_json: { total_queries: 24, completed_queries: 10, progress_percent: 42, fetched_raw: 13, query_errors: 1 },
          },
        ],
      } as any)
      .mockResolvedValue({
        page: 1,
        page_size: 50,
        total: 1,
        items: [
          {
            id: 11,
            job_id: 7,
            trigger_type: "auto",
            status: "success",
            started_at: "2026-04-13T00:00:00.123456+00:00",
            ended_at: "2026-04-13T00:05:00.654321+00:00",
            error_text: null,
            stats_json: { total_queries: 24, completed_queries: 24, progress_percent: 100, fetched_raw: 20, query_errors: 1 },
          },
        ],
      } as any);
    getRuntimeLogsMock.mockResolvedValue({ items: [] });

    render(<LogsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("logs-run-progress")).getByText("42%")).toBeInTheDocument();
    });
    expect(screen.queryByText("姝ｅ湪鍔犺浇鏃ュ織...")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(listRunsMock).toHaveBeenCalledTimes(2);
    }, { timeout: 2500 });

    expect(screen.queryByText("姝ｅ湪鍔犺浇鏃ュ織...")).not.toBeInTheDocument();
  });

  it("shows a stop button for running runs and dispatches cancel", async () => {
    listRunsMock.mockResolvedValue({
      page: 1,
      page_size: 50,
      total: 1,
      items: [
        {
          id: 11,
          job_id: null,
          trigger_type: "manual",
          status: "running",
          started_at: "2026-04-13T00:00:00.123456+00:00",
          ended_at: null,
          error_text: null,
          stats_json: { total_queries: 24, completed_queries: 10, progress_percent: 42, fetched_raw: 13, query_errors: 1 },
        },
      ],
    } as any);
    getRuntimeLogsMock.mockResolvedValue({ items: [] });

    render(<LogsPage />);

    const stopButton = await screen.findByRole("button", { name: TEXT.stopRun });
    stopButton.click();

    await waitFor(() => {
      expect(cancelRunMock).toHaveBeenCalledWith(11);
    });
  });
});
