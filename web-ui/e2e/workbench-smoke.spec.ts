import { expect, test } from "@playwright/test";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function apiPayload(pathname: string) {
  if (pathname === "/health" || pathname === "/health/snapshot") {
    return {
      summary: { updated_at: "2026-05-30T00:00:00+00:00", source: "e2e" },
      db: {
        configured: true,
        connected: true,
        db_path: "data/app.db",
        db_exists: true,
        job_count: 0,
        run_count: 0,
        last_checked_at: "2026-05-30T00:00:00+00:00",
        last_error: "",
      },
      x: {
        configured: false,
        connected: false,
        auth_source: "",
        cli_version: "",
        account_hint: "",
        last_checked_at: "2026-05-30T00:00:00+00:00",
        last_error: "",
      },
    };
  }
  if (pathname === "/workspace" || pathname === "/workspace/export") {
    return {
      version: 2,
      meta: { updated_at: "2026-05-30T00:00:00+00:00", next_job_id: 1 },
      environment: { db_path: "data/app.db", runtime_dir: "runtime", env_file: ".env" },
      jobs: [],
    };
  }
  if (pathname === "/items" || pathname === "/items/query") {
    return { page: 1, page_size: 100, total: 0, items: [] };
  }
  if (pathname === "/jobs") {
    return { page: 1, page_size: 10, total: 0, items: [] };
  }
  if (pathname === "/task-packs") {
    return { items: [] };
  }
  if (pathname === "/rule-sets") {
    return { items: [] };
  }
  if (pathname === "/runs") {
    return { page: 1, page_size: 50, total: 0, items: [] };
  }
  if (pathname === "/logs/runtime") {
    return { items: [] };
  }
  return { error: { code: "not_found", message: "not found" } };
}

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:8765/**", async (route) => {
    const url = new URL(route.request().url());
    const payload = apiPayload(url.pathname);
    await route.fulfill({
      status: "error" in payload ? 404 : 200,
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
  });
});

test("navigates between core workbench pages", async ({ page }) => {
  await page.goto("/#/results");

  await expect(page.getByTestId("panel-results")).toBeVisible();
  await expect(page.getByTestId("results-page")).toBeVisible();

  await page.getByTestId("nav-jobs").click();
  await expect(page.getByTestId("panel-jobs")).toBeVisible();
  await expect(page.getByTestId("jobs-page")).toBeVisible();

  await page.getByTestId("nav-logs").click();
  await expect(page.getByTestId("panel-logs")).toBeVisible();
  await expect(page.getByTestId("logs-page")).toBeVisible();
});
