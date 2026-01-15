/**
 * Azure DevOps Wiki Routes
 *
 * Provides endpoints for browsing and accessing Azure DevOps wiki content
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { createListWikisHandler } from './routes/list-wikis.js';
import { createListPagesHandler } from './routes/list-pages.js';
import { createGetPageHandler } from './routes/get-page.js';
import { createListProjectsHandler } from './routes/list-projects.js';
import { createGetConfigHandler } from './routes/get-config.js';

export function createAzureDevOpsWikiRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // GET /api/azure-devops-wiki/config - Get current Azure DevOps config
  router.get('/config', createGetConfigHandler(settingsService));

  // GET /api/azure-devops-wiki/projects - List projects in an organization
  router.get('/projects', createListProjectsHandler());

  // GET /api/azure-devops-wiki/wikis - List available wikis
  router.get('/wikis', createListWikisHandler());

  // POST /api/azure-devops-wiki/pages - List pages in a wiki
  router.post('/pages', createListPagesHandler());

  // POST /api/azure-devops-wiki/page - Get specific page content
  router.post('/page', createGetPageHandler());

  return router;
}
