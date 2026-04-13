import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dedupeItems, deleteItem, deleteItems, listItems } from "../api";
import { ResultsPage } from "./ResultsPage";

vi.mock("../api", () => ({
  listItems: vi.fn(),
  deleteItem: vi.fn(),
  deleteItems: vi.fn(),
  dedupeItems: vi.fn(),
}));

const RESULTS_VISIBLE_COLUMNS_KEY = "results.visibleColumns.v1";

const listItemsMock = vi.mocked(listItems);
const deleteItemMock = vi.mocked(deleteItem);
const deleteItemsMock = vi.mocked(deleteItems);
const dedupeItemsMock = vi.mocked(dedupeItems);

const TEXT = {
  title: "结果查询",
  refresh: "刷新列表",
  batchDelete: "批量删除",
  dedupe: "全表去重",
  selectPage: "本页全选",
  fields: "字段",
  resetColumns: "恢复默认",
  keywordLabel: "keyword",
} as const;

function makeItem(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    run_id: 100 + id,
    dedupe_key: `dedupe-${id}`,
    level: "A",
    score: 80 + id,
    title: `Item ${id}`,
    summary_zh: `Summary ${id}`,
    excerpt: `Excerpt ${id}`,
    is_zero_cost: 1,
    source_url: `https://x.com/demo/status/${id}`,
    author: `author-${id}`,
    created_at_x: "2026-04-13T00:49:06+00:00",
    reasons_json: [{ rule: `rule-${id}` }],
    rule_set_id: 2,
    state: "new",
    ...overrides,
  };
}

function makePage(items: ReturnType<typeof makeItem>[], total = items.length, page = 1, pageSize = 100) {
  return {
    page,
    page_size: pageSize,
    total,
    items,
  };
}

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders default business columns and utc+8 timestamps", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(TEXT.title)).toBeInTheDocument();
    });

    expect(listItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 100, sort_by: "id", sort_dir: "desc" }),
    );
    expect(screen.getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.batchDelete })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.dedupe })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.fields })).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("summary_zh")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("created_at_x")).toBeInTheDocument();
    expect(screen.queryByText("dedupe_key")).not.toBeInTheDocument();
    expect(screen.queryByText("reasons_json")).not.toBeInTheDocument();
    const scoreAscButton = screen.getByRole("button", { name: "score asc" });
    const scoreDescButton = screen.getByRole("button", { name: "score desc" });
    expect(scoreAscButton).toBeInTheDocument();
    expect(scoreDescButton).toBeInTheDocument();
    expect(scoreAscButton.parentElement).toHaveClass("results-sort-controls-inline");
    expect(screen.queryByText("ASC")).not.toBeInTheDocument();
    expect(screen.queryByText("DESC")).not.toBeInTheDocument();
    expect(scoreAscButton).toHaveTextContent("↑");
    expect(scoreDescButton).toHaveTextContent("↓");
    expect(screen.queryByRole("button", { name: "dedupe_key asc" })).not.toBeInTheDocument();
    expect(screen.getByText("2026-04-13 08:49:06 UTC+8")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://x.com/demo/status/1" })).toHaveAttribute(
      "href",
      "https://x.com/demo/status/1",
    );
  });

  it("shows a hidden column after checking it in the field dropdown", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.fields }));
    fireEvent.click(screen.getByLabelText("toggle-column-dedupe_key"));

    expect(await screen.findByRole("button", { name: "dedupe_key asc" })).toBeInTheDocument();
    expect(screen.getByText("dedupe-1")).toBeInTheDocument();
    expect(window.localStorage.getItem(RESULTS_VISIBLE_COLUMNS_KEY)).toContain("dedupe_key");
  });

  it("hides a visible column and its sort controls, then restores defaults", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("score")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.fields }));
    fireEvent.click(screen.getByLabelText("toggle-column-score"));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "score asc" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.resetColumns }));

    expect(await screen.findByRole("button", { name: "score asc" })).toBeInTheDocument();
  });

  it("restores visible columns from local storage on first render", async () => {
    window.localStorage.setItem(RESULTS_VISIBLE_COLUMNS_KEY, JSON.stringify(["title", "level", "created_at_x"]));
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("title")).toBeInTheDocument();
    });

    expect(screen.getByText("level")).toBeInTheDocument();
    expect(screen.getByText("created_at_x")).toBeInTheDocument();
    expect(screen.queryByText("summary_zh")).not.toBeInTheDocument();
    expect(screen.queryByText("source_url")).not.toBeInTheDocument();
    expect(screen.queryByText("score")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "score asc" })).not.toBeInTheDocument();
  });

  it("requests server-side sorting when a visible sort control is clicked", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenCalledTimes(1);
    });

    listItemsMock.mockClear();
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    fireEvent.click(screen.getByRole("button", { name: "score asc" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: "score", sort_dir: "asc" }),
      );
    });
  });

  it("re-renders rows when sorted data comes back in a new order", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1, { score: 90, title: "Item 1" }), makeItem(2, { score: 80, title: "Item 2" })], 2))
      .mockResolvedValueOnce(makePage([makeItem(2, { score: 80, title: "Item 2" }), makeItem(1, { score: 90, title: "Item 1" })], 2));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    const getTitleOrder = () =>
      screen
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? "")
        .filter((text) => text === "Item 1" || text === "Item 2");

    expect(getTitleOrder()).toEqual(["Item 1", "Item 2"]);

    fireEvent.click(screen.getByRole("button", { name: "score asc" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort_by: "score", sort_dir: "asc" }),
      );
      expect(getTitleOrder()).toEqual(["Item 2", "Item 1"]);
    });
  });

  it("shows pagination info and loads the requested page", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    const secondPageItems = Array.from({ length: 32 }, (_, index) => makeItem(index + 101));
    listItemsMock
      .mockResolvedValueOnce(makePage(firstPageItems, 132, 1))
      .mockResolvedValueOnce(makePage(secondPageItems, 132, 2));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    expect(screen.getByText("loaded=100")).toBeInTheDocument();
    expect(screen.getByText("total=132")).toBeInTheDocument();
    expect(screen.getByText("page=1/2")).toBeInTheDocument();
    expect(screen.getByText("共 132 条")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 100, sort_by: "id", sort_dir: "desc" }),
      );
      expect(screen.getByText("Item 101")).toBeInTheDocument();
    });

    expect(screen.getByText("loaded=32")).toBeInTheDocument();
    expect(screen.getByText("page=2/2")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
  });

  it("offers a select-all-matching action after selecting the whole page", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    listItemsMock.mockResolvedValue(makePage(firstPageItems, 132, 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));

    expect(screen.getByText("selected=100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "select-all-matching" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));

    expect(screen.getByText("selected=132")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "clear-selection" })).toBeInTheDocument();
  });

  it("keeps all-matching selection across pages", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    const secondPageItems = Array.from({ length: 32 }, (_, index) => makeItem(index + 101));
    listItemsMock
      .mockResolvedValueOnce(makePage(firstPageItems, 132, 1))
      .mockResolvedValueOnce(makePage(secondPageItems, 132, 2));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(screen.getByText("Item 101")).toBeInTheDocument();
    });

    expect(screen.getByText("selected=132")).toBeInTheDocument();
    expect(screen.getByLabelText("select-item-101")).toBeChecked();
  });

  it("resets to page 1 and clears all-matching selection when refreshing a new keyword", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    const secondPageItems = Array.from({ length: 32 }, (_, index) => makeItem(index + 101));
    listItemsMock
      .mockResolvedValueOnce(makePage(firstPageItems, 132, 1))
      .mockResolvedValueOnce(makePage(secondPageItems, 132, 2))
      .mockResolvedValueOnce(makePage([makeItem(999, { title: "Alpha 999" })], 1, 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(screen.getByText("Item 101")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(TEXT.keywordLabel), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.refresh }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, page_size: 100, keyword: "alpha" }),
      );
      expect(screen.getByText("Alpha 999")).toBeInTheDocument();
    });

    expect(screen.getByText("selected=0")).toBeInTheDocument();
    expect(screen.getByText("page=1/1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "clear-selection" })).not.toBeInTheDocument();
  });

  it("deletes selected rows in batch and refreshes the list", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1), makeItem(2)], 2))
      .mockResolvedValueOnce(makePage([], 0, 1));
    deleteItemsMock.mockResolvedValue({ ids: [1, 2], deleted: 2 });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: TEXT.batchDelete }));

    await waitFor(() => {
      expect(deleteItemsMock).toHaveBeenCalledWith([1, 2]);
    });

    expect(await screen.findByText("已删除 2 条记录")).toBeInTheDocument();
  });

  it("deletes all matching results when that selection mode is active", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    listItemsMock
      .mockResolvedValueOnce(makePage(firstPageItems, 132, 1))
      .mockResolvedValueOnce(makePage([], 0, 1));
    deleteItemsMock.mockResolvedValue({ ids: [], deleted: 132 });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: TEXT.batchDelete }));

    await waitFor(() => {
      expect(deleteItemsMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "all_matching" }));
    });

    expect(await screen.findByText("已删除 132 条记录")).toBeInTheDocument();
  });

  it("deletes a single row from the action column", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(7)], 1))
      .mockResolvedValueOnce(makePage([], 0, 1));
    deleteItemMock.mockResolvedValue({ id: 7, deleted: 1 });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 7")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "delete-item-7" }));

    await waitFor(() => {
      expect(deleteItemMock).toHaveBeenCalledWith(7);
    });

    expect(await screen.findByText("已删除记录 #7")).toBeInTheDocument();
  });

  it("runs full-table dedupe and shows the summary", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(3)], 1))
      .mockResolvedValueOnce(makePage([makeItem(3)], 1));
    dedupeItemsMock.mockResolvedValue({
      groups: 2,
      deleted: 3,
      kept: 2,
      rows_before: 10,
      rows_after: 7,
    });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Item 3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.dedupe }));

    await waitFor(() => {
      expect(dedupeItemsMock).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText("去重完成：2 组重复，删除 3 条，保留 2 条"),
    ).toBeInTheDocument();
  });
});
