/**
 * Azure DevOps authentication - poll for completion
 *
 * Client calls this repeatedly to check if user has authorized
 */

import type { Request, Response } from 'express';
import { AzureDevOpsAuthManager } from '../../../providers/azure-devops-auth.js';
import { SettingsService } from '../../../services/settings-service.js';
import { createLogger } from '@automaker/utils';
import { pendingAzureAuths } from './start-azure-auth.js';

const logger = createLogger('AzurePollRoute');

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// Store authenticated sessions (in production, use proper session management)
export const azureAuthSessions = new Map<string, AzureDevOpsAuthManager>();

export function createPollAzureAuthHandler() {
  return async (req: Request, res: Response) => {
    try {
      const settingsService = (req as any).settingsService as SettingsService;

      const { deviceCodeId, organization, project, wikiId } = req.body as {
        deviceCodeId: string;
        organization?: string;
        project?: string;
        wikiId?: string;
      };

      if (!deviceCodeId) {
        res.json({
          success: false,
          status: 'error',
          error: 'Device code ID required',
        });
        return;
      }

      const pendingAuth = pendingAzureAuths.get(deviceCodeId);
      if (!pendingAuth) {
        res.json({
          success: false,
          status: 'expired',
          error: 'Device code expired or not found',
        });
        return;
      }

      // Poll Microsoft Entra ID for access token
      const CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'; // Azure CLI
      const TENANT_ID = pendingAuth.tenantId || 'organizations'; // Use stored tenant ID or default

      const params = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT_ID,
        device_code: deviceCodeId,
      });

      const response = await fetch(
        `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = (await response.json()) as TokenResponse;

      if (data.error === 'authorization_pending') {
        // Still waiting
        res.json({
          success: true,
          status: 'pending',
        });
        return;
      }

      if (data.error === 'slow_down') {
        // Polling too fast
        logger.warn('Microsoft says to slow down polling');
        res.json({
          success: true,
          status: 'pending',
          slowDown: true,
        });
        return;
      }

      if (data.error === 'expired_token' || data.error === 'code_expired') {
        // Device code expired
        logger.warn('Device code expired');
        pendingAzureAuths.delete(deviceCodeId);
        res.json({
          success: true,
          status: 'expired',
          error: 'Device code has expired. Please start authentication again.',
        });
        return;
      }

      if (data.error) {
        logger.error('Azure authorization error:', data.error, data.error_description);
        // Clean up on fatal errors
        pendingAzureAuths.delete(deviceCodeId);
        res.json({
          success: true,
          status: 'error',
          error: data.error_description || data.error,
        });
        return;
      }

      if (data.access_token && data.refresh_token && data.expires_in) {
        // Success! Create auth manager and store session
        const authManager = new AzureDevOpsAuthManager();
        authManager.setCachedToken({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        });

        // Get user ID from token
        const tokenInfo = authManager.getCachedTokenInfo();

        // Generate session ID (moved up to use in both persistence and in-memory storage)
        const sessionId = `azure_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Save token to credentials.json for persistence
        await settingsService.saveAzureAuthToken(sessionId, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          userId: tokenInfo?.userId,
        });

        // Fetch user's Azure DevOps organizations and default project/wiki
        let fetchedConfig:
          | {
              organization?: string;
              project?: string;
              wikiId?: string;
              wikiName?: string;
              availableOrgs?: Array<{ id: string; name: string }>;
              availableProjects?: Array<{ id: string; name: string }>;
              availableWikis?: Array<{ id: string; name: string; type: string }>;
            }
          | undefined;

        try {
          // Get user's organizations
          const accountsResponse = await fetch(
            'https://app.vssps.visualstudio.com/_apis/accounts?api-version=6.0',
            {
              headers: {
                Authorization: `Bearer ${data.access_token}`,
                Accept: 'application/json',
              },
            }
          );

          if (accountsResponse.ok) {
            const accountsData = (await accountsResponse.json()) as any;
            if (accountsData.value && accountsData.value.length > 0) {
              const orgs = accountsData.value.map((acc: any) => ({
                id: acc.accountId,
                name: acc.accountName,
              }));

              const firstOrg = accountsData.value[0].accountName as string;

              // Get projects for this organization
              const projectsResponse = await fetch(
                `https://dev.azure.com/${firstOrg}/_apis/projects?api-version=6.0`,
                {
                  headers: {
                    Authorization: `Bearer ${data.access_token}`,
                    Accept: 'application/json',
                  },
                }
              );

              if (projectsResponse.ok) {
                const projectsData = (await projectsResponse.json()) as any;
                if (projectsData.value && projectsData.value.length > 0) {
                  const projects = projectsData.value.map((proj: any) => ({
                    id: proj.id,
                    name: proj.name,
                  }));

                  const firstProject = projectsData.value[0].name as string;

                  // Get wikis for this project
                  const wikisResponse = await fetch(
                    `https://dev.azure.com/${firstOrg}/${firstProject}/_apis/wiki/wikis?api-version=7.1-preview.2`,
                    {
                      headers: {
                        Authorization: `Bearer ${data.access_token}`,
                        Accept: 'application/json',
                      },
                    }
                  );

                  if (wikisResponse.ok) {
                    const wikisData = (await wikisResponse.json()) as any;
                    if (wikisData.value && wikisData.value.length > 0) {
                      const wikis = wikisData.value.map((wiki: any) => ({
                        id: wiki.id,
                        name: wiki.name,
                        type: wiki.type,
                      }));

                      const firstWiki = wikisData.value[0];
                      fetchedConfig = {
                        organization: firstOrg,
                        project: firstProject,
                        wikiId: firstWiki.id, // Use ID instead of name
                        wikiName: firstWiki.name,
                        availableOrgs: orgs,
                        availableProjects: projects,
                        availableWikis: wikis,
                      };
                      logger.info('Fetched Azure DevOps config:', {
                        org: firstOrg,
                        project: firstProject,
                        wikiId: firstWiki.id,
                        wikiName: firstWiki.name,
                        totalOrgs: orgs.length,
                        totalProjects: projects.length,
                        totalWikis: wikis.length,
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (fetchError) {
          logger.warn('Failed to fetch Azure DevOps organizations/projects:', fetchError);
          // Continue anyway - authentication still succeeded
        }

        // Store auth manager in session (in-memory, sessionId already generated above)
        azureAuthSessions.set(sessionId, authManager);

        logger.info(`Stored auth session ${sessionId}, total sessions: ${azureAuthSessions.size}`);
        logger.info(
          `Token expires at: ${new Date(data.expires_in * 1000 + Date.now()).toISOString()}`
        );

        // Clean up pending auth
        pendingAzureAuths.delete(deviceCodeId);

        logger.info('Successfully authenticated with Azure DevOps');

        res.json({
          success: true,
          status: 'complete',
          sessionId,
          userId: tokenInfo?.userId,
          expiresAt: Date.now() + data.expires_in * 1000,
          // Return fetched config (org/project/wiki)
          config: fetchedConfig,
        });
      } else {
        res.json({
          success: true,
          status: 'pending',
        });
      }
    } catch (error) {
      logger.error('Failed to poll Azure DevOps authentication:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
