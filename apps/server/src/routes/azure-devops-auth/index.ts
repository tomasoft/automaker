/**
 * Azure DevOps authentication routes
 *
 * Provides OAuth 2.0 device flow endpoints for Azure DevOps wiki access
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { createStartAzureAuthHandler } from './routes/start-azure-auth.js';
import { createPollAzureAuthHandler } from './routes/poll-azure-auth.js';
import { createCheckAzureAuthHandler } from './routes/check-azure-auth.js';
import { createLogoutAzureAuthHandler } from './routes/logout-azure-auth.js';

export function createAzureAuthRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Inject settingsService into all requests
  router.use((req, _res, next) => {
    (req as any).settingsService = settingsService;
    next();
  });

  // Start device flow authentication
  router.post('/start', createStartAzureAuthHandler());

  // Poll for authentication completion
  router.post('/poll', createPollAzureAuthHandler());

  // Check current authentication status
  router.get('/status', createCheckAzureAuthHandler());

  // Logout and revoke tokens
  router.post('/logout', createLogoutAzureAuthHandler());

  return router;
}
