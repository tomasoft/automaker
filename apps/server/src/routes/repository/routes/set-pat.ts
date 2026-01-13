/**
 * Set PAT Route
 *
 * Stores Personal Access Token for Azure DevOps authentication
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('SetPATRoute');

// Store PATs temporarily (in production, use encrypted storage)
const patStorage = new Map<string, string>();

export async function setPATRoute(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, pat } = req.body as {
      sessionId: string;
      pat: string;
    };

    if (!sessionId || !pat) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, pat',
      });
      return;
    }

    // Store PAT (in real implementation, encrypt and store in secure storage)
    patStorage.set(sessionId, pat);

    logger.info(`[SetPAT] PAT stored for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Personal Access Token stored successfully',
    });
  } catch (error) {
    logger.error('[SetPAT] Failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store PAT',
    });
  }
}

// Export helper to retrieve PAT
export function getPAT(sessionId: string): string | undefined {
  return patStorage.get(sessionId);
}
