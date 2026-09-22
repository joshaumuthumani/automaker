/**
 * Linear Issues Hook
 *
 * React Query-based hook for fetching Linear issues assigned to the user.
 */

import { useLinearIssues as useLinearIssuesQuery } from '@/hooks/queries';

export function useLinearIssuesView() {
  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    error,
    refetch: refresh,
  } = useLinearIssuesQuery();

  return {
    openIssues: data?.openIssues ?? [],
    closedIssues: data?.closedIssues ?? [],
    loading,
    refreshing,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh,
  };
}
