/**
 * POST /issues endpoint - List Linear issues assigned to the authenticated user
 *
 * Linear issues are not repository-scoped the way GitHub issues are, so there is
 * no git-remote equivalent to filter by. "Assigned to me" is the default scope.
 */

import type { Request, Response } from 'express';
import {
  getLinearApiKey,
  linearGraphQL,
  getErrorMessage,
  logError,
  LINEAR_NOT_CONNECTED_ERROR,
} from './common.js';

const ASSIGNED_ISSUES_LIMIT = 100;

/** Linear workflow state types that mean the issue is no longer active */
const CLOSED_STATE_TYPES = ['completed', 'canceled'];

const ASSIGNED_ISSUES_QUERY = `
  query Issues($first: Int) {
    viewer {
      assignedIssues(first: $first, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          url
          priority
          state {
            id
            name
            type
            color
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          assignee {
            id
            name
            avatarUrl
          }
          team {
            id
            name
            key
          }
          createdAt
          updatedAt
        }
      }
    }
  }`;

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearState {
  id: string;
  name: string;
  type: string;
  color: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number;
  state: LinearState;
  labels: LinearLabel[];
  assignee: LinearUser | null;
  team: LinearTeam | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListIssuesResult {
  success: boolean;
  openIssues?: LinearIssue[];
  closedIssues?: LinearIssue[];
  error?: string;
}

/** Raw issue node as returned by the Linear GraphQL API */
interface LinearIssueNode extends Omit<LinearIssue, 'labels'> {
  labels?: { nodes?: LinearLabel[] } | null;
}

interface AssignedIssuesResponse {
  viewer: {
    assignedIssues: {
      nodes: LinearIssueNode[];
    };
  } | null;
}

/**
 * Flatten Linear's connection shape (`labels.nodes`) into a plain array.
 */
function toLinearIssue(node: LinearIssueNode): LinearIssue {
  return {
    ...node,
    labels: node.labels?.nodes ?? [],
  };
}

/**
 * Split issues into active and finished, mirroring GitHub's open/closed split.
 */
export function splitIssuesByState(nodes: LinearIssueNode[]): {
  openIssues: LinearIssue[];
  closedIssues: LinearIssue[];
} {
  const openIssues: LinearIssue[] = [];
  const closedIssues: LinearIssue[] = [];

  for (const node of nodes) {
    const issue = toLinearIssue(node);
    if (CLOSED_STATE_TYPES.includes(issue.state?.type)) {
      closedIssues.push(issue);
    } else {
      openIssues.push(issue);
    }
  }

  return { openIssues, closedIssues };
}

export function createListIssuesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = getLinearApiKey();
      if (!apiKey) {
        res.status(400).json({ success: false, error: LINEAR_NOT_CONNECTED_ERROR });
        return;
      }

      const data = await linearGraphQL<AssignedIssuesResponse>(apiKey, ASSIGNED_ISSUES_QUERY, {
        first: ASSIGNED_ISSUES_LIMIT,
      });

      const nodes = data.viewer?.assignedIssues?.nodes ?? [];
      const { openIssues, closedIssues } = splitIssuesByState(nodes);

      res.json({
        success: true,
        openIssues,
        closedIssues,
      });
    } catch (error) {
      logError(error, 'List Linear issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
