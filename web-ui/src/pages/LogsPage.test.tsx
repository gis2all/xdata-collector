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
  runsTitle: "\u91c7\u96c6\u8fd0\u884c\u65e5\u5fd7",
  runtimeTitle: "\u670d\u52a1\u8fdb\u7a0b\u65e5\u5fd7",
  noRuns: "\u6682\u65e0\u91c7\u96c6\u8fd0\u884c\u8bb0\u5f55",
  noLogContent: "\u5f53\u524d\u65e0\u65e5\u5fd7\u5185\u5bb9",
  refresh: "\u5237\u65b0",
} as const;

describe("LogsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders run logs and runtime log snapshots", async () => {
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
        },
      ],
    });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText(TEXT.runsTitle)).toBeInTheDocument();
    });

    expect(screen.getByText(TEXT.runtimeTitle)).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("api.current.out.log")).toBeInTheDocument();
    expect(screen.getByText("ready!")).toBeInTheDocument();
    expect(screen.getByText("matched 0")).toBeInTheDocument();
    expect(screen.getAllByText("2026-04-13 08:00:00 UTC+8").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("2026-04-13 08:01:00 UTC+8").length).toBeGreaterThanOrEqual(2);
  });

  it("shows runtime service logs above collection run logs", async () => {
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

    const runtimeHeading = await screen.findByRole("heading", { name: TEXT.runtimeTitle });
    const runsHeading = await screen.findByRole("heading", { name: TEXT.runsTitle });

    expect(runtimeHeading.compareDocumentPosition(runsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    const apiGroup = screen.getByRole("heading", { name: "API" }).closest(".logs-service-group");
    expect(apiGroup).not.toBeNull();
    expect(within(apiGroup as HTMLElement).getByText(TEXT.noLogContent)).toBeInTheDocument();
    expect(screen.getAllByText(TEXT.noLogContent).length).toBeGreaterThanOrEqual(3);
  });

  it("renders request errors without leaving the page blank", async () => {
    listRunsMock.mockRejectedValue(new Error("network down"));
    getRuntimeLogsMock.mockResolvedValue({ items: [] });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText("network down")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
  });
});
