/**
 * Planning files routes - Get planning file content and status
 * POST /planning-file endpoint - Get task_plan.md, findings.md, or progress.md content
 * POST /planning-status endpoint - Get status of all planning files
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';

function getFeatureDir(projectPath: string, featureId: string): string {
  return path.join(projectPath, '.automaker', 'features', featureId);
}

/**
 * Handler for getting planning file content
 */
export function createPlanningFileHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, fileType } = req.body as {
        projectPath: string;
        featureId: string;
        fileType: 'task_plan' | 'findings' | 'progress';
      };

      if (!projectPath || !featureId || !fileType) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and fileType are required',
        });
        return;
      }

      // Validate file type
      const validTypes = ['task_plan', 'findings', 'progress'];
      if (!validTypes.includes(fileType)) {
        res.status(400).json({
          success: false,
          error: `Invalid file type. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      const featureDir = getFeatureDir(projectPath, featureId);
      const planningDir = path.join(featureDir, 'planning');
      const filePath = path.join(planningDir, `${fileType}.md`);

      // Read file content (ENOENT handled as null)
      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;

      res.json({
        success: true,
        available: true,
        content,
      });
    } catch (error) {
      // Handle file not found gracefully
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({
          success: true,
          available: false,
          content: '',
        });
        return;
      }

      logError(error, 'Get planning file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler for getting planning files status
 */
export function createPlanningStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      const featureDir = getFeatureDir(projectPath, featureId);
      const planningDir = path.join(featureDir, 'planning');

      // Check each file
      const files: Record<string, { exists: boolean; lastModified?: string }> = {};
      const fileTypes = ['task_plan', 'findings', 'progress'];

      for (const fileType of fileTypes) {
        const filePath = path.join(planningDir, `${fileType}.md`);

        try {
          const stats = await secureFs.stat(filePath);
          files[fileType] = {
            exists: true,
            lastModified: stats.mtime.toISOString(),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            files[fileType] = { exists: false };
          } else {
            throw error;
          }
        }
      }

      const available = Object.values(files).some((f) => f.exists);

      res.json({
        success: true,
        available,
        files,
      });
    } catch (error) {
      logError(error, 'Get planning status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
