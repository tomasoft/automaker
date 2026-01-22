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

      logger.info(`[check-auth] Request received, sessionId from query: ${sessionId}`);

      let authManager: AzureDevOpsAuthManager | null = null;
      let actualSessionId: string | undefined;

      if (sessionId) {
        logger.info(`[check-auth] Checking for sessionId: ${sessionId}`);
        // Try to use the provided sessionId
        authManager = azureAuthSessions.get(sessionId) || null;

        if (authManager) {
          logger.info(`[check-auth] Found session in memory: ${sessionId}`);
          actualSessionId = sessionId;
        } else {
          logger.info(`[check-auth] Session not in memory, checking persisted storage`);
          // If not in memory, try to restore from persisted tokens
          const tokenData = await settingsService.getAzureAuthToken(sessionId);
          if (tokenData) {
            logger.info(`[check-auth] Restoring Azure session ${sessionId} from persisted storage`);
            authManager = new AzureDevOpsAuthManager();
            authManager.setCachedToken({
              accessToken: tokenData.accessToken,
              refreshToken: tokenData.refreshToken,
              expiresAt: tokenData.expiresAt,
              userId: tokenData.userId,
            });
            // Add back to in-memory sessions
            azureAuthSessions.set(sessionId, authManager);
            actualSessionId = sessionId;
          } else {
            logger.warn(`[check-auth] No persisted token found for sessionId: ${sessionId}`);
          }
        }
      }

      // If no sessionId provided or sessionId not found, try to find any valid session
      if (!authManager) {
        logger.info('[check-auth] No valid session yet, looking for any available session');
        const sessions = Array.from(azureAuthSessions.entries());
        logger.info(`[check-auth] Found ${sessions.length} in-memory sessions`);

        if (sessions.length > 0) {
          logger.info('[check-auth] Using first available in-memory session');
          [actualSessionId, authManager] = sessions[0];
          logger.info(`[check-auth] Using session: ${actualSessionId}`);
        } else {
          logger.info('[check-auth] No in-memory sessions, checking persisted storage');
          // Try to restore from persisted storage
          const allTokens = await settingsService.getAllAzureAuthTokens();
          const sessionIds = Object.keys(allTokens);
          logger.info(`[check-auth] Found ${sessionIds.length} persisted sessions`);

          if (sessionIds.length > 0) {
            const firstSessionId = sessionIds[0];
            const tokenData = allTokens[firstSessionId];
            logger.info(`[check-auth] Restoring session ${firstSessionId} from persisted storage`);
            authManager = new AzureDevOpsAuthManager();
            authManager.setCachedToken({
              accessToken: tokenData.accessToken,
              refreshToken: tokenData.refreshToken,
              expiresAt: tokenData.expiresAt,
              userId: tokenData.userId,
            });
            azureAuthSessions.set(firstSessionId, authManager);
            actualSessionId = firstSessionId;
          }
        }
      }

      if (!authManager) {
        logger.warn('[check-auth] No auth manager found - not authenticated');
        res.json({
          success: true,
          authenticated: false,
        });
        return;
      }

      // At this point, authManager is guaranteed to exist
      // Check if we have a cached token (don't try to refresh it)
      const tokenInfo = authManager.getCachedTokenInfo();
      logger.info(`[check-auth] Token info:`, {
        hasAccessToken: !!tokenInfo?.accessToken,
        hasRefreshToken: !!tokenInfo?.refreshToken,
        expiresAt: tokenInfo?.expiresAt,
        currentTime: Date.now(),
        userId: tokenInfo?.userId,
        sessionId: actualSessionId,
      });

      const hasToken = !!tokenInfo && !!tokenInfo.accessToken;

      // Check if token is expired
      const isExpired = tokenInfo ? tokenInfo.expiresAt < Date.now() : true;

      logger.info(
        `[check-auth] Token check: hasToken=${hasToken}, isExpired=${isExpired}, sessionId=${actualSessionId}`
      );

      res.json({
        success: true,
        authenticated: hasToken && !isExpired,
        sessionId: actualSessionId, // Return the actual sessionId being used
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
