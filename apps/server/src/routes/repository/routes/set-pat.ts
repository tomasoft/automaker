/**
 * Set PAT Route
 *
 * Stores Personal Access Token for Azure DevOps authentication
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SetPATRoute');

/**
 * Create handler factory for setting PAT
 */
export function createSetPATHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, pat } = req.body as {
        sessionId: string;
        pat: string;
      };

      if (!sessionId || !pat) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: sessionId, pat',
        });
        return;
      }

      // Store PAT persistently in credentials
      const credentials = await settingsService.getCredentials();
      const azureDevOpsPATs = credentials.azureDevOpsPATs || {};
      azureDevOpsPATs[sessionId] = pat;

      await settingsService.updateCredentials({
        azureDevOpsPATs,
      });

      logger.info(`[SetPAT] PAT stored for session: "${sessionId}"`);
      logger.info(`[SetPAT] Total PATs stored: ${Object.keys(azureDevOpsPATs).length}`);

      res.json({
        success: true,
        message: 'Personal Access Token stored successfully',
      });
    } catch (error) {
      logger.error('[SetPAT] Failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store PAT',
      });
    }
  };
}

/**
 * Create helper to retrieve PAT
 */
export function createGetPATHelper(settingsService: SettingsService) {
  return async (sessionId: string): Promise<string | undefined> => {
    try {
      const credentials = await settingsService.getCredentials();
      const pat = credentials.azureDevOpsPATs?.[sessionId];
      logger.info(`[GetPAT] Looking up PAT for session: "${sessionId}"`);
      logger.info(`[GetPAT] PAT found: ${pat ? 'YES' : 'NO'}`);
      return pat;
    } catch (error) {
      logger.error('[GetPAT] Failed to retrieve PAT:', error);
      return undefined;
    }
  };
}
