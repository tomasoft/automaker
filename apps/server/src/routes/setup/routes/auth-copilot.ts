/**
 * GitHub Copilot authentication handler for setup wizard
 *
 * Initiates device flow authentication for GitHub Copilot
 */

import type { Request, Response } from 'express';
import { CopilotAuthManager } from '../../../providers/copilot-auth.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotAuthRoute');

export function createAuthCopilotHandler() {
  return async (_req: Request, res: Response) => {
    try {
      logger.info('Starting GitHub Copilot device flow authentication...');

      const authManager = new CopilotAuthManager();

      // First, send the device code info to the client immediately
      // so they can display it and open the browser
      let deviceCodeSent = false;

      const token = await authManager.authenticate((deviceCode) => {
        if (!deviceCodeSent) {
          deviceCodeSent = true;
          // Send device code info to client via response
          res.json({
            success: true,
            stage: 'device_code',
            deviceCode: {
              verificationUri: deviceCode.verification_uri,
              userCode: deviceCode.user_code,
              expiresIn: deviceCode.expires_in,
            },
            message: 'Please authorize in your browser',
          });
        }
      });

      // If we already sent the device code response, we can't send another
      // This is a limitation of HTTP - we'd need WebSockets for real-time updates
      if (!deviceCodeSent) {
        res.json({
          success: true,
          message: 'Successfully authenticated with GitHub Copilot',
          authenticated: true,
          tokenPreview: token.substring(0, 10) + '...',
        });
      }
    } catch (error) {
      logger.error('GitHub Copilot authentication failed:', error);
      res.status(500).json({
        success: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
