/**
 * Repository Routes
 *
 * API endpoints for repository configuration, analysis, and impact detection
 */

import { Router } from 'express';
import { analyzeRepositoryRoute } from './routes/analyze-repository.js';
import { setPATRoute } from './routes/set-pat.js';
import { getAnalysisStatusRoute } from './routes/get-analysis-status.js';

export function createRepositoryRoutes(): Router {
  const router = Router();

  // POST /api/repository/analyze - Trigger deep repository analysis
  router.post('/analyze', analyzeRepositoryRoute);

  // POST /api/repository/pat - Set Personal Access Token
  router.post('/pat', setPATRoute);

  // GET /api/repository/analysis-status - Get analysis progress/status
  router.get('/analysis-status', getAnalysisStatusRoute);

  return router;
}
