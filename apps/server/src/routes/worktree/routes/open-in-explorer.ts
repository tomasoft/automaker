/**
 * POST /open-in-explorer endpoint - Open a worktree directory in the file explorer
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createOpenInExplorerHandler() {
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

      console.log('[OpenInExplorer] Opening path:', worktreePath);

      const platform = process.platform;
      let openCommand: string;
      let explorerName: string;

      if (platform === 'darwin') {
        openCommand = `open "${worktreePath}"`;
        explorerName = 'Finder';
      } else if (platform === 'win32') {
        // For Windows, use simple explorer command to open the folder
        // Note: worktreePath should use forward slashes or escaped backslashes
        const normalizedPath = worktreePath.replace(/\//g, '\\');
        openCommand = `explorer "${normalizedPath}"`;
        explorerName = 'Explorer';
      } else {
        openCommand = `xdg-open "${worktreePath}"`;
        explorerName = 'File Manager';
      }

      console.log('[OpenInExplorer] Running command:', openCommand);

      // On Windows, explorer sometimes returns non-zero exit code even on success
      // So we ignore errors on Windows platform
      if (platform === 'win32') {
        exec(openCommand); // Fire and forget on Windows
      } else {
        await execAsync(openCommand);
      }

      res.json({
        success: true,
        result: {
          message: `Opened ${worktreePath} in ${explorerName}`,
        },
      });
    } catch (error) {
      logError(error, 'Open in explorer failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
