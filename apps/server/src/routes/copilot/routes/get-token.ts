/**
 * GitHub Copilot token retrieval handler
 * 
 * Returns the current Copilot API token (partially masked for security).
 */

import type { Request, Response } from 'express';
import { GitHubCopilotProvider } from '../../../providers/github-copilot-provider.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotTokenRoute');

export function createGetTokenHandler() {
  return async (_req: Request, res: Response) => {
    try {
      const provider = new GitHubCopilotProvider();
      const token = await provider.getToken();

      // Only show first and last few characters for security
      const maskedToken = token.length > 20
        ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}`
        : token.substring(0, 10) + '...';

      res.json({
        success: true,
        token: maskedToken,
      });
    } catch (error) {
      logger.error('Error getting Copilot token:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
