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
    }
  }

  /**
   * Get a valid Copilot token (from cache or by refreshing)
   */
  async getToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
      return this.cachedToken.token;
    }

    // Check for GitHub token from environment
    if (!this.githubAccessToken) {
      this.githubAccessToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    }

    // If no GitHub token, need to do device flow
    if (!this.githubAccessToken) {
      throw new Error(
        'No GitHub access token found. Please set GITHUB_TOKEN environment variable or run authentication flow.'
      );
    }

    // Get Copilot token using GitHub access token
    const copilotToken = await this.fetchCopilotToken(this.githubAccessToken);
    
    this.cachedToken = {
      token: copilotToken.token,
      expiresAt: copilotToken.expires_at,
      organizationsList: copilotToken.organization_list,
    };

    return this.cachedToken.token;
  }

  /**
   * Perform GitHub device flow authentication
   */
  async authenticate(): Promise<string> {
    logger.info('Starting GitHub device flow authentication...');

    // Step 1: Request device code
    const deviceCode = await this.requestDeviceCode();
    
    logger.info('\n===========================================');
    logger.info('GitHub Authentication Required');
    logger.info('===========================================');
    logger.info(`\nPlease visit: ${deviceCode.verification_uri}`);
    logger.info(`\nAnd enter code: ${deviceCode.user_code}\n`);
    logger.info('===========================================\n');

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
        'Accept': 'application/json',
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
            'Accept': 'application/json',
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
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/json',
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
      await this.getToken();
      return true;
    } catch {
      return false;
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
