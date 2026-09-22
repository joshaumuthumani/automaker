import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  getElectronAPI,
  type LinearIssue,
  type LinearComment,
  type IssueValidationResult,
  type LinearIssueValidationEvent,
  type LinearStoredValidation,
} from '@/lib/electron';
import type { PhaseModelEntry, ModelId } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { isValidationStale } from '../utils';
import { useValidateLinearIssue, useMarkLinearValidationViewed } from '@/hooks/mutations';

const logger = createLogger('LinearIssueValidation');

interface UseIssueValidationOptions {
  selectedIssue: LinearIssue | null;
  showValidationDialog: boolean;
  onValidationResultChange: (
    result: IssueValidationResult | null,
    scannedProjectPath?: string
  ) => void;
  onShowValidationDialogChange: (show: boolean) => void;
}

export interface ValidateLinearIssueOptions {
  forceRevalidate?: boolean;
  /** Accept either a model ID (backward compat) or a full PhaseModelEntry */
  model?: ModelId | PhaseModelEntry;
  /** Preferred way to pass a model with thinking level / reasoning effort */
  modelEntry?: PhaseModelEntry;
  comments?: LinearComment[];
}

/**
 * Orchestrates AI validation of Linear issues.
 *
 * Mirrors the GitHub issue validation hook, keyed by the Linear issue
 * `identifier` (e.g. "ENG-123") instead of a numeric issue number.
 */
export function useIssueValidation({
  selectedIssue,
  showValidationDialog,
  onValidationResultChange,
  onShowValidationDialogChange,
}: UseIssueValidationOptions) {
  const { currentProject, phaseModels, muteDoneSound } = useAppStore();
  const [validatingIssues, setValidatingIssues] = useState<Set<string>>(new Set());
  const [cachedValidations, setCachedValidations] = useState<Map<string, LinearStoredValidation>>(
    new Map()
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // React Query mutations
  const validateIssueMutation = useValidateLinearIssue(currentProject?.path ?? '');
  const markViewedMutation = useMarkLinearValidationViewed(currentProject?.path ?? '');

  // Refs for stable event handler (avoids re-subscribing on state changes)
  const selectedIssueRef = useRef<LinearIssue | null>(null);
  const showValidationDialogRef = useRef(false);

  // Keep refs in sync with state for stable event handler
  useEffect(() => {
    selectedIssueRef.current = selectedIssue;
  }, [selectedIssue]);

  useEffect(() => {
    showValidationDialogRef.current = showValidationDialog;
  }, [showValidationDialog]);

  // Load cached validations on mount
  useEffect(() => {
    let isMounted = true;

    const loadCachedValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.linear?.getValidations) {
          const result = await api.linear.getValidations(currentProject.path);
          if (isMounted && result.success && result.validations) {
            const map = new Map<string, LinearStoredValidation>();
            for (const v of result.validations) {
              map.set(v.issueIdentifier, v);
            }
            setCachedValidations(map);
          }
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Failed to load cached validations:', err);
        }
      }
    };

    loadCachedValidations();

    return () => {
      isMounted = false;
    };
  }, [currentProject?.path]);

  // Load running validations on mount (restore validatingIssues state)
  useEffect(() => {
    let isMounted = true;

    const loadRunningValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.linear?.getValidationStatus) {
          const result = await api.linear.getValidationStatus(currentProject.path);
          if (isMounted && result.success && result.runningIssues) {
            setValidatingIssues(new Set(result.runningIssues));
          }
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Failed to load running validations:', err);
        }
      }
    };

    loadRunningValidations();

    return () => {
      isMounted = false;
    };
  }, [currentProject?.path]);

  // Subscribe to validation events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.linear?.onValidationEvent) return;

    const handleValidationEvent = (event: LinearIssueValidationEvent) => {
      // Only handle events for current project
      if (event.projectPath !== currentProject?.path) return;

      switch (event.type) {
        case 'issue_validation_start':
          setValidatingIssues((prev) => new Set([...prev, event.issueIdentifier]));
          break;

        case 'issue_validation_complete':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueIdentifier);
            return next;
          });

          // Update cached validations (use event.model to avoid stale closure race condition)
          setCachedValidations((prev) => {
            const next = new Map(prev);
            next.set(event.issueIdentifier, {
              issueIdentifier: event.issueIdentifier,
              issueTitle: event.issueTitle,
              projectPath: event.projectPath,
              validatedAt: new Date().toISOString(),
              model: event.model,
              result: event.result,
            });
            return next;
          });

          // Show toast notification
          toast.success(`Issue ${event.issueIdentifier} validated: ${event.result.verdict}`, {
            description:
              event.result.verdict === 'valid'
                ? 'Issue is ready to be converted to a task'
                : event.result.verdict === 'invalid'
                  ? 'Issue may have problems'
                  : 'Issue needs clarification',
          });

          // Play audio notification (if not muted)
          if (!muteDoneSound) {
            try {
              if (!audioRef.current) {
                audioRef.current = new Audio('/sounds/ding.mp3');
              }
              audioRef.current.play().catch(() => {
                // Audio play might fail due to browser restrictions
              });
            } catch {
              // Ignore audio errors
            }
          }

          // If validation dialog is open for this issue, update the result
          if (
            selectedIssueRef.current?.identifier === event.issueIdentifier &&
            showValidationDialogRef.current
          ) {
            onValidationResultChange(event.result, event.projectPath);
          }
          break;

        case 'issue_validation_error':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueIdentifier);
            return next;
          });
          toast.error(`Validation failed for issue ${event.issueIdentifier}`, {
            description: event.error,
          });
          if (
            selectedIssueRef.current?.identifier === event.issueIdentifier &&
            showValidationDialogRef.current
          ) {
            onShowValidationDialogChange(false);
          }
          break;
      }
    };

    const unsubscribe = api.linear.onValidationEvent(handleValidationEvent);
    return () => unsubscribe();
  }, [currentProject?.path, muteDoneSound, onValidationResultChange, onShowValidationDialogChange]);

  // Cleanup audio element on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleValidateIssue = useCallback(
    async (issue: LinearIssue, options: ValidateLinearIssueOptions = {}) => {
      const { forceRevalidate = false, model, modelEntry, comments } = options;

      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      // Check if already validating this issue
      if (validatingIssues.has(issue.identifier) || validateIssueMutation.isPending) {
        toast.info(`Validation already in progress for issue ${issue.identifier}`);
        return;
      }

      // Check for cached result - if fresh, show it directly (unless force revalidate)
      const cached = cachedValidations.get(issue.identifier);
      if (cached && !forceRevalidate && !isValidationStale(cached.validatedAt)) {
        // Show cached result directly
        onValidationResultChange(cached.result, cached.projectPath);
        onShowValidationDialogChange(true);
        return;
      }

      // Use provided model override or fall back to phaseModels.validationModel
      // Extract model string and thinking level from PhaseModelEntry (handles both old string format and new object format)
      const effectiveModelEntry = modelEntry
        ? modelEntry
        : model
          ? typeof model === 'string'
            ? { model: model as ModelId }
            : model
          : phaseModels.validationModel;
      const normalizedEntry =
        typeof effectiveModelEntry === 'string'
          ? { model: effectiveModelEntry as ModelId }
          : effectiveModelEntry;

      // Use mutation to trigger validation (toast is handled by mutation)
      validateIssueMutation.mutate({
        issue,
        model: normalizedEntry.model,
        thinkingLevel: normalizedEntry.thinkingLevel,
        reasoningEffort: normalizedEntry.reasoningEffort,
        providerId: normalizedEntry.providerId,
        comments,
      });
    },
    [
      currentProject?.path,
      validatingIssues,
      cachedValidations,
      phaseModels.validationModel,
      validateIssueMutation,
      onValidationResultChange,
      onShowValidationDialogChange,
    ]
  );

  // View cached validation result
  const handleViewCachedValidation = useCallback(
    async (issue: LinearIssue) => {
      const cached = cachedValidations.get(issue.identifier);
      if (!cached) return;

      onValidationResultChange(cached.result, cached.projectPath);
      onShowValidationDialogChange(true);

      // Mark as viewed if not already viewed
      if (!cached.viewedAt && currentProject?.path) {
        markViewedMutation.mutate(issue.identifier, {
          onSuccess: () => {
            // Update local state
            setCachedValidations((prev) => {
              const next = new Map(prev);
              const updated = prev.get(issue.identifier);
              if (updated) {
                next.set(issue.identifier, {
                  ...updated,
                  viewedAt: new Date().toISOString(),
                });
              }
              return next;
            });
          },
        });
      }
    },
    [
      cachedValidations,
      currentProject?.path,
      markViewedMutation,
      onValidationResultChange,
      onShowValidationDialogChange,
    ]
  );

  return {
    validatingIssues,
    cachedValidations,
    handleValidateIssue,
    handleViewCachedValidation,
    isValidating: validateIssueMutation.isPending,
  };
}
