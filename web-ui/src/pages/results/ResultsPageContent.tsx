import { ResultsControlLayer } from "./ResultsControlLayer";
import { ResultsPageHeader } from "./ResultsPageHeader";
import { ResultsWorkspace } from "./ResultsWorkspace";
import { useResultsPageState } from "./useResultsPageState";

export function ResultsPageContent() {
  const state = useResultsPageState();

  return (
    <div className="results-page" data-testid="results-page">
      <ResultsPageHeader title={state.TEXT.title} />
      <ResultsControlLayer state={state} />
      <ResultsWorkspace state={state} />
    </div>
  );
}
