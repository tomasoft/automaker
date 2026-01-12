/**
 * Azure DevOps authentication - check status
 *
 * Returns current authentication status
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from './poll-azure-auth.js';

const logger = createLogger('AzureStatusRoute');

export function createCheckAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.query as { sessionId?: string };

      if (!sessionId) {
        res.json({
          success: true,
          authenticated: false,
        });
        return;
      }

      const authManager = azureAuthSessions.get(sessionId);
      if (!authManager) {
        res.json({
          success: true,
          authenticated: false,
        });
        return;
      }

      // Check if token is still valid
      const isValid = await authManager.checkAccess();
      const tokenInfo = authManager.getCachedTokenInfo();

      res.json({
        success: true,
        authenticated: isValid,
        userId: tokenInfo?.userId,
        expiresAt: tokenInfo?.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to check Azure DevOps authentication status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
