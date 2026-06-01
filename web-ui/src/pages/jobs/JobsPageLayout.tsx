import { JobWorkspace } from "./JobWorkspace";
import { JobsListPane } from "./JobsListPane";
import type { UseJobsPageState } from "./useJobsPageState";

type JobsPageLayoutProps = {
  state: UseJobsPageState;
};

export function JobsPageLayout({ state }: JobsPageLayoutProps) {
  const {
    error,
    actionMessage,
    layoutRef,
    isResizing,
    total,
    page,
    totalPages,
    loading,
    queryInput,
    status,
    manageSelectionSummary,
    showSelectAllMatching,
    selectedCount,
    batchActionSpecs,
    selectionWarning,
    jobsTableMinWidth,
    isResizingColumn,
    JOBS_SELECT_COLUMN_WIDTH,
    resolvedJobColumns,
    allPageSelected,
    resizingColumnId,
    jobs,
    activeRunsByJobId,
    selectedJob,
    allMatchingSelected,
    selectedIds,
    setQueryInput,
    submitQuery,
    setStatus,
    clearSelection,
    refreshJobs,
    selectAllMatchingJobs,
    handleBatchAction,
    isBatchActionEnabled,
    togglePageSelection,
    startColumnResize,
    openJobWorkspace,
    toggleRowSelection,
    isSplitLayout,
    handleResizerPointerDown,
    handleResizerMouseDown,
    drawerOpen,
    isCreateWorkspace,
    selectedJobActiveRun,
    workspaceTitle,
    workspaceMeta,
    drawerDisabled,
    currentTaskEyebrow,
    currentTaskHeroTitle,
    currentTaskHeroDescription,
    currentStatusLabel,
    nextRunLabel,
    lastRunLabel,
    lastRunTimeLabel,
    currentTaskPackName,
    currentTaskPackBindingLabel,
    currentTaskPackDraftLabel,
    formTags,
    taskPacks,
    currentTaskPack,
    form,
    taskKeywordCount,
    taskAuthorConstraintCount,
    taskRuleCount,
    taskLevelCount,
    currentRuleSetPreview,
    saving,
    savingPack,
    deletingPack,
    fileInputRef,
    pendingFileActionRef,
    updateForm,
    setForm,
    handleSave,
    handleRestore,
    handlePurge,
    handleRunNow,
    handleStopRun,
    handleToggle,
    handleDelete,
    handleImportPack,
    handleSavePack,
    handleDeleteCurrentPack,
    handleImportPackFile,
    handleImportAndSavePackFile,
    setSelectedJob,
    setDrawerMode,
    resetForm,
    setDrawerOpen,
    openCreate,
  } = state;

  return (
    <div className="jobs-page" data-testid="jobs-page">
      <section className="card jobs-page-header workbench-page-header">
        <div className="workbench-page-header-copy">
          <h3>{"自动任务"}</h3>
          <p className="kv">{"自动任务负责调度，任务正文来自当前绑定任务包。"}</p>
        </div>
        <div className="jobs-page-header-actions workbench-page-header-actions">
          <button type="button" className="workbench-primary-action" data-testid="create-job-button" onClick={openCreate}>{"新建任务"}</button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {actionMessage && <div className="alert success" style={{ whiteSpace: "pre-line" }}>{actionMessage}</div>}

      <div
        ref={layoutRef}
        className={`jobs-layout${isResizing ? " dragging" : ""}`}
        data-testid="jobs-layout"
      >
        <JobsListPane
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          queryInput={queryInput}
          status={status}
          manageSelectionSummary={manageSelectionSummary}
          showSelectAllMatching={showSelectAllMatching}
          selectedCount={selectedCount}
          batchActionSpecs={batchActionSpecs}
          selectionWarning={selectionWarning}
          jobsTableMinWidth={jobsTableMinWidth}
          isResizingColumn={isResizingColumn}
          selectColumnWidth={JOBS_SELECT_COLUMN_WIDTH}
          columns={resolvedJobColumns}
          allPageSelected={allPageSelected}
          resizingColumnId={resizingColumnId}
          jobs={jobs}
          activeRunsByJobId={activeRunsByJobId}
          selectedJobId={selectedJob?.id ?? null}
          allMatchingSelected={allMatchingSelected}
          selectedIds={selectedIds}
          onQueryInputChange={setQueryInput}
          onSubmitQuery={submitQuery}
          onStatusChange={(nextStatus) => {
            setStatus(nextStatus);
            clearSelection();
            void refreshJobs({ page: 1, status: nextStatus });
          }}
          onSelectAllMatching={selectAllMatchingJobs}
          onClearSelection={clearSelection}
          onBatchAction={(action) => {
            void handleBatchAction(action);
          }}
          isBatchActionEnabled={isBatchActionEnabled}
          onPageChange={(nextPage) => {
            void refreshJobs({ page: nextPage });
          }}
          onTogglePageSelection={togglePageSelection}
          onStartColumnResize={startColumnResize}
          onOpenJobWorkspace={openJobWorkspace}
          onToggleRowSelection={toggleRowSelection}
        />

        {isSplitLayout && (
          <div
            className={`jobs-resizer${isResizing ? " dragging" : ""}`}
            data-testid="jobs-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整区域宽度"
            onPointerDown={handleResizerPointerDown}
            onMouseDown={handleResizerMouseDown}
          />
        )}

        <JobWorkspace
          drawerOpen={drawerOpen}
          isCreateWorkspace={isCreateWorkspace}
          selectedJob={selectedJob}
          selectedJobActiveRun={selectedJobActiveRun}
          workspaceTitle={workspaceTitle}
          workspaceMeta={workspaceMeta}
          drawerDisabled={drawerDisabled}
          currentTaskEyebrow={currentTaskEyebrow}
          currentTaskHeroTitle={currentTaskHeroTitle}
          currentTaskHeroDescription={currentTaskHeroDescription}
          currentStatusLabel={currentStatusLabel}
          nextRunLabel={nextRunLabel}
          lastRunLabel={lastRunLabel}
          lastRunTimeLabel={lastRunTimeLabel}
          currentTaskPackName={currentTaskPackName}
          currentTaskPackBindingLabel={currentTaskPackBindingLabel}
          currentTaskPackDraftLabel={currentTaskPackDraftLabel}
          formTags={formTags}
          taskPacks={taskPacks}
          currentTaskPack={currentTaskPack}
          form={form}
          taskKeywordCount={taskKeywordCount}
          taskAuthorConstraintCount={taskAuthorConstraintCount}
          taskRuleCount={taskRuleCount}
          taskLevelCount={taskLevelCount}
          currentRuleSetPreview={currentRuleSetPreview}
          saving={saving}
          savingPack={savingPack}
          deletingPack={deletingPack}
          loading={loading}
          fileInputRef={fileInputRef}
          pendingFileActionRef={pendingFileActionRef}
          updateForm={updateForm}
          setForm={setForm}
          handleSave={handleSave}
          handleRestore={handleRestore}
          handlePurge={handlePurge}
          handleRunNow={handleRunNow}
          handleStopRun={handleStopRun}
          handleToggle={handleToggle}
          handleDelete={handleDelete}
          handleImportPack={handleImportPack}
          handleSavePack={handleSavePack}
          handleDeleteCurrentPack={handleDeleteCurrentPack}
          handleImportPackFile={handleImportPackFile}
          handleImportAndSavePackFile={handleImportAndSavePackFile}
          onClose={() => { setSelectedJob(null); setDrawerMode("create"); resetForm(); setDrawerOpen(false); }}
          onOpenCreate={openCreate}
          onRefreshEmpty={() => { void refreshJobs({ keepDrawer: false, reloadSelected: false }); }}
        />
      </div>
    </div>

  );
}
