type ResultsPageHeaderProps = {
  title: string;
};

export function ResultsPageHeader({ title }: ResultsPageHeaderProps) {
  return (
    <section className="results-page-header workbench-page-header" data-testid="results-page-header">
      <div className="results-page-header-copy workbench-page-header-copy">
        <h3>{title}</h3>
      </div>
    </section>
  );
}
