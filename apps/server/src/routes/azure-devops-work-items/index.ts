/**
 * Azure DevOps Work Items routes
 *
 * Provides endpoints for fetching work items from Azure DevOps Boards
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { createListWorkItemsHandler } from './routes/list-work-items.js';
import { createGetChildWorkItemsHandler } from './routes/get-child-work-items.js';
import { createUpdateWorkItemStatusHandler } from './routes/update-work-item-status.js';
import { createAddWorkItemLinkHandler } from './routes/add-work-item-link.js';
import { downloadAttachmentRoute } from './routes/download-attachment.js';
import { createGetWorkItemCommentsHandler } from './routes/get-work-item-comments.js';
import { createExtractDocxTextHandler } from './routes/extract-docx-text.js';
import { createExtractPdfTextHandler } from './routes/extract-pdf-text.js';

export function createAzureWorkItemsRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Inject settingsService into all requests
  router.use((req, _res, next) => {
    (req as any).settingsService = settingsService;
    next();
  });

  // List work items assigned to user
  router.get('/list', createListWorkItemsHandler());

  // Get child work items for a parent
  router.get('/children', createGetChildWorkItemsHandler());

  // Update work item status
  router.post('/update-status', createUpdateWorkItemStatusHandler());

  // Add link to work item
  router.post('/add-link', createAddWorkItemLinkHandler());

  // Download attachment
  router.get('/attachment/:attachmentId', downloadAttachmentRoute(settingsService));

  // Get work item comments
  router.get('/comments', createGetWorkItemCommentsHandler());

  // Extract text from DOCX
  router.post('/extract-docx-text', createExtractDocxTextHandler());

  // Extract text from PDF
  router.post('/extract-pdf-text', createExtractPdfTextHandler());

  return router;
}
