/**
 * Azure DevOps Wiki - get current config endpoint
 *
 * GET /api/azure-devops-wiki/config
 * Returns the organization and project from settings
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('AzureWikiRoutes');

export function createGetConfigHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response) => {
    try {
      // Get the first authenticated session (there should only be one)
      const authManager = Array.from(azureAuthSessions.values())[0];

      if (!authManager) {
        res.json({
          success: false,
          error: 'Not authenticated with Azure DevOps',
        });
        return;
      }

      // Get cached token info which might have config data
      const tokenInfo = authManager.getCachedTokenInfo();

      // Get Azure DevOps config from settings (saved during authentication)
      const settings = await settingsService.getGlobalSettings();

      logger.info('Returning Azure DevOps config from settings:', {
        organization: settings.azureDevOps?.organization,
        project: settings.azureDevOps?.project,
      });

      res.json({
        success: true,
        authenticated: true,
        userId: tokenInfo?.userId,
        organization: settings.azureDevOps?.organization,
        project: settings.azureDevOps?.project,
        wikiId: settings.azureDevOps?.wikiId,
      });
    } catch (error) {
      logger.error('Failed to get Azure DevOps config:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
