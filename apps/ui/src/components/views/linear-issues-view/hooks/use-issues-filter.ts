import { useMemo } from 'react';
import type { LinearIssue } from '@/lib/electron';
import type { LinearIssuesFilterState, LinearIssuesFilterResult } from '../types';
import { isClosedState } from '../utils';

/**
 * Checks if an issue matches the state filter (open/closed/all).
 */
function matchesStateFilter(
  issue: LinearIssue,
  stateFilter: LinearIssuesFilterState['stateFilter']
): boolean {
  if (stateFilter === 'all') return true;
  return isClosedState(issue.state) === (stateFilter === 'closed');
}

/**
 * Checks if an issue matches any of the selected labels.
 * Returns true if no labels are selected (no filter) or if any selected label matches.
 */
function matchesLabels(issue: LinearIssue, selectedLabels: string[]): boolean {
  if (selectedLabels.length === 0) return true;

  const issueLabels = issue.labels.map((l) => l.name);
  return selectedLabels.some((label) => issueLabels.includes(label));
}

/**
 * Extracts all unique labels from a list of issues.
 */
function extractAvailableLabels(issues: LinearIssue[]): string[] {
  const labelsSet = new Set<string>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      labelsSet.add(label.name);
    }
  }
  return Array.from(labelsSet).sort();
}

/**
 * Hook to filter Linear issues based on the current filter state.
 *
 * @param issues - Combined array of all issues (open + closed) to filter
 * @param filterState - Current filter state
 * @returns Filter result containing matched issues and available filter options
 */
export function useIssuesFilter(
  issues: LinearIssue[],
  filterState: LinearIssuesFilterState
): LinearIssuesFilterResult {
  const { stateFilter, selectedLabels } = filterState;

  return useMemo(() => {
    const availableLabels = extractAvailableLabels(issues);

    // 'open' is the default view, so it is not treated as an active filter
    const hasActiveFilter = stateFilter !== 'open' || selectedLabels.length > 0;

    const matchedIssues = issues.filter(
      (issue) => matchesStateFilter(issue, stateFilter) && matchesLabels(issue, selectedLabels)
    );

    return {
      matchedIssues,
      availableLabels,
      hasActiveFilter,
      matchedCount: matchedIssues.length,
    };
  }, [issues, stateFilter, selectedLabels]);
}
