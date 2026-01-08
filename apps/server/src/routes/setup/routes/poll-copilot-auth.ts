/**
 * GitHub Copilot authentication - poll for completion
 *
 * Client calls this repeatedly to check if user has authorized
 */

import type { Request, Response } from 'express';
import { CopilotAuthManager } from '../../../providers/copilot-auth.js';
import { createLogger } from '@automaker/utils';
import { pendingAuths } from './start-copilot-auth.js';
import { setApiKey, getApiKey, persistApiKeyToEnv } from '../common.js';

const logger = createLogger('CopilotPollRoute');

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export function createPollCopilotAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { deviceCodeId } = req.body as { deviceCodeId: string };

      if (!deviceCodeId) {
        res.json({
          success: false,
          status: 'error',
          error: 'Device code ID required',
        });
        return;
      }

      const pendingAuth = pendingAuths.get(deviceCodeId);
      if (!pendingAuth) {
        res.json({
          success: false,
          status: 'expired',
          error: 'Device code expired or not found',
        });
        return;
      }

      // Poll GitHub for access token
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: 'Iv1.b507a08c87ecfe98',
          device_code: deviceCodeId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data: AccessTokenResponse = await response.json();

      if (data.error === 'authorization_pending') {
        // Still waiting
        res.json({
          success: true,
          status: 'pending',
        });
        return;
      }

      if (data.error === 'slow_down') {
        // Polling too fast - tell client to slow down but don't fail
        logger.warn('GitHub says to slow down polling');
        res.json({
          success: true,
          status: 'pending',
          slowDown: true, // Signal to client to increase interval
        });
        return;
      }

      if (data.error) {
        logger.error('GitHub authorization error:', data.error);
        // Don't delete pending auth on errors - let it expire naturally
        res.json({
          success: true,
          status: 'pending',
          error: data.error_description || data.error,
        });
        return;
      }

      if (data.access_token) {
        // Success! Get Copilot token and store GitHub token
        try {
          const authManager = new CopilotAuthManager(data.access_token);
          const copilotToken = await authManager.getToken();

          // Store the GitHub access token for future use (in-memory)
          setApiKey('github_token', data.access_token);
          logger.info(
            `[CopilotPollRoute] Stored GitHub token in memory (length: ${data.access_token.length})`
          );

          // Also set in process.env for immediate availability
          process.env.GITHUB_TOKEN = data.access_token;
          logger.info('[CopilotPollRoute] Set GITHUB_TOKEN in process.env');

          // Persist token to .env file for survival across restarts
          try {
            await persistApiKeyToEnv('GITHUB_TOKEN', data.access_token);
            logger.info('[CopilotPollRoute] Persisted GitHub token to .env file');
          } catch (error) {
            logger.warn('[CopilotPollRoute] Failed to persist token to .env:', error);
            // Continue anyway - in-memory token will work for this session
          }

          // Verify it was stored in memory
          const verifyToken = getApiKey('github_token');
          logger.info(
            `[CopilotPollRoute] Verification - token retrieved from memory: ${!!verifyToken}`
          );
          logger.info(
            `[CopilotPollRoute] Verification - token in process.env: ${!!process.env.GITHUB_TOKEN}`
          );

          // Clean up pending auth
          pendingAuths.delete(deviceCodeId);

          logger.info('Successfully authenticated with GitHub Copilot');

          res.json({
            success: true,
            status: 'completed',
            authenticated: true,
            tokenPreview: copilotToken.substring(0, 10) + '...',
          });
        } catch (error) {
          logger.error('Failed to get Copilot token:', error);
          pendingAuths.delete(deviceCodeId);
          res.json({
            success: false,
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to get Copilot token',
          });
        }
        return;
      }

      // Unknown state
      res.json({
        success: false,
        status: 'error',
        error: 'Unexpected response from GitHub',
      });
    } catch (error) {
      logger.error('Error polling for Copilot authentication:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
