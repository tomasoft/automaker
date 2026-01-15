/**
 * POST /write endpoint - Write file
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { PathNotAllowedError } from '@automaker/platform';
import { mkdirSafe } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

export function createWriteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, content, encoding } = req.body as {
        filePath: string;
        content: string;
        encoding?: 'utf-8' | 'base64';
      };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Ensure parent directory exists (symlink-safe)
      await mkdirSafe(path.dirname(path.resolve(filePath)));

      // If content is base64, decode it and write as binary
      if (encoding === 'base64') {
        const buffer = Buffer.from(content, 'base64');
        await secureFs.writeFile(filePath, buffer);
      } else {
        await secureFs.writeFile(filePath, content, 'utf-8');
      }

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Write file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
