import type { ItemTable } from "../../api";

type ResultsPageHeaderProps = {
  title: string;
  subtitle: string;
  curatedLabel: string;
  rawLabel: string;
  refreshLabel: string;
  table: ItemTable;
  loading: boolean;
  onSwitchTable: (table: ItemTable) => void;
  onRefresh: () => void;
};

export function ResultsPageHeader({
  title,
  subtitle,
  curatedLabel,
  rawLabel,
  refreshLabel,
  table,
  loading,
  onSwitchTable,
  onRefresh,
}: ResultsPageHeaderProps) {
  return (
    <section className="results-page-header" data-testid="results-page-header">
      <div className="results-page-header-copy">
        <h3>{title}</h3>
        <div className="kv">{subtitle}</div>
      </div>
      <div className="results-page-header-actions">
        <div className="segmented-control" role="tablist" aria-label="results-table-switcher">
          <button
            type="button"
            className={table === "curated" ? "active" : "ghost"}
            onClick={() => onSwitchTable("curated")}
          >
            {curatedLabel}
          </button>
          <button
            type="button"
            className={table === "raw" ? "active" : "ghost"}
            onClick={() => onSwitchTable("raw")}
          >
            {rawLabel}
          </button>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {refreshLabel}
        </button>
      </div>
    </section>
  );
}
