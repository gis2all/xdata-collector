import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ManualSearchPage } from "./pages/ManualSearchPage";
import { JobsPage } from "./pages/JobsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CalendarClock, FileText, LayoutDashboard, Search, Settings, Table } from "lucide-react";

const ACTIVE_PAGE_STORAGE_KEY = "app.activePage.v1";
const THEME_STORAGE_KEY = "app.theme.v1";

type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const NAVS = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "运行总览",
    shellWidth: "wide",
    component: <DashboardPage />,
  },
  {
    id: "manual",
    icon: Search,
    label: "手动搜索",
    shellWidth: "wide",
    component: <ManualSearchPage />,
  },
  { id: "jobs",
    icon: CalendarClock, label: "自动任务", shellWidth: "wide", component: <JobsPage /> },
  {
    id: "results",
    icon: Table,
    label: "结果浏览",
    shellWidth: "wide",
    component: <ResultsPage />,
  },
  { id: "logs",
    icon: FileText, label: "运行日志", shellWidth: "wide", component: <LogsPage /> },
  {
    id: "settings",
    icon: Settings,
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

function readHashActivePage(): NavId | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.location.hash.replace(/^#\/?/, "");
  return isNavId(raw) ? raw : null;
}

function readInitialActivePage(): NavId {
  const hashActive = readHashActivePage();
  if (hashActive) {
    return hashActive;
  }
  if (typeof window !== "undefined" && window.location.hash) {
    return "dashboard";
  }
  return readStoredActivePage();
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

function writeHashActivePage(value: NavId) {
  if (typeof window === "undefined") {
    return;
  }
  const nextHash = `#/${value}`;
  if (window.location.hash === nextHash) {
    return;
  }
  window.history.replaceState(null, "", nextHash);
}

export function App() {
  const [active, setActive] = useState<NavId>(() => readInitialActivePage());
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    function syncFromHash() {
      const hashActive = readHashActivePage();
      if (hashActive) {
        setActive(hashActive);
        writeStoredActivePage(hashActive);
        return;
      }
      if (window.location.hash) {
        setActive("dashboard");
        writeStoredActivePage("dashboard");
        writeHashActivePage("dashboard");
      }
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function activatePage(value: NavId) {
    setActive(value);
    writeStoredActivePage(value);
    writeHashActivePage(value);
  }

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
                activatePage(item.id);
              }}
            >
              <item.icon size={15} strokeWidth={1.5} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="theme-toggle"
          data-testid="theme-toggle"
          onClick={toggleTheme}
        >
          {theme === "dark" ? "浅色模式" : "深色模式"}
        </button>
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
