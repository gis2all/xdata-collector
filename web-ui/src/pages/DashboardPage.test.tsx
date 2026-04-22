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

  it("renders the dashboard workbench structure and restores the last displayed state without automatic health requests", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));

    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-page-header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toHaveClass("workbench-primary-action");
    expect(screen.getByTestId("dashboard-summary")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-panels")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-x-info")).toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-summary")).getByText("\u6700\u8fd1\u72b6\u6001")).toBeInTheDocument();
    expect(screen.getAllByText("\u5df2\u8fde\u63a5").length).toBeGreaterThan(0);
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps the dashboard in a not-yet-checked state when no local state exists", async () => {
    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-page-header")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-panels")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-summary")).getByText("\u5c1a\u672a\u6821\u9a8c")).toBeInTheDocument();
    expect(screen.getByText("\u70b9\u51fb\u201c\u91cd\u65b0\u52a0\u8f7d\u201d\u83b7\u53d6\u6700\u65b0\u72b6\u6001\u3002")).toBeInTheDocument();
    expect(healthMock).not.toHaveBeenCalled();
    expect(healthSnapshotMock).not.toHaveBeenCalled();
  });

  it("stores healthy results after clicking reload", async () => {
    healthMock.mockResolvedValue(healthySnapshot);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "\u91cd\u65b0\u52a0\u8f7d" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
    expect(screen.getByTestId("dashboard-panels")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-db-info")).toBeInTheDocument();
  });

  it("stores failed health results after clicking reload", async () => {
    healthMock.mockResolvedValue(failedSnapshot);

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "\u91cd\u65b0\u52a0\u8f7d" }));

    await waitFor(() => {
      expect(healthMock).toHaveBeenCalledTimes(1);
    });

    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("db probe failed");
    expect(screen.getAllByText("\u6700\u8fd1\u6821\u9a8c\u5931\u8d25").length).toBeGreaterThan(0);
  });

  it("keeps the previous displayed state when the reload request itself fails", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify(healthySnapshot));
    healthMock.mockRejectedValue(new Error("network down"));

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "\u91cd\u65b0\u52a0\u8f7d" }));

    await waitFor(() => {
      expect(screen.getByText("\u9519\u8bef: network down")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dashboard-panels")).toBeInTheDocument();
    expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toContain("backend_snapshot");
  });
});
