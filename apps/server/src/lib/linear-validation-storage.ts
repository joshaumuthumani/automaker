/**
 * Linear Validation Storage - CRUD operations for Linear issue validation results
 *
 * Stores validation results in .automaker/linear-validations/{issueIdentifier}/validation.json
 * Mirrors validation-storage.ts, but Linear issues have no numeric issue number - their
 * human-readable `identifier` (e.g. "ENG-123") is the stable, filesystem-safe key instead.
 */

import * as secureFs from './secure-fs.js';
import {
  getLinearValidationsDir,
  getLinearValidationDir,
  getLinearValidationPath,
} from '@automaker/platform';
import type { LinearStoredValidation } from '@automaker/types';

// Re-export LinearStoredValidation for convenience
export type { LinearStoredValidation };

/** Number of hours before a validation is considered stale */
const VALIDATION_CACHE_TTL_HOURS = 24;

/**
 * Linear identifiers are a team key plus an issue number, e.g. "ENG-123".
 * Anchored so nothing that could escape the validations directory (`..`, `/`, `\`)
 * can ever be used as a directory name. Uppercase-only (Linear's real identifiers
 * always are) so a differently-cased request can never collide with the real
 * directory on a case-insensitive filesystem (macOS, Windows).
 */
const ISSUE_IDENTIFIER_PATTERN = /^[A-Z0-9]+-\d+$/;

/**
 * Whether a string is a well-formed Linear issue identifier.
 *
 * Used both at the HTTP boundary (to reject bad input with a 400) and inside this
 * module (so no storage path can be built from an untrusted value).
 */
export function isValidIssueIdentifier(issueIdentifier: unknown): issueIdentifier is string {
  return typeof issueIdentifier === 'string' && ISSUE_IDENTIFIER_PATTERN.test(issueIdentifier);
}

/**
 * Throw if the identifier could not safely be used as a directory name.
 */
function assertValidIssueIdentifier(issueIdentifier: string): void {
  if (!isValidIssueIdentifier(issueIdentifier)) {
    throw new Error(`Invalid Linear issue identifier: ${issueIdentifier}`);
  }
}

/**
 * Write validation result to storage
 *
 * Creates the validation directory if needed and stores the result as JSON.
 *
 * @param projectPath - Absolute path to project directory
 * @param issueIdentifier - Linear issue identifier, e.g. "ENG-123"
 * @param data - Validation data to store
 */
export async function writeValidation(
  projectPath: string,
  issueIdentifier: string,
  data: LinearStoredValidation
): Promise<void> {
  assertValidIssueIdentifier(issueIdentifier);

  const validationDir = getLinearValidationDir(projectPath, issueIdentifier);
  const validationPath = getLinearValidationPath(projectPath, issueIdentifier);

  // Ensure directory exists
  await secureFs.mkdir(validationDir, { recursive: true });

  // Write validation result
  await secureFs.writeFile(validationPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read validation result from storage
 *
 * @param projectPath - Absolute path to project directory
 * @param issueIdentifier - Linear issue identifier, e.g. "ENG-123"
 * @returns Stored validation or null if not found
 */
export async function readValidation(
  projectPath: string,
  issueIdentifier: string
): Promise<LinearStoredValidation | null> {
  if (!isValidIssueIdentifier(issueIdentifier)) {
    return null;
  }

  try {
    const validationPath = getLinearValidationPath(projectPath, issueIdentifier);
    const content = (await secureFs.readFile(validationPath, 'utf-8')) as string;
    return JSON.parse(content) as LinearStoredValidation;
  } catch {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Get all stored validations for a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Array of stored validations
 */
export async function getAllValidations(projectPath: string): Promise<LinearStoredValidation[]> {
  const validationsDir = getLinearValidationsDir(projectPath);

  try {
    const dirs = await secureFs.readdir(validationsDir, { withFileTypes: true });

    // Read all validation files in parallel for better performance
    const promises = dirs
      .filter((dir) => dir.isDirectory())
      .map((dir) => readValidation(projectPath, dir.name));

    const results = await Promise.all(promises);
    const validations = results.filter((v): v is LinearStoredValidation => v !== null);

    // Sort by issue identifier (numeric-aware, so "ENG-2" sorts before "ENG-10")
    validations.sort((a, b) =>
      a.issueIdentifier.localeCompare(b.issueIdentifier, undefined, { numeric: true })
    );

    return validations;
  } catch {
    // Directory doesn't exist
    return [];
  }
}

/**
 * Delete a validation from storage
 *
 * @param projectPath - Absolute path to project directory
 * @param issueIdentifier - Linear issue identifier, e.g. "ENG-123"
 * @returns true if validation was deleted, false if not found
 */
export async function deleteValidation(
  projectPath: string,
  issueIdentifier: string
): Promise<boolean> {
  try {
    assertValidIssueIdentifier(issueIdentifier);
    const validationDir = getLinearValidationDir(projectPath, issueIdentifier);
    await secureFs.rm(validationDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a validation is stale (older than TTL)
 *
 * @param validation - Stored validation to check
 * @returns true if validation is older than 24 hours
 */
export function isValidationStale(validation: LinearStoredValidation): boolean {
  const validatedAt = new Date(validation.validatedAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - validatedAt.getTime()) / (1000 * 60 * 60);
  return hoursDiff > VALIDATION_CACHE_TTL_HOURS;
}

/**
 * Get validation with freshness info
 *
 * @param projectPath - Absolute path to project directory
 * @param issueIdentifier - Linear issue identifier, e.g. "ENG-123"
 * @returns Object with validation and isStale flag, or null if not found
 */
export async function getValidationWithFreshness(
  projectPath: string,
  issueIdentifier: string
): Promise<{ validation: LinearStoredValidation; isStale: boolean } | null> {
  const validation = await readValidation(projectPath, issueIdentifier);
  if (!validation) {
    return null;
  }

  return {
    validation,
    isStale: isValidationStale(validation),
  };
}

/**
 * Mark a validation as viewed by the user
 *
 * @param projectPath - Absolute path to project directory
 * @param issueIdentifier - Linear issue identifier, e.g. "ENG-123"
 * @returns true if validation was marked as viewed, false if not found
 */
export async function markValidationViewed(
  projectPath: string,
  issueIdentifier: string
): Promise<boolean> {
  const validation = await readValidation(projectPath, issueIdentifier);
  if (!validation) {
    return false;
  }

  validation.viewedAt = new Date().toISOString();
  await writeValidation(projectPath, issueIdentifier, validation);
  return true;
}

/**
 * Get count of unviewed, non-stale validations for a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Number of unviewed validations
 */
export async function getUnviewedValidationsCount(projectPath: string): Promise<number> {
  const validations = await getAllValidations(projectPath);
  return validations.filter((v) => !v.viewedAt && !isValidationStale(v)).length;
}
