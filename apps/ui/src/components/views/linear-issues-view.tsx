import { useState, useCallback, useMemo, type ComponentProps } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { ListTodo, RefreshCw, SearchX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { getElectronAPI, type IssueValidationResult, type LinearIssue } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { cn, pathsEqual, generateUUID } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import {
  useLinearIssuesView,
  useIssuesFilter,
  useIssueValidation,
  type ValidateLinearIssueOptions,
} from './linear-issues-view/hooks';
import { IssueRow, IssueDetailPanel, IssuesListHeader } from './linear-issues-view/components';
import { ValidationDialog } from './linear-issues-view/dialogs';
import { AddFeatureDialog } from './board-view/dialogs';
import { formatDate, isClosedState } from './linear-issues-view/utils';
import { useModelOverride } from '@/components/shared';
import type { LinearIssuesFilterState, LinearIssuesStateFilter } from './linear-issues-view/types';
import { DEFAULT_LINEAR_ISSUES_FILTER_STATE } from './linear-issues-view/types';

const logger = createLogger('LinearIssuesView');

const LINEAR_FEATURE_CATEGORY = 'From Linear';

type AddFeatureData = Parameters<ComponentProps<typeof AddFeatureDialog>['onAdd']>[0];

export function LinearIssuesView() {
  const navigate = useNavigate();
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);

  // Validation dialog state
  const [validationResult, setValidationResult] = useState<IssueValidationResult | null>(null);
  const [validationScannedProjectPath, setValidationScannedProjectPath] = useState<
    string | undefined
  >(undefined);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showRevalidateConfirm, setShowRevalidateConfirm] = useState(false);
  const [pendingRevalidateOptions, setPendingRevalidateOptions] =
    useState<ValidateLinearIssueOptions | null>(null);

  // Add Feature dialog state
  const [showAddFeatureDialog, setShowAddFeatureDialog] = useState(false);
  const [createFeatureIssue, setCreateFeatureIssue] = useState<LinearIssue | null>(null);

  // Filter state
  const [filterState, setFilterState] = useState<LinearIssuesFilterState>(
    DEFAULT_LINEAR_ISSUES_FILTER_STATE
  );

  const { currentProject, getCurrentWorktree, worktreesByProject, defaultSkipTests } =
    useAppStore();
  const queryClient = useQueryClient();

  // Model override for validation
  const validationModelOverride = useModelOverride({ phase: 'validationModel' });

  const isMobile = useIsMobile();

  const { openIssues, closedIssues, loading, refreshing, error, refresh } = useLinearIssuesView();

  const { validatingIssues, cachedValidations, handleValidateIssue, handleViewCachedValidation } =
    useIssueValidation({
      selectedIssue,
      showValidationDialog,
      onValidationResultChange: (result, scannedProjectPath) => {
        setValidationResult(result);
        setValidationScannedProjectPath(scannedProjectPath);
      },
      onShowValidationDialogChange: setShowValidationDialog,
    });

  // Combine all issues for filtering
  const allIssues = useMemo(() => [...openIssues, ...closedIssues], [openIssues, closedIssues]);

  const filterResult = useIssuesFilter(allIssues, filterState);

  // Separate filtered issues by state
  const { filteredOpenIssues, filteredClosedIssues } = useMemo(() => {
    const open: LinearIssue[] = [];
    const closed: LinearIssue[] = [];
    for (const issue of filterResult.matchedIssues) {
      if (isClosedState(issue.state)) {
        closed.push(issue);
      } else {
        open.push(issue);
      }
    }
    return { filteredOpenIssues: open, filteredClosedIssues: closed };
  }, [filterResult.matchedIssues]);

  // Filter state change handlers
  const handleStateFilterChange = useCallback((stateFilter: LinearIssuesStateFilter) => {
    setFilterState((prev) => ({ ...prev, stateFilter }));
  }, []);

  const handleLabelsChange = useCallback((selectedLabels: string[]) => {
    setFilterState((prev) => ({ ...prev, selectedLabels }));
  }, []);

  // Clear all filters to default state
  const handleClearFilters = useCallback(() => {
    setFilterState(DEFAULT_LINEAR_ISSUES_FILTER_STATE);
  }, []);

  // Get current branch from selected worktree
  const currentBranch = useMemo(() => {
    if (!currentProject?.path) return '';
    const currentWorktreeInfo = getCurrentWorktree(currentProject.path);
    const worktrees = worktreesByProject[currentProject.path] ?? [];
    const currentWorktreePath = currentWorktreeInfo?.path ?? null;

    const selectedWorktree =
      currentWorktreePath === null
        ? worktrees.find((w) => w.isMain)
        : worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath));

    return selectedWorktree?.branch || worktrees.find((w) => w.isMain)?.branch || '';
  }, [currentProject?.path, getCurrentWorktree, worktreesByProject]);

  const handleOpenInLinear = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  // Build a prefilled description from a Linear issue for the feature dialog
  const buildIssueDescription = useCallback(
    (issue: LinearIssue) => {
      const parts = [
        `**From Linear issue ${issue.identifier}**`,
        '',
        issue.description || 'No description provided.',
      ];

      if (issue.labels.length > 0) {
        parts.push('', `**Labels:** ${issue.labels.map((l) => l.name).join(', ')}`);
      }

      parts.push('', `**Linear URL:** ${issue.url}`);

      // Include cached validation analysis if available
      const cached = cachedValidations.get(issue.identifier);
      if (cached?.result) {
        const validation = cached.result;
        parts.push('', '---', '', '**AI Validation Analysis:**', validation.reasoning);
        if (validation.suggestedFix) {
          parts.push('', `**Suggested Approach:**`, validation.suggestedFix);
        }
        if (validation.relatedFiles?.length) {
          parts.push('', '**Related Files:**', ...validation.relatedFiles.map((f) => `- \`${f}\``));
        }
      }

      return parts.join('\n');
    },
    [cachedValidations]
  );

  // Memoize the prefilled description to avoid recomputing on every render
  const prefilledDescription = useMemo(
    () => (createFeatureIssue ? buildIssueDescription(createFeatureIssue) : undefined),
    [createFeatureIssue, buildIssueDescription]
  );

  // Open the Add Feature dialog with pre-filled data from a Linear issue
  const handleCreateFeature = useCallback((issue: LinearIssue) => {
    setCreateFeatureIssue(issue);
    setShowAddFeatureDialog(true);
  }, []);

  // Handle feature creation from the AddFeatureDialog
  const handleAddFeatureFromIssue = useCallback(
    async (featureData: AddFeatureData) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api.features?.create) {
          return;
        }

        const feature = {
          id: `linear-${createFeatureIssue?.identifier ?? 'new'}-${generateUUID()}`,
          title: featureData.title,
          description: featureData.description,
          category: featureData.category,
          status: 'backlog' as const,
          passes: false,
          priority: featureData.priority,
          model: featureData.model,
          thinkingLevel: featureData.thinkingLevel,
          reasoningEffort: featureData.reasoningEffort,
          providerId: featureData.providerId,
          skipTests: featureData.skipTests,
          branchName: featureData.workMode === 'current' ? currentBranch : featureData.branchName,
          planningMode: featureData.planningMode,
          requirePlanApproval: featureData.requirePlanApproval,
          dependencies: [],
          excludedPipelineSteps: featureData.excludedPipelineSteps,
          ...(featureData.imagePaths?.length ? { imagePaths: featureData.imagePaths } : {}),
          ...(featureData.textFilePaths?.length
            ? { textFilePaths: featureData.textFilePaths }
            : {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = await api.features.create(currentProject.path, feature);
        if (result.success) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.features.all(currentProject.path),
          });
          toast.success(
            `Created feature: ${featureData.title || featureData.description.slice(0, 50)}`
          );
          setShowAddFeatureDialog(false);
          setCreateFeatureIssue(null);
        } else {
          toast.error(result.error || 'Failed to create feature');
        }
      } catch (err) {
        logger.error('Create feature from Linear issue error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create feature');
      }
    },
    [currentProject?.path, currentBranch, queryClient, createFeatureIssue]
  );

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    // A "not connected" error means retrying will just fail again - route the
    // user to Settings to fix the key instead of a dead-end retry button.
    const isNotConnected = error.includes('Add a Linear API key in Settings');
    return (
      <ErrorState
        error={error}
        title="Failed to Load Issues"
        onRetry={isNotConnected ? () => navigate({ to: '/settings' }) : refresh}
        retryText={isNotConnected ? 'Go to Settings' : undefined}
      />
    );
  }

  const totalIssues = filteredOpenIssues.length + filteredClosedIssues.length;
  const totalUnfilteredIssues = openIssues.length + closedIssues.length;
  const isFilteredEmpty =
    totalIssues === 0 && totalUnfilteredIssues > 0 && filterResult.hasActiveFilter;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Issues List - hidden on mobile when an issue is selected */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedIssue ? 'w-80' : 'flex-1',
          isMobile && selectedIssue && 'hidden'
        )}
      >
        {/* Header */}
        <IssuesListHeader
          openCount={filteredOpenIssues.length}
          closedCount={filteredClosedIssues.length}
          totalOpenCount={openIssues.length}
          totalClosedCount={closedIssues.length}
          hasActiveFilter={filterResult.hasActiveFilter}
          refreshing={refreshing}
          onRefresh={refresh}
          compact={!!selectedIssue}
          filterProps={{
            stateFilter: filterState.stateFilter,
            selectedLabels: filterState.selectedLabels,
            availableLabels: filterResult.availableLabels,
            onStateFilterChange: handleStateFilterChange,
            onLabelsChange: handleLabelsChange,
          }}
        />

        {/* Issues List */}
        <div className="flex-1 overflow-auto">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                {isFilteredEmpty ? (
                  <SearchX className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <ListTodo className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <h2 className="text-base font-medium mb-2">
                {isFilteredEmpty ? 'No Matching Issues' : 'No Issues'}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {isFilteredEmpty
                  ? 'No issues match your current filters.'
                  : 'You have no Linear issues assigned to you.'}
              </p>
              {isFilteredEmpty && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open Issues */}
              {filteredOpenIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  isSelected={selectedIssue?.id === issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  onOpenExternal={() => handleOpenInLinear(issue.url)}
                  formatDate={formatDate}
                  cachedValidation={cachedValidations.get(issue.identifier)}
                  isValidating={validatingIssues.has(issue.identifier)}
                />
              ))}

              {/* Closed Issues Section */}
              {filteredClosedIssues.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Closed Issues ({filteredClosedIssues.length})
                  </div>
                  {filteredClosedIssues.map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      isSelected={selectedIssue?.id === issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      onOpenExternal={() => handleOpenInLinear(issue.url)}
                      formatDate={formatDate}
                      cachedValidation={cachedValidations.get(issue.identifier)}
                      isValidating={validatingIssues.has(issue.identifier)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <IssueDetailPanel
          issue={selectedIssue}
          validatingIssues={validatingIssues}
          cachedValidations={cachedValidations}
          onValidateIssue={handleValidateIssue}
          onViewCachedValidation={handleViewCachedValidation}
          onOpenInLinear={handleOpenInLinear}
          onClose={() => setSelectedIssue(null)}
          onShowRevalidateConfirm={(options) => {
            setPendingRevalidateOptions(options);
            setShowRevalidateConfirm(true);
          }}
          onCreateFeature={handleCreateFeature}
          formatDate={formatDate}
          modelOverride={validationModelOverride}
          isMobile={isMobile}
        />
      )}

      {/* Validation Dialog */}
      <ValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        issue={selectedIssue}
        validationResult={validationResult}
        scannedProjectPath={validationScannedProjectPath}
        onCreateFeature={handleCreateFeature}
      />

      {/* Add Feature Dialog - opened from issue detail panel */}
      <AddFeatureDialog
        open={showAddFeatureDialog}
        onOpenChange={(open) => {
          setShowAddFeatureDialog(open);
          if (!open) {
            setCreateFeatureIssue(null);
          }
        }}
        onAdd={handleAddFeatureFromIssue}
        categorySuggestions={[LINEAR_FEATURE_CATEGORY]}
        branchSuggestions={[]}
        defaultSkipTests={defaultSkipTests}
        defaultBranch={currentBranch}
        currentBranch={currentBranch || undefined}
        isMaximized={false}
        projectPath={currentProject?.path}
        prefilledTitle={createFeatureIssue?.title}
        prefilledDescription={prefilledDescription}
        prefilledCategory={LINEAR_FEATURE_CATEGORY}
      />

      {/* Revalidate Confirmation Dialog */}
      <ConfirmDialog
        open={showRevalidateConfirm}
        onOpenChange={(open) => {
          setShowRevalidateConfirm(open);
          if (!open) {
            setPendingRevalidateOptions(null);
          }
        }}
        title="Re-validate Issue"
        description={`Are you sure you want to re-validate issue ${selectedIssue?.identifier}? This will run a new AI analysis and replace the existing validation result.`}
        icon={RefreshCw}
        iconClassName="text-primary"
        confirmText="Re-validate"
        onConfirm={() => {
          if (selectedIssue && pendingRevalidateOptions) {
            logger.info('Revalidating with options:', {
              commentsCount: pendingRevalidateOptions.comments?.length ?? 0,
            });
            handleValidateIssue(selectedIssue, {
              ...pendingRevalidateOptions,
              forceRevalidate: true,
            });
          }
        }}
      />
    </div>
  );
}
