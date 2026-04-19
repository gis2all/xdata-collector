import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders the fixed rail shell structure", () => {
    render(<App />);

    expect(screen.getByTestId("sidebar-brand")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-rail")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav")).toBeInTheDocument();
    expect(screen.getByText("X \u6570\u636e\u91c7\u96c6\u5668")).toBeInTheDocument();
    expect(screen.queryByText("\u5f53\u524d\u9875")).not.toBeInTheDocument();
    expect(screen.queryByText("\u8fd0\u884c\u6458\u8981")).not.toBeInTheDocument();
  });

  it("applies shell width classes to panels", () => {
    render(<App />);

    expect(screen.getByTestId("panel-dashboard")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-manual")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-jobs")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-results")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-logs")).toHaveClass("page-shell-wide");
    expect(screen.getByTestId("panel-settings")).toHaveClass("page-shell-wide");
  });

  it("handles localStorage getItem failures safely", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    try {
      expect(() => render(<App />)).not.toThrow();
      expect(screen.getByTestId("panel-dashboard")).toHaveAttribute("aria-hidden", "false");
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
