/**
 * Planning Files Routes
 * Get planning files content for a feature (task_plan.md, findings.md, progress.md)
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';

const logger = createLogger('PlanningFilesRoutes');
const router = Router();

/**
 * GET /api/features/:projectPath/:featureId/planning-files/:fileName
 * Fetch a specific planning file
 */
router.get(
  '/:projectPath/:featureId/planning-files/:fileName',
  async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, fileName } = req.params;

      // Validate fileName (only allow these specific files)
      const allowedFiles = ['task_plan.md', 'findings.md', 'progress.md'];
      if (!allowedFiles.includes(fileName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid file name. Allowed: ${allowedFiles.join(', ')}`,
        });
      }

      // Construct path to planning file
      const automakerDir = getAutomakerDir(projectPath);
      const planningFilePath = path.join(automakerDir, 'features', featureId, 'planning', fileName);

      // Check if file exists
      try {
        await secureFs.access(planningFilePath);
      } catch (error) {
        return res.status(404).json({
          success: false,
          error: 'Planning file not found',
          exists: false,
        });
      }

      // Read file content
      const content = await secureFs.readFile(planningFilePath, 'utf-8');

      // Extract metadata from HTML comment if present
      let metadata = null;
      const metadataMatch = (content as string).match(/<!-- metadata: (.+?) -->/);
      if (metadataMatch) {
        try {
          metadata = JSON.parse(metadataMatch[1]);
        } catch (e) {
          logger.warn(`Failed to parse metadata from ${fileName}:`, e);
        }
      }

      // Get file stats for timestamp info
      const stats = await secureFs.stat(planningFilePath);

      res.json({
        success: true,
        content,
        metadata,
        fileName,
        updatedAt: stats.mtime.toISOString(),
        exists: true,
      });
    } catch (error) {
      logger.error('Failed to fetch planning file:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/features/:projectPath/:featureId/planning-files
 * Fetch all planning files at once
 */
router.get('/:projectPath/:featureId/planning-files', async (req: Request, res: Response) => {
  try {
    const { projectPath, featureId } = req.params;

    const automakerDir = getAutomakerDir(projectPath);
    const planningDir = path.join(automakerDir, 'features', featureId, 'planning');

    // Check if planning directory exists
    try {
      await secureFs.access(planningDir);
    } catch (error) {
      return res.json({
        success: true,
        files: {
          taskPlan: null,
          findings: null,
          progress: null,
        },
        exists: false,
      });
    }

    // Read all three files
    const fileNames = ['task_plan.md', 'findings.md', 'progress.md'];
    const results: Record<string, any> = {};

    for (const fileName of fileNames) {
      const filePath = path.join(planningDir, fileName);

      try {
        await secureFs.access(filePath);
        const content = await secureFs.readFile(filePath, 'utf-8');
        const stats = await secureFs.stat(filePath);

        // Extract metadata
        let metadata = null;
        const metadataMatch = (content as string).match(/<!-- metadata: (.+?) -->/);
        if (metadataMatch) {
          try {
            metadata = JSON.parse(metadataMatch[1]);
          } catch (e) {
            logger.warn(`Failed to parse metadata from ${fileName}:`, e);
          }
        }

        results[fileName] = {
          content,
          metadata,
          updatedAt: stats.mtime.toISOString(),
          exists: true,
        };
      } catch (error) {
        results[fileName] = null;
      }
    }

    res.json({
      success: true,
      files: {
        taskPlan: results['task_plan.md'],
        findings: results['findings.md'],
        progress: results['progress.md'],
      },
      exists: true,
    });
  } catch (error) {
    logger.error('Failed to fetch planning files:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
