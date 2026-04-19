import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const RESULTS_COLUMN_WIDTHS_KEY = "results.columnWidths.v1";

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


function makeRawItem(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    run_id: 200 + id,
    tweet_id: `${9000 + id}`,
    canonical_url: `https://x.com/i/status/${9000 + id}`,
    author: `raw-author-${id}`,
    text: `Raw text ${id}`,
    created_at_x: "2026-04-13T00:49:06+00:00",
    views: 100 + id,
    likes: 10 + id,
    replies: 2 + id,
    retweets: 1 + id,
    query_name: `manual:${id}`,
    fetched_at: "2026-04-13T01:00:00+00:00",
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

  it("renders the results workbench structure with header, filter layer, manager layer, and main workspace", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-page-header")).toBeInTheDocument();
    });

    expect(screen.getByTestId("results-page")).not.toHaveClass("card");
    expect(screen.getByTestId("results-page-header")).toHaveClass("workbench-page-header");
    expect(screen.getByTestId("results-filter-layer")).toHaveClass("workbench-layer");
    expect(screen.getByTestId("results-filter-summary-panel")).toHaveClass("workbench-summary-panel");
    expect(screen.getByTestId("results-filter-toolbar-shell")).toHaveClass("workbench-subsurface");
    expect(screen.getByTestId("results-manager-layer")).toHaveClass("workbench-layer");
    expect(screen.getByTestId("results-manager-toolbar-shell")).toHaveClass("workbench-subsurface");
    expect(screen.getByTestId("results-main-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("results-table-pane")).toBeInTheDocument();
    expect(screen.getByTestId("results-table-headband")).toBeInTheDocument();
    expect(screen.getByTestId("results-detail-rail")).toHaveClass("workbench-layer");
    expect(screen.getByTestId("results-table-status")).toBeInTheDocument();
    expect(screen.getByTestId("results-filter-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("results-manager-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("results-manager-summary-panel")).toHaveClass("workbench-summary-panel");
    expect(screen.getByRole("button", { name: TEXT.refresh })).toHaveClass("workbench-primary-action");
    expect(screen.getByRole("button", { name: TEXT.fields })).toHaveClass("workbench-secondary-action");
    expect(screen.getByRole("button", { name: TEXT.resetColumns })).toHaveClass("workbench-secondary-action");
    expect(screen.getByRole("button", { name: TEXT.dedupe })).toHaveClass("workbench-secondary-action");
    expect(screen.getByRole("button", { name: TEXT.batchDelete })).toHaveClass("workbench-danger-action");
    expect(screen.getByText("当前结果表")).toBeInTheDocument();
    expect(screen.getByText("当前浏览范围")).toBeInTheDocument();
    expect(screen.getByText("表格管理")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: TEXT.fields }));
    const fieldMenu = screen.getByTestId("results-field-menu");
    const fieldPicker = screen.getByRole("button", { name: TEXT.fields }).closest(".results-field-picker");
    expect(fieldMenu).toBeInTheDocument();
    expect(fieldPicker).toContainElement(fieldMenu);
    expect(screen.getByText("列显示")).toBeInTheDocument();
  });

  it("loads the first curated row into the detail rail, then follows row switching", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1), makeItem(2)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-detail-rail")).toBeInTheDocument();
    });

    const detailRail = screen.getByTestId("results-detail-rail");
    await waitFor(() => {
      expect(within(detailRail).getByText("Summary 1")).toBeInTheDocument();
    });
    expect(within(detailRail).getByText(/author-1/)).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1").closest("tr")).toHaveAttribute("data-row-active", "true");

    const row = within(screen.getByTestId("results-table-pane")).getByText("Item 2").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    await waitFor(() => {
      expect(within(detailRail).getByText("Summary 2")).toBeInTheDocument();
    });
    const sectionTitles = detailRail.querySelectorAll(".results-detail-section-title");
    const summaryHeading = sectionTitles[0];
    const cluesHeading = sectionTitles[1];
    const infoHeading = sectionTitles[2];
    expect(summaryHeading).toBeTruthy();
    expect(cluesHeading).toBeTruthy();
    expect(infoHeading).toBeTruthy();
    expect(summaryHeading.compareDocumentPosition(cluesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cluesHeading.compareDocumentPosition(infoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailRail.querySelector(".results-detail-hero")).toHaveClass("workbench-summary-panel");
    expect(detailRail.querySelector(".results-detail-fact-grid")).toHaveClass("workbench-summary-grid");
    expect(within(detailRail).queryByTestId("results-detail-context-grid")).not.toBeInTheDocument();
    expect(within(detailRail).getByTestId("results-detail-hero")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByTestId("results-detail-summary-section")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByTestId("results-detail-clues-section")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByTestId("results-detail-info-section")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByText(/author-2/)).toBeInTheDocument();
    expect(within(detailRail).getByText(/rule-2/)).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("Item 2").closest("tr")).toHaveAttribute("data-row-active", "true");
  });

  it("shows a contextual empty-state rail when the current table has no rows", async () => {
    listItemsMock.mockResolvedValue(makePage([], 0));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("\u6682\u65e0\u7ed3\u679c\u8bb0\u5f55")).toBeInTheDocument();
    });

    const detailRail = screen.getByTestId("results-detail-rail");

    expect(within(detailRail).getByText("\u5f53\u524d\u8868\u6682\u65e0\u8bb0\u5f55")).toBeInTheDocument();
    expect(within(detailRail).queryByTestId("results-detail-context-grid")).not.toBeInTheDocument();
    expect(within(detailRail).getByText("\u4e0b\u4e00\u6b65\u5efa\u8bae")).toBeInTheDocument();
  });

  it("renders detail content after selecting a row checkbox", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1), makeItem(2)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("select-item-2")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("select-item-2"));

    const detailRail = screen.getByTestId("results-detail-rail");
    await waitFor(() => {
      expect(within(detailRail).getByText("Summary 2")).toBeInTheDocument();
    });
    expect(within(detailRail).getByText(/author-2/)).toBeInTheDocument();
  });

  it("keeps the detail hero compact while preserving primary record cues", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    const detailRail = screen.getByTestId("results-detail-rail");

    await waitFor(() => {
      expect(within(detailRail).getByText("Summary 1")).toBeInTheDocument();
    });

    expect(within(detailRail).getByTestId("results-detail-hero-pills")).toHaveClass("workbench-pill-row");
    expect(within(detailRail).queryByTestId("results-detail-context-grid")).not.toBeInTheDocument();
    expect(within(detailRail).getByText(/author-1/)).toBeInTheDocument();
    expect(within(detailRail).getByText("\u7b5b\u9009\u7ed3\u679c")).toBeInTheDocument();
  });

  it("keeps table browsing controls in the filter layer and table actions in the manager layer", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-filter-layer")).toBeInTheDocument();
      expect(screen.getByTestId("results-manager-layer")).toBeInTheDocument();
    });

    const filter = screen.getByTestId("results-filter-layer");
    const manager = screen.getByTestId("results-manager-layer");
    const filterSummaryPanel = within(filter).getByTestId("results-filter-summary-panel");
    const filterToolbarShell = within(filter).getByTestId("results-filter-toolbar-shell");
    const filterToolbar = within(filterToolbarShell).getByTestId("results-filter-toolbar");
    const filterBrowse = within(filterToolbar).getByTestId("results-filter-browse");
    const filterPrimary = within(filterToolbar).getByTestId("results-filter-primary");
    const managerToolbarShell = within(manager).getByTestId("results-manager-toolbar-shell");
    const managerToolbar = within(managerToolbarShell).getByTestId("results-manager-toolbar");
    const managerViewActions = within(managerToolbar).getByTestId("results-manager-view-actions");
    const managerDataActions = within(managerToolbar).getByTestId("results-manager-data-actions");

    expect(within(filterBrowse).getByRole("tablist", { name: "results-table-switcher" })).toBeInTheDocument();
    expect(within(filterPrimary).getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
    expect(within(filterSummaryPanel).getByTestId("results-filter-summary")).toBeInTheDocument();
    expect(within(managerViewActions).getAllByRole("button").map((button) => button.textContent)).toEqual(["字段", "恢复默认"]);
    expect(within(managerDataActions).getAllByRole("button").map((button) => button.textContent)).toEqual(["批量删除", "全表去重"]);
    expect(within(manager).queryByLabelText(TEXT.keywordLabel)).not.toBeInTheDocument();
    expect(within(filterBrowse).getByLabelText(TEXT.keywordLabel)).toBeInTheDocument();
    expect(within(filterSummaryPanel).getByText("\u5f53\u524d\u8868\uff1a\u7b5b\u9009\u7ed3\u679c")).toBeInTheDocument();
    expect(within(filterSummaryPanel).getByText("\u5173\u952e\u8bcd\uff1a\u5168\u90e8")).toBeInTheDocument();
    expect(within(manager).queryByText("\u5f53\u524d\u8868\uff1a\u7b5b\u9009\u7ed3\u679c")).not.toBeInTheDocument();
    expect(within(manager).getByText("共 1 条")).toBeInTheDocument();
    expect(within(manager).getByText("已选 0 条")).toBeInTheDocument();
  });

  it("loads the first raw row into the detail rail after switching tables", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeRawItem(2)], 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(within(screen.getByRole("tablist", { name: "results-table-switcher" })).getAllByRole("button")[1]);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Raw text 2")).toBeInTheDocument();
    });

    const detailRail = screen.getByTestId("results-detail-rail");
    await waitFor(() => {
      expect(within(detailRail).getByText("Raw text 2")).toBeInTheDocument();
    });
    const sectionTitles = detailRail.querySelectorAll(".results-detail-section-title");
    const bodyHeading = sectionTitles[0];
    const collectHeading = sectionTitles[1];
    expect(bodyHeading).toBeTruthy();
    expect(collectHeading).toBeTruthy();
    expect(bodyHeading.compareDocumentPosition(collectHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailRail.querySelector(".results-detail-hero")).toHaveClass("workbench-summary-panel");
    expect(detailRail.querySelector(".results-detail-fact-grid")).toHaveClass("workbench-summary-grid");
    expect(within(detailRail).queryByTestId("results-detail-context-grid")).not.toBeInTheDocument();
    expect(within(detailRail).getByTestId("results-detail-hero")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByTestId("results-detail-collect-section")).toHaveClass("results-detail-card");
    expect(within(detailRail).getByTestId("results-detail-metrics-section")).toHaveClass("results-detail-card");
    expect(within(detailRail).getAllByText("raw-author-2").length).toBeGreaterThan(0);
    expect(within(detailRail).getByText("102")).toBeInTheDocument();
    expect(within(detailRail).getByText("manual:2")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("Raw text 2").closest("tr")).toHaveAttribute("data-row-active", "true");
  });

  it("renders default business columns and utc+8 timestamps", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(TEXT.title)).toBeInTheDocument();
    });

    expect(listItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 100, sort_by: "id", sort_dir: "desc", table: "curated" }),
    );
    expect(screen.getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.batchDelete })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.dedupe })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.fields })).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("summary_zh")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("author")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("created_at_x")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).queryByText("dedupe_key")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).queryByText("reasons_json")).not.toBeInTheDocument();
    const scoreAscButton = screen.getByRole("button", { name: "score asc" });
    const scoreDescButton = screen.getByRole("button", { name: "score desc" });
    expect(scoreAscButton).toBeInTheDocument();
    expect(scoreDescButton).toBeInTheDocument();
    expect(scoreAscButton.parentElement).toHaveClass("results-sort-controls-inline");
    expect(screen.queryByText("ASC")).not.toBeInTheDocument();
    expect(screen.queryByText("DESC")).not.toBeInTheDocument();
    expect(scoreAscButton).toHaveTextContent("↑");
    expect(scoreDescButton).toHaveTextContent("↓");
    expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1").closest(".results-cell-content")).toHaveClass("results-cell-content-text");
    expect(within(screen.getByTestId("results-table-pane")).getByText("Summary 1").closest(".results-cell-content")).toHaveClass("results-cell-content-text");
    expect(screen.getByRole("link", { name: "https://x.com/demo/status/1" }).closest(".results-cell-content")).toHaveClass("results-cell-content-link");
    expect(screen.queryByRole("button", { name: "dedupe_key asc" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("2026-04-13 08:49:06 UTC+8")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://x.com/demo/status/1" })).toHaveAttribute(
      "href",
      "https://x.com/demo/status/1",
    );
  });

  it("shows a hidden column after checking it in the field dropdown", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.fields }));
    fireEvent.click(screen.getByLabelText("toggle-column-dedupe_key"));

    expect(await screen.findByRole("button", { name: "dedupe_key asc" })).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("dedupe-1")).toBeInTheDocument();
    expect(window.localStorage.getItem(RESULTS_VISIBLE_COLUMNS_KEY)).toContain("dedupe_key");
  });

  it("hides a visible column and its sort controls, then restores defaults", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("score")).toBeInTheDocument();
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    });

    expect(within(screen.getByTestId("results-table-pane")).getByText("level")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).getByText("created_at_x")).toBeInTheDocument();
    expect(screen.queryByText("summary_zh")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).queryByText("source_url")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-pane")).queryByText("score")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "score asc" })).not.toBeInTheDocument();
  });

  it("uses default column widths before any resize override exists", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    });

    const titleHeader = within(screen.getByTestId("results-table-pane")).getByText("title").closest("th");
    expect(titleHeader).toHaveStyle({ width: "220px" });
  });

  it("resizes a visible column in real time and writes the new width to local storage", async () => {
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    });

    const titleHeader = within(screen.getByTestId("results-table-pane")).getByText("title").closest("th");
    const titleResizer = screen.getByRole("separator", { name: "resize-column-title" });

    fireEvent.mouseDown(titleResizer, { clientX: 220 });
    fireEvent.mouseMove(window, { clientX: 300 });

    expect(titleHeader).toHaveStyle({ width: "300px" });

    fireEvent.mouseUp(window);

    expect(window.localStorage.getItem(RESULTS_COLUMN_WIDTHS_KEY)).toContain("\"title\":300");
  });

  it("restores resized column widths from local storage on first render", async () => {
    window.localStorage.setItem(
      RESULTS_COLUMN_WIDTHS_KEY,
      JSON.stringify({ curated: { title: 320 }, raw: {} }),
    );
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    });

    const titleHeader = within(screen.getByTestId("results-table-pane")).getByText("title").closest("th");
    expect(titleHeader).toHaveStyle({ width: "320px" });
  });

  it("keeps curated and raw column widths separate", async () => {
    window.localStorage.setItem(
      RESULTS_COLUMN_WIDTHS_KEY,
      JSON.stringify({
        curated: { title: 310 },
        raw: { text: 360 },
      }),
    );
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeRawItem(2)], 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("title")).toBeInTheDocument();
    });

    expect(within(screen.getByTestId("results-table-pane")).getByText("title").closest("th")).toHaveStyle({ width: "310px" });

    fireEvent.click(screen.getByRole("button", { name: "原始结果" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("text")).toBeInTheDocument();
    });

    expect(within(screen.getByTestId("results-table-pane")).getByText("text").closest("th")).toHaveStyle({ width: "360px" });
  });

  it("restores a hidden column with its previously saved width", async () => {
    window.localStorage.setItem(
      RESULTS_COLUMN_WIDTHS_KEY,
      JSON.stringify({ curated: { summary_zh: 340 }, raw: {} }),
    );
    listItemsMock.mockResolvedValue(makePage([makeItem(1)]));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("summary_zh")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.fields }));
    fireEvent.click(screen.getByLabelText("toggle-column-summary_zh"));

    await waitFor(() => {
      expect(within(screen.getByRole("table")).queryByText("summary_zh")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("toggle-column-summary_zh"));

    const summaryHeader = await within(screen.getByRole("table")).findByText("summary_zh");
    expect(summaryHeader.closest("th")).toHaveStyle({ width: "340px" });
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
        expect.objectContaining({ sort_by: "score", sort_dir: "asc", table: "curated" }),
      );
    });
  });

  it("re-renders rows when sorted data comes back in a new order", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1, { score: 90, title: "Item 1" }), makeItem(2, { score: 80, title: "Item 2" })], 2))
      .mockResolvedValueOnce(makePage([makeItem(2, { score: 80, title: "Item 2" }), makeItem(1, { score: 90, title: "Item 1" })], 2));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
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
        expect.objectContaining({ sort_by: "score", sort_dir: "asc", table: "curated" }),
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    const tableStatus = screen.getByTestId("results-table-status");
    expect(within(tableStatus).getByText("\u5f53\u524d\u7b2c 1 / 2 \u9875")).toBeInTheDocument();
    expect(within(tableStatus).getByText("\u672c\u9875 100 \u6761")).toBeInTheDocument();
    expect(within(tableStatus).getByText("\u672c\u9875\u5df2\u9009 0 \u6761")).toBeInTheDocument();
    expect(within(tableStatus).getByText("\u6392\u5e8f\uff1aid \u00b7 \u964d\u5e8f")).toBeInTheDocument();
    expect(within(tableStatus).getByText("\u6bcf\u9875 100 \u6761")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-manager-layer")).getByText("共 132 条")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-filter-summary")).getByText("\u5f53\u524d\u8868\uff1a\u7b5b\u9009\u7ed3\u679c")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(screen.getByTestId("results-pagination")).toHaveClass("workbench-subsurface");
    expect(
      screen.getByTestId("results-pagination").compareDocumentPosition(screen.getByTestId("results-table-wrap")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "results-prev-page" })).toHaveClass("workbench-secondary-action");
    expect(screen.getByRole("button", { name: "results-next-page" })).toHaveClass("workbench-secondary-action");

    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 100, sort_by: "id", sort_dir: "desc", table: "curated" }),
      );
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 101")).toBeInTheDocument();
    });

    expect(within(screen.getByTestId("results-table-status")).getByText("\u5f53\u524d\u7b2c 2 / 2 \u9875")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-status")).getByText("\u672c\u9875 32 \u6761")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
  });

  it("offers a select-all-matching action after selecting the whole page", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) => makeItem(index + 1));
    listItemsMock.mockResolvedValue(makePage(firstPageItems, 132, 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));

    expect(screen.getByText("已选 100 条")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "select-all-matching" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));

    expect(screen.getByText("已选 132 条")).toBeInTheDocument();
    expect(screen.getByText("已选全部匹配结果")).toBeInTheDocument();
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 101")).toBeInTheDocument();
    });

    expect(screen.getByText("已选 132 条")).toBeInTheDocument();
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: "results-next-page" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 101")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(TEXT.keywordLabel), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.refresh }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, page_size: 100, keyword: "alpha", table: "curated" }),
      );
      expect(within(screen.getByTestId("results-table-pane")).getByText("Alpha 999")).toBeInTheDocument();
    });

    expect(screen.getByText("已选 0 条")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-table-status")).getByText("\u5f53\u524d\u7b2c 1 / 1 \u9875")).toBeInTheDocument();
    expect(within(screen.getByTestId("results-filter-summary")).getByText("\u5173\u952e\u8bcd\uff1aalpha")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "clear-selection" })).not.toBeInTheDocument();
  });

  it("deletes selected rows in batch and refreshes the list", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1), makeItem(2)], 2))
      .mockResolvedValueOnce(makePage([], 0, 1));
    deleteItemsMock.mockResolvedValue({ ids: [1, 2], deleted: 2 });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: TEXT.batchDelete }));

    await waitFor(() => {
      expect(deleteItemsMock).toHaveBeenCalledWith({ ids: [1, 2], table: "curated" });
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "select-all-matching" }));
    fireEvent.click(screen.getByRole("button", { name: TEXT.batchDelete }));

    await waitFor(() => {
      expect(deleteItemsMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "all_matching", table: "curated" }));
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 7")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "delete-item-7" })).toHaveClass("workbench-danger-action");
    fireEvent.click(screen.getByRole("button", { name: "delete-item-7" }));

    await waitFor(() => {
      expect(deleteItemMock).toHaveBeenCalledWith(7, "curated");
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
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.dedupe }));

    await waitFor(() => {
      expect(dedupeItemsMock).toHaveBeenCalledWith({ table: "curated" });
    });

    expect(
      await screen.findByText("去重完成：2 组重复，删除 3 条，保留 2 条"),
    ).toBeInTheDocument();
  });


  it("switches to raw table and loads raw columns", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeRawItem(2)], 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "原始结果" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, page_size: 100, sort_by: "id", sort_dir: "desc", table: "raw" }),
      );
      expect(within(screen.getByTestId("results-table-pane")).getByText("tweet_id")).toBeInTheDocument();
      expect(within(screen.getByTestId("results-table-pane")).getByText("text")).toBeInTheDocument();
      expect(within(screen.getByTestId("results-table-pane")).getByText("views")).toBeInTheDocument();
      expect(within(screen.getByTestId("results-table-pane")).getByText("Raw text 2")).toBeInTheDocument();
    });

    expect(screen.queryByText("summary_zh")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("results-filter-summary")).getByText("\u5f53\u524d\u8868\uff1a\u539f\u59cb\u7ed3\u679c")).toBeInTheDocument();
  });

  it("clears selection and falls back invalid sort and columns when switching tables", async () => {
    window.localStorage.setItem(RESULTS_VISIBLE_COLUMNS_KEY, JSON.stringify(["title", "summary_zh"]));
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeRawItem(2)], 1));

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "title asc" }));
    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort_by: "title", sort_dir: "asc", table: "curated" }),
      );
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: "原始结果" }));

    await waitFor(() => {
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort_by: "id", sort_dir: "desc", table: "raw" }),
      );
      expect(within(screen.getByTestId("results-filter-summary")).getByText("\u5f53\u524d\u8868\uff1a\u539f\u59cb\u7ed3\u679c")).toBeInTheDocument();
      expect(screen.getByText("已选 0 条")).toBeInTheDocument();
      expect(within(screen.getByTestId("results-table-pane")).getByText("author")).toBeInTheDocument();
      expect(within(screen.getByTestId("results-table-pane")).queryByText("title")).not.toBeInTheDocument();
    });
  });

  it("passes raw table to delete and dedupe actions", async () => {
    listItemsMock
      .mockResolvedValueOnce(makePage([makeItem(1)], 1))
      .mockResolvedValueOnce(makePage([makeRawItem(3), makeRawItem(4)], 2))
      .mockResolvedValueOnce(makePage([makeRawItem(3), makeRawItem(4)], 2))
      .mockResolvedValueOnce(makePage([], 0, 1));
    deleteItemsMock.mockResolvedValue({ ids: [3, 4], deleted: 2 });
    dedupeItemsMock.mockResolvedValue({ groups: 1, deleted: 1, kept: 1, rows_before: 2, rows_after: 1 });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Item 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "原始结果" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("results-table-pane")).getByText("Raw text 3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: TEXT.dedupe }));
    await waitFor(() => {
      expect(dedupeItemsMock).toHaveBeenCalledWith({ table: "raw" });
    });

    fireEvent.click(screen.getByLabelText(TEXT.selectPage));
    fireEvent.click(screen.getByRole("button", { name: TEXT.batchDelete }));

    await waitFor(() => {
      expect(deleteItemsMock).toHaveBeenCalledWith({ ids: [3, 4], table: "raw" });
    });
  });
});
