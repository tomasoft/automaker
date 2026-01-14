/**
 * Repository Routes
 *
 * API endpoints for repository configuration, analysis, and impact detection
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { analyzeRepositoryRoute } from './routes/analyze-repository.js';
import { getAnalysisStatusRoute } from './routes/get-analysis-status.js';

export function createRepositoryRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // POST /api/repository/analyze - Trigger deep repository analysis
  router.post('/analyze', analyzeRepositoryRoute);

  // GET /api/repository/analysis-status - Get analysis progress/status
  router.get('/analysis-status', getAnalysisStatusRoute);

  return router;
}
