/**
 * Webhook routes for external service integrations
 *
 * Handles webhook callbacks from:
 * - Azure DevOps Service Hooks (wiki page updates)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '@automaker/utils';
import { logWikiEvent } from '@automaker/utils';
import { WikiService } from '../services/wiki-service.js';
import type { SettingsService } from '../services/settings-service.js';

const logger = createLogger('WebhooksRoutes');

/**
 * Azure DevOps Service Hook event payload
 */
interface AzureDevOpsWebhookEvent {
  subscriptionId: string;
  notificationId: number;
  id: string;
  eventType: string;
  publisherId: string;
  message: {
    text: string;
    html: string;
    markdown: string;
  };
  detailedMessage: {
    text: string;
    html: string;
    markdown: string;
  };
  resource: {
    id: string;
    path: string;
    name?: string;
    type?: string;
    versions?: Array<{
      version: number;
      content?: string;
    }>;
    page?: {
      id: string;
      path: string;
      name: string;
    };
  };
  resourceVersion: string;
  resourceContainers: {
    collection: {
      id: string;
      baseUrl: string;
    };
    account: {
      id: string;
      baseUrl: string;
    };
    project: {
      id: string;
      name: string;
    };
  };
  createdDate: string;
}

/**
 * Verify Azure DevOps webhook signature
 * Azure DevOps doesn't send HMAC signatures, so we verify the subscription ID matches our config
 */
function verifyAzureWebhook(subscriptionId: string, configuredWebhookId: string): boolean {
  return subscriptionId === configuredWebhookId;
}

/**
 * Create webhook routes
 */
export function createWebhookRoutes(settingsService: SettingsService): Router {
  const router = Router();

  /**
   * POST /api/webhooks/azure-wiki
   *
   * Receives Azure DevOps Service Hook events for wiki page updates.
   * Invalidates cache entries for modified pages.
   *
   * Event types handled:
   * - ms.vss-wiki.wiki-page-created
   * - ms.vss-wiki.wiki-page-updated
   * - ms.vss-wiki.wiki-page-deleted
   */
  router.post('/azure-wiki', async (req: Request, res: Response) => {
    try {
      const event = req.body as AzureDevOpsWebhookEvent;

      logger.info(
        `Received Azure DevOps webhook: ${event.eventType} for page ${event.resource.path}`
      );

      // Get settings to verify webhook
      const globalSettings = await settingsService.getGlobalSettings();

      if (!globalSettings.azureDevOps?.webhookId) {
        logger.warn('Azure DevOps webhook not configured, rejecting event');
        return res.status(400).json({ error: 'Webhook not configured' });
      }

      // Verify webhook subscription ID
      if (!verifyAzureWebhook(event.subscriptionId, globalSettings.azureDevOps.webhookId)) {
        logger.warn(
          `Webhook verification failed: subscription ${event.subscriptionId} does not match configured ${globalSettings.azureDevOps.webhookId}`
        );
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }

      // Log webhook event to audit trail
      const dataDir = await settingsService.getDataDir();
      await logWikiEvent(dataDir, 'wiki_webhook_received', {
        eventType: event.eventType,
        pagePath: event.resource.path,
        subscriptionId: event.subscriptionId,
        timestamp: event.createdDate,
      });

      // Get wiki service instance
      const wikiService = new WikiService(dataDir);

      // Handle different event types
      switch (event.eventType) {
        case 'ms.vss-wiki.wiki-page-created':
        case 'ms.vss-wiki.wiki-page-updated': {
          // Invalidate cache for this page
          const pagePath = event.resource.page?.path || event.resource.path;
          await wikiService.invalidatePage(pagePath);

          logger.info(`Invalidated cache for page: ${pagePath}`);

          await logWikiEvent(dataDir, 'wiki_page_invalidated', {
            pagePath,
            eventType: event.eventType,
            reason: 'webhook',
          });

          break;
        }

        case 'ms.vss-wiki.wiki-page-deleted': {
          // Invalidate cache for deleted page
          const pagePath = event.resource.page?.path || event.resource.path;
          await wikiService.invalidatePage(pagePath);

          logger.info(`Invalidated cache for deleted page: ${pagePath}`);

          await logWikiEvent(dataDir, 'wiki_page_deleted', {
            pagePath,
            eventType: event.eventType,
          });

          break;
        }

        default:
          logger.debug(`Ignoring unhandled event type: ${event.eventType}`);
      }

      // Respond with 200 OK to acknowledge receipt
      res.json({
        success: true,
        message: 'Webhook processed',
        eventType: event.eventType,
        pagePath: event.resource.path,
      });
    } catch (error) {
      logger.error('Error processing Azure DevOps webhook:', error);
      res.status(500).json({
        error: 'Failed to process webhook',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/webhooks/azure-wiki/test
   *
   * Test endpoint to verify webhook configuration
   */
  router.get('/azure-wiki/test', async (req: Request, res: Response) => {
    try {
      const globalSettings = await settingsService.getGlobalSettings();

      if (!globalSettings.azureDevOps) {
        return res.json({
          configured: false,
          message: 'Azure DevOps not configured',
        });
      }

      res.json({
        configured: true,
        organization: globalSettings.azureDevOps.organization,
        project: globalSettings.azureDevOps.project,
        wikiId: globalSettings.azureDevOps.wikiId,
        webhookId: globalSettings.azureDevOps.webhookId,
        webhookUrl: globalSettings.azureDevOps.webhookUrl,
        lastIndexed: globalSettings.azureDevOps.lastIndexed,
        authenticatedUser: globalSettings.azureDevOps.authenticatedUser,
      });
    } catch (error) {
      logger.error('Error testing webhook configuration:', error);
      res.status(500).json({
        error: 'Failed to check webhook configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
