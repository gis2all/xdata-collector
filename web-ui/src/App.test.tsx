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

    expect(screen.getByTestId("page-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("mock-dashboard")).toBeInTheDocument();
  });

  it("restores the saved active page from local storage on first render", () => {
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "results");

    render(<App />);

    expect(screen.getByTestId("page-results")).toBeInTheDocument();
    expect(screen.getByTestId("mock-results")).toBeInTheDocument();
  });

  it("writes the current active page to local storage when navigation changes", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("nav-jobs"));

    expect(screen.getByTestId("page-jobs")).toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)).toBe("jobs");
  });

  it("restores the clicked page after a remount", () => {
    const first = render(<App />);

    fireEvent.click(screen.getByTestId("nav-settings"));
    expect(window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)).toBe("settings");

    first.unmount();

    render(<App />);

    expect(screen.getByTestId("page-settings")).toBeInTheDocument();
    expect(screen.getByTestId("mock-settings")).toBeInTheDocument();
  });

  it("falls back to dashboard when the saved active page is invalid", () => {
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "unknown-page");

    render(<App />);

    expect(screen.getByTestId("page-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("mock-dashboard")).toBeInTheDocument();
  });
});
