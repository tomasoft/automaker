/**
 * GitHub Copilot routes - HTTP API for Copilot authentication and management
 *
 * Provides endpoints for:
 * - Authenticating with GitHub Copilot
 * - Getting Copilot status
 * - Retrieving Copilot token
 *
 * All endpoints use handler factories.
 * Mounted at /api/copilot in the main server.
 */

import { Router } from 'express';
import { createAuthHandler } from './routes/auth.js';
import { createStatusHandler } from './routes/status.js';
import { createGetTokenHandler } from './routes/get-token.js';
import { createGetCopilotPlanHandler } from './routes/get-plan.js';
import { createGetCopilotModelsHandler } from './routes/get-models.js';

/**
 * Create copilot router with all endpoints
 *
 * Endpoints:
 * - POST /auth - Initiate GitHub device flow authentication
 * - GET /status - Get Copilot authentication status
 * - GET /token - Get current Copilot token
 * - GET /plan - Get user's Copilot subscription plan
 * - GET /models - Get available models for user's plan
 *
 * @returns Express Router configured with all Copilot endpoints
 */
export function createCopilotRoutes(): Router {
  const router = Router();

  // Authentication route
  router.post('/auth', createAuthHandler());

  // Status check route
  router.get('/status', createStatusHandler());

  // Get token route
  router.get('/token', createGetTokenHandler());

  // Get plan route
  router.get('/plan', createGetCopilotPlanHandler());

  // Get models route
  router.get('/models', createGetCopilotModelsHandler());

  return router;
}
