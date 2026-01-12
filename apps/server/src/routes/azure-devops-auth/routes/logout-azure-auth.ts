/**
 * Azure DevOps authentication - logout
 *
 * Revokes tokens and clears session
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from './poll-azure-auth.js';

const logger = createLogger('AzureLogoutRoute');

export function createLogoutAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body as { sessionId?: string };

      if (!sessionId) {
        res.json({
          success: false,
          error: 'Session ID required',
        });
        return;
      }

      const authManager = azureAuthSessions.get(sessionId);
      if (!authManager) {
        res.json({
          success: true,
          message: 'Session not found or already logged out',
        });
        return;
      }

      // Revoke tokens
      await authManager.revoke();

      // Remove from sessions
      azureAuthSessions.delete(sessionId);

      logger.info('Successfully logged out from Azure DevOps');

      res.json({
        success: true,
        message: 'Successfully logged out',
      });
    } catch (error) {
      logger.error('Failed to logout from Azure DevOps:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
