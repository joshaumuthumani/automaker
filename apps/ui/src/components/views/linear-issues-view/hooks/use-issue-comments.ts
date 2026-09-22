import type { LinearComment } from '@/lib/electron';
import { useLinearIssueComments } from '@/hooks/queries';

interface UseIssueCommentsResult {
  comments: LinearComment[];
  totalCount: number;
  loading: boolean;
  error: string | null;
}

export function useIssueComments(issueId: string | null): UseIssueCommentsResult {
  const { data, isLoading, error } = useLinearIssueComments(issueId ?? undefined);

  return {
    comments: data?.comments ?? [],
    totalCount: data?.totalCount ?? 0,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
