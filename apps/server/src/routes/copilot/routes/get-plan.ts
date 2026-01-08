import { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { CopilotAuthManager } from '../../../providers/copilot-auth.js';
import { getApiKey } from '../../setup/common.js';

const logger = createLogger('CopilotPlanRoute');

/**
 * GET /api/copilot/plan
 * Get the user's GitHub Copilot subscription plan
 */
export function createGetCopilotPlanHandler() {
  return async (req: Request, res: Response) => {
    try {
      // Get stored GitHub token
      const storedToken = getApiKey('github_token');

      logger.info('[CopilotPlan] Checking for stored token:', !!storedToken);

      if (!storedToken) {
        logger.warn('[CopilotPlan] No stored GitHub token found');
        res.json({
          success: false,
          error: 'Not authenticated with GitHub Copilot',
        });
        return;
      }

      logger.info('[CopilotPlan] Creating auth manager with token');
      // Create auth manager with stored token
      const authManager = new CopilotAuthManager(storedToken);

      logger.info('[CopilotPlan] Fetching user plan from GitHub API');
      // Get user's plan
      const planInfo = await authManager.getUserCopilotPlan();

      if (!planInfo) {
        logger.warn('[CopilotPlan] Failed to get plan info from GitHub API');
        res.json({
          success: false,
          error: 'Failed to fetch Copilot plan information',
        });
        return;
      }

      logger.info('[CopilotPlan] Successfully fetched Copilot plan:', planInfo);

      res.json({
        success: true,
        plan: planInfo.plan,
        seat_management_setting: planInfo.seat_management_setting,
        organization: planInfo.organization,
      });
    } catch (error) {
      logger.error('[CopilotPlan] Error fetching Copilot plan:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch plan',
      });
    }
  };
}
