/**
 * Skills routes
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { createListSkillsHandler } from './routes/list.js';
import { createPreviewSkillsHandler } from './routes/preview.js';

export function createSkillsRouter(settingsService: SettingsService): Router {
  const router = Router();

  // List all skills (global and project)
  router.get('/', createListSkillsHandler(settingsService));

  // Preview skills that would be auto-selected for a message
  router.post('/preview', createPreviewSkillsHandler(settingsService));

  return router;
}
