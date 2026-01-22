/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createBulkUpdateHandler } from './routes/bulk-update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createAgentOutputHandler, createRawOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';
import { createAnalyzeFeatureImpactRoute } from './routes/analyze-impact.js';
import { createPlanningFileHandler, createPlanningStatusHandler } from './routes/planning-files.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createFeaturesRoutes(
  featureLoader: FeatureLoader,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(featureLoader));
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(featureLoader));
  router.post(
    '/bulk-update',
    validatePathParams('projectPath'),
    createBulkUpdateHandler(featureLoader)
  );
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler(featureLoader));
  router.post('/agent-output', createAgentOutputHandler(featureLoader));
  router.post('/raw-output', createRawOutputHandler(featureLoader));
  router.post('/generate-title', createGenerateTitleHandler());
  router.post('/planning-file', createPlanningFileHandler());
  router.post('/planning-status', createPlanningStatusHandler());

  // Impact analysis route (requires settingsService)
  if (settingsService) {
    router.post(
      '/analyze-impact',
      validatePathParams('projectPath'),
      createAnalyzeFeatureImpactRoute(settingsService)
    );
  }

  return router;
}
