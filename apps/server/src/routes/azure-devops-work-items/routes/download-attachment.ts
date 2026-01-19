import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { createLogger } from '@automaker/utils';
import { getAuthSessionBySessionId } from '../../azure-devops-auth/routes/poll-azure-auth.js';

const logger = createLogger('[DownloadAttachmentRoute]');

export const downloadAttachmentRoute = (settingsService: SettingsService) => {
  return async (req: Request, res: Response) => {
    try {
      const { attachmentId } = req.params;
      const { organization, project, sessionId } = req.query as {
        organization?: string;
        project?: string;
        sessionId?: string;
      };

      if (!attachmentId) {
        return res.status(400).json({ error: 'Attachment ID is required' });
      }

      if (!organization || !project) {
        return res.status(400).json({
          error: 'organization and project query parameters are required',
        });
      }

      logger.info(`Downloading attachment: ${attachmentId}`);

      // Get authenticated session using sessionId
      const authManager = await getAuthSessionBySessionId(sessionId, settingsService);

      if (!authManager) {
        return res.status(401).json({
          error: 'Not authenticated with Azure DevOps',
        });
      }

      const buffer = await authManager.downloadAttachment(organization, project, attachmentId);

      // Return the file as binary data
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(buffer);
    } catch (error) {
      logger.error('Failed to download attachment:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to download attachment',
      });
    }
  };
};
