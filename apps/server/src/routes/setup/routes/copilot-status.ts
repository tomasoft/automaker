/**
 * GitHub Copilot status handler for setup wizard
 */

import type { Request, Response } from 'express';
import { GitHubCopilotProvider } from '../../../providers/github-copilot-provider.js';
import { createLogger } from '@automaker/utils';
import { getApiKey } from '../common.js';

const logger = createLogger('CopilotStatusRoute');

export function createCopilotStatusHandler() {
  return async (_req: Request, res: Response) => {
    try {
      // Check if we have a stored GitHub token
      const storedToken = getApiKey('github_token');
      logger.info(`[CopilotStatusRoute] Checking status. Stored token exists: ${!!storedToken}`);
      if (storedToken) {
        logger.info(
          `[CopilotStatusRoute] Token length: ${storedToken.length}, starts with: ${storedToken.substring(0, 7)}...`
        );
      }

      const provider = new GitHubCopilotProvider({ githubToken: storedToken || undefined });
      const status = await provider.detectInstallation();

      logger.info('[CopilotStatusRoute] GitHub Copilot status check result:', {
        installed: status.installed,
        authenticated: status.authenticated,
        hasApiKey: status.hasApiKey,
        method: status.method,
        error: status.error,
      });

      res.json({
        success: true,
        installed: status.installed,
        authenticated: status.authenticated,
        hasApiKey: status.hasApiKey,
        method: status.method || 'sdk',
        error: status.error,
        // Provide helpful instructions
        instructions: !status.authenticated
          ? 'Set GITHUB_TOKEN environment variable or use the interactive login'
          : undefined,
      });
    } catch (error) {
      logger.error('Error checking GitHub Copilot status:', error);
      res.status(500).json({
        success: false,
        installed: false,
        authenticated: false,
        hasApiKey: false,
        method: 'none',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
