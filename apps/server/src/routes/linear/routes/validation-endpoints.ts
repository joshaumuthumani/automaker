/**
 * Additional Linear validation endpoints for status, stop, and retrieving stored validations
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { LinearIssueValidationEvent } from '@automaker/types';
import {
  getValidationStatus,
  getRunningValidations,
  abortValidation,
  getErrorMessage,
  logError,
  logger,
} from './validation-common.js';
import {
  getAllValidations,
  getValidationWithFreshness,
  deleteValidation,
  markValidationViewed,
  isValidIssueIdentifier,
} from '../../../lib/linear-validation-storage.js';

/** Shared 400 response for a missing or malformed issue identifier */
const INVALID_IDENTIFIER_ERROR = 'issueIdentifier is required and must look like "ENG-123"';

/**
 * POST /validation-status - Check if validation is running for an issue
 */
export function createValidationStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueIdentifier } = req.body as {
        projectPath: string;
        issueIdentifier?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If issueIdentifier provided, check specific issue
      if (issueIdentifier !== undefined) {
        if (!isValidIssueIdentifier(issueIdentifier)) {
          res.status(400).json({ success: false, error: INVALID_IDENTIFIER_ERROR });
          return;
        }

        const status = getValidationStatus(projectPath, issueIdentifier);
        res.json({
          success: true,
          isRunning: status?.isRunning ?? false,
          startedAt: status?.startedAt?.toISOString(),
        });
        return;
      }

      // Otherwise, return all running validations for the project
      const runningIssues = getRunningValidations(projectPath);
      res.json({
        success: true,
        runningIssues,
      });
    } catch (error) {
      logError(error, 'Linear validation status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-stop - Cancel a running validation
 */
export function createValidationStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueIdentifier } = req.body as {
        projectPath: string;
        issueIdentifier: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!isValidIssueIdentifier(issueIdentifier)) {
        res.status(400).json({ success: false, error: INVALID_IDENTIFIER_ERROR });
        return;
      }

      const wasAborted = abortValidation(projectPath, issueIdentifier);

      if (wasAborted) {
        logger.info(`Validation for issue ${issueIdentifier} was stopped`);
        res.json({
          success: true,
          message: `Validation for issue ${issueIdentifier} has been stopped`,
        });
      } else {
        res.json({
          success: false,
          error: `No validation is running for issue ${issueIdentifier}`,
        });
      }
    } catch (error) {
      logError(error, 'Linear validation stop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validations - Get stored validations for a project
 */
export function createGetValidationsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueIdentifier } = req.body as {
        projectPath: string;
        issueIdentifier?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If issueIdentifier provided, get specific validation with freshness info
      if (issueIdentifier !== undefined) {
        if (!isValidIssueIdentifier(issueIdentifier)) {
          res.status(400).json({ success: false, error: INVALID_IDENTIFIER_ERROR });
          return;
        }

        const result = await getValidationWithFreshness(projectPath, issueIdentifier);

        if (!result) {
          res.json({
            success: true,
            validation: null,
          });
          return;
        }

        res.json({
          success: true,
          validation: result.validation,
          isStale: result.isStale,
        });
        return;
      }

      // Otherwise, get all validations for the project
      const validations = await getAllValidations(projectPath);

      res.json({
        success: true,
        validations,
      });
    } catch (error) {
      logError(error, 'Get Linear validations failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-delete - Delete a stored validation
 */
export function createDeleteValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueIdentifier } = req.body as {
        projectPath: string;
        issueIdentifier: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!isValidIssueIdentifier(issueIdentifier)) {
        res.status(400).json({ success: false, error: INVALID_IDENTIFIER_ERROR });
        return;
      }

      const deleted = await deleteValidation(projectPath, issueIdentifier);

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      logError(error, 'Delete Linear validation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-mark-viewed - Mark a validation as viewed by the user
 */
export function createMarkViewedHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueIdentifier } = req.body as {
        projectPath: string;
        issueIdentifier: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!isValidIssueIdentifier(issueIdentifier)) {
        res.status(400).json({ success: false, error: INVALID_IDENTIFIER_ERROR });
        return;
      }

      const success = await markValidationViewed(projectPath, issueIdentifier);

      if (success) {
        // Emit event so UI can update the unviewed count
        const viewedEvent: LinearIssueValidationEvent = {
          type: 'issue_validation_viewed',
          issueIdentifier,
          projectPath,
        };
        events.emit('linear-validation:event', viewedEvent);
      }

      res.json({ success });
    } catch (error) {
      logError(error, 'Mark Linear validation viewed failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
