/**
 * GitHub Copilot Authentication Utilities
 *
 * Handles authentication flow for GitHub Copilot API access
 * Based on: https://github.com/ericc-ch/copilot-api
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotAuth');

interface CopilotToken {
  token: string;
  expiresAt: number;
  organizationsList?: string[];
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  organization_list?: string[];
}

/**
 * GitHub Copilot Auth Manager
 */
export class CopilotAuthManager {
  private static readonly CLIENT_ID = 'Iv1.b507a08c87ecfe98';
  private static readonly SCOPE = 'read:user';
  private static readonly DEVICE_CODE_URL = 'https://github.com/login/device/code';
  private static readonly ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
  private static readonly COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';

  private cachedToken: CopilotToken | null = null;
  private githubAccessToken: string | null = null;

  constructor(githubToken?: string) {
    if (githubToken) {
      this.githubAccessToken = githubToken;
    } else {
      // Try to load from stored token (for persistence across requests)
      // This will be populated by the polling endpoint after successful auth
      this.githubAccessToken = null;
    }
  }

  /**
   * Get a valid Copilot token (from cache or by refreshing)
   */
  async getToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
      logger.debug('[CopilotAuth] Using cached Copilot token');
      return this.cachedToken.token;
    }

    // Check for GitHub token from environment
    if (!this.githubAccessToken) {
      this.githubAccessToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
      logger.debug('[CopilotAuth] Checked environment for GitHub token:', !!this.githubAccessToken);
    }

    // If no GitHub token, need to do device flow
    if (!this.githubAccessToken) {
      logger.warn('[CopilotAuth] No GitHub access token found');
      throw new Error(
        'No GitHub access token found. Please set GITHUB_TOKEN environment variable or run authentication flow.'
      );
    }

    // Get Copilot token using GitHub access token
    logger.debug('[CopilotAuth] Fetching Copilot API token using GitHub access token');
    try {
      const copilotToken = await this.fetchCopilotToken(this.githubAccessToken);

      this.cachedToken = {
        token: copilotToken.token,
        expiresAt: copilotToken.expires_at,
        organizationsList: copilotToken.organization_list,
      };

      logger.debug('[CopilotAuth] Successfully obtained and cached Copilot token');
      return this.cachedToken.token;
    } catch (error) {
      logger.error(
        '[CopilotAuth] Failed to fetch Copilot token:',
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * Perform GitHub device flow authentication
   *
   * @param onDeviceCode Optional callback to receive device code info (for UI display)
   */
  async authenticate(onDeviceCode?: (data: DeviceCodeResponse) => void): Promise<string> {
    logger.info('Starting GitHub device flow authentication...');

    // Step 1: Request device code
    const deviceCode = await this.requestDeviceCode();

    logger.info('\n===========================================');
    logger.info('GitHub Authentication Required');
    logger.info('===========================================');
    logger.info(`\nPlease visit: ${deviceCode.verification_uri}`);
    logger.info(`\nAnd enter code: ${deviceCode.user_code}\n`);
    logger.info('===========================================\n');

    // Notify callback with device code info (for UI to display)
    if (onDeviceCode) {
      onDeviceCode(deviceCode);
    }

    // Step 2: Poll for access token
    const accessToken = await this.pollForAccessToken(deviceCode);

    this.githubAccessToken = accessToken;
    logger.info('Successfully authenticated with GitHub!');

    // Step 3: Get Copilot token
    const copilotToken = await this.fetchCopilotToken(accessToken);

    this.cachedToken = {
      token: copilotToken.token,
      expiresAt: copilotToken.expires_at,
      organizationsList: copilotToken.organization_list,
    };

    return this.cachedToken.token;
  }

  /**
   * Request device code from GitHub
   */
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const response = await fetch(CopilotAuthManager.DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CopilotAuthManager.CLIENT_ID,
        scope: CopilotAuthManager.SCOPE,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to request device code: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Poll GitHub for access token after user authorization
   */
  private async pollForAccessToken(deviceCode: DeviceCodeResponse): Promise<string> {
    const startTime = Date.now();
    const expiresIn = deviceCode.expires_in * 1000;
    const interval = deviceCode.interval * 1000;

    while (Date.now() - startTime < expiresIn) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const response = await fetch(CopilotAuthManager.ACCESS_TOKEN_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: CopilotAuthManager.CLIENT_ID,
            device_code: deviceCode.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const data = await response.json();

        if (data.error === 'authorization_pending') {
          // Still waiting for user to authorize
          continue;
        }

        if (data.error) {
          throw new Error(`GitHub authorization error: ${data.error_description || data.error}`);
        }

        if (data.access_token) {
          return data.access_token;
        }
      } catch (error) {
        logger.error('Error polling for access token:', error);
      }
    }

    throw new Error('GitHub authentication timed out');
  }

  /**
   * Fetch Copilot token using GitHub access token
   */
  private async fetchCopilotToken(githubToken: string): Promise<CopilotTokenResponse> {
    const response = await fetch(CopilotAuthManager.COPILOT_TOKEN_URL, {
      method: 'GET',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch Copilot token: ${response.statusText}\n${errorText}\n\nMake sure you have an active GitHub Copilot subscription.`
      );
    }

    return response.json();
  }

  /**
   * Check if user has valid Copilot access
   */
  async checkAccess(): Promise<boolean> {
    try {
      logger.debug('[CopilotAuth] Checking access. GitHub token exists:', !!this.githubAccessToken);
      const token = await this.getToken();
      logger.debug('[CopilotAuth] Successfully obtained Copilot token');
      return true;
    } catch (error) {
      logger.warn(
        '[CopilotAuth] Failed to check access:',
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /**
   * Get user's Copilot subscription information
   * Returns the plan type: 'free', 'pro', 'pro+', 'business', or 'enterprise'
   *
   * Note: GitHub doesn't have a public API endpoint for this yet,
   * so we infer from available information or return a default.
   */
  async getUserCopilotPlan(): Promise<{
    plan: 'free' | 'pro' | 'pro+' | 'business' | 'enterprise';
    seat_management_setting?: string;
    organization?: string;
  } | null> {
    if (!this.githubAccessToken) {
      logger.error('[CopilotAuth] No GitHub access token available');
      return null;
    }

    try {
      // Try to get basic user info first
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${this.githubAccessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!userResponse.ok) {
        logger.error(
          `[CopilotAuth] Failed to fetch user info: ${userResponse.status} ${userResponse.statusText}`
        );
        // Token might be valid for Copilot but not for user API, return default plan
        return {
          plan: 'pro', // Default assumption if authenticated
          seat_management_setting: 'individual',
        };
      }

      const userData = await userResponse.json();
      const username = userData.login;
      logger.info(`[CopilotAuth] Authenticated as: ${username}`);

      // GitHub's Copilot REST API endpoints are for org admins, not individual users
      // See: https://docs.github.com/en/rest/copilot/copilot-user-management
      // For individual plan detection, we'll return a default 'pro' plan
      // Users can click "Manage Plan" to see their actual tier on GitHub.com

      return {
        plan: 'pro', // Most common plan for authenticated users
        seat_management_setting: 'individual',
      };
    } catch (error) {
      logger.error('Failed to get Copilot plan:', error);
      return null;
    }
  }

  /**
   * Get cached token info (without refreshing)
   */
  getCachedTokenInfo(): CopilotToken | null {
    return this.cachedToken;
  }

  /**
   * Clear cached tokens
   */
  clearCache(): void {
    this.cachedToken = null;
  }
}
