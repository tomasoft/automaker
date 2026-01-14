/**
 * Repository Routes
 *
 * API endpoints for repository configuration, analysis, and impact detection
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { analyzeRepositoryRoute, injectGetPAT } from './routes/analyze-repository.js';
import { createSetPATHandler, createGetPATHelper } from './routes/set-pat.js';
import { createCheckPATHandler } from './routes/check-pat.js';
import { getAnalysisStatusRoute } from './routes/get-analysis-status.js';

export function createRepositoryRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Create PAT helper and inject it
  const getPAT = createGetPATHelper(settingsService);
  injectGetPAT(getPAT);

  // POST /api/repository/analyze - Trigger deep repository analysis
  router.post('/analyze', analyzeRepositoryRoute);

  // POST /api/repository/pat - Set Personal Access Token
  router.post('/pat', createSetPATHandler(settingsService));

  // POST /api/repository/pat/check - Check if PAT exists
  router.post('/pat/check', createCheckPATHandler(settingsService));

  // GET /api/repository/analysis-status - Get analysis progress/status
  router.get('/analysis-status', getAnalysisStatusRoute);

  return router;
}
