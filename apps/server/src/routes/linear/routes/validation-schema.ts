/**
 * Linear Issue Validation Schema and Prompt Building
 *
 * Defines the JSON schema for Claude's structured output and
 * helper functions for building validation prompts.
 *
 * Note: The system prompt is shared with GitHub issue validation - it is
 * centralized in @automaker/prompts and accessed via getPromptCustomization()
 * in validate-issue.ts.
 *
 * Linear issues in this integration carry no linked-PR information, so the
 * GitHub schema's `prAnalysis` field and PR prompt section are deliberately
 * left out rather than carried over as dead weight.
 */

/**
 * JSON Schema for Linear issue validation structured output.
 * Used with Claude SDK's outputFormat option to ensure reliable parsing.
 */
export const issueValidationSchema = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['valid', 'invalid', 'needs_clarification'],
      description: 'The validation verdict for the issue',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident the AI is in its assessment',
    },
    reasoning: {
      type: 'string',
      description: 'Detailed explanation of the verdict',
    },
    bugConfirmed: {
      type: 'boolean',
      description: 'For bug reports: whether the bug was confirmed in the codebase',
    },
    relatedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files related to the issue found during analysis',
    },
    suggestedFix: {
      type: 'string',
      description: 'Suggested approach to fix or implement the issue',
    },
    missingInfo: {
      type: 'array',
      items: { type: 'string' },
      description: 'Information needed when verdict is needs_clarification',
    },
    estimatedComplexity: {
      type: 'string',
      enum: ['trivial', 'simple', 'moderate', 'complex', 'very_complex'],
      description: 'Estimated effort to address the issue',
    },
  },
  required: ['verdict', 'confidence', 'reasoning'],
  additionalProperties: false,
} as const;

/**
 * Comment data structure for validation prompt
 */
export interface ValidationComment {
  author: string;
  createdAt: string;
  body: string;
}

/**
 * Build the user prompt for Linear issue validation.
 *
 * Creates a structured prompt that includes the issue details for Claude
 * to analyze against the codebase.
 *
 * @param issueIdentifier - The Linear issue identifier, e.g. "ENG-123"
 * @param issueTitle - The issue title
 * @param issueBody - The issue description
 * @param issueLabels - Optional array of label names
 * @param comments - Optional array of comments to include in analysis
 * @returns Formatted prompt string for the validation request
 */
export function buildValidationPrompt(
  issueIdentifier: string,
  issueTitle: string,
  issueBody: string,
  issueLabels?: string[],
  comments?: ValidationComment[]
): string {
  const labelsSection = issueLabels?.length ? `\n\n**Labels:** ${issueLabels.join(', ')}` : '';

  let commentsSection = '';
  if (comments && comments.length > 0) {
    // Limit to most recent 10 comments to control prompt size
    const recentComments = comments.slice(-10);
    const commentsText = recentComments
      .map(
        (c) => `**${c.author}** (${new Date(c.createdAt).toISOString().slice(0, 10)}):\n${c.body}`
      )
      .join('\n\n---\n\n');

    commentsSection = `\n\n### Comments (${comments.length} total${comments.length > 10 ? ', showing last 10' : ''})\n\n${commentsText}`;
  }

  return `Please validate the following Linear issue by analyzing the codebase:

## ${issueIdentifier}: ${issueTitle}
${labelsSection}

### Description

${issueBody || '(No description provided)'}
${commentsSection}

---

Scan the codebase to verify this issue. Look for the files, components, or functionality mentioned. Determine if this issue is valid, invalid, or needs clarification.${comments && comments.length > 0 ? ' Consider the context provided in the comments as well.' : ''}`;
}
