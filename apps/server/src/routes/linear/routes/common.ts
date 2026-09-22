/**
 * Common utilities for Linear routes
 *
 * Linear has no CLI equivalent to `gh`, so every request goes straight to the
 * Linear GraphQL HTTP API using the user's personal API key.
 */

import { getApiKey } from '../../setup/common.js';

// Re-export shared utilities from the canonical location
export { getErrorMessage, logError } from '../../../lib/exec-utils.js';

const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';
/** Timeout for Linear API requests in milliseconds */
const LINEAR_API_TIMEOUT_MS = 30000;

export const LINEAR_NOT_CONNECTED_ERROR =
  'Linear is not connected. Add a Linear API key in Settings.';

interface LinearGraphQLResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

/**
 * Resolve the Linear personal API key from the in-memory store or environment.
 * The key is app-level (not per project), matching how Linear scopes access.
 */
export function getLinearApiKey(): string | undefined {
  return getApiKey('linear') || process.env.LINEAR_API_KEY || undefined;
}

/**
 * Execute a GraphQL query against the Linear API.
 *
 * Note: Linear expects the raw API key in the Authorization header,
 * without a `Bearer ` prefix.
 */
export async function linearGraphQL<TData>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> {
  const response = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(LINEAR_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as LinearGraphQLResponse<TData>;

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors[0].message);
  }

  if (!payload.data) {
    throw new Error('Linear API returned no data');
  }

  return payload.data;
}
