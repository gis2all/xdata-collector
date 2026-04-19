import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ManualSearchPage } from "./pages/ManualSearchPage";
import { JobsPage } from "./pages/JobsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

const ACTIVE_PAGE_STORAGE_KEY = "app.activePage.v1";

const NAVS = [
  {
    id: "dashboard",
    label: "运行总览",
    shellWidth: "wide",
    component: <DashboardPage />,
  },
  {
    id: "manual",
    label: "手动搜索",
    shellWidth: "wide",
    component: <ManualSearchPage />,
  },
  { id: "jobs", label: "自动任务", shellWidth: "wide", component: <JobsPage /> },
  {
    id: "results",
    label: "结果浏览",
    shellWidth: "wide",
    component: <ResultsPage />,
  },
  { id: "logs", label: "运行日志", shellWidth: "wide", component: <LogsPage /> },
  {
    id: "settings",
    label: "设置",
    shellWidth: "wide",
    component: <SettingsPage />,
  },
] as const;

type NavId = (typeof NAVS)[number]["id"];

function isNavId(value: string): value is NavId {
  return NAVS.some((item) => item.id === value);
}

function readStoredActivePage(): NavId {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  try {
    const raw = window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
    if (!raw || !isNavId(raw)) {
      return "dashboard";
    }
    return raw;
  } catch {
    return "dashboard";
  }
}

function writeStoredActivePage(value: NavId) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures.
  }
}

export function App() {
  const [active, setActive] = useState<NavId>(() => readStoredActivePage());

  return (
    <div className="app-shell">
      <aside className="sidebar" data-testid="sidebar-rail">
        <div className="sidebar-brand" data-testid="sidebar-brand">
          <h2>X 数据采集器</h2>
        </div>

        <nav className="sidebar-nav" data-testid="sidebar-nav">
          {NAVS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${active === item.id ? "active" : ""}`}
              data-testid={`nav-${item.id}`}
              aria-current={active === item.id ? "page" : undefined}
              onClick={() => {
                setActive(item.id);
                writeStoredActivePage(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="app-canvas">
        {NAVS.map((item) => (
          <section
            key={item.id}
            data-testid={`panel-${item.id}`}
            className={[
              "page-shell",
              `page-shell-${item.shellWidth}`,
              active === item.id ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
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
