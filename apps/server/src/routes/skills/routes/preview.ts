/**
 * POST /api/skills/preview endpoint - Preview skills that would be auto-selected
 */

import type { Request, Response } from 'express';
import { SkillsLoaderService } from '../../../services/skills-loader.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage } from '../../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('SkillsRoutes');

export function createPreviewSkillsHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { message, projectPath } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Missing or invalid message parameter',
        });
        return;
      }

      // Get settings
      const globalSettings = await settingsService.getGlobalSettings();
      const projectSettings = projectPath
        ? await settingsService.getProjectSettings(projectPath)
        : undefined;

      // Create skills loader
      const skillsLoader = new SkillsLoaderService(
        globalSettings,
        projectSettings,
        projectPath || '',
        settingsService.getDataDir(),
        undefined // No wiki service needed for preview
      );

      // Load skills with the message
      const result = await skillsLoader.loadSkills(message, {
        maxSkills: globalSettings.maxAutoSelectedSkills ?? 3,
        similarityThreshold: globalSettings.skillSimilarityThreshold ?? 0.3,
        disabledSkills: projectSettings?.disabledSkills,
      });

      res.json({
        success: true,
        skills: result.skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          score: s.score,
          scope: s.scope,
          tags: s.tags,
        })),
        totalAvailable: await skillsLoader.discoverSkills().then((s) => s.length),
      });
    } catch (error) {
      logger.error('Failed to preview skills', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
