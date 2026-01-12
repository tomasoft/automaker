/**
 * Azure DevOps authentication - poll for completion
 *
 * Client calls this repeatedly to check if user has authorized
 */

import type { Request, Response } from 'express';
import { AzureDevOpsAuthManager } from '../../../providers/azure-devops-auth.js';
import { createLogger } from '@automaker/utils';
import { pendingAzureAuths } from './start-azure-auth.js';

const logger = createLogger('AzurePollRoute');

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// Store authenticated sessions (in production, use proper session management)
export const azureAuthSessions = new Map<string, AzureDevOpsAuthManager>();

export function createPollAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { deviceCodeId, organization, project, wikiId } = req.body as {
        deviceCodeId: string;
        organization?: string;
        project?: string;
        wikiId?: string;
      };

      if (!deviceCodeId) {
        res.json({
          success: false,
          status: 'error',
          error: 'Device code ID required',
        });
        return;
      }

      const pendingAuth = pendingAzureAuths.get(deviceCodeId);
      if (!pendingAuth) {
        res.json({
          success: false,
          status: 'expired',
          error: 'Device code expired or not found',
        });
        return;
      }

      // Poll Microsoft Entra ID for access token
      const CLIENT_ID = '499b84ac-1321-427f-aa17-267ca6975798';
      const TENANT_ID = 'common';

      const params = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT_ID,
        device_code: deviceCodeId,
      });

      const response = await fetch(
        `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = (await response.json()) as TokenResponse;

      if (data.error === 'authorization_pending') {
        // Still waiting
        res.json({
          success: true,
          status: 'pending',
        });
        return;
      }

      if (data.error === 'slow_down') {
        // Polling too fast
        logger.warn('Microsoft says to slow down polling');
        res.json({
          success: true,
          status: 'pending',
          slowDown: true,
        });
        return;
      }

      if (data.error) {
        logger.error('Azure authorization error:', data.error);
        res.json({
          success: true,
          status: 'error',
          error: data.error_description || data.error,
        });
        return;
      }

      if (data.access_token && data.refresh_token && data.expires_in) {
        // Success! Create auth manager and store session
        const authManager = new AzureDevOpsAuthManager();
        authManager.setCachedToken({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        });

        // Get user ID from token
        const tokenInfo = authManager.getCachedTokenInfo();

        // Store auth manager in session (in production, serialize to database/redis)
        const sessionId = `azure_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        azureAuthSessions.set(sessionId, authManager);

        // Clean up pending auth
        pendingAzureAuths.delete(deviceCodeId);

        logger.info('Successfully authenticated with Azure DevOps');

        res.json({
          success: true,
          status: 'complete',
          sessionId,
          userId: tokenInfo?.userId,
          // Include organization/project/wiki config if provided
          config:
            organization && project && wikiId
              ? {
                  organization,
                  project,
                  wikiId,
                }
              : undefined,
        });
      } else {
        res.json({
          success: true,
          status: 'pending',
        });
      }
    } catch (error) {
      logger.error('Failed to poll Azure DevOps authentication:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
