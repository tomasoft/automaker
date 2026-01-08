/**
 * GitHub Copilot status handler
 * 
 * Checks the current authentication status with GitHub Copilot.
 */

import type { Request, Response } from 'express';
import { GitHubCopilotProvider } from '../../../providers/github-copilot-provider.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotStatusRoute');

export function createStatusHandler() {
  return async (_req: Request, res: Response) => {
    try {
      const provider = new GitHubCopilotProvider();
      const status = await provider.detectInstallation();

      logger.debug('Copilot status:', status);

      res.json({
        success: true,
        status: {
          installed: status.installed,
          authenticated: status.authenticated,
          hasApiKey: status.hasApiKey,
          method: status.method,
          error: status.error,
        },
      });
    } catch (error) {
      logger.error('Error checking Copilot status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
