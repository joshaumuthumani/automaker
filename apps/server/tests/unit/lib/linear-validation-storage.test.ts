import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  writeValidation,
  readValidation,
  getAllValidations,
  deleteValidation,
  isValidationStale,
  isValidIssueIdentifier,
  getValidationWithFreshness,
  markValidationViewed,
  getUnviewedValidationsCount,
  type LinearStoredValidation,
} from '@/lib/linear-validation-storage.js';
import { buildValidationPrompt } from '@/routes/linear/routes/validation-schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('linear-validation-storage.ts', () => {
  let testProjectPath: string;

  beforeEach(async () => {
    testProjectPath = path.join(os.tmpdir(), `linear-validation-storage-test-${Date.now()}`);
    await fs.mkdir(testProjectPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createMockValidation = (
    overrides: Partial<LinearStoredValidation> = {}
  ): LinearStoredValidation => ({
    issueIdentifier: 'ENG-123',
    issueTitle: 'Test Issue',
    projectPath: testProjectPath,
    validatedAt: new Date().toISOString(),
    model: 'haiku',
    result: {
      verdict: 'valid',
      confidence: 'high',
      reasoning: 'Test reasoning',
    },
    ...overrides,
  });

  const linearValidationPath = (projectPath: string, issueIdentifier: string) =>
    path.join(projectPath, '.automaker', 'linear-validations', issueIdentifier, 'validation.json');

  describe('isValidIssueIdentifier', () => {
    it('should accept well-formed Linear identifiers', () => {
      expect(isValidIssueIdentifier('ENG-1')).toBe(true);
      expect(isValidIssueIdentifier('JOS-7')).toBe(true);
      expect(isValidIssueIdentifier('A1B2-4567')).toBe(true);
    });

    it('should reject identifiers that could escape the validations directory', () => {
      expect(isValidIssueIdentifier('../../etc/passwd')).toBe(false);
      expect(isValidIssueIdentifier('ENG-1/../../secrets')).toBe(false);
      expect(isValidIssueIdentifier('..')).toBe(false);
      expect(isValidIssueIdentifier('ENG\\1')).toBe(false);
    });

    it('should reject lowercase, so a mismatched-case request can never collide with the real directory on a case-insensitive filesystem', () => {
      expect(isValidIssueIdentifier('eng-123')).toBe(false);
      expect(isValidIssueIdentifier('Eng-123')).toBe(false);
    });

    it('should reject malformed or non-string identifiers', () => {
      expect(isValidIssueIdentifier('')).toBe(false);
      expect(isValidIssueIdentifier('ENG')).toBe(false);
      expect(isValidIssueIdentifier('ENG-')).toBe(false);
      expect(isValidIssueIdentifier('-123')).toBe(false);
      expect(isValidIssueIdentifier(123)).toBe(false);
      expect(isValidIssueIdentifier(undefined)).toBe(false);
    });
  });

  describe('writeValidation', () => {
    it('should write validation keyed by identifier, not a number', async () => {
      const validation = createMockValidation();

      await writeValidation(testProjectPath, 'ENG-123', validation);

      const content = await fs.readFile(linearValidationPath(testProjectPath, 'ENG-123'), 'utf-8');
      expect(JSON.parse(content)).toEqual(validation);
    });

    it('should store alongside - not inside - the GitHub validations directory', async () => {
      await writeValidation(testProjectPath, 'ENG-123', createMockValidation());

      const githubDir = path.join(testProjectPath, '.automaker', 'validations');
      await expect(fs.access(githubDir)).rejects.toThrow();
    });

    it('should refuse to write with a traversal identifier', async () => {
      await expect(
        writeValidation(testProjectPath, '../escaped', createMockValidation())
      ).rejects.toThrow('Invalid Linear issue identifier');
    });
  });

  describe('readValidation', () => {
    it('should read validation from storage', async () => {
      const validation = createMockValidation();
      await writeValidation(testProjectPath, 'ENG-123', validation);

      expect(await readValidation(testProjectPath, 'ENG-123')).toEqual(validation);
    });

    it('should return null when validation does not exist', async () => {
      expect(await readValidation(testProjectPath, 'ENG-999')).toBeNull();
    });

    it('should return null for a traversal identifier', async () => {
      expect(await readValidation(testProjectPath, '../../etc/passwd')).toBeNull();
    });
  });

  describe('getAllValidations', () => {
    it('should return all validations sorted by identifier', async () => {
      const first = createMockValidation({ issueIdentifier: 'ENG-1', issueTitle: 'Issue 1' });
      const second = createMockValidation({ issueIdentifier: 'ENG-2', issueTitle: 'Issue 2' });

      await writeValidation(testProjectPath, 'ENG-2', second);
      await writeValidation(testProjectPath, 'ENG-1', first);

      const result = await getAllValidations(testProjectPath);

      expect(result).toEqual([first, second]);
    });

    it('should sort numerically, not lexicographically (ENG-2 before ENG-10)', async () => {
      const two = createMockValidation({ issueIdentifier: 'ENG-2', issueTitle: 'Issue 2' });
      const ten = createMockValidation({ issueIdentifier: 'ENG-10', issueTitle: 'Issue 10' });

      await writeValidation(testProjectPath, 'ENG-10', ten);
      await writeValidation(testProjectPath, 'ENG-2', two);

      const result = await getAllValidations(testProjectPath);

      expect(result.map((v) => v.issueIdentifier)).toEqual(['ENG-2', 'ENG-10']);
    });

    it('should return empty array when no validations exist', async () => {
      expect(await getAllValidations(testProjectPath)).toEqual([]);
    });

    it('should skip directories that are not valid identifiers', async () => {
      const validation = createMockValidation({ issueIdentifier: 'ENG-1' });
      await writeValidation(testProjectPath, 'ENG-1', validation);

      await fs.mkdir(path.join(testProjectPath, '.automaker', 'linear-validations', 'invalid'), {
        recursive: true,
      });

      const result = await getAllValidations(testProjectPath);

      expect(result).toEqual([validation]);
    });
  });

  describe('deleteValidation', () => {
    it('should delete validation from storage', async () => {
      await writeValidation(testProjectPath, 'ENG-123', createMockValidation());

      expect(await deleteValidation(testProjectPath, 'ENG-123')).toBe(true);
      expect(await readValidation(testProjectPath, 'ENG-123')).toBeNull();
    });

    it('should return false for a traversal identifier', async () => {
      expect(await deleteValidation(testProjectPath, '../escaped')).toBe(false);
    });
  });

  describe('isValidationStale', () => {
    it('should return false for recent validation', () => {
      expect(isValidationStale(createMockValidation())).toBe(false);
    });

    it('should return true for validation older than 24 hours', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      expect(isValidationStale(createMockValidation({ validatedAt: oldDate.toISOString() }))).toBe(
        true
      );
    });
  });

  describe('getValidationWithFreshness', () => {
    it('should return the validation with its staleness', async () => {
      const validation = createMockValidation();
      await writeValidation(testProjectPath, 'ENG-123', validation);

      const result = await getValidationWithFreshness(testProjectPath, 'ENG-123');

      expect(result).toEqual({ validation, isStale: false });
    });

    it('should return null when validation does not exist', async () => {
      expect(await getValidationWithFreshness(testProjectPath, 'ENG-999')).toBeNull();
    });
  });

  describe('markValidationViewed', () => {
    it('should mark validation as viewed', async () => {
      await writeValidation(testProjectPath, 'ENG-123', createMockValidation());

      expect(await markValidationViewed(testProjectPath, 'ENG-123')).toBe(true);

      const updated = await readValidation(testProjectPath, 'ENG-123');
      expect(updated?.viewedAt).toBeDefined();
    });

    it('should return false when validation does not exist', async () => {
      expect(await markValidationViewed(testProjectPath, 'ENG-999')).toBe(false);
    });
  });

  describe('getUnviewedValidationsCount', () => {
    it('should count only unviewed, non-stale validations', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      await writeValidation(
        testProjectPath,
        'ENG-1',
        createMockValidation({ issueIdentifier: 'ENG-1' })
      );
      await writeValidation(
        testProjectPath,
        'ENG-2',
        createMockValidation({ issueIdentifier: 'ENG-2', viewedAt: new Date().toISOString() })
      );
      await writeValidation(
        testProjectPath,
        'ENG-3',
        createMockValidation({ issueIdentifier: 'ENG-3', validatedAt: oldDate.toISOString() })
      );

      expect(await getUnviewedValidationsCount(testProjectPath)).toBe(1);
    });

    it('should return 0 when no validations exist', async () => {
      expect(await getUnviewedValidationsCount(testProjectPath)).toBe(0);
    });
  });
});

describe('linear validation-schema.ts', () => {
  it('should title the prompt with the Linear identifier rather than a #number', () => {
    const prompt = buildValidationPrompt('ENG-123', 'Fix the flux capacitor', 'It flickers.');

    expect(prompt).toContain('## ENG-123: Fix the flux capacitor');
    expect(prompt).toContain('Linear issue');
    expect(prompt).not.toContain('#ENG-123');
    expect(prompt).not.toContain('GitHub');
  });

  it('should include labels and comments when provided', () => {
    const prompt = buildValidationPrompt(
      'ENG-1',
      'Title',
      'Body',
      ['bug', 'p1'],
      [{ author: 'Ada', createdAt: '2026-09-01T00:00:00.000Z', body: 'Still broken' }]
    );

    expect(prompt).toContain('**Labels:** bug, p1');
    expect(prompt).toContain('Comments (1 total)');
    expect(prompt).toContain('**Ada** (2026-09-01)');
    expect(prompt).toContain('Still broken');
  });

  it('should show only the last 10 comments to bound prompt size', () => {
    const comments = Array.from({ length: 12 }, (_, i) => ({
      author: `user${i}`,
      createdAt: '2026-09-01T00:00:00.000Z',
      body: `comment ${i}`,
    }));

    const prompt = buildValidationPrompt('ENG-1', 'Title', 'Body', undefined, comments);

    expect(prompt).toContain('Comments (12 total, showing last 10)');
    expect(prompt).not.toContain('comment 0');
    expect(prompt).toContain('comment 11');
  });

  it('should fall back to a placeholder for an empty description', () => {
    expect(buildValidationPrompt('ENG-1', 'Title', '')).toContain('(No description provided)');
  });
});
