/**
 * Azure DevOps Work Items - Update Status Route
 *
 * Updates the status of a work item in Azure DevOps
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('UpdateWorkItemStatusRoute');

export function createUpdateWorkItemStatusHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { organization, project, workItemId, status, sessionId } = req.body as {
        organization?: string;
        project?: string;
        workItemId?: number;
        status?: string;
        sessionId?: string;
      };

      if (!organization || !project || !workItemId || !status) {
        res.status(400).json({
          success: false,
          error: 'organization, project, workItemId, and status are required',
        });
        return;
      }

      const authManager = await getAuthSessionBySessionId(sessionId, settingsService);
      if (!authManager) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated with Azure DevOps',
        });
        return;
      }

      await authManager.updateWorkItemStatus(organization, project, workItemId, status);

      res.json({
        success: true,
        message: `Work item ${workItemId} updated to ${status}`,
      });
    } catch (error) {
      logger.error('Failed to update work item status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
