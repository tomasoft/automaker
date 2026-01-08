/**
 * Local LLM Status Route
 *
 * Returns the connection status of the local LLM server
 */

import { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { LocalLLMProvider } from '../../../providers/local-llm-provider.js';

const logger = createLogger('LocalLLMStatusRoute');

export function createGetLocalLLMStatusHandler() {
  return async (req: Request, res: Response) => {
    try {
      const provider = new LocalLLMProvider();
      const status = await provider.detectInstallation();

      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logger.error('Error checking Local LLM status:', error);
      res.json({
        success: false,
        installed: false,
        method: 'local',
        hasApiKey: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Failed to check status',
      });
    }
  };
}
