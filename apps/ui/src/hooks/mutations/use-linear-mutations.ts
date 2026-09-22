/**
 * Linear Mutation Hooks
 *
 * React Query mutations for Linear operations like validating issues.
 *
 * Linear issues have no numeric issue number - they are keyed by their
 * human-readable `identifier` (e.g. "ENG-123").
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI, LinearIssue, LinearComment } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { ModelId, ThinkingLevel, ReasoningEffort } from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';

/**
 * Input for validating a Linear issue
 */
interface ValidateLinearIssueInput {
  issue: LinearIssue;
  model?: ModelId;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  providerId?: string;
  comments?: LinearComment[];
}

/**
 * Validate a Linear issue with AI
 *
 * This mutation triggers an async validation process. Results are delivered
 * via WebSocket events (issue_validation_complete, issue_validation_error).
 *
 * @param projectPath - Path to the project whose codebase is scanned
 * @returns Mutation for validating issues
 *
 * @example
 * ```tsx
 * const validateMutation = useValidateLinearIssue(projectPath);
 *
 * validateMutation.mutate({ issue, model: 'sonnet', comments });
 * ```
 */
export function useValidateLinearIssue(projectPath: string) {
  return useMutation({
    mutationFn: async (input: ValidateLinearIssueInput) => {
      const { issue, model, thinkingLevel, reasoningEffort, providerId, comments } = input;

      const api = getElectronAPI();
      if (!api.linear?.validateIssue) {
        throw new Error('Validation API not available');
      }

      const validationInput = {
        issueIdentifier: issue.identifier,
        issueTitle: issue.title,
        issueBody: issue.description || '',
        issueLabels: issue.labels.map((l) => l.name),
        comments,
      };

      // Resolve model alias to canonical model identifier
      const resolvedModel = model ? resolveModelString(model) : undefined;

      const result = await api.linear.validateIssue(
        projectPath,
        validationInput,
        resolvedModel,
        thinkingLevel,
        reasoningEffort,
        providerId
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to start validation');
      }

      return { issueIdentifier: issue.identifier };
    },
    onSuccess: (_, variables) => {
      toast.info(`Starting validation for issue ${variables.issue.identifier}`, {
        description: 'You will be notified when the analysis is complete',
      });
    },
    onError: (error) => {
      toast.error('Failed to validate issue', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    // Note: We don't invalidate queries here because the actual result
    // comes through WebSocket events which handle cache invalidation
  });
}

/**
 * Mark a Linear validation as viewed
 *
 * @param projectPath - Path to the project
 * @returns Mutation for marking validation as viewed
 *
 * @example
 * ```tsx
 * const markViewedMutation = useMarkLinearValidationViewed(projectPath);
 * markViewedMutation.mutate(issue.identifier);
 * ```
 */
export function useMarkLinearValidationViewed(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issueIdentifier: string) => {
      const api = getElectronAPI();
      if (!api.linear?.markValidationViewed) {
        throw new Error('Mark viewed API not available');
      }

      const result = await api.linear.markValidationViewed(projectPath, issueIdentifier);

      if (!result.success) {
        throw new Error(result.error || 'Failed to mark as viewed');
      }

      return { issueIdentifier };
    },
    onSuccess: () => {
      // Invalidate validations cache to refresh the viewed state
      queryClient.invalidateQueries({
        queryKey: queryKeys.linear.validations(projectPath),
      });
    },
    // Silent mutation - no toast needed for marking as viewed
  });
}
