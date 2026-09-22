/**
 * Linear routes - HTTP API for Linear integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createCheckLinearConnectionHandler } from './routes/check-connection.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListCommentsHandler } from './routes/list-comments.js';
import { createValidateIssueHandler } from './routes/validate-issue.js';
import {
  createValidationStatusHandler,
  createValidationStopHandler,
  createGetValidationsHandler,
  createDeleteValidationHandler,
  createMarkViewedHandler,
} from './routes/validation-endpoints.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createLinearRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  // Linear credentials are app-level, so none of these routes are project-scoped
  router.post('/check-connection', createCheckLinearConnectionHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/issue-comments', createListCommentsHandler());

  // Validation runs against a project's codebase, so these routes are project-scoped
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateIssueHandler(events, settingsService)
  );
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createValidationStatusHandler()
  );
  router.post('/validation-stop', validatePathParams('projectPath'), createValidationStopHandler());
  router.post('/validations', validatePathParams('projectPath'), createGetValidationsHandler());
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createMarkViewedHandler(events)
  );

  return router;
}
