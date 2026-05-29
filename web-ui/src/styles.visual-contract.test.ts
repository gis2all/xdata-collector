import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

const flatWorkbenchFiles = [
  "src/components/SearchSpecEditor.tsx",
  "src/components/RuleSetEditor.tsx",
  "src/pages/DashboardPage.tsx",
  "src/pages/ManualSearchPage.tsx",
  "src/pages/JobsPage.tsx",
  "src/pages/ResultsPage.tsx",
  "src/pages/results/ResultsTableManager.tsx",
  "src/pages/results/ResultsDetailRail.tsx",
  "src/pages/LogsPage.tsx",
  "src/pages/SettingsPage.tsx",
];

function blockFor(selector: string) {
  const start = styles.lastIndexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }
  const end = styles.indexOf("}", start);
  return styles.slice(start, end + 1);
}

function exactBlockFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
  if (!match) {
    throw new Error(`Missing exact CSS selector: ${selector}`);
  }
  return match[0];
}

function selectorsWithProperty(property: string) {
  const matches = Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g));
  return matches
    .filter(([, , body]) => body.includes(`${property}:`))
    .map(([, selector]) => selector.trim().replace(/\s+/g, " "));
}

function lastBlockContainingSelector(selector: string) {
  const matches = Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g));
  const normalizedSelector = selector.trim();
  const match = matches
    .filter(([, selectorList]) =>
      selectorList
        .split(",")
        .map((item) => item.trim().replace(/\s+/g, " "))
        .includes(normalizedSelector),
    )
    .at(-1);
  if (!match) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }
  return `${match[1]}{${match[2]}}`;
}

function blocksContainingSelector(selector: string) {
  const normalizedSelector = selector.trim();
  return Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter(([, selectorList]) =>
      selectorList
        .split(",")
        .map((item) => item.trim().replace(/\s+/g, " "))
        .includes(normalizedSelector),
    )
    .map(([block]) => block);
}

describe("visual contract", () => {
  it("does not use gradients or rounded chrome", () => {
    expect(styles).not.toMatch(/(?:linear|radial)-gradient/);
    const roundedChrome = Array.from(styles.matchAll(/([^{}]+)\{([^{}]*border-radius:\s*([^;]+);[^{}]*)\}/g))
      .filter(([, selectorList, , value]) => value.trim() !== "0" && !selectorList.includes(".tag-pill"));
    expect(roundedChrome).toEqual([]);
  });

  it("keeps primary workbench surfaces square and low chrome", () => {
    const compactSelectors = [
      ".card",
      ".workbench-page-header",
      ".workbench-summary-panel",
      ".workbench-subsurface",
      ".workbench-table-shell",
      ".results-table-pane",
      ".results-detail-rail",
    ];

    for (const selector of compactSelectors) {
      expect(blockFor(selector)).not.toMatch(/border-radius:\s*(1[0-9]|[2-9][0-9])px/);
    }
  });

  it("keeps legacy shell aliases visually inert when retained for compatibility", () => {
    for (const selector of [".workbench-summary-panel", ".workbench-subsurface", ".collector-card"]) {
      const block = lastBlockContainingSelector(selector);
      expect(block).toContain("border: 0;");
      expect(block).toContain("box-shadow: none;");
      expect(block).toContain("border-radius: 0;");
    }
  });

  it("keeps large workbench surfaces borderless so data lines carry the structure", () => {
    for (const selector of [
      ".workbench-page-header",
      ".workbench-layer",
      ".manual-section-card",
      ".jobs-list-tools",
      ".jobs-empty-workspace",
      ".logs-section",
      ".settings-summary",
      ".settings-actions",
      ".settings-editor-section",
      ".results-control-layer",
      ".results-filter-layer",
      ".results-manager-layer",
      ".results-table-pane",
      ".results-detail-rail",
    ]) {
      expect(lastBlockContainingSelector(selector)).toContain("border: 0;");
    }
  });

  it("uses a rail indicator for active navigation instead of a rounded block", () => {
    expect(styles).toContain(".app-shell .sidebar .nav-item.active::before");
    expect(blockFor(".app-shell .sidebar .nav-item.active")).not.toContain("background: #dbeafe");
  });

  it("defines flat primitives instead of page-internal card shells", () => {
    for (const selector of [".flat-section", ".flat-meta-strip", ".flat-row-list", ".flat-row", ".flat-actions"]) {
      expect(blockFor(selector)).toBeTruthy();
      expect(blockFor(selector)).not.toMatch(/border-radius:\s*(1[0-9]|[2-9][0-9])px/);
    }
  });

  it("keeps flat primitives free of decorative outer dividers", () => {
    for (const selector of [".flat-section", ".flat-meta-strip", ".flat-actions", ".flat-row-list"]) {
      expect(blockFor(selector)).not.toContain("border-top:");
      expect(blockFor(selector)).not.toContain("border-bottom:");
    }
  });

  it("keeps row dividers data-only and avoids trailing row lines", () => {
    expect(blockFor(".flat-row")).not.toContain("border-top:");
    expect(blockFor(".flat-row")).not.toContain("border-bottom:");
    expect(blockFor(".flat-row:not(:last-child)")).toContain("border-bottom:");
  });

  it("separates interactive secondary actions from passive status pills", () => {
    expect(exactBlockFor(".workbench-secondary-action")).toContain("min-height: 40px;");
    expect(exactBlockFor(".workbench-secondary-action")).toContain("font-weight: 700;");
    expect(exactBlockFor(".workbench-secondary-action")).toContain("background: #edf4ff;");
    expect(exactBlockFor(".workbench-pill")).toContain("min-height: 28px;");
    expect(exactBlockFor(".workbench-pill")).toContain("font-weight: 600;");
    expect(exactBlockFor(".workbench-pill")).toContain("background: #f8fafc;");
    expect(exactBlockFor(".workbench-pill")).not.toContain("background: #edf4ff;");
  });

  it("does not mix action semantics on the same element", () => {
    for (const file of flatWorkbenchFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} should not mix ghost and workbench secondary classes`).not.toContain("ghost workbench-secondary-action");
      expect(source, `${file} should not mix generic danger and workbench danger classes`).not.toContain("danger workbench-danger-action");
    }
  });

  it("limits horizontal divider lines to data scanning surfaces", () => {
    expect(selectorsWithProperty("border-top")).toEqual([]);
    expect(selectorsWithProperty("border-bottom")).toEqual([
      ".table th, .table td",
      ".results-table th",
      ".flat-row:not(:last-child)",
    ]);
  });

  it("keeps table shells as the main allowed full-border data containers", () => {
    for (const selector of [".workbench-table-shell", ".jobs-table-card", ".results-table-wrap"]) {
      expect(blocksContainingSelector(selector).some((block) => block.includes("border: 1px solid"))).toBe(true);
    }
  });

  it("keeps the Jobs table readable beside the detail rail", () => {
    expect(blocksContainingSelector(".jobs-layout").some((block) => block.includes("minmax(320px, 320px)"))).toBe(true);
    expect(blocksContainingSelector(".jobs-layout").some((block) => block.includes("20px"))).toBe(true);
    expect(blocksContainingSelector(".jobs-layout").some((block) => block.includes("align-items: stretch;"))).toBe(true);
    expect(blockFor(".jobs-table")).toContain("min-width: 900px;");
    expect(blockFor(".jobs-table")).not.toContain("table-layout: fixed;");
    expect(styles).not.toContain(".jobs-row-actions-stack");
  });

  it("keeps the Jobs empty workspace shell flat and sticky", () => {
    expect(blockFor(".jobs-empty-shell")).toContain("background: #ffffff;");
    expect(blockFor(".jobs-empty-shell")).toContain("border-radius: 0;");
    expect(blockFor(".jobs-empty-shell")).toContain("box-shadow: none;");
    expect(blockFor(".jobs-empty-workspace")).toContain("background: transparent;");
    expect(blockFor(".jobs-empty-workspace")).toContain("flex: 1 1 auto;");
    expect(blocksContainingSelector(".jobs-drawer").some((block) => block.includes("position: sticky;"))).toBe(true);
    expect(blocksContainingSelector(".jobs-drawer").some((block) => block.includes("top: 16px;"))).toBe(true);
  });

  it("keeps the Results workspace split stretchable with a dedicated rail resizer", () => {
    expect(blocksContainingSelector(".results-main-workspace").some((block) => block.includes("minmax(380px, 420px)"))).toBe(true);
    expect(blocksContainingSelector(".results-main-workspace").some((block) => block.includes("20px"))).toBe(true);
    expect(blocksContainingSelector(".results-main-workspace").some((block) => block.includes("align-items: stretch;"))).toBe(true);
    expect(blockFor(".results-resizer")).toContain("cursor: col-resize;");
    expect(blocksContainingSelector(".results-resizer::before").some((block) => block.includes("width: 1px;"))).toBe(true);
  });

  it("keeps jobs table column dividers visible by default like the results table", () => {
    const jobsDivider = blockFor(".jobs-column-resizer::before");
    expect(jobsDivider).toContain("background: #cbd5e1;");
    expect(jobsDivider).toContain("top: 3px;");
    expect(jobsDivider).toContain("bottom: 3px;");
    expect(jobsDivider).toContain("width: 1px;");
  });

  it("hides the jobs table horizontal scrollbar chrome while keeping horizontal scrolling available", () => {
    const jobsWrap = blockFor(".jobs-table-wrap");
    const jobsWrapScrollbar = blockFor(".jobs-table-wrap::-webkit-scrollbar");
    expect(jobsWrap).toContain("overflow-x: auto;");
    expect(jobsWrap).toContain("scrollbar-width: none;");
    expect(jobsWrap).toContain("-ms-overflow-style: none;");
    expect(jobsWrapScrollbar).toContain("display: none;");
  });

  it("keeps the Results control layer aligned to the same horizontal gutter as nearby sections", () => {
    expect(blocksContainingSelector(".results-control-layer").some((block) => block.includes("padding: 12px 18px;"))).toBe(true);
  });

  it("keeps table selection checkboxes consistent in size and left aligned", () => {
    expect(blockFor(".table-select-cell")).toContain("width: 48px;");
    expect(blockFor(".table-select-cell")).toContain("padding-left: 14px;");
    expect(blocksContainingSelector(".table-select-cell > label").some((block) => block.includes("justify-content: flex-start;"))).toBe(true);
    expect(blockFor(".table input[type=\"checkbox\"]")).toContain("width: 16px;");
    expect(blockFor(".table input[type=\"checkbox\"]")).toContain("height: 16px;");
  });

  it("keeps select arrows centered with a custom chevron instead of browser default chrome", () => {
    const selectBlocks = blocksContainingSelector("select");
    expect(selectBlocks.some((block) => block.includes("appearance: none;"))).toBe(true);
    expect(selectBlocks.some((block) => block.includes("background-position: right 14px center;"))).toBe(true);
    expect(selectBlocks.some((block) => block.includes("background-size: 12px 12px;"))).toBe(true);
    expect(blockFor("select:disabled")).toContain("background-repeat: no-repeat;");
    expect(blockFor("select:disabled")).toContain("background-position: right 14px center;");
    expect(blockFor("select::-ms-expand")).toContain("display: none;");
  });

  it("keeps key pages free of nested summary panels and subsurfaces", () => {
    const prohibitedClassNames = [
      "workbench-summary-panel",
      "workbench-subsurface",
      "dashboard-detail-item",
      "collector-card",
      "drawer-section",
      "logs-file-card",
      "results-table-headband",
    ];

    for (const file of flatWorkbenchFiles) {
      const source = readFileSync(file, "utf8");
      const classNameLines = Array.from(source.matchAll(/className="([^"]*)"/g), ([, value]) => value).join("\n");
      for (const className of prohibitedClassNames) {
        expect(classNameLines, `${file} should not use class ${className}`).not.toContain(className);
      }
    }
  });
});
