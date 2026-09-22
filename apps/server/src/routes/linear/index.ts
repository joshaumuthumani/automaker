/**
 * Linear routes - HTTP API for Linear integration
 */

import { Router } from 'express';
import { createCheckLinearConnectionHandler } from './routes/check-connection.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListCommentsHandler } from './routes/list-comments.js';

export function createLinearRoutes(): Router {
  const router = Router();

  // Linear credentials are app-level, so none of these routes are project-scoped
  router.post('/check-connection', createCheckLinearConnectionHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/issue-comments', createListCommentsHandler());

  return router;
}
