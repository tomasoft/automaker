/**
 * Azure DevOps Wiki - get page content endpoint
 *
 * POST /api/azure-devops-wiki/page
 * Returns content of a specific wiki page
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWikiRoutes');

export function createGetPageHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { organization, project, wikiId, path, sessionId } = req.body as {
        organization: string;
        project: string;
        wikiId: string;
        path: string;
        sessionId?: string;
      };

      if (!organization || !project || !wikiId || !path) {
        res.status(400).json({
          success: false,
          error: 'organization, project, wikiId, and path are required',
        });
        return;
      }

      // Get authenticated session using sessionId
      const authManager = await getAuthSessionBySessionId(sessionId, settingsService);

      if (!authManager) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated with Azure DevOps',
        });
        return;
      }

      // Get page content
      const page = await authManager.getPage(organization, project, wikiId, path);

      res.json({
        success: true,
        page,
      });
    } catch (error) {
      logger.error('Failed to get page:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
