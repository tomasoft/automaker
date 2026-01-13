/**
 * Azure DevOps Authentication Utilities
 *
 * Handles OAuth 2.0 device flow authentication for Azure DevOps Wiki API access
 * Based on Microsoft Entra ID device authorization grant flow
 * @see https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('AzureDevOpsAuth');

interface AzureToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: string; // User principal name or email
  authType?: 'oauth' | 'pat'; // Authentication type
}

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token?: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
  error_codes?: number[];
}

/**
 * Azure DevOps Auth Manager
 */
export class AzureDevOpsAuthManager {
  // Microsoft Entra ID endpoints
  private static readonly TENANT_ID = 'common'; // 'common' for multi-tenant, or specific tenant ID
  private static readonly CLIENT_ID = '499b84ac-1321-427f-aa17-267ca6975798'; // Visual Studio Code client ID (public client)
  private static readonly DEVICE_CODE_URL = `https://login.microsoftonline.com/${AzureDevOpsAuthManager.TENANT_ID}/oauth2/v2.0/devicecode`;
  private static readonly TOKEN_URL = `https://login.microsoftonline.com/${AzureDevOpsAuthManager.TENANT_ID}/oauth2/v2.0/token`;

  // Azure DevOps API scopes
  private static readonly SCOPES = [
    'vso.wiki', // Wiki read/write
    'vso.serviceendpoint_query', // For webhooks
    'offline_access', // Refresh token
  ].join(' ');

  private cachedToken: AzureToken | null = null;
  private personalAccessToken: string | null = null;

  constructor(cachedToken?: AzureToken, pat?: string) {
    if (cachedToken) {
      this.cachedToken = cachedToken;
    }
    if (pat) {
      this.personalAccessToken = pat;
    }
  }

  /**
   * Set Personal Access Token for authentication
   */
  setPAT(pat: string): void {
    this.personalAccessToken = pat;
    // Clear OAuth token if switching to PAT
    this.cachedToken = null;
  }

  /**
   * Clear Personal Access Token
   */
  clearPAT(): void {
    this.personalAccessToken = null;
  }

  /**
   * Get a valid Azure DevOps access token (from cache, PAT, or by refreshing)
   */
  async getToken(): Promise<string> {
    // If using PAT, return it directly (PATs don't expire in traditional sense)
    if (this.personalAccessToken) {
      logger.debug('[AzureDevOpsAuth] Using Personal Access Token');
      return this.personalAccessToken;
    }

    // Check if we have a valid cached token (with 5 min buffer)
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 300000) {
      logger.debug('[AzureDevOpsAuth] Using cached access token');
      return this.cachedToken.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (this.cachedToken?.refreshToken) {
      logger.debug('[AzureDevOpsAuth] Cached token expired, refreshing...');
      try {
        await this.refreshToken();
        return this.cachedToken!.accessToken;
      } catch (error) {
        logger.error(
          '[AzureDevOpsAuth] Failed to refresh token:',
          error instanceof Error ? error.message : error
        );
        // Fall through to re-authentication
        this.cachedToken = null;
      }
    }

    // No valid token, need to authenticate
    throw new Error(
      'No valid Azure DevOps access token found. Please authenticate using the device flow.'
    );
  }

  /**
   * Perform Azure DevOps device flow authentication
   *
   * @param onDeviceCode Optional callback to receive device code info (for UI display)
   */
  async authenticate(onDeviceCode?: (data: DeviceCodeResponse) => void): Promise<AzureToken> {
    logger.info('Starting Azure DevOps device flow authentication...');

    // Step 1: Request device code
    const deviceCode = await this.requestDeviceCode();

    logger.info('\n===========================================');
    logger.info('Azure DevOps Authentication Required');
    logger.info('===========================================');
    logger.info(`\nPlease visit: ${deviceCode.verification_uri}`);
    logger.info(`\nAnd enter code: ${deviceCode.user_code}\n`);
    logger.info('===========================================\n');

    // Notify callback with device code info (for UI to display)
    if (onDeviceCode) {
      onDeviceCode(deviceCode);
    }

    // Step 2: Poll for access token
    const tokenData = await this.pollForAccessToken(deviceCode);

    // Step 3: Extract user ID from token (if available)
    const userId = this.extractUserIdFromToken(tokenData.id_token);

    this.cachedToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      userId,
    };

    logger.info('Successfully authenticated with Azure DevOps!');
    return this.cachedToken;
  }

  /**
   * Request device code from Microsoft Entra ID
   */
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const params = new URLSearchParams({
      client_id: AzureDevOpsAuthManager.CLIENT_ID,
      scope: AzureDevOpsAuthManager.SCOPES,
    });

    const response = await fetch(AzureDevOpsAuthManager.DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to request device code: ${response.statusText}\n${errorText}`);
    }

    const data: DeviceCodeResponse = (await response.json()) as DeviceCodeResponse;
    return data;
  }

  /**
   * Poll Microsoft Entra ID for access token after user authorization
   */
  private async pollForAccessToken(deviceCode: DeviceCodeResponse): Promise<TokenResponse> {
    const startTime = Date.now();
    const expiresIn = deviceCode.expires_in * 1000;
    const interval = deviceCode.interval * 1000;

    while (Date.now() - startTime < expiresIn) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const params = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: AzureDevOpsAuthManager.CLIENT_ID,
          device_code: deviceCode.device_code,
        });

        const response = await fetch(AzureDevOpsAuthManager.TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        const data = (await response.json()) as TokenResponse | TokenErrorResponse;

        // Check for error responses
        if ('error' in data) {
          if (data.error === 'authorization_pending') {
            // Still waiting for user to authorize
            logger.debug('[AzureDevOpsAuth] Authorization pending, continuing to poll...');
            continue;
          }

          if (data.error === 'slow_down') {
            // Microsoft is asking us to slow down polling
            logger.debug('[AzureDevOpsAuth] Slowing down polling interval');
            await new Promise((resolve) => setTimeout(resolve, interval));
            continue;
          }

          throw new Error(`Azure authentication error: ${data.error_description || data.error}`);
        }

        // Success - we have tokens
        if ('access_token' in data) {
          return data;
        }
      } catch (error) {
        logger.error('Error polling for access token:', error);
        throw error;
      }
    }

    throw new Error('Azure DevOps authentication timed out');
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshToken(): Promise<void> {
    if (!this.cachedToken?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: AzureDevOpsAuthManager.CLIENT_ID,
      refresh_token: this.cachedToken.refreshToken,
      scope: AzureDevOpsAuthManager.SCOPES,
    });

    const response = await fetch(AzureDevOpsAuthManager.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${response.statusText}\n${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;

    this.cachedToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.cachedToken.refreshToken, // Keep old if not returned
      expiresAt: Date.now() + data.expires_in * 1000,
      userId: this.cachedToken.userId,
    };

    logger.debug('[AzureDevOpsAuth] Successfully refreshed access token');
  }

  /**
   * Extract user ID from ID token (JWT)
   */
  private extractUserIdFromToken(idToken?: string): string | undefined {
    if (!idToken) return undefined;

    try {
      // JWT is base64-encoded, split into parts
      const parts = idToken.split('.');
      if (parts.length !== 3) return undefined;

      // Decode payload (second part)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

      // Extract user principal name or email
      return payload.upn || payload.email || payload.preferred_username;
    } catch (error) {
      logger.warn('[AzureDevOpsAuth] Failed to extract user ID from token:', error);
      return undefined;
    }
  }

  /**
   * Check if user has valid Azure DevOps access
   */
  async checkAccess(): Promise<boolean> {
    try {
      const token = await this.getToken();
      return !!token;
    } catch (error) {
      logger.warn(
        '[AzureDevOpsAuth] Failed to check access:',
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /**
   * Get cached token info
   */
  getCachedTokenInfo(): AzureToken | null {
    return this.cachedToken;
  }

  /**
   * Set cached token (for session restoration)
   */
  setCachedToken(token: AzureToken): void {
    this.cachedToken = token;
  }

  /**
   * Clear cached tokens
   */
  clearCache(): void {
    this.cachedToken = null;
  }

  /**
   * Revoke tokens (logout)
   */
  async revoke(): Promise<void> {
    // Microsoft doesn't require explicit revocation for public clients
    // Just clear the cache
    this.clearCache();
    logger.info('[AzureDevOpsAuth] Tokens revoked');
  }

  /**
   * List available wikis from Azure DevOps
   */
  async listWikis(): Promise<{ id: string; name: string; type: string; url: string }[]> {
    const token = await this.getToken();

    // TODO: For now return empty array - need organization/project context
    // This would require storing organization/project during auth flow
    logger.warn('[AzureDevOpsAuth] listWikis requires organization/project context');
    return [];
  }

  /**
   * List pages in a wiki
   */
  async listPages(
    organization: string,
    project: string,
    wikiId: string,
    path?: string
  ): Promise<{ id: string; path: string; name: string }[]> {
    const token = await this.getToken();

    const url = `https://dev.azure.com/${organization}/${project}/_apis/wiki/wikis/${wikiId}/pages?api-version=7.1-preview.1${path ? `&path=${encodeURIComponent(path)}` : ''}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list pages: ${response.statusText}`);
    }

    const data = (await response.json()) as { value?: Array<{ id: string; path: string }> };

    return (data.value || []).map((page) => ({
      id: page.id,
      path: page.path,
      name: page.path.split('/').pop() || page.path,
    }));
  }

  /**
   * Get content of a wiki page
   */
  async getPage(
    organization: string,
    project: string,
    wikiId: string,
    path: string
  ): Promise<{ content: string; path: string; metadata: Record<string, unknown> }> {
    const token = await this.getToken();

    const url = `https://dev.azure.com/${organization}/${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(path)}&includeContent=true&api-version=7.1-preview.1`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get page: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      content?: string;
      path: string;
      [key: string]: unknown;
    };

    return {
      content: data.content || '',
      path: data.path,
      metadata: {
        id: data.id,
        url: data.url,
      },
    };
  }
}
