/**
 * Parse agent response and create feature files
 */

import path from 'path';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { getFeaturesDir } from '@automaker/platform';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import type { SettingsService } from '../../services/settings-service.js';
import { analyzeFeatureImpact } from '../../services/impact-analysis-service.js';
import type { Feature } from '@automaker/types';

const logger = createLogger('SpecRegeneration');

export async function parseAndCreateFeatures(
  projectPath: string,
  content: string,
  events: EventEmitter,
  settingsService?: SettingsService
): Promise<void> {
  logger.info('========== parseAndCreateFeatures() started ==========');
  logger.info(`Content length: ${content.length} chars`);
  logger.info('========== CONTENT RECEIVED FOR PARSING ==========');
  logger.info(content);
  logger.info('========== END CONTENT ==========');

  try {
    // Extract JSON from response using shared utility
    logger.info('Extracting JSON from response using extractJsonWithArray...');

    interface FeaturesResponse {
      features: Array<{
        id: string;
        category?: string;
        title: string;
        description: string;
        priority?: number;
        complexity?: string;
        dependencies?: string[];
      }>;
    }

    const parsed = extractJsonWithArray<FeaturesResponse>(content, 'features', { logger });

    if (!parsed || !parsed.features) {
      logger.error('❌ No valid JSON with "features" array found in response');
      logger.error('Full content received:');
      logger.error(content);
      throw new Error('No valid JSON found in response');
    }

    logger.info(`Parsed ${parsed.features?.length || 0} features`);
    logger.info('Parsed features:', JSON.stringify(parsed.features, null, 2));

    const featuresDir = getFeaturesDir(projectPath);
    await secureFs.mkdir(featuresDir, { recursive: true });

    const createdFeatures: Array<{ id: string; title: string }> = [];

    // Check if impact analysis is available
    let impactAnalysisEnabled = false;
    let projectSettings;
    let globalSettings;

    if (settingsService) {
      try {
        projectSettings = await settingsService.getProjectSettings(projectPath);
        globalSettings = await settingsService.getGlobalSettings();
        impactAnalysisEnabled =
          !!projectSettings?.targetRepository?.analyzed &&
          !!projectSettings?.repositoryGraph &&
          !!projectSettings?.repositoryFileTree;

        if (impactAnalysisEnabled) {
          logger.info('Impact analysis enabled - will analyze features after creation');
        } else {
          logger.info('Impact analysis disabled - repository not configured or analyzed');
        }
      } catch (error) {
        logger.warn('Failed to check impact analysis availability:', error);
      }
    }

    for (const feature of parsed.features) {
      logger.debug('Creating feature:', feature.id);
      const featureDir = path.join(featuresDir, feature.id);
      await secureFs.mkdir(featureDir, { recursive: true });

      const featureData = {
        id: feature.id,
        category: feature.category || 'Uncategorized',
        title: feature.title,
        description: feature.description,
        status: 'backlog', // Features go to backlog - user must manually start them
        priority: feature.priority || 2,
        complexity: feature.complexity || 'moderate',
        dependencies: feature.dependencies || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await secureFs.writeFile(
        path.join(featureDir, 'feature.json'),
        JSON.stringify(featureData, null, 2)
      );

      createdFeatures.push({ id: feature.id, title: feature.title });

      // Run impact analysis if enabled
      if (impactAnalysisEnabled && projectSettings && globalSettings) {
        try {
          logger.info(`Running impact analysis for feature: ${feature.id}`);

          const impactConfig = globalSettings.impactAnalysis;
          const projectRules = Array.isArray(projectSettings.impactAnalysisRules)
            ? projectSettings.impactAnalysisRules
            : [];

          const context = {
            fileTree: projectSettings.repositoryFileTree!,
            graph: projectSettings.repositoryGraph!,
            services: projectSettings.targetRepository?.services || [],
            features: [],
            rules: projectRules.length > 0 ? projectRules : impactConfig?.rules || [],
            dependencyDepth: impactConfig?.dependencyDepth || 2,
          };

          const featureForAnalysis: Feature = {
            ...featureData,
            spec: feature.description, // Use description as spec for initial analysis
            projectPath,
          } as Feature;

          const impactResult = await analyzeFeatureImpact(
            featureForAnalysis,
            context,
            impactConfig?.fileExtractionPatterns || []
          );

          // Auto-attach high-confidence wiki pages
          const autoAttachedPages: any[] = [];
          if (impactConfig?.autoAttachWiki && impactResult.gotchas) {
            for (const gotcha of impactResult.gotchas) {
              if (gotcha.wikiPages && gotcha.wikiPages.length > 0) {
                for (const wikiPage of gotcha.wikiPages) {
                  autoAttachedPages.push({
                    id: `wiki-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    path: wikiPage,
                    filename: wikiPage.split('/').pop() || wikiPage,
                    mimeType: 'text/markdown',
                    content: '',
                    autoAttached: true,
                  });
                }
              }
            }
          }

          // Update feature with impact analysis and auto-attached wiki pages
          const updatedFeatureData = {
            ...featureData,
            impactAnalysis: impactResult,
            textFilePaths: autoAttachedPages.length > 0 ? autoAttachedPages : undefined,
          };

          await secureFs.writeFile(
            path.join(featureDir, 'feature.json'),
            JSON.stringify(updatedFeatureData, null, 2)
          );

          logger.info(
            `Impact analysis complete for ${feature.id}: Risk ${impactResult.riskLevel} (${impactResult.riskScore}/100), ${impactResult.gotchas.length} gotchas, ${autoAttachedPages.length} wiki pages auto-attached`
          );
        } catch (error) {
          logger.error(`Failed to analyze feature ${feature.id}:`, error);
          // Don't fail feature creation if impact analysis fails
        }
      }
    }

    logger.info(`✓ Created ${createdFeatures.length} features successfully`);

    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: `Spec regeneration complete! Created ${createdFeatures.length} features.`,
      projectPath: projectPath,
    });
  } catch (error) {
    logger.error('❌ parseAndCreateFeatures() failed:');
    logger.error('Error:', error);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: (error as Error).message,
      projectPath: projectPath,
    });
  }

  logger.debug('========== parseAndCreateFeatures() completed ==========');
}
