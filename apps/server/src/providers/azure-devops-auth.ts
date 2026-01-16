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
  private static readonly DEFAULT_TENANT_ID = 'organizations'; // 'organizations' for work/school accounts
  private static readonly CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'; // Azure CLI client ID (public client with Azure DevOps consent)

  // URLs are built dynamically with tenant ID
  private static getDeviceCodeUrl(tenantId: string): string {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  }

  private static getTokenUrl(tenantId: string): string {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  // Azure DevOps API scopes
  // Using .default scope with Azure DevOps resource ID for delegated permissions
  private static readonly SCOPES = '499b84ac-1321-427f-aa17-267ca6975798/.default offline_access';

  private cachedToken: AzureToken | null = null;
  private personalAccessToken: string | null = null;
  private tenantId: string;

  constructor(cachedToken?: AzureToken, pat?: string, tenantId?: string) {
    if (cachedToken) {
      this.cachedToken = cachedToken;
    }
    if (pat) {
      this.personalAccessToken = pat;
    }
    this.tenantId = tenantId || AzureDevOpsAuthManager.DEFAULT_TENANT_ID;
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
    logger.debug('[AzureDevOpsAuth] getToken() called');
    logger.debug('[AzureDevOpsAuth] Has PAT:', !!this.personalAccessToken);
    logger.debug('[AzureDevOpsAuth] Has cached token:', !!this.cachedToken);
    if (this.cachedToken) {
      logger.debug(
        '[AzureDevOpsAuth] Token expires at:',
        new Date(this.cachedToken.expiresAt).toISOString()
      );
      logger.debug(
        '[AzureDevOpsAuth] Time until expiry (ms):',
        this.cachedToken.expiresAt - Date.now()
      );
    }

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

    const response = await fetch(AzureDevOpsAuthManager.getDeviceCodeUrl(this.tenantId), {
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

        const response = await fetch(AzureDevOpsAuthManager.getTokenUrl(this.tenantId), {
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

    const response = await fetch(AzureDevOpsAuthManager.getTokenUrl(this.tenantId), {
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
  async listWikis(
    organization: string,
    project: string
  ): Promise<{ id: string; name: string; type: string; url: string }[]> {
    const token = await this.getToken();

    const url = `https://dev.azure.com/${organization}/${project}/_apis/wiki/wikis?api-version=7.1-preview.2`;

    logger.info(`[listWikis] Fetching from URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[listWikis] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to list wikis: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      value?: Array<{ id: string; name: string; type: string; url: string }>;
    };

    logger.info(`[listWikis] Found ${data.value?.length || 0} wikis`);
    if (data.value) {
      logger.info(`[listWikis] Wikis:`, data.value);
    }

    return data.value || [];
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

    // Use recursionLevel=full to get all pages in the tree
    const pathParam = path ? `&path=${encodeURIComponent(path)}` : '';
    const url = `https://dev.azure.com/${organization}/${project}/_apis/wiki/wikis/${wikiId}/pages?recursionLevel=full&api-version=7.1-preview.1${pathParam}`;

    logger.info(`[listPages] Fetching from URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[listPages] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to list pages: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    logger.info(`[listPages] Response data structure:`, Object.keys(data));
    logger.info(`[listPages] Full response:`, JSON.stringify(data, null, 2));

    // The response might have a different structure - let's check
    let pages: Array<{ id: string; path: string }> = [];

    if (data.subPages && Array.isArray(data.subPages)) {
      // Flatten the tree structure
      const flattenPages = (pageNode: any): Array<{ id: string; path: string }> => {
        const result: Array<{ id: string; path: string }> = [];
        if (pageNode.path) {
          // Use path as id if no id is provided
          result.push({ id: pageNode.path, path: pageNode.path });
        }
        if (pageNode.subPages && Array.isArray(pageNode.subPages)) {
          for (const subPage of pageNode.subPages) {
            result.push(...flattenPages(subPage));
          }
        }
        return result;
      };

      // Process all subpages
      for (const subPage of data.subPages) {
        pages.push(...flattenPages(subPage));
      }
    } else if (data.value && Array.isArray(data.value)) {
      pages = data.value;
    }

    logger.info(`[listPages] Got ${pages.length} pages from Azure DevOps`);
    if (pages.length > 0) {
      logger.info(`[listPages] First few pages:`, pages.slice(0, 5));
    }

    return pages.map((page) => ({
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

  /**
   * Get current user profile from Azure DevOps
   */
  async getCurrentUser(): Promise<{ id: string; displayName: string; emailAddress: string }> {
    const token = await this.getToken();

    const response = await fetch(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get user profile: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id: string;
      displayName: string;
      emailAddress: string;
    };

    return {
      id: data.id,
      displayName: data.displayName,
      emailAddress: data.emailAddress,
    };
  }

  /**
   * Query work items assigned to the authenticated user
   */
  async getMyWorkItems(
    organization: string,
    project: string,
    workItemTypes: string[] = ['Bug', 'User Story', 'Feature']
  ): Promise<
    Array<{
      id: number;
      title: string;
      workItemType: string;
      state: string;
      assignedTo: string;
      description?: string;
      acceptanceCriteria?: string;
      tags?: string;
      priority?: number;
      url: string;
      parentId?: number;
    }>
  > {
    const token = await this.getToken();

    // Build WIQL query to get work items assigned to current user
    // Using @Me macro which resolves to current authenticated user
    const wiql = {
      query: `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.Description], [Microsoft.VSTS.Common.AcceptanceCriteria], [System.Tags], [Microsoft.VSTS.Common.Priority]
              FROM workitems
              WHERE [System.TeamProject] = @project
                AND [System.AssignedTo] = @Me
                AND [System.WorkItemType] IN (${workItemTypes.map((t) => `'${t}'`).join(', ')})
              ORDER BY [Microsoft.VSTS.Common.Priority] ASC, [System.CreatedDate] DESC`,
    };

    logger.info(
      `[getMyWorkItems] Executing WIQL query for org=${organization}, project=${project}`
    );
    logger.info(`[getMyWorkItems] WIQL: ${wiql.query}`);

    // Execute WIQL query
    const wiqlResponse = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(wiql),
      }
    );

    if (!wiqlResponse.ok) {
      const errorText = await wiqlResponse.text();
      logger.error(
        `[getMyWorkItems] WIQL query failed with status ${wiqlResponse.status}: ${errorText}`
      );
      throw new Error(`Failed to query work items: ${wiqlResponse.statusText}`);
    }

    const wiqlData = (await wiqlResponse.json()) as {
      workItems?: Array<{ id: number; url: string }>;
    };

    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      logger.info('[getMyWorkItems] No work items found matching query');
      logger.info(`[getMyWorkItems] Query returned: ${JSON.stringify(wiqlData)}`);
      return [];
    }

    logger.info(`[getMyWorkItems] Found ${wiqlData.workItems.length} work items`);

    // Fetch full details for each work item
    const workItemIds = wiqlData.workItems.map((wi) => wi.id);
    logger.info(`[getMyWorkItems] Fetching details for IDs: ${workItemIds.join(', ')}`);
    const batchResponse = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${workItemIds.join(',')}&$expand=all&api-version=7.1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!batchResponse.ok) {
      const errorText = await batchResponse.text();
      logger.error(
        `[getMyWorkItems] Batch fetch failed with status ${batchResponse.status}: ${errorText}`
      );
      throw new Error(`Failed to fetch work item details: ${batchResponse.statusText}`);
    }

    const batchData = (await batchResponse.json()) as {
      value?: Array<{
        id: number;
        url: string;
        relations?: Array<{
          rel: string;
          url: string;
          attributes?: {
            name?: string;
            [key: string]: any;
          };
        }>;
        fields: {
          'System.Title': string;
          'System.WorkItemType': string;
          'System.State': string;
          'System.AssignedTo'?: { displayName: string };
          'System.Description'?: string;
          'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
          'System.Tags'?: string;
          'Microsoft.VSTS.Common.Priority'?: number;
        };
      }>;
    };

    if (!batchData.value) {
      return [];
    }

    logger.info(`[getMyWorkItems] Fetched details for ${batchData.value.length} work items`);

    return batchData.value.map((wi) => {
      const attachments =
        wi.relations
          ?.filter((rel: any) => rel.rel === 'AttachedFile')
          .map((rel: any) => ({
            id: rel.url.split('/').pop(),
            name: rel.attributes?.name || 'attachment',
            url: rel.url,
          })) || [];

      if (attachments.length > 0) {
        logger.info(
          `[getMyWorkItems] Work item ${wi.id} has ${attachments.length} attachments:`,
          attachments.map((a) => a.name)
        );
      }

      // Find parent work item (reverse hierarchy relation)
      const parentRelation = wi.relations?.find(
        (rel: any) => rel.rel === 'System.LinkTypes.Hierarchy-Reverse'
      );
      const parentId = parentRelation
        ? parseInt(parentRelation.url.match(/\/(\d+)$/)?.[1] || '0', 10) || undefined
        : undefined;

      return {
        id: wi.id,
        title: wi.fields['System.Title'],
        workItemType: wi.fields['System.WorkItemType'],
        state: wi.fields['System.State'],
        assignedTo: wi.fields['System.AssignedTo']?.displayName || 'Unassigned',
        description: wi.fields['System.Description'],
        acceptanceCriteria: wi.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
        tags: wi.fields['System.Tags'],
        priority: wi.fields['Microsoft.VSTS.Common.Priority'],
        url: wi.url,
        attachments,
        parentId,
      };
    });
  }

  /**
   * Get child work items for a parent work item (e.g., bugs/stories under a feature)
   */
  async getChildWorkItems(
    organization: string,
    project: string,
    parentId: number
  ): Promise<
    Array<{
      id: number;
      title: string;
      workItemType: string;
      state: string;
      url: string;
    }>
  > {
    const token = await this.getToken();

    logger.info(`[getChildWorkItems] Fetching children for work item ${parentId}`);

    // Get work item with relations
    const response = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${parentId}?$expand=relations&api-version=7.1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[getChildWorkItems] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to get work item: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      relations?: Array<{
        rel: string;
        url: string;
      }>;
    };

    if (!data.relations) {
      logger.info(`[getChildWorkItems] No relations found for work item ${parentId}`);
      return [];
    }

    // Filter for child relations
    const childRelations = data.relations.filter(
      (r) => r.rel === 'System.LinkTypes.Hierarchy-Forward'
    );

    if (childRelations.length === 0) {
      logger.info(`[getChildWorkItems] No child work items found for ${parentId}`);
      return [];
    }

    // Extract child IDs from URLs
    const childIds = childRelations
      .map((r) => {
        const match = r.url.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((id) => id !== null) as number[];

    logger.info(`[getChildWorkItems] Found ${childIds.length} child work items for ${parentId}`);

    if (childIds.length === 0) {
      return [];
    }

    // Fetch details for child work items
    const batchResponse = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${childIds.join(',')}&api-version=7.1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!batchResponse.ok) {
      const errorText = await batchResponse.text();
      logger.error(
        `[getChildWorkItems] Batch fetch failed with status ${batchResponse.status}: ${errorText}`
      );
      throw new Error(`Failed to fetch child work item details: ${batchResponse.statusText}`);
    }

    const batchData = (await batchResponse.json()) as {
      value?: Array<{
        id: number;
        url: string;
        fields: {
          'System.Title': string;
          'System.WorkItemType': string;
          'System.State': string;
        };
      }>;
    };

    if (!batchData.value) {
      return [];
    }

    return batchData.value.map((wi) => ({
      id: wi.id,
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      url: wi.url,
    }));
  }

  /**
   * Update Azure DevOps work item status
   */
  async updateWorkItemStatus(
    organization: string,
    project: string,
    workItemId: number,
    status: string
  ): Promise<void> {
    const token = await this.getToken();

    const updatePayload = [
      {
        op: 'add',
        path: '/fields/System.State',
        value: status,
      },
    ];

    const response = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.1`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json-patch+json',
          Accept: 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[updateWorkItemStatus] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to update work item status: ${response.statusText}`);
    }

    logger.info(`[updateWorkItemStatus] Updated work item ${workItemId} to status: ${status}`);
  }

  /**
   * Add a link reference to an Azure DevOps work item as a comment
   * (Azure DevOps doesn't support custom URL protocols like automaker://)
   */
  async addWorkItemLink(
    organization: string,
    project: string,
    workItemId: number,
    linkUrl: string,
    linkComment?: string
  ): Promise<void> {
    const token = await this.getToken();

    // Add as a comment since Azure DevOps doesn't support custom URL protocols
    const commentText = linkComment
      ? `${linkComment}\n\nAutoMaker Feature: ${linkUrl}`
      : `Linked to AutoMaker feature: ${linkUrl}`;

    const updatePayload = [
      {
        op: 'add',
        path: '/fields/System.History',
        value: commentText,
      },
    ];

    const response = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.1`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json-patch+json',
          Accept: 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[addWorkItemLink] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to add link to work item: ${response.statusText}`);
    }

    logger.info(`[addWorkItemLink] Added link comment to work item ${workItemId}: ${linkUrl}`);
  }

  /**
   * Download an attachment from an Azure DevOps work item
   */
  async downloadAttachment(
    organization: string,
    project: string,
    attachmentId: string
  ): Promise<Buffer> {
    const token = await this.getToken();

    // Note: Attachments API doesn't use project in the URL path
    const response = await fetch(
      `https://dev.azure.com/${organization}/_apis/wit/attachments/${attachmentId}?api-version=7.1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[downloadAttachment] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to download attachment: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get comments/discussions for a work item
   */
  async getWorkItemComments(
    organization: string,
    project: string,
    workItemId: number
  ): Promise<
    Array<{
      id: number;
      text: string;
      createdDate: string;
      createdBy: string;
      attachments?: Array<{
        id: string;
        name: string;
        url: string;
      }>;
    }>
  > {
    const token = await this.getToken();

    logger.info(`[getWorkItemComments] Fetching comments for work item ${workItemId}`);

    const response = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[getWorkItemComments] Failed with status ${response.status}: ${errorText}`);
      throw new Error(`Failed to get work item comments: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      comments?: Array<{
        id: number;
        text: string;
        createdDate: string;
        createdBy: { displayName: string };
        url: string;
      }>;
    };

    if (!data.comments || data.comments.length === 0) {
      logger.info(`[getWorkItemComments] No comments found for work item ${workItemId}`);
      return [];
    }

    logger.info(
      `[getWorkItemComments] Found ${data.comments.length} comments for work item ${workItemId}`
    );

    // Parse comments for attachments (look for image/file references in HTML)
    return data.comments.map((comment) => {
      const attachments: Array<{ id: string; name: string; url: string }> = [];

      // Look for attachment references in comment text (Azure DevOps uses HTML with img tags and attachment links)
      // Example: src="https://dev.azure.com/.../attachments/07e3ea22-2376-4799-a9e5-9cd8be425502?fileName=image.png"
      const imgRegex = /attachments\/([a-f0-9-]+)(?:\?fileName=([^"&]+))?/gi;

      let match;
      while ((match = imgRegex.exec(comment.text)) !== null) {
        const id = match[1]; // Just the UUID, no query params
        const filename = match[2] || `attachment-${id}`;
        attachments.push({
          id,
          name: filename,
          url: match[0], // Full match for reference
        });
      }

      return {
        id: comment.id,
        text: comment.text,
        createdDate: comment.createdDate,
        createdBy: comment.createdBy.displayName,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    });
  }
}
