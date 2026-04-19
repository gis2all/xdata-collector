import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ManualSearchPage } from "./pages/ManualSearchPage";
import { JobsPage } from "./pages/JobsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

const ACTIVE_PAGE_STORAGE_KEY = "app.activePage.v1";
const DASHBOARD_HEALTH_STATE_KEY = "dashboard.healthSnapshot.v1";

type CachedDatabaseHealth = {
  configured?: boolean;
  connected?: boolean;
  last_error?: string | null;
};

type CachedHealthSnapshot = {
  db?: CachedDatabaseHealth;
};

type DashboardHealthCacheReadResult = {
  snapshot: CachedHealthSnapshot | null;
  shouldCleanupInvalidCache: boolean;
};

const NAVS = [
  {
    id: "dashboard",
    label: "运行总览",
    shellWidth: "regular",
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
    shellWidth: "regular",
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

function clearStoredDashboardHealth() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DASHBOARD_HEALTH_STATE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readStoredDashboardHealth(): DashboardHealthCacheReadResult {
  if (typeof window === "undefined") {
    return { snapshot: null, shouldCleanupInvalidCache: false };
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DASHBOARD_HEALTH_STATE_KEY);
  } catch {
    return { snapshot: null, shouldCleanupInvalidCache: false };
  }

  if (!raw) {
    return { snapshot: null, shouldCleanupInvalidCache: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { snapshot: null, shouldCleanupInvalidCache: true };
    }
    return {
      snapshot: parsed as CachedHealthSnapshot,
      shouldCleanupInvalidCache: false,
    };
  } catch {
    return { snapshot: null, shouldCleanupInvalidCache: true };
  }
}

function resolveRuntimeDbStatus(snapshot: CachedHealthSnapshot | null) {
  const db = snapshot?.db;
  if (!db || typeof db !== "object") {
    return "未校验";
  }
  if (db.configured === false) {
    return "未配置";
  }
  if (db.configured === true && db.connected === true) {
    return "已连接";
  }
  if (
    db.configured === true &&
    db.connected === false &&
    typeof db.last_error === "string" &&
    db.last_error.trim()
  ) {
    return "最近失败";
  }
  return "未校验";
}

function buildRuntimeSummary(snapshot: CachedHealthSnapshot | null) {
  return {
    api: snapshot ? "已缓存" : "未校验",
    scheduler: "未校验",
    db: resolveRuntimeDbStatus(snapshot),
  };
}

export function App() {
  const [active, setActive] = useState<NavId>(() => readStoredActivePage());
  const [{ snapshot: cachedHealthSnapshot, shouldCleanupInvalidCache }] =
    useState<DashboardHealthCacheReadResult>(() => readStoredDashboardHealth());

  useEffect(() => {
    if (!shouldCleanupInvalidCache) {
      return;
    }
    clearStoredDashboardHealth();
  }, [shouldCleanupInvalidCache]);

  const runtimeSummary = buildRuntimeSummary(cachedHealthSnapshot);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand" data-testid="sidebar-brand">
          <h2>X 数据采集器</h2>
          <p>本地任务、调度与结果工作台</p>
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
        <div className="sidebar-runtime-summary" data-testid="sidebar-runtime-summary">
          <div data-testid="runtime-api">{`API: ${runtimeSummary.api}`}</div>
          <div data-testid="runtime-scheduler">{`调度: ${runtimeSummary.scheduler}`}</div>
          <div data-testid="runtime-db">{`数据库: ${runtimeSummary.db}`}</div>
        </div>
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
