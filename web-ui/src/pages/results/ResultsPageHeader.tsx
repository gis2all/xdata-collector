type ResultsPageHeaderProps = {
  title: string;
  subtitle: string;
};

export function ResultsPageHeader({ title, subtitle }: ResultsPageHeaderProps) {
  return (
    <section className="results-page-header" data-testid="results-page-header">
      <div className="results-page-header-copy">
        <h3>{title}</h3>
        <div className="kv">{subtitle}</div>
      </div>
    </section>
  );
}
