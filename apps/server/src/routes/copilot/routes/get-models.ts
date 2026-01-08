import { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { CopilotAuthManager } from '../../../providers/copilot-auth.js';
import { getApiKey } from '../../setup/common.js';
import { getModelsForPlan, COPILOT_MODELS } from '../../../lib/copilot-models.js';

const logger = createLogger('CopilotModelsRoute');

/**
 * GET /api/copilot/models
 * Get available models for the user's Copilot plan
 */
export function createGetCopilotModelsHandler() {
  return async (req: Request, res: Response) => {
    try {
      // Get stored GitHub token
      const storedToken = getApiKey('github_token');

      if (!storedToken) {
        // Return all models but mark them as unavailable
        res.json({
          success: true,
          authenticated: false,
          plan: null,
          allModels: COPILOT_MODELS,
          availableModels: [],
        });
        return;
      }

      // Create auth manager with stored token
      const authManager = new CopilotAuthManager(storedToken);

      // Get user's plan
      const planInfo = await authManager.getUserCopilotPlan();

      if (!planInfo) {
        // Return all models but mark as unable to determine plan
        res.json({
          success: true,
          authenticated: true,
          plan: null,
          allModels: COPILOT_MODELS,
          availableModels: COPILOT_MODELS, // Fallback: show all
        });
        return;
      }

      // Get models available for this plan
      const availableModels = getModelsForPlan(planInfo.plan);

      logger.info(`User has ${planInfo.plan} plan with ${availableModels.length} available models`);

      res.json({
        success: true,
        authenticated: true,
        plan: planInfo.plan,
        seat_management: planInfo.seat_management_setting,
        organization: planInfo.organization,
        allModels: COPILOT_MODELS,
        availableModels,
      });
    } catch (error) {
      logger.error('Error fetching Copilot models:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models',
      });
    }
  };
}
