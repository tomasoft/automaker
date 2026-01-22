/**
 * Azure DevOps authentication - debug sessions endpoint
 *
 * Returns information about active sessions for debugging
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { azureAuthSessions } from './poll-azure-auth.js';
import { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('AzureDebugRoute');

export function createDebugSessionsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;

      // Get all in-memory sessions
      const inMemorySessions = Array.from(azureAuthSessions.keys());

      // Get persisted sessions (this requires checking settings)
      const settings = await settingsService.getGlobalSettings();
      const persistedSessions = (settings as any).azureAuthTokens
        ? Object.keys((settings as any).azureAuthTokens)
        : [];

      logger.info('Debug sessions:', {
        inMemory: inMemorySessions,
        persisted: persistedSessions,
      });

      res.json({
        success: true,
        inMemorySessions,
        persistedSessions,
        totalInMemory: inMemorySessions.length,
        totalPersisted: persistedSessions.length,
      });
    } catch (error) {
      logger.error('Failed to debug sessions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
