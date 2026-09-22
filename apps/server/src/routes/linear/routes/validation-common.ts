/**
 * Common utilities and state for Linear issue validation routes
 *
 * Tracks running validation status per issue to support:
 * - Checking if a validation is in progress
 * - Cancelling a running validation
 * - Preventing duplicate validations for the same issue
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../../common.js';

const logger = createLogger('LinearIssueValidation');

/**
 * Status of a validation in progress
 */
interface ValidationStatus {
  isRunning: boolean;
  abortController: AbortController;
  startedAt: Date;
}

/**
 * Map of issue identifier to validation status
 * Key format: `${projectPath}||${issueIdentifier}` to support multiple projects
 * Note: Using `||` as delimiter since `:` appears in Windows paths (e.g., C:\)
 */
const validationStatusMap = new Map<string, ValidationStatus>();

/** Maximum age for stale validation entries before cleanup (1 hour) */
const MAX_VALIDATION_AGE_MS = 60 * 60 * 1000;

/**
 * Create a unique key for a validation
 * Uses `||` as delimiter since `:` appears in Windows paths
 */
function getValidationKey(projectPath: string, issueIdentifier: string): string {
  return `${projectPath}||${issueIdentifier}`;
}

/**
 * Check if a validation is currently running for an issue
 */
export function isValidationRunning(projectPath: string, issueIdentifier: string): boolean {
  const key = getValidationKey(projectPath, issueIdentifier);
  const status = validationStatusMap.get(key);
  return status?.isRunning ?? false;
}

/**
 * Get validation status for an issue
 */
export function getValidationStatus(
  projectPath: string,
  issueIdentifier: string
): { isRunning: boolean; startedAt?: Date } | null {
  const key = getValidationKey(projectPath, issueIdentifier);
  const status = validationStatusMap.get(key);
  if (!status) {
    return null;
  }
  return {
    isRunning: status.isRunning,
    startedAt: status.startedAt,
  };
}

/**
 * Get all running validations for a project
 */
export function getRunningValidations(projectPath: string): string[] {
  const runningIssues: string[] = [];
  const prefix = `${projectPath}||`;
  for (const [key, status] of validationStatusMap.entries()) {
    if (status.isRunning && key.startsWith(prefix)) {
      runningIssues.push(key.slice(prefix.length));
    }
  }
  return runningIssues;
}

/**
 * Set a validation as running
 */
export function setValidationRunning(
  projectPath: string,
  issueIdentifier: string,
  abortController: AbortController
): void {
  const key = getValidationKey(projectPath, issueIdentifier);
  validationStatusMap.set(key, {
    isRunning: true,
    abortController,
    startedAt: new Date(),
  });
}

/**
 * Atomically try to set a validation as running (check-and-set)
 * Prevents TOCTOU race conditions when starting validations
 *
 * @returns true if successfully claimed, false if already running
 */
export function trySetValidationRunning(
  projectPath: string,
  issueIdentifier: string,
  abortController: AbortController
): boolean {
  const key = getValidationKey(projectPath, issueIdentifier);
  if (validationStatusMap.has(key)) {
    return false; // Already running
  }
  validationStatusMap.set(key, {
    isRunning: true,
    abortController,
    startedAt: new Date(),
  });
  return true; // Successfully claimed
}

/**
 * Cleanup stale validation entries (e.g., from crashed validations)
 * Should be called periodically to prevent memory leaks
 */
export function cleanupStaleValidations(): number {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [key, status] of validationStatusMap.entries()) {
    if (now - status.startedAt.getTime() > MAX_VALIDATION_AGE_MS) {
      status.abortController.abort();
      validationStatusMap.delete(key);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} stale validation entries`);
  }
  return cleanedCount;
}

/**
 * Clear validation status (call when validation completes or errors)
 */
export function clearValidationStatus(projectPath: string, issueIdentifier: string): void {
  const key = getValidationKey(projectPath, issueIdentifier);
  validationStatusMap.delete(key);
}

/**
 * Abort a running validation
 *
 * @returns true if validation was aborted, false if not running
 */
export function abortValidation(projectPath: string, issueIdentifier: string): boolean {
  const key = getValidationKey(projectPath, issueIdentifier);
  const status = validationStatusMap.get(key);

  if (!status || !status.isRunning) {
    return false;
  }

  status.abortController.abort();
  validationStatusMap.delete(key);
  return true;
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
export { logger };
