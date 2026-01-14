/**
 * Azure DevOps authentication - check status
 *
 * Returns current authentication status
 */

import type { Request, Response } from 'express';
import { SettingsService } from '../../../services/settings-service.js';
import { AzureDevOpsAuthManager } from '../../../providers/azure-devops-auth.js';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from './poll-azure-auth.js';

const logger = createLogger('AzureStatusRoute');

export function createCheckAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { sessionId } = req.query as { sessionId?: string };

      if (!sessionId) {
        res.json({
          success: true,
          authenticated: false,
        });
        return;
      }

      // First check in-memory sessions
      let authManager = azureAuthSessions.get(sessionId);

      // If not in memory, try to restore from persisted tokens
      if (!authManager) {
        const tokenData = await settingsService.getAzureAuthToken(sessionId);
        if (tokenData) {
          logger.info(`Restoring Azure session ${sessionId} from persisted storage`);
          authManager = new AzureDevOpsAuthManager();
          authManager.setCachedToken({
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            userId: tokenData.userId,
          });
          // Add back to in-memory sessions
          azureAuthSessions.set(sessionId, authManager);
        } else {
          // No session found in memory or persisted storage
          res.json({
            success: true,
            authenticated: false,
          });
          return;
        }
      }

      // At this point, authManager is guaranteed to exist
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
