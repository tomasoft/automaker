/**
 * Check PAT Route
 *
 * Checks if a Personal Access Token exists for a session
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('CheckPATRoute');

/**
 * Create handler factory for checking PAT existence
 */
export function createCheckPATHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as {
        sessionId: string;
      };

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: sessionId',
        });
        return;
      }

      // Check if PAT exists
      const credentials = await settingsService.getCredentials();
      const hasPAT = !!credentials.azureDevOpsPATs?.[sessionId];

      logger.info(
        `[CheckPAT] PAT check for session: "${sessionId}" - ${hasPAT ? 'EXISTS' : 'NOT FOUND'}`
      );

      res.json({
        success: true,
        hasPAT,
      });
    } catch (error) {
      logger.error('[CheckPAT] Failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check PAT',
      });
    }
  };
}
