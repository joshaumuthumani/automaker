/**
 * POST /check-connection endpoint - Check whether Linear is reachable with the stored API key
 */

import type { Request, Response } from 'express';
import { getLinearApiKey, linearGraphQL, getErrorMessage, logError } from './common.js';

const VIEWER_QUERY = `
  query Me {
    viewer {
      id
      name
    }
  }`;

export interface LinearViewer {
  id: string;
  name: string;
}

export interface LinearConnectionStatus {
  connected: boolean;
  viewer: LinearViewer | null;
}

/**
 * @param candidateKey - Key to test instead of the stored one, so Settings can
 *   verify a pasted key before saving it.
 */
export async function checkLinearConnection(
  candidateKey?: string
): Promise<LinearConnectionStatus> {
  const apiKey = candidateKey || getLinearApiKey();
  if (!apiKey) {
    return { connected: false, viewer: null };
  }

  try {
    const data = await linearGraphQL<{ viewer: LinearViewer | null }>(apiKey, VIEWER_QUERY);
    if (!data.viewer) {
      return { connected: false, viewer: null };
    }
    return { connected: true, viewer: data.viewer };
  } catch {
    // An unusable key is reported as "not connected" rather than an error,
    // so the sidebar can simply hide the Linear section.
    return { connected: false, viewer: null };
  }
}

export function createCheckLinearConnectionHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKey } = req.body as { apiKey?: string };
      const status = await checkLinearConnection(apiKey);
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Check Linear connection failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
