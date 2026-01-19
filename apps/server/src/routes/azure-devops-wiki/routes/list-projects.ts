/**
 * Azure DevOps - list projects endpoint
 *
 * GET /api/azure-devops-wiki/projects?organization=<org>
 * Returns list of projects in an organization
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWikiRoutes');

export function createListProjectsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { organization, sessionId } = req.query as {
        organization?: string;
        sessionId?: string;
      };

      if (!organization) {
        res.status(400).json({
          success: false,
          error: 'organization query parameter is required',
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

      // Get token
      const token = await authManager.getToken();

      // Fetch projects from Azure DevOps
      const response = await fetch(
        `https://dev.azure.com/${organization}/_apis/projects?api-version=6.0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to fetch projects: ${response.status} ${errorText}`);
        res.status(response.status).json({
          success: false,
          error: `Failed to fetch projects: ${response.statusText}`,
        });
        return;
      }

      const data = (await response.json()) as any;
      const projects = (data.value || []).map((proj: any) => ({
        id: proj.id,
        name: proj.name,
      }));

      logger.info(`Found ${projects.length} projects in ${organization}`);

      res.json({
        success: true,
        projects,
      });
    } catch (error) {
      logger.error('Failed to list projects:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
