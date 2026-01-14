/**
 * GET /api/skills endpoint - List all skills (global and project)
 */

import type { Request, Response } from 'express';
import { SkillsLoaderService } from '../../../services/skills-loader.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage } from '../../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('SkillsRoutes');

export function createListSkillsHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

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
        undefined // No wiki service needed for listing
      );

      // Discover all skills
      const allSkills = await skillsLoader.discoverSkills();

      // Separate global and project skills
      const globalSkills = allSkills.filter((s: any) => s.scope === 'global');
      const projectSkills = allSkills.filter((s: any) => s.scope === 'project');

      res.json({
        success: true,
        global: globalSkills.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          tags: s.tags,
          filePath: s.filePath,
          enabled: s.enabled,
        })),
        project: projectSkills.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          tags: s.tags,
          filePath: s.filePath,
          enabled: s.enabled,
        })),
      });
    } catch (error) {
      logger.error('Failed to list skills', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
