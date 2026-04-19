import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobsPage } from "./JobsPage";

vi.mock("../api", () => ({
  listJobs: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  restoreJob: vi.fn(),
  purgeJob: vi.fn(),
  runJobNow: vi.fn(),
  toggleJob: vi.fn(),
  batchJobs: vi.fn(),
  listTaskPacks: vi.fn(),
  getTaskPack: vi.fn(),
  createTaskPack: vi.fn(),
  updateTaskPack: vi.fn(),
  deleteTaskPack: vi.fn(),
}));

import { batchJobs, createJob, createTaskPack, deleteTaskPack, getJob, getTaskPack, listJobs, listTaskPacks, updateJob } from "../api";

const listJobsMock = vi.mocked(listJobs);
const listTaskPacksMock = vi.mocked(listTaskPacks);
const getJobMock = vi.mocked(getJob);
const getTaskPackMock = vi.mocked(getTaskPack);
const createJobMock = vi.mocked(createJob);
const createTaskPackMock = vi.mocked(createTaskPack);
const deleteTaskPackMock = vi.mocked(deleteTaskPack);
const batchJobsMock = vi.mocked(batchJobs);
const updateJobMock = vi.mocked(updateJob);

const packFile = {
  version: 1,
  kind: "task_pack",
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  meta: { name: "Alpha Watch", description: "watch alpha", updated_at: "2026-04-14T00:00:00+00:00" },
  search_spec: {
    all_keywords: ["alpha"],
    exact_phrases: [],
    any_keywords: [],
    exclude_keywords: [],
    authors_include: [],
    authors_exclude: [],
    language_mode: "zh_en",
    days_filter: { mode: "lte", max: 20, min: null },
    metric_filters: {
      views: { mode: "any", min: null, max: null },
      likes: { mode: "any", min: null, max: null },
      replies: { mode: "any", min: null, max: null },
      retweets: { mode: "any", min: null, max: null },
    },
    metric_filters_explicit: true,
    max_results: 40,
    include_retweets: false,
    include_replies: true,
    require_media: false,
    require_links: false,
    raw_query: "",
  },
  rule_set: {
    id: 1,
    name: "Default Rule Set",
    description: "builtin",
    version: 1,
    definition: { levels: [], rules: [] },
  },
};

function makeJob(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `job-${id}`,
    keywords_json: ["alpha"],
    interval_minutes: 60,
    days: 20,
    thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
    levels_json: [],
    search_spec_json: packFile.search_spec,
    rule_set_id: 1,
    rule_set_summary: { id: 1, name: "Default Rule Set", description: "builtin", version: 1, is_builtin: true },
    pack_name: `job-${id}`,
    pack_path: `config/packs/job-${id}.json`,
    enabled: 1,
    next_run_at: "2026-04-14T00:00:00+00:00",
    created_at: "2026-04-14T00:00:00+00:00",
    updated_at: "2026-04-14T00:00:00+00:00",
    deleted_at: null,
    last_run_id: null,
    last_run_status: null,
    last_run_started_at: null,
    last_run_ended_at: null,
    last_run_error_text: null,
    last_run_stats: {},
    ...overrides,
  } as any;
}

describe("JobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    listJobsMock.mockResolvedValue({ page: 1, page_size: 10, total: 0, items: [] } as any);
    listTaskPacksMock.mockResolvedValue({ items: [{ pack_name: "alpha-watch", pack_path: "config/packs/alpha-watch.json", name: "Alpha Watch", description: "watch alpha", updated_at: "2026-04-14T00:00:00+00:00" }] } as any);
    getJobMock.mockResolvedValue(makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" } }) as any);
    getTaskPackMock.mockResolvedValue(packFile as any);
    createTaskPackMock.mockImplementation(async (payload: any) => ({
      version: 1,
      kind: "task_pack",
      pack_name: payload.pack_name || "alpha-watch",
      pack_path: `config/packs/${payload.pack_name || "alpha-watch"}.json`,
      meta: {
        name: payload.meta?.name || "Alpha Watch",
        description: payload.meta?.description || "",
        updated_at: "2026-04-14T00:00:00+00:00",
      },
      search_spec: payload.search_spec,
      rule_set: {
        id: payload.rule_set?.id ?? 1,
        name: payload.rule_set?.name || "Default Rule Set",
        description: payload.rule_set?.description || "",
        version: payload.rule_set?.version || 1,
        definition: payload.rule_set?.definition || { levels: [], rules: [] },
      },
    }) as any);
    deleteTaskPackMock.mockResolvedValue({ pack_name: "alpha-watch", deleted: 1 } as any);
    batchJobsMock.mockResolvedValue({
      action: "delete",
      mode: "ids",
      total_targeted: 0,
      succeeded: 0,
      failed: 0,
      succeeded_ids: [],
      failed_items: [],
    } as any);
    createJobMock.mockResolvedValue({
      id: 10,
      name: "scheduled-alpha",
      keywords_json: ["alpha"],
      interval_minutes: 120,
      days: 20,
      thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
      levels_json: [],
      search_spec_json: packFile.search_spec,
      rule_set_id: 1,
      rule_set_summary: { id: 1, name: "Default Rule Set", description: "builtin", version: 1, is_builtin: true },
      pack_name: "job-010-scheduled-alpha",
      pack_path: "config/packs/job-010-scheduled-alpha.json",
      enabled: 1,
      next_run_at: null,
      created_at: "2026-04-14T00:00:00+00:00",
      updated_at: "2026-04-14T00:00:00+00:00",
    } as any);
    updateJobMock.mockResolvedValue(makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" } }) as any);
  });

  it("renders a draggable resizer in split layout on wide screens", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1440, writable: true });

    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    expect(screen.getByTestId("jobs-layout")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-resizer")).toBeInTheDocument();
  });

  it("updates the split width in real time while dragging the resizer", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1440, writable: true });

    render(<JobsPage />);

    const layout = await screen.findByTestId("jobs-layout");
    const resizer = screen.getByTestId("jobs-resizer");
    Object.defineProperty(layout, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 1400, height: 800, right: 1400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.mouseDown(resizer, { clientX: 760 });
    fireEvent.mouseMove(window, { clientX: 700 });

    expect(layout).toHaveStyle({ gridTemplateColumns: "700px 12px minmax(520px, 1fr)" });
    expect(layout.className).toContain("dragging");

    fireEvent.mouseUp(window);

    expect(layout.className).not.toContain("dragging");
  });

  it("does not render the resizer in stacked layout on narrower screens", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1100, writable: true });

    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("jobs-resizer")).not.toBeInTheDocument();
  });

  it("does not persist a dragged width after remount", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1440, writable: true });

    const first = render(<JobsPage />);
    const firstLayout = await screen.findByTestId("jobs-layout");
    const firstResizer = screen.getByTestId("jobs-resizer");
    Object.defineProperty(firstLayout, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 1400, height: 800, right: 1400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.mouseDown(firstResizer, { clientX: 760 });
    fireEvent.mouseMove(window, { clientX: 680 });
    fireEvent.mouseUp(window);

    expect(firstLayout).toHaveStyle({ gridTemplateColumns: "680px 12px minmax(520px, 1fr)" });

    first.unmount();

    render(<JobsPage />);
    const secondLayout = await screen.findByTestId("jobs-layout");

    expect(secondLayout.style.gridTemplateColumns).toBe("");
  });

  it("renders the reorganized editable workspace structure after loading a task pack", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    expect(screen.getByRole("columnheader", { name: "任务包" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "规则集" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "查询摘要" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-alpha" } });
    fireEvent.change(screen.getByLabelText("job-interval"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("job-pack-select"), { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("job-load-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    expect(screen.getByRole("heading", { name: "当前任务" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "当前绑定任务包" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务包操作" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务正文摘要" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "搜索条件" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "规则" })).toBeInTheDocument();
    expect(screen.getByText("已绑定本地任务包")).toBeInTheDocument();
    expect(screen.getByText("pack_name=alpha-watch")).toBeInTheDocument();
    expect(screen.getByText("pack_path=config/packs/alpha-watch.json")).toBeInTheDocument();
    expect(screen.getByText("规则可视化编辑器")).toBeInTheDocument();
    expect(screen.getByLabelText("job-load-pack")).toBeInTheDocument();
    expect(screen.getByLabelText("job-save-as-pack")).toBeInTheDocument();
    expect(screen.getByLabelText("job-save-current-pack")).toBeInTheDocument();
    expect(screen.getByText(/只替换当前草稿/)).toBeInTheDocument();
    expect(screen.getByText(/会先导入文件，再立刻保存成新的本地任务包并绑定/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("submit-job"));

    await waitFor(() => {
      expect(createJobMock).toHaveBeenCalled();
    });

    const payload = createJobMock.mock.calls[0]?.[0] as any;
    expect(payload.name).toBe("scheduled-alpha");
    expect(payload.interval_minutes).toBe(120);
    expect(payload.search_spec.all_keywords).toEqual(["alpha"]);
    expect(payload.rule_set.name).toBe("Default Rule Set");
  });

  it("separates page header, filter layer, and list manage layer", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    expect(screen.getByRole("heading", { name: "自动任务" })).toBeInTheDocument();
    expect(screen.getByText("自动任务负责调度；任务正文来自当前绑定任务包，包含搜索条件和规则。")).toBeInTheDocument();
    expect(screen.getByTestId("create-job-button")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-manage-bar")).toBeInTheDocument();
    expect(screen.getByText("已选 0 项")).toBeInTheDocument();
    expect(screen.getByText("共 0 项任务")).toBeInTheDocument();
    expect(screen.getByText("当前范围：启用中")).toBeInTheDocument();
  });

  it("shows a top save button for create mode and keeps the footer save button", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-alpha" } });
    fireEvent.change(screen.getByLabelText("job-interval"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("job-pack-select"), { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("job-load-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    expect(screen.getByLabelText("submit-job-top")).toBeInTheDocument();
    expect(screen.getByLabelText("submit-job")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("submit-job-top"));

    await waitFor(() => {
      expect(createJobMock).toHaveBeenCalled();
    });
  });

  it("renders a current-task hero for create mode", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));

    expect(screen.getAllByText("新建任务草稿").length).toBeGreaterThan(0);
    expect(screen.getByText("当前状态：已启用")).toBeInTheDocument();
    expect(screen.getByText("下次运行：保存后生成")).toBeInTheDocument();
    expect(screen.getByText("最近运行：尚未运行")).toBeInTheDocument();
  });

  it("shows loading state on the top save button while creating and keeps the workspace editable after save", async () => {
    let resolveCreate: ((value: any) => void) | null = null;
    createJobMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }) as any,
    );

    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-alpha" } });
    fireEvent.change(screen.getByLabelText("job-pack-select"), { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("job-load-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    fireEvent.click(screen.getByLabelText("submit-job-top"));

    expect(screen.getByLabelText("submit-job-top")).toBeDisabled();
    expect(screen.getByLabelText("submit-job-top")).toHaveTextContent("保存中...");

    resolveCreate?.({
      id: 10,
      name: "scheduled-alpha",
      keywords_json: ["alpha"],
      interval_minutes: 60,
      days: 20,
      thresholds_json: { views: 0, likes: 0, replies: 0, retweets: 0, mode: "OR" },
      levels_json: [],
      search_spec_json: packFile.search_spec,
      rule_set_id: 1,
      rule_set_summary: { id: 1, name: "Default Rule Set", description: "builtin", version: 1, is_builtin: true },
      pack_name: "job-010-scheduled-alpha",
      pack_path: "config/packs/job-010-scheduled-alpha.json",
      enabled: 1,
      next_run_at: null,
      created_at: "2026-04-14T00:00:00+00:00",
      updated_at: "2026-04-14T00:00:00+00:00",
    });

    await waitFor(() => {
      expect(screen.getByText("已保存")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("submit-job-top")).toBeInTheDocument();
    expect(screen.getByLabelText("submit-job-top")).not.toBeDisabled();
  });

  it("opens the unified workspace from row click and keeps a lightweight open action for active jobs", async () => {
    listJobsMock.mockResolvedValueOnce({
      page: 1,
      page_size: 10,
      total: 1,
      items: [makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" } })],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("alpha-watch-job").length).toBeGreaterThan(0);
    });

    const row = screen.getAllByText("alpha-watch-job")[0]?.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    await waitFor(() => {
      expect(screen.getByLabelText("submit-job-top")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "\u67e5\u770b" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "\u7f16\u8f91" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "\u6253\u5f00" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "\u5173\u95ed" }));
    fireEvent.click(screen.getByRole("button", { name: "\u6253\u5f00" }));

    await waitFor(() => {
      expect(screen.getByLabelText("submit-job-top")).toBeInTheDocument();
    });
  });



  it("imports a task pack from a local file but keeps scheduling fields", async () => {
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-local" } });
    fireEvent.change(screen.getByLabelText("job-interval"), { target: { value: "90" } });

    const fileInput = screen.getByTestId("job-pack-file-input") as HTMLInputElement;
    const file = new File(
      [JSON.stringify({
        meta: { name: "Local Alpha", description: "from file" },
        search_spec: { ...packFile.search_spec, all_keywords: ["local-alpha"] },
        rule_set: { ...packFile.rule_set, name: "Local Rule", description: "local rule" },
      })],
      "local-alpha.json",
      { type: "application/json" },
    );
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("local-alpha")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("scheduled-local")).toBeInTheDocument();
    expect(screen.getByDisplayValue("90")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Local Rule")).toBeInTheDocument();
    expect(screen.getAllByText("未绑定").length).toBeGreaterThan(0);
  });



  it("imports a task pack file and saves it as a managed new task pack while keeping scheduling fields", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("local-alpha-pack");
    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("create-job-button"));
    fireEvent.change(screen.getByLabelText("job-name"), { target: { value: "scheduled-local" } });
    fireEvent.change(screen.getByLabelText("job-interval"), { target: { value: "90" } });

    const fileInput = screen.getByTestId("job-pack-file-input") as HTMLInputElement;
    const file = new File(
      [JSON.stringify({
        meta: { name: "Local Alpha", description: "from file" },
        search_spec: { ...packFile.search_spec, all_keywords: ["saved-local-alpha"] },
        rule_set: { ...packFile.rule_set, name: "Saved Local Rule", description: "saved local rule" },
      })],
      "saved-local-alpha.json",
      { type: "application/json" },
    );

    fireEvent.click(screen.getByLabelText("job-import-and-save-pack"));
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(createTaskPackMock).toHaveBeenCalled();
    });

    expect(screen.getByDisplayValue("scheduled-local")).toBeInTheDocument();
    expect(screen.getByDisplayValue("90")).toBeInTheDocument();
    expect(screen.getByText("任务包载入")).toBeInTheDocument();
    expect(screen.getByText("pack_name=local-alpha-pack")).toBeInTheDocument();
    expect(screen.getByText("pack_path=config/packs/local-alpha-pack.json")).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it("supports two-step all matching selection and batch delete", async () => {
    const firstPageItems = Array.from({ length: 10 }, (_, index) => makeJob(index + 1));
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 12, items: firstPageItems } as any)
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any);
    batchJobsMock.mockResolvedValue({
      action: "delete",
      mode: "all_matching",
      total_targeted: 12,
      succeeded: 12,
      failed: 0,
      succeeded_ids: firstPageItems.map((item) => item.id),
      failed_items: [],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("job-1").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("jobs-select-page"));
    expect(screen.getByText("已选 10 项")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("select-all-matching-jobs"));
    expect(screen.getByText("已选 12 项")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "delete", mode: "all_matching", status: "active" }),
      );
    });

    expect(await screen.findByText("已成功 12 条，失败 0 条")).toBeInTheDocument();
  });

  it("disables batch actions when deleted and non-deleted jobs are mixed in all view", async () => {
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 2,
        items: [
          makeJob(1, { name: "active-job", deleted_at: null }),
          makeJob(2, { name: "deleted-job", enabled: 0, deleted_at: "2026-04-14T00:00:00+00:00" }),
        ],
      } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "all" } });

    await waitFor(() => {
      expect(screen.getAllByText("active-job").length).toBeGreaterThan(0);
      expect(screen.getAllByText("deleted-job").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("select-job-1"));
    fireEvent.click(screen.getByLabelText("select-job-2"));

    expect(screen.getByText("当前选择同时包含已删除和未删除任务，请先按状态筛选或重新勾选。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量删除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "批量恢复" })).toBeDisabled();
  });

  it("switches to all view after a successful batch restore from deleted status", async () => {
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 0, items: [] } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 1,
        items: [makeJob(5, { name: "deleted-job", enabled: 0, deleted_at: "2026-04-14T00:00:00+00:00" })],
      } as any)
      .mockResolvedValueOnce({
        page: 1,
        page_size: 10,
        total: 1,
        items: [makeJob(5, { name: "deleted-job", enabled: 0, deleted_at: null })],
      } as any);
    batchJobsMock.mockResolvedValue({
      action: "restore",
      mode: "ids",
      total_targeted: 1,
      succeeded: 1,
      failed: 0,
      succeeded_ids: [5],
      failed_items: [],
    } as any);

    render(<JobsPage />);

    fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "deleted" } });

    await waitFor(() => {
      expect(screen.getAllByText("deleted-job").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("select-job-5"));
    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith({ action: "restore", ids: [5] });
      expect(listJobsMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "all", page: 1 }));
    });
  });

  it("shows summary and first failed jobs for batch run now", async () => {
    const jobs = [makeJob(1, { name: "job-one" }), makeJob(2, { name: "job-two" }), makeJob(3, { name: "job-three" })];
    listJobsMock
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 3, items: jobs } as any)
      .mockResolvedValueOnce({ page: 1, page_size: 10, total: 3, items: jobs } as any);
    batchJobsMock.mockResolvedValue({
      action: "run_now",
      mode: "ids",
      total_targeted: 3,
      succeeded: 1,
      failed: 2,
      succeeded_ids: [1],
      failed_items: [
        { id: 2, name: "job-two", error: "boom-two" },
        { id: 3, name: "job-three", error: "boom-three" },
      ],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("job-one").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("jobs-select-page"));
    fireEvent.click(screen.getByRole("button", { name: "批量立即运行" }));

    await waitFor(() => {
      expect(batchJobsMock).toHaveBeenCalledWith({ action: "run_now", ids: [1, 2, 3] });
    });

    expect(await screen.findByText(/已成功 1 条，失败 2 条/)).toBeInTheDocument();
    expect(screen.getByText(/job-two: boom-two/)).toBeInTheDocument();
    expect(screen.getByText(/job-three: boom-three/)).toBeInTheDocument();
  });

  it("shows dirty task pack state after editing task body fields", async () => {
    listJobsMock.mockResolvedValueOnce({
      page: 1,
      page_size: 10,
      total: 1,
      items: [makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" } })],
    } as any);

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("alpha-watch-job").length).toBeGreaterThan(0);
    });

    const row = screen.getAllByText("alpha-watch-job")[0]?.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    await waitFor(() => {
      expect(screen.getByText("当前绑定任务包")).toBeInTheDocument();
      expect(screen.getByText("未修改")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("alpha"), { target: { value: "alpha,beta" } });

    expect(screen.getByText("已修改未保存")).toBeInTheDocument();
  });

  it("shows a clear error when deleting a task pack still referenced by the current job", async () => {
    listJobsMock.mockResolvedValueOnce({
      page: 1,
      page_size: 10,
      total: 1,
      items: [makeJob(7, { name: "alpha-watch-job", pack_name: "alpha-watch", pack_meta: { name: "Alpha Watch" } })],
    } as any);
    deleteTaskPackMock.mockRejectedValueOnce(new Error("task pack is referenced by existing jobs"));

    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("alpha-watch-job").length).toBeGreaterThan(0);
    });

    const row = screen.getAllByText("alpha-watch-job")[0]?.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "当前绑定任务包" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("job-delete-pack"));

    await waitFor(() => {
      expect(deleteTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    expect(screen.getByText("当前任务包仍被自动任务使用，请先更换绑定后再删除")).toBeInTheDocument();
  });
});
