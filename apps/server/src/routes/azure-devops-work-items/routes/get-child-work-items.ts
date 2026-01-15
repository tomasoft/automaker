/**
 * Azure DevOps Work Items - get child work items endpoint
 *
 * GET /api/azure-devops-work-items/children?organization=<org>&project=<project>&parentId=<id>
 * Returns child work items for a parent work item
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AzureWorkItemsRoutes');

export function createGetChildWorkItemsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { organization, project, parentId } = req.query as {
        organization?: string;
        project?: string;
        parentId?: string;
      };

      if (!organization || !project || !parentId) {
        res.status(400).json({
          success: false,
          error: 'organization, project, and parentId query parameters are required',
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

      const parentIdNum = parseInt(parentId, 10);
      if (isNaN(parentIdNum)) {
        res.status(400).json({
          success: false,
          error: 'parentId must be a valid number',
        });
        return;
      }

      logger.info(
        `Fetching child work items for parent ${parentIdNum} in org=${organization}, project=${project}`
      );

      // Get child work items from Azure DevOps
      const childWorkItems = await authManager.getChildWorkItems(
        organization,
        project,
        parentIdNum
      );

      logger.info(`Found ${childWorkItems.length} child work items for parent ${parentIdNum}`);

      res.json({
        success: true,
        childWorkItems,
      });
    } catch (error) {
      logger.error('Failed to get child work items:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
