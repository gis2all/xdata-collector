import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ManualSearchPage } from "./pages/ManualSearchPage";
import { JobsPage } from "./pages/JobsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

const ACTIVE_PAGE_STORAGE_KEY = "app.activePage.v1";

const NAVS = [
  { id: "dashboard", label: "运行总览", component: <DashboardPage /> },
  { id: "manual", label: "手动搜索", component: <ManualSearchPage /> },
  { id: "jobs", label: "自动任务", component: <JobsPage /> },
  { id: "results", label: "结果浏览", component: <ResultsPage /> },
  { id: "logs", label: "运行日志", component: <LogsPage /> },
  { id: "settings", label: "设置", component: <SettingsPage /> },
] as const;

type NavId = (typeof NAVS)[number]["id"];

function isNavId(value: string): value is NavId {
  return NAVS.some((item) => item.id === value);
}

function readStoredActivePage(): NavId {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  const raw = window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
  if (!raw || !isNavId(raw)) {
    return "dashboard";
  }
  return raw;
}

function writeStoredActivePage(value: NavId) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, value);
}

export function App() {
  const [active, setActive] = useState<NavId>(() => readStoredActivePage());

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>X数据采集器</h2>
        {NAVS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${active === item.id ? "active" : ""}`}
            data-testid={`nav-${item.id}`}
            onClick={() => {
              setActive(item.id);
              writeStoredActivePage(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <main className="main" data-testid={`page-${active}`}>
        {NAVS.map((item) => (
          <section
            key={item.id}
            className={active === item.id ? "page-panel active" : "page-panel"}
            hidden={active !== item.id}
            aria-hidden={active !== item.id}
          >
            {item.component}
          </section>
        ))}
      </main>
    </div>
  );
}

