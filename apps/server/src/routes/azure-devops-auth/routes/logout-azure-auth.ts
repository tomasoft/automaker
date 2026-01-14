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
      const { sessionId } = req.body as { sessionId?: string };

      if (!sessionId) {
        // No session ID provided - clear all sessions
        logger.info('No sessionId provided, clearing all Azure DevOps sessions');
        const sessionCount = azureAuthSessions.size;

        // Revoke all tokens
        for (const [id, authManager] of azureAuthSessions.entries()) {
          try {
            await authManager.revoke();
          } catch (error) {
            logger.warn(`Failed to revoke session ${id}:`, error);
          }
        }

        // Clear all sessions (in-memory)
        azureAuthSessions.clear();

        // Clear all persisted tokens
        await settingsService.clearAllAzureAuthTokens();

        logger.info(`Cleared ${sessionCount} Azure DevOps session(s)`);
        res.json({
          success: true,
          message: 'All sessions cleared',
        });
        return;
      }

      const authManager = azureAuthSessions.get(sessionId);
      if (authManager) {
        // Revoke tokens
        await authManager.revoke();

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
