import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    browser_hint: "default",
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

  it("restores the last displayed dashboard state from local storage without any automatic health requests", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));

    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-x-info")).toBeInTheDocument();
    expect(screen.getAllByText("已连接").length).toBeGreaterThan(0);
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps the dashboard in not-yet-checked state when no local state exists", async () => {
    render(<DashboardPage />);

    expect(screen.queryByTestId("dashboard-db-info")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-x-info")).not.toBeInTheDocument();
    expect(screen.getByText("尚未刷新")).toBeInTheDocument();
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("stores healthy results after clicking reload", async () => {
    healthMock.mockResolvedValue(healthySnapshot);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
  });

  it("stores failed health results after clicking reload", async () => {
    healthMock.mockResolvedValue(failedSnapshot);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("db probe failed");
    expect(screen.getAllByText("最近校验失败").length).toBeGreaterThan(0);
  });

  it("keeps the previous displayed state when the reload request itself fails", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));
    healthMock.mockRejectedValue(new Error("network down"));

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(screen.getByText("错误: network down")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
  });
});
