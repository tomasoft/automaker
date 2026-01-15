/**
 * POST /discard-changes endpoint - Discard all uncommitted changes in a worktree
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createDiscardChangesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            discarded: false,
            message: 'No changes to discard',
          },
        });
        return;
      }

      // Discard all uncommitted changes (both staged and unstaged)
      // git reset --hard resets the index and working tree to HEAD
      await execAsync('git reset --hard HEAD', { cwd: worktreePath });

      // Remove untracked files and directories
      // -f = force, -d = directories, -x = also remove ignored files
      await execAsync('git clean -fd', { cwd: worktreePath });

      res.json({
        success: true,
        result: {
          discarded: true,
          message: 'All changes discarded successfully',
        },
      });
    } catch (error) {
      const message = getErrorMessage(error);
      logError(error, 'Error discarding changes');

      res.status(500).json({
        success: false,
        error: `Failed to discard changes: ${message}`,
      });
    }
  };
}
