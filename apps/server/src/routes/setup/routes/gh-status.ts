/**
 * GET /gh-status endpoint - Get GitHub CLI status
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getGitHubCliPaths, getExtendedPath, systemPathAccess } from '@automaker/platform';
import { getErrorMessage, logError, getApiKey } from '../common.js';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);

const logger = createLogger('GhStatus');

function getExecEnv() {
  const extendedPath = getExtendedPath();
  const env: Record<string, string> = {
    PATH: extendedPath,
  };

  if (process.env.TZ) {
    env.TZ = process.env.TZ;
  }

  // If we have a stored GitHub token from Copilot auth, use it for gh CLI
  const githubToken = getApiKey('github_token');
  if (githubToken) {
    env.GH_TOKEN = githubToken;
    logger.info(`[GhStatus] Using stored GitHub token for gh CLI (length: ${githubToken.length})`);
  } else {
    logger.info('[GhStatus] No stored GitHub token found for gh CLI');
  }

  logger.debug(
    `[GhStatus] Extended PATH: ${extendedPath
      .split(process.platform === 'win32' ? ';' : ':')
      .slice(0, 5)
      .join(', ')}...`
  );

  return env;
}

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  path: string | null;
  user: string | null;
  error?: string;
}

async function getGhStatus(): Promise<GhStatus> {
  const status: GhStatus = {
    installed: false,
    authenticated: false,
    version: null,
    path: null,
    user: null,
  };

  const isWindows = process.platform === 'win32';

  // Log environment info for debugging
  logger.debug(`[GhStatus] Platform: ${process.platform}`);
  logger.debug(`[GhStatus] ProgramFiles: ${process.env.ProgramFiles || 'undefined'}`);
  logger.debug(`[GhStatus] LOCALAPPDATA: ${process.env.LOCALAPPDATA || 'undefined'}`);

  const execEnv = getExecEnv();

  // Check if gh CLI is installed
  try {
    const findCommand = isWindows ? 'where gh' : 'command -v gh';
    logger.debug(`[GhStatus] Running command: ${findCommand}`);
    const { stdout } = await execAsync(findCommand, { env: execEnv });
    status.path = stdout.trim().split(/\r?\n/)[0];
    status.installed = true;
    logger.info(`[GhStatus] Found gh CLI at: ${status.path}`);
  } catch (error) {
    logger.warn(`[GhStatus] 'where gh' failed, trying common locations`);
    // gh not in PATH, try common locations from centralized system paths
    const commonPaths = getGitHubCliPaths();
    logger.info(`[GhStatus] Checking ${commonPaths.length} common paths for gh CLI`);
    logger.info(`[GhStatus] Paths to check: ${commonPaths.join(', ')}`);

    for (const p of commonPaths) {
      try {
        logger.debug(`[GhStatus] Checking: ${p}`);
        const exists = await systemPathAccess(p);
        logger.debug(`[GhStatus] Result for ${p}: ${exists}`);
        if (exists) {
          status.path = p;
          status.installed = true;
          logger.info(`[GhStatus] Found gh CLI at: ${p}`);
          break;
        }
      } catch (err) {
        // Not found at this path
        logger.debug(
          `[GhStatus] Not found at: ${p}, error: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    if (!status.installed) {
      logger.warn(`[GhStatus] gh CLI not found in any common location`);
    }
  }

  if (!status.installed) {
    return status;
  }

  // Use the full path to gh.exe if we have it (especially important on Windows)
  const ghCommand = status.path || 'gh';
  logger.info(`[GhStatus] Using gh command: ${ghCommand}`);

  // Get version
  try {
    const { stdout } = await execAsync(`"${ghCommand}" --version`, { env: execEnv });
    // Extract version from output like "gh version 2.40.1 (2024-01-09)"
    const versionMatch = stdout.match(/gh version ([\d.]+)/);
    status.version = versionMatch ? versionMatch[1] : stdout.trim().split('\n')[0];
  } catch (error) {
    logger.warn(
      '[GhStatus] Failed to get version:',
      error instanceof Error ? error.message : error
    );
    // Version command failed
  }

  // Check authentication status by actually making an API call
  // gh auth status can return non-zero even when GH_TOKEN is valid
  let apiCallSucceeded = false;
  try {
    logger.debug('[GhStatus] Attempting gh api user call with token');
    const { stdout } = await execAsync(`"${ghCommand}" api user --jq ".login"`, { env: execEnv });
    const user = stdout.trim();
    if (user) {
      status.authenticated = true;
      status.user = user;
      apiCallSucceeded = true;
      logger.info(`[GhStatus] Successfully authenticated as: ${user}`);
    }
    // If stdout is empty, fall through to gh auth status fallback
  } catch (error) {
    logger.warn(
      '[GhStatus] gh api user call failed:',
      error instanceof Error ? error.message : error
    );
    // API call failed - fall through to gh auth status fallback
  }

  // Fallback: try gh auth status if API call didn't succeed
  if (!apiCallSucceeded) {
    try {
      logger.debug('[GhStatus] Attempting gh auth status fallback');
      const { stdout } = await execAsync(`"${ghCommand}" auth status`, { env: execEnv });
      status.authenticated = true;

      // Try to extract username from output
      const userMatch =
        stdout.match(/Logged in to [^\s]+ account ([^\s]+)/i) ||
        stdout.match(/Logged in to [^\s]+ as ([^\s]+)/i);
      if (userMatch) {
        status.user = userMatch[1];
      }
      logger.info('[GhStatus] gh auth status succeeded');
    } catch (error) {
      // Auth status returns non-zero if not authenticated
      logger.warn(
        '[GhStatus] gh auth status failed:',
        error instanceof Error ? error.message : error
      );
      status.authenticated = false;
    }
  }

  return status;
}

export function createGhStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getGhStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Get GitHub CLI status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
