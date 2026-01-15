/**
 * Azure DevOps Work Items - Add Link Route
 *
 * Adds a hyperlink to a work item in Azure DevOps
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('AddWorkItemLinkRoute');

export function createAddWorkItemLinkHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { organization, project, workItemId, linkUrl, linkComment } = req.body as {
        organization?: string;
        project?: string;
        workItemId?: number;
        linkUrl?: string;
        linkComment?: string;
      };

      if (!organization || !project || !workItemId || !linkUrl) {
        res.status(400).json({
          success: false,
          error: 'organization, project, workItemId, and linkUrl are required',
        });
        return;
      }

      const authManager = Array.from(azureAuthSessions.values())[0];
      if (!authManager) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated with Azure DevOps',
        });
        return;
      }

      await authManager.addWorkItemLink(organization, project, workItemId, linkUrl, linkComment);

      res.json({
        success: true,
        message: `Link added to work item ${workItemId}`,
      });
    } catch (error) {
      logger.error('Failed to add link to work item:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
