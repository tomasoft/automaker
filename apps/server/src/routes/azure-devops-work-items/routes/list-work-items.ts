/**
 * Azure DevOps Work Items - list work items endpoint
 *
 * GET /api/azure-devops-work-items/list?organization=<org>&project=<project>&types=<types>
 * Returns list of work items assigned to the authenticated user
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWorkItemsRoutes');

export function createListWorkItemsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { organization, project, types } = req.query as {
        organization?: string;
        project?: string;
        types?: string;
      };

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

      // Parse work item types (default: Bug, User Story, Feature)
      let workItemTypes = ['Bug', 'User Story', 'Feature'];
      if (types) {
        workItemTypes = types.split(',').map((t) => t.trim());
      }

      logger.info(
        `Fetching work items for org=${organization}, project=${project}, types=${workItemTypes.join(',')}`
      );

      // Get work items from Azure DevOps
      const workItems = await authManager.getMyWorkItems(organization, project, workItemTypes);

      logger.info(`Found ${workItems.length} work items assigned to user`);

      res.json({
        success: true,
        workItems,
      });
    } catch (error) {
      logger.error('Failed to list work items:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
