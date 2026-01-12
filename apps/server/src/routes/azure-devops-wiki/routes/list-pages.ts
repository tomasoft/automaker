/**
 * Azure DevOps Wiki - list pages endpoint
 *
 * POST /api/azure-devops-wiki/pages
 * Returns list of pages in a wiki
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWikiRoutes');

export function createListPagesHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { organization, project, wikiId, path } = req.body as {
        organization: string;
        project: string;
        wikiId: string;
        path?: string;
      };

      if (!organization || !project || !wikiId) {
        res.status(400).json({
          success: false,
          error: 'organization, project, and wikiId are required',
        });
        return;
      }

      // Get authenticated session
      const authManager = Array.from(azureAuthSessions.values())[0];

      if (!authManager) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated with Azure DevOps',
        });
        return;
      }

      // List pages
      const pages = await authManager.listPages(organization, project, wikiId, path);

      res.json({
        success: true,
        pages,
      });
    } catch (error) {
      logger.error('Failed to list pages:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
