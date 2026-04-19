import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualSearchPage } from "./ManualSearchPage";

vi.mock("../api", () => ({
  listTaskPacks: vi.fn(),
  getTaskPack: vi.fn(),
  createTaskPack: vi.fn(),
  updateTaskPack: vi.fn(),
  deleteTaskPack: vi.fn(),
  runManual: vi.fn(),
}));

vi.mock("../components/RuleSetEditor", () => ({
  RuleSetEditor: () => <div data-testid="rule-set-editor" />,
}));

import { createTaskPack, deleteTaskPack, getTaskPack, listTaskPacks, runManual } from "../api";

const listTaskPacksMock = vi.mocked(listTaskPacks);
const getTaskPackMock = vi.mocked(getTaskPack);
const createTaskPackMock = vi.mocked(createTaskPack);
const deleteTaskPackMock = vi.mocked(deleteTaskPack);
const runManualMock = vi.mocked(runManual);

const taskPackSummary = {
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  name: "Alpha Watch",
  description: "watch alpha",
  updated_at: "2026-04-14T00:00:00+00:00",
};

const taskPackFile = {
  version: 1,
  kind: "task_pack",
  pack_name: "alpha-watch",
  pack_path: "config/packs/alpha-watch.json",
  meta: {
    name: "Alpha Watch",
    description: "watch alpha",
    updated_at: "2026-04-14T00:00:00+00:00",
  },
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

describe("ManualSearchPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    listTaskPacksMock.mockResolvedValue({ items: [taskPackSummary] } as any);
    getTaskPackMock.mockResolvedValue(taskPackFile as any);
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
  });

  it("renders the execution-first workbench structure and updates the execution rail after a run", async () => {
    runManualMock.mockResolvedValue({
      run_id: 1,
      status: "success",
      search_spec: taskPackFile.search_spec,
      final_query: "alpha lang:zh || alpha lang:en",
      final_queries: ["alpha lang:zh -is:retweet", "alpha lang:en -is:retweet"],
      rule_set_summary: { id: 1, name: "Default Rule Set", description: "", version: 1, is_builtin: true },
      raw_total: 1,
      matched_total: 0,
      raw_items: [],
      matched_items: [],
      stats: {},
      errors: [],
    } as any);

    render(<ManualSearchPage />);

    await waitFor(() => {
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    const header = screen.getByTestId("manual-page-header");
    expect(screen.getByRole("heading", { name: "手动执行任务" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "当前任务包" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务包操作" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务正文摘要" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "搜索条件" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "规则" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "执行上下文" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "执行结果" })).toBeInTheDocument();
    expect(screen.getByTestId("manual-execution-rail")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "立即执行任务" })).toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "清空当前草稿" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "刷新任务包列表" })).not.toBeInTheDocument();
    expect(screen.getByText("未绑定任务草稿")).toBeInTheDocument();
    expect(screen.getByText("绑定状态：未绑定")).toBeInTheDocument();
    expect(screen.getByText("草稿来源：默认空白")).toBeInTheDocument();
    expect(screen.getByText("当前草稿：未绑定草稿")).toBeInTheDocument();
    expect(screen.getByText("最近状态：未执行")).toBeInTheDocument();
    expect(screen.getByText("最近执行：尚未执行")).toBeInTheDocument();
    expect(screen.getAllByText("尚未执行").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "查看执行结果" })).toBeInTheDocument();
    expect(screen.queryByText("复制规则集")).not.toBeInTheDocument();
    expect(screen.queryByText("保存规则集")).not.toBeInTheDocument();
    expect(screen.queryByText("删除规则集")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "立即执行任务" }));

    await waitFor(() => {
      expect(screen.getByText("alpha lang:zh -is:retweet")).toBeInTheDocument();
    });

    expect(runManualMock).toHaveBeenCalled();
    expect(screen.getByText("alpha lang:en -is:retweet")).toBeInTheDocument();
    expect(screen.getByText("执行成功")).toBeInTheDocument();
    expect(screen.getByText("最近状态：执行成功")).toBeInTheDocument();
    expect(screen.getByText("最近执行")).toBeInTheDocument();
    expect(screen.getByText("raw_total")).toBeInTheDocument();
    expect(screen.getByText("matched_total")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("imports a task pack and exports the current editor state", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("manual-alpha");

    render(<ManualSearchPage />);

    const select = await screen.findByLabelText("manual-pack-select");
    fireEvent.change(select, { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("manual-load-pack"));

    await waitFor(() => {
      expect(getTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("alpha")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Alpha Watch").length).toBeGreaterThan(0);
    expect(screen.getByText("绑定状态：已绑定本地任务包")).toBeInTheDocument();
    expect(screen.getByText("草稿状态：未修改")).toBeInTheDocument();
    expect(screen.getByText("草稿来源：任务包载入")).toBeInTheDocument();
    expect(screen.getByText("pack_name=alpha-watch")).toBeInTheDocument();
    expect(screen.getByText("pack_path=config/packs/alpha-watch.json")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务包操作" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务正文摘要" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复任务包内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新任务包列表" })).toBeInTheDocument();
    expect(screen.getByLabelText("manual-load-pack")).toBeInTheDocument();
    expect(screen.getByLabelText("manual-save-as-pack")).toBeInTheDocument();
    expect(screen.getByLabelText("manual-save-current-pack")).toBeInTheDocument();
    expect(screen.getByText(/只替换当前草稿/)).toBeInTheDocument();
    expect(screen.getByText(/会先导入文件，再立刻保存成新的本地任务包并绑定/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("manual-save-as-pack"));

    await waitFor(() => {
      expect(createTaskPackMock).toHaveBeenCalled();
    });

    promptSpy.mockRestore();
  });



  it("imports a task pack from a local file into an unbound draft", async () => {
    render(<ManualSearchPage />);

    await waitFor(() => {
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    const fileInput = screen.getByTestId("manual-pack-file-input") as HTMLInputElement;
    const file = new File(
      [JSON.stringify({
        meta: { name: "Local Alpha", description: "from file" },
        search_spec: { ...taskPackFile.search_spec, all_keywords: ["local-alpha"] },
        rule_set: { ...taskPackFile.rule_set, name: "Local Rule", description: "local rule" },
      })],
      "local-alpha.json",
      { type: "application/json" },
    );
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("local-alpha")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Local Rule")).toBeInTheDocument();
    expect(screen.getByText("绑定状态：未绑定")).toBeInTheDocument();
    expect(screen.getByText("草稿来源：文件导入")).toBeInTheDocument();
  });



  it("imports a task pack file and saves it as a managed new task pack", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("local-alpha-pack");

    render(<ManualSearchPage />);

    await waitFor(() => {
      expect(listTaskPacksMock).toHaveBeenCalled();
    });

    const fileInput = screen.getByTestId("manual-pack-file-input") as HTMLInputElement;
    const file = new File(
      [JSON.stringify({
        meta: { name: "Local Alpha", description: "from file" },
        search_spec: { ...taskPackFile.search_spec, all_keywords: ["saved-local-alpha"] },
        rule_set: { ...taskPackFile.rule_set, name: "Saved Local Rule", description: "saved local rule" },
      })],
      "saved-local-alpha.json",
      { type: "application/json" },
    );

    fireEvent.click(screen.getByLabelText("manual-import-and-save-pack"));
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(createTaskPackMock).toHaveBeenCalled();
    });

    expect(screen.getByText("绑定状态：已绑定本地任务包")).toBeInTheDocument();
    expect(screen.getByText("草稿来源：任务包载入")).toBeInTheDocument();
    expect(screen.getByText("pack_name=local-alpha-pack")).toBeInTheDocument();
    expect(screen.getByText("pack_path=config/packs/local-alpha-pack.json")).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it("shows dirty draft state after editing the imported task pack", async () => {
    render(<ManualSearchPage />);

    const select = await screen.findByLabelText("manual-pack-select");
    fireEvent.change(select, { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("manual-load-pack"));

    await waitFor(() => {
      expect(screen.getByText("草稿状态：未修改")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("Default Rule Set"), { target: { value: "Default Rule Set v2" } });

    expect(screen.getByText("已修改未保存")).toBeInTheDocument();
  });

  it("deletes the current task pack and resets back to an unbound draft", async () => {
    render(<ManualSearchPage />);

    const select = await screen.findByLabelText("manual-pack-select");
    fireEvent.change(select, { target: { value: "alpha-watch" } });
    fireEvent.click(screen.getByLabelText("manual-load-pack"));

    await waitFor(() => {
      expect(screen.getByText("绑定状态：已绑定本地任务包")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("manual-delete-pack"));

    await waitFor(() => {
      expect(deleteTaskPackMock).toHaveBeenCalledWith("alpha-watch");
    });

    expect(screen.getByText("绑定状态：未绑定")).toBeInTheDocument();
    expect(screen.getByText("已删除任务包 alpha-watch")).toBeInTheDocument();
  });
});
