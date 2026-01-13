/**
 * Get Analysis Status Route
 *
 * Returns status of ongoing repository analysis
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GetAnalysisStatusRoute');

export async function getAnalysisStatusRoute(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.query as { sessionId?: string };

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'Missing required query parameter: sessionId',
      });
      return;
    }

    // In real implementation, query analysis job status from database/cache
    // For now, return a simple status
    res.json({
      success: true,
      data: {
        status: 'idle', // 'analyzing' | 'completed' | 'failed' | 'idle'
        progress: 0,
        currentStep: null,
      },
    });
  } catch (error) {
    logger.error('[GetAnalysisStatus] Failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analysis status',
    });
  }
}
