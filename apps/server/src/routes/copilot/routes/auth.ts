/**
 * GitHub Copilot authentication handler
 * 
 * Initiates the GitHub device flow authentication process for Copilot access.
 */

import type { Request, Response } from 'express';
import { CopilotAuthManager } from '../../../providers/copilot-auth.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotAuthRoute');

export function createAuthHandler() {
  return async (_req: Request, res: Response) => {
    try {
      logger.info('Starting GitHub Copilot authentication flow...');

      const authManager = new CopilotAuthManager();
      const token = await authManager.authenticate();

      res.json({
        success: true,
        message: 'Successfully authenticated with GitHub Copilot',
        token: token.substring(0, 10) + '...' // Only show first 10 chars for security
      });
    } catch (error) {
      logger.error('Error during Copilot authentication:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
