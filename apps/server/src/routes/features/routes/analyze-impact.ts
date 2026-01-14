/**
 * Analyze Feature Impact Route
 *
 * Runs impact analysis on a feature's spec
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { analyzeFeatureImpact } from '../../../services/impact-analysis-service.js';
import type { Feature, ImpactAnalysisResult } from '@automaker/types';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('AnalyzeFeatureImpactRoute');

export function createAnalyzeFeatureImpactRoute(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[AnalyzeFeatureImpact] Request body keys:', Object.keys(req.body || {}));

      const { feature, projectPath } = req.body as {
        feature: Feature;
        projectPath: string;
      };

      if (!feature || !projectPath) {
        logger.warn(
          '[AnalyzeFeatureImpact] Missing fields - feature:',
          !!feature,
          'projectPath:',
          !!projectPath
        );
        res.status(400).json({
          success: false,
          error: 'Missing required fields: feature, projectPath',
        });
        return;
      }

      logger.info(
        `[AnalyzeFeatureImpact] Starting analysis for feature ${feature.id} in project ${projectPath}`
      );

      // Load project settings
      const projectSettings = await settingsService.getProjectSettings(projectPath);

      // Check if repository is configured and analyzed
      if (!projectSettings?.targetRepository?.analyzed) {
        res.json({
          success: true,
          data: null,
          message: 'Repository not analyzed. Configure repository in Settings → DevOps Resources.',
        });
        return;
      }

      if (!projectSettings.repositoryGraph || !projectSettings.repositoryFileTree) {
        res.json({
          success: true,
          data: null,
          message: 'Repository graph not available. Re-analyze repository.',
        });
        return;
      }

      // Get global settings for impact analysis configuration
      const globalSettings = await settingsService.getGlobalSettings();
      const impactConfig = globalSettings.impactAnalysis;
      const projectRules = Array.isArray(projectSettings.impactAnalysisRules)
        ? projectSettings.impactAnalysisRules
        : [];

      // Build context for impact analysis
      const context = {
        fileTree: projectSettings.repositoryFileTree,
        graph: projectSettings.repositoryGraph,
        services: projectSettings.targetRepository.services || [],
        features: [], // TODO: Load other features for cross-feature analysis
        rules: projectRules.length > 0 ? projectRules : impactConfig?.rules || [],
        dependencyDepth: impactConfig?.dependencyDepth || 2,
      };

      // Run analysis
      const result: ImpactAnalysisResult = await analyzeFeatureImpact(
        feature,
        context,
        impactConfig?.fileExtractionPatterns || []
      );

      logger.info(
        `[AnalyzeFeatureImpact] Analysis complete: ${result.affectedFiles.length} files, risk score ${result.riskScore}`
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('[AnalyzeFeatureImpact] Failed:', error);

      // Ensure we always send a valid JSON response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to analyze feature impact',
        });
      }
    }
  };
}
