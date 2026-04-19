import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./pages/DashboardPage", () => ({
  DashboardPage: () => <div data-testid="mock-dashboard">dashboard-page</div>,
}));

vi.mock("./pages/ManualSearchPage", () => ({
  ManualSearchPage: () => <div data-testid="mock-manual">manual-page</div>,
}));

vi.mock("./pages/JobsPage", () => ({
  JobsPage: () => <div data-testid="mock-jobs">jobs-page</div>,
}));

vi.mock("./pages/ResultsPage", () => ({
  ResultsPage: () => <div data-testid="mock-results">results-page</div>,
}));

vi.mock("./pages/LogsPage", () => ({
  LogsPage: () => <div data-testid="mock-logs">logs-page</div>,
}));

vi.mock("./pages/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="mock-settings">settings-page</div>,
}));

const ACTIVE_PAGE_STORAGE_KEY = "app.activePage.v1";
const DASHBOARD_HEALTH_STATE_KEY = "dashboard.healthSnapshot.v1";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to dashboard when no saved active page exists", () => {
    render(<App />);

    expect(screen.getByTestId("panel-dashboard")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("mock-dashboard")).toBeInTheDocument();
  });

  it("restores the saved active page from local storage on first render", () => {
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "results");

    render(<App />);

    expect(screen.getByTestId("panel-results")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("mock-results")).toBeInTheDocument();
  });

  it("writes the current active page to local storage when navigation changes", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("nav-jobs"));

    expect(screen.getByTestId("panel-jobs")).toHaveAttribute("aria-hidden", "false");
    expect(window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)).toBe("jobs");
  });

  it("keeps the clicked nav item marked as the current page", () => {
    render(<App />);

    const dashboardNav = screen.getByTestId("nav-dashboard");
    const logsNav = screen.getByTestId("nav-logs");

    expect(dashboardNav).toHaveAttribute("aria-current", "page");
    expect(logsNav).not.toHaveAttribute("aria-current");

    fireEvent.click(logsNav);

    expect(logsNav).toHaveAttribute("aria-current", "page");
    expect(dashboardNav).not.toHaveAttribute("aria-current");
  });

  it("restores the clicked page after a remount", () => {
    const first = render(<App />);

    fireEvent.click(screen.getByTestId("nav-settings"));
    expect(window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)).toBe("settings");

    first.unmount();
    render(<App />);

    expect(screen.getByTestId("panel-settings")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("mock-settings")).toBeInTheDocument();
  });

  it("falls back to dashboard when the saved active page is invalid", () => {
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "unknown-page");

    render(<App />);

    expect(screen.getByTestId("panel-dashboard")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("mock-dashboard")).toBeInTheDocument();
  });

  it("renders the new shell structure and copy", () => {
    render(<App />);

    expect(screen.getByTestId("sidebar-brand")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-runtime-summary")).toBeInTheDocument();
    expect(screen.getByText("X \u6570\u636e\u91c7\u96c6\u5668")).toBeInTheDocument();
    expect(
      screen.getByText("\u672c\u5730\u4efb\u52a1\u3001\u8c03\u5ea6\u4e0e\u7ed3\u679c\u5de5\u4f5c\u53f0"),
    ).toBeInTheDocument();
  });

  it("applies shell width classes to panels", () => {
    render(<App />);

    expect(screen.getByTestId("panel-dashboard")).toHaveClass("page-shell-regular");
    expect(screen.getByTestId("panel-manual")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-jobs")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-results")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-logs")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-settings")).toHaveClass("page-shell-regular");
  });

  it("renders runtime summary from cached healthy snapshot", () => {
    window.localStorage.setItem(
      DASHBOARD_HEALTH_STATE_KEY,
      JSON.stringify({
        db: {
          configured: true,
          connected: true,
          last_error: "",
        },
      }),
    );

    render(<App />);

    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u6570\u636e\u5e93");
    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u5df2\u8fde\u63a5");
    expect(screen.getByTestId("runtime-api")).toHaveTextContent("\u5df2\u7f13\u5b58");
    expect(screen.getByTestId("runtime-scheduler")).toHaveTextContent("\u672a\u6821\u9a8c");
  });

  it("renders neutral runtime summary when no cached snapshot exists", () => {
    render(<App />);

    expect(screen.getByTestId("runtime-api")).toHaveTextContent("\u672a\u6821\u9a8c");
    expect(screen.getByTestId("runtime-scheduler")).toHaveTextContent("\u672a\u6821\u9a8c");
    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u672a\u6821\u9a8c");
  });

  it("falls back to neutral runtime summary and clears invalid cached snapshot JSON", async () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, "{invalid-json");

    render(<App />);

    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u672a\u6821\u9a8c");
    await waitFor(() => {
      expect(window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY)).toBeNull();
    });
  });

  it("maps unconfigured db state to 未配置", () => {
    window.localStorage.setItem(
      DASHBOARD_HEALTH_STATE_KEY,
      JSON.stringify({
        db: {
          configured: false,
          connected: false,
          last_error: "",
        },
      }),
    );

    render(<App />);

    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u672a\u914d\u7f6e");
  });

  it("maps db connection failure with last_error to 最近失败", () => {
    window.localStorage.setItem(
      DASHBOARD_HEALTH_STATE_KEY,
      JSON.stringify({
        db: {
          configured: true,
          connected: false,
          last_error: "boom",
        },
      }),
    );

    render(<App />);

    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u6700\u8fd1\u5931\u8d25");
  });

  it("falls back to 未校验 when cached db fields are missing", () => {
    window.localStorage.setItem(DASHBOARD_HEALTH_STATE_KEY, JSON.stringify({ db: {} }));

    render(<App />);

    expect(screen.getByTestId("runtime-api")).toHaveTextContent("\u5df2\u7f13\u5b58");
    expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u672a\u6821\u9a8c");
  });

  it("handles localStorage getItem failures safely", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    try {
      expect(() => render(<App />)).not.toThrow();
      expect(screen.getByTestId("runtime-api")).toHaveTextContent("\u672a\u6821\u9a8c");
      expect(screen.getByTestId("runtime-db")).toHaveTextContent("\u672a\u6821\u9a8c");
      expect(screen.getByTestId("panel-dashboard")).toHaveAttribute("aria-hidden", "false");
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
