/**
 * Routes for usage tracking
 */

import { Router, type Request, type Response } from 'express';
import type { LogUsageRequest, UsageQuery } from '@automaker/types';
import { getUsageTrackingService } from '../../services/usage-tracking-service.js';
import { createLogger } from '@automaker/utils';

const router = Router();
const logger = createLogger('usage-routes');

/**
 * POST /api/usage/log
 * Log a usage entry
 */
router.post('/log', async (req: Request<object, object, LogUsageRequest>, res: Response) => {
  try {
    const service = getUsageTrackingService();
    const entry = await service.logUsage(req.body);

    res.json({ success: true, entry });
  } catch (error) {
    logger.error('Failed to log usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log usage entry',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/usage/stats
 * Get usage statistics based on query parameters
 */
router.get('/stats', async (req: Request<object, object, object, UsageQuery>, res: Response) => {
  try {
    const service = getUsageTrackingService();
    const stats = await service.getStats(req.query);

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/usage/feature/:projectPath/:featureId
 * Get usage statistics for a specific feature
 */
router.get('/feature/:projectPath/:featureId', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId } = req.params;
    const service = getUsageTrackingService();
    const stats = await service.getFeatureStats(decodeURIComponent(projectPath), featureId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'No usage data found for this feature',
      });
    }

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get feature usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feature usage statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/usage/project/:projectPath
 * Get usage statistics for a project
 */
router.get('/project/:projectPath', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.params;
    const service = getUsageTrackingService();
    const stats = await service.getProjectStats(decodeURIComponent(projectPath));

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get project usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve project usage statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/usage/clear
 * Clear all usage data (for testing or reset)
 */
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const service = getUsageTrackingService();
    await service.clear();

    res.json({ success: true, message: 'Usage data cleared' });
  } catch (error) {
    logger.error('Failed to clear usage data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear usage data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
