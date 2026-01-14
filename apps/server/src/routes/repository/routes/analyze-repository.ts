/**
 * Analyze Repository Route
 *
 * Triggers deep analysis of local codebase
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { analyzeLocalRepository } from '../../../services/repository-service.js';

const logger = createLogger('AnalyzeRepositoryRoute');

// Store analysis results temporarily (in production, use database)
const analysisResults = new Map<string, any>();

export async function analyzeRepositoryRoute(req: Request, res: Response): Promise<void> {
  try {
    const { projectPath } = req.body as {
      projectPath: string;
    };

    if (!projectPath) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: projectPath',
      });
      return;
    }

    logger.info(`[AnalyzeRepository] Starting analysis for local project: ${projectPath}`);

    // Perform analysis on local codebase
    const result = await analyzeLocalRepository(projectPath);

    // Store results
    analysisResults.set(projectPath, {
      ...result,
      analyzedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: {
        fileTree: result.fileTree,
        graph: result.graph,
        services: result.services,
        commitSHA: result.commitSHA,
        currentBranch: result.currentBranch,
        timing: result.timing,
        stats: {
          filesIndexed: result.fileTree.length,
          servicesDetected: result.services.length,
          componentsFound: result.graph.nodes.length,
        },
      },
    });
  } catch (error) {
    logger.error('[AnalyzeRepository] Failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze repository',
    });
  }
}
