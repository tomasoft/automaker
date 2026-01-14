/**
 * Analyze Repository Route
 *
 * Triggers deep analysis of configured repository
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { analyzeRepository } from '../../../services/repository-service.js';
import type { RepositoryConfiguration } from '@automaker/types';

const logger = createLogger('AnalyzeRepositoryRoute');

// Store analysis results temporarily (in production, use database)
const analysisResults = new Map<string, any>();

// This will be injected by the router
let getPATFunction: ((sessionId: string) => Promise<string | undefined>) | undefined;

export function injectGetPAT(getPAT: (sessionId: string) => Promise<string | undefined>) {
  getPATFunction = getPAT;
}

export async function analyzeRepositoryRoute(req: Request, res: Response): Promise<void> {
  try {
    const { repositoryConfig, accessToken, sessionId } = req.body as {
      repositoryConfig: RepositoryConfiguration;
      accessToken?: string;
      sessionId: string;
    };

    if (!repositoryConfig) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: repositoryConfig',
      });
      return;
    }

    // Use provided accessToken or retrieve stored PAT
    let token = accessToken;
    if (!token && sessionId && getPATFunction) {
      token = await getPATFunction(sessionId);
    }

    if (!token) {
      res.status(400).json({
        success: false,
        error:
          'No access token provided and no PAT found for this session. Please configure your Personal Access Token first.',
      });
      return;
    }

    logger.info(
      `[AnalyzeRepository] Starting analysis for ${repositoryConfig.organization}/${repositoryConfig.project}/${repositoryConfig.repository}`
    );

    // Perform analysis
    const result = await analyzeRepository(repositoryConfig, token);

    // Store results
    if (sessionId) {
      analysisResults.set(sessionId, {
        ...result,
        analyzedAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        fileTree: result.fileTree,
        graph: result.graph,
        services: result.services,
        commitSHA: result.commitSHA,
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
