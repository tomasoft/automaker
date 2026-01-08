/**
 * Local LLM API Routes
 *
 * Provides endpoints for managing local LLM server connections
 */

import { Router } from 'express';
import { createGetLocalLLMStatusHandler } from './routes/status.js';
import { createGetLocalLLMModelsHandler } from './routes/get-models.js';

const router = Router();

// Status endpoint
router.get('/status', createGetLocalLLMStatusHandler());

// Models endpoint
router.get('/models', createGetLocalLLMModelsHandler());

export default router;
