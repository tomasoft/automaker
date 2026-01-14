/**
 * Azure DevOps Wiki - list wikis endpoint
 *
 * GET /api/azure-devops-wiki/wikis
 * Returns list of wikis accessible to the authenticated user
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWikiRoutes');

export function createListWikisHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { organization, project } = req.query as { organization?: string; project?: string };

      if (!organization || !project) {
        res.status(400).json({
          success: false,
          error: 'organization and project query parameters are required',
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

      // Get wikis from Azure DevOps
      const wikis = await authManager.listWikis(organization, project);

      res.json({
        success: true,
        wikis,
      });
    } catch (error) {
      logger.error('Failed to list wikis:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
