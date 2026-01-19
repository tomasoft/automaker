import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('[GetWorkItemCommentsRoute]');

export function createGetWorkItemCommentsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;
      const { organization, project, workItemId, sessionId } = req.query as {
        organization?: string;
        project?: string;
        workItemId?: string;
        sessionId?: string;
      };

      if (!organization || !project || !workItemId) {
        return res.status(400).json({
          error: 'organization, project, and workItemId query parameters are required',
        });
      }

      logger.info(`Getting comments for work item ${workItemId}`);

      // Get authenticated session using sessionId
      const authManager = await getAuthSessionBySessionId(sessionId, settingsService);

      if (!authManager) {
        return res.status(401).json({
          error: 'Not authenticated with Azure DevOps',
        });
      }

      const comments = await authManager.getWorkItemComments(
        organization,
        project,
        parseInt(workItemId, 10)
      );

      res.json({ success: true, comments });
    } catch (error) {
      logger.error('Failed to get work item comments:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get work item comments',
      });
    }
  };
}
