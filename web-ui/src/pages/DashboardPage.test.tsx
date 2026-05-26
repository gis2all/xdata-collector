import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";

vi.mock("../api", () => ({
  health: vi.fn(),
  healthSnapshot: vi.fn(),
}));

import { health, healthSnapshot } from "../api";

const healthMock = vi.mocked(health);
const healthSnapshotMock = vi.mocked(healthSnapshot);
const DASHBOARD_HEALTH_STATE_KEY = "dashboard.healthSnapshot.v1";

const healthySnapshot = {
  summary: {
    updated_at: "2026-04-18T00:00:00+00:00",
    source: "backend_snapshot",
  },
  db: {
    configured: true,
    connected: true,
    db_path: "data/app.db",
    db_exists: true,
    job_count: 2,
    run_count: 8,
    last_checked_at: "2026-04-18T00:00:00+00:00",
    last_error: "",
  },
  x: {
    configured: true,
    connected: true,
    auth_source: "twitter-cli",
    cli_version: "0.8.6",
    account_hint: "unknown",
    last_checked_at: "2026-04-18T00:00:00+00:00",
    last_error: "",
  },
} as any;

const failedSnapshot = {
  ...healthySnapshot,
  db: {
    ...healthySnapshot.db,
    connected: false,
    last_error: "db probe failed",
  },
  x: {
    ...healthySnapshot.x,
    connected: false,
    last_error: "x probe failed",
  },
} as any;

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores cached state without auto-refreshing", () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));

    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-page-header")).toBeInTheDocument();
    expect(screen.getByText("页面刷新不会主动探测，点击重新加载才会更新当前状态。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toHaveClass("workbench-primary-action");
    expect(screen.getByTestId("dashboard-summary")).toHaveClass("dashboard-width-lock");
    expect(screen.getByTestId("dashboard-panels")).toHaveClass("dashboard-width-lock");
    expect(within(screen.getByTestId("dashboard-summary")).getByText("最近状态")).toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-db-info")).getByTestId("dashboard-db-detail-list")).toHaveClass("flat-row-list");
    expect(within(screen.getByTestId("dashboard-x-info")).getByTestId("dashboard-x-detail-list")).toHaveClass("flat-row-list");
    expect(within(screen.getByTestId("dashboard-x-info")).getByText("0.8.6")).toBeInTheDocument();
    expect(screen.getAllByText("已连接").length).toBeGreaterThan(0);
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps a compact not-yet-checked state when no cache exists", () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-page-header")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-summary")).toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-summary")).getByText("尚未校验")).toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-summary")).getByText("等待手动刷新")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-panels")).not.toBeInTheDocument();
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("calls health only after clicking reload and stores healthy results", async () => {
    healthMock.mockResolvedValue(healthySnapshot);

    render(<DashboardPage />);

    expect(healthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
    expect(screen.getByTestId("dashboard-panels")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-x-info")).toBeInTheDocument();
  });

  it("stores failed probe results after clicking reload", async () => {
    healthMock.mockResolvedValue(failedSnapshot);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("db probe failed");
    expect(screen.getAllByText("最近校验失败").length).toBeGreaterThan(0);
  });

  it("keeps the previous displayed state when reload itself fails", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));
    healthMock.mockRejectedValue(new Error("network down"));

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(screen.getByText("错误: network down")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dashboard-panels")).toBeInTheDocument();
    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
    expect(healthMock).toHaveBeenCalledTimes(1);
  });

  it("keeps reload failures compact when there is no cached state", async () => {
    healthMock.mockRejectedValue(new Error("network down"));

    render(<DashboardPage />);

    expect(healthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(screen.getByText("错误: network down")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dashboard-summary")).toHaveClass("flat-meta-strip");
    expect(screen.queryByTestId("dashboard-panels")).not.toBeInTheDocument();
  });
});
