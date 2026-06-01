import { JobsPageLayout } from "./JobsPageLayout";
import { useJobsPageState } from "./useJobsPageState";

export function JobsPageContent() {
  const state = useJobsPageState();

  return <JobsPageLayout state={state} />;
}
