import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultsPage } from "./ResultsPage";
import { listItems } from "../api";

vi.mock("../api", () => ({
  listItems: vi.fn(),
}));

const listItemsMock = vi.mocked(listItems);

const TEXT = {
  title: "结果浏览",
  placeholder: "输入关键词筛选",
  refresh: "刷新列表",
  author: "作者",
  publishedAt: "发布时间",
} as const;

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders readable chinese labels and utc+8 timestamps", async () => {
    listItemsMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 1,
          title: "BTC breakout",
          level: "A",
          author: "alice",
          created_at_x: "2026-04-13T00:49:06+00:00",
          state: "new",
        },
      ],
    });

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(TEXT.title)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(TEXT.placeholder)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXT.refresh })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: TEXT.author })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: TEXT.publishedAt })).toBeInTheDocument();
    expect(screen.getByText("2026-04-13 08:49:06 UTC+8")).toBeInTheDocument();
  });
});
