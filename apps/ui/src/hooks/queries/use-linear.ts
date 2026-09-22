/**
 * Linear Query Hooks
 *
 * React Query hooks for fetching Linear issues and comments.
 *
 * Linear issues are not repository-scoped, and the API key is an app-level
 * credential, so none of these hooks take a project path.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { LinearIssue, LinearComment } from '@/lib/electron';

interface LinearIssuesResult {
  openIssues: LinearIssue[];
  closedIssues: LinearIssue[];
}

/**
 * Fetch Linear issues assigned to the authenticated user
 *
 * @returns Query result with open and closed issues
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLinearIssues();
 * const { openIssues, closedIssues } = data ?? { openIssues: [], closedIssues: [] };
 * ```
 */
export function useLinearIssues() {
  return useQuery({
    queryKey: queryKeys.linear.issues(),
    queryFn: async (): Promise<LinearIssuesResult> => {
      const api = getElectronAPI();
      if (!api.linear) {
        throw new Error('Linear API not available');
      }
      const result = await api.linear.listIssues();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch issues');
      }
      return {
        openIssues: result.openIssues ?? [],
        closedIssues: result.closedIssues ?? [],
      };
    },
    staleTime: STALE_TIMES.LINEAR,
  });
}

/**
 * Check whether Linear is connected with a usable API key
 *
 * @returns Query result with the connection status
 */
export function useLinearConnection() {
  return useQuery({
    queryKey: queryKeys.linear.connection(),
    queryFn: async (): Promise<boolean> => {
      const api = getElectronAPI();
      if (!api.linear) {
        throw new Error('Linear API not available');
      }
      const result = await api.linear.checkConnection();
      if (!result.success) {
        throw new Error(result.error || 'Failed to check Linear connection');
      }
      return result.connected ?? false;
    },
    staleTime: STALE_TIMES.LINEAR,
  });
}

/**
 * Fetch comments for a Linear issue
 *
 * @param issueId - Linear issue id (UUID)
 * @returns Query result with comments
 */
export function useLinearIssueComments(issueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.linear.issueComments(issueId ?? ''),
    queryFn: async (): Promise<{ comments: LinearComment[]; totalCount: number }> => {
      if (!issueId) throw new Error('Missing issue id');
      const api = getElectronAPI();
      if (!api.linear) {
        throw new Error('Linear API not available');
      }
      const result = await api.linear.listComments(issueId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch comments');
      }
      return {
        comments: result.comments ?? [],
        totalCount: result.totalCount ?? 0,
      };
    },
    enabled: !!issueId,
    staleTime: STALE_TIMES.LINEAR,
  });
}
