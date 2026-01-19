/**
 * Azure DevOps Wiki - list pages endpoint
 *
 * POST /api/azure-devops-wiki/pages
 * Returns list of pages in a wiki
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWikiRoutes');

export function createListPagesHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { organization, project, wikiId, path, sessionId } = req.body as {
        organization: string;
        project: string;
        wikiId: string;
        path?: string;
        sessionId?: string;
      };

      if (!organization || !project || !wikiId) {
        res.status(400).json({
          success: false,
          error: 'organization, project, and wikiId are required',
        });
        return;
      }

      // Get authenticated session using sessionId
      const authManager = await getAuthSessionBySessionId(sessionId, settingsService);

      if (!authManager) {
        logger.warn('No Azure DevOps auth session found');
        res.status(401).json({
          success: false,
          error: 'Not authenticated with Azure DevOps. Please sign in first.',
        });
        return;
      }

      // Check if auth manager has a token
      const tokenInfo = authManager.getCachedTokenInfo();
      logger.info(`Token info:`, tokenInfo);
      if (!tokenInfo) {
        logger.warn('Auth manager exists but has no cached token');
        res.status(401).json({
          success: false,
          error: 'Authentication expired. Please sign in again.',
        });
        return;
      }

      logger.info(`Fetching pages for ${organization}/${project}/${wikiId}`);

      // First, list wikis to verify the wiki exists and get the correct ID
      try {
        const wikis = await authManager.listWikis(organization, project);
        logger.info(`Available wikis in ${organization}/${project}:`, wikis);
      } catch (wikiError) {
        logger.warn('Failed to list wikis (non-fatal):', wikiError);
      }

      // List pages
      try {
        const pages = await authManager.listPages(organization, project, wikiId, path);
        res.json({
          success: true,
          pages,
        });
      } catch (listError) {
        logger.error('Error listing pages:', listError);
        throw listError;
      }
    } catch (error) {
      logger.error('Failed to list pages:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
