import { ManualDraftWorkspace } from "./ManualDraftWorkspace";
import { ManualExecutionRail } from "./ManualExecutionRail";
import { ManualResultsSection } from "./ManualResultsSection";
import { ManualSearchPageHeader } from "./ManualSearchPageHeader";
import { useManualSearchPageState } from "./useManualSearchPageState";

export function ManualSearchPageContent() {
  const state = useManualSearchPageState();

  return (
    <div className="collector-workbench manual-page" data-testid="manual-search-page">
      <ManualSearchPageHeader state={state} />

      <div className="manual-layout">
        <ManualDraftWorkspace state={state} />
        <ManualExecutionRail state={state} />
      </div>

      <ManualResultsSection state={state} />
    </div>
  );
}
