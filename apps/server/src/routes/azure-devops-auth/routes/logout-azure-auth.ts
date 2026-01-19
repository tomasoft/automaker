/**
 * Azure DevOps authentication - logout
 *
 * Revokes tokens and clears session
 */

import type { Request, Response } from 'express';
import { SettingsService } from '../../../services/settings-service.js';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from './poll-azure-auth.js';

const logger = createLogger('AzureLogoutRoute');

export function createLogoutAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      let { sessionId } = req.body as { sessionId?: string };

      // If no sessionId provided, auto-detect the active session
      if (!sessionId) {
        if (azureAuthSessions.size === 0) {
          logger.info('No active sessions to logout from');
          res.json({
            success: true,
            message: 'No active sessions',
          });
          return;
        }

        // Get the first (and ideally only) session
        sessionId = Array.from(azureAuthSessions.keys())[0];
        logger.info(`No sessionId provided, auto-detected session: ${sessionId}`);
      }

      const authManager = azureAuthSessions.get(sessionId);
      if (authManager) {
        // Revoke tokens
        try {
          await authManager.revoke();
        } catch (error) {
          logger.warn(`Failed to revoke tokens for session ${sessionId}:`, error);
        }

        // Remove from in-memory sessions
        azureAuthSessions.delete(sessionId);
      }

      // Remove from persisted tokens (even if not in memory)
      await settingsService.deleteAzureAuthToken(sessionId);

      logger.info(`Successfully logged out from Azure DevOps (session: ${sessionId})`);
      logger.info(`Remaining sessions: ${azureAuthSessions.size}`);

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
