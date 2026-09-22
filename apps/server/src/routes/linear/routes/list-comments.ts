/**
 * POST /issue-comments endpoint - Fetch comments for a Linear issue
 */

import type { Request, Response } from 'express';
import {
  getLinearApiKey,
  linearGraphQL,
  getErrorMessage,
  logError,
  LINEAR_NOT_CONNECTED_ERROR,
} from './common.js';
import type { LinearUser } from './list-issues.js';

const ISSUE_COMMENTS_QUERY = `
  query IssueComments($id: String!) {
    issue(id: $id) {
      comments {
        nodes {
          id
          body
          user {
            id
            name
            avatarUrl
          }
          createdAt
        }
      }
    }
  }`;

interface ListCommentsRequest {
  issueId: string;
}

export interface LinearComment {
  id: string;
  body: string;
  user: LinearUser | null;
  createdAt: string;
}

interface IssueCommentsResponse {
  issue: {
    comments: {
      nodes: LinearComment[];
    };
  } | null;
}

export function createListCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { issueId } = req.body as ListCommentsRequest;

      if (!issueId || typeof issueId !== 'string') {
        res.status(400).json({ success: false, error: 'issueId is required and must be a string' });
        return;
      }

      const apiKey = getLinearApiKey();
      if (!apiKey) {
        res.status(400).json({ success: false, error: LINEAR_NOT_CONNECTED_ERROR });
        return;
      }

      const data = await linearGraphQL<IssueCommentsResponse>(apiKey, ISSUE_COMMENTS_QUERY, {
        id: issueId,
      });

      if (!data.issue) {
        throw new Error('Issue not found');
      }

      const comments = data.issue.comments?.nodes ?? [];

      res.json({
        success: true,
        comments,
        totalCount: comments.length,
      });
    } catch (error) {
      logError(error, 'Fetch comments for Linear issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
