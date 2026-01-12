/**
 * Azure DevOps authentication - start device flow
 *
 * Returns device code immediately for the client to display
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AzureAuthRoute');

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

// Store pending authentications (in-memory for now)
export const pendingAzureAuths = new Map<
  string,
  { deviceCode: DeviceCodeResponse; startTime: number }
>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of pendingAzureAuths.entries()) {
    if (now - data.startTime > data.deviceCode.expires_in * 1000) {
      pendingAzureAuths.delete(code);
    }
  }
}, 60000);

export function createStartAzureAuthHandler() {
  return async (_req: Request, res: Response) => {
    try {
      logger.info('Initiating Azure DevOps device flow...');

      // Request device code from Microsoft Entra ID
      const CLIENT_ID = '499b84ac-1321-427f-aa17-267ca6975798'; // VS Code public client
      const TENANT_ID = 'common';
      const SCOPES = 'vso.wiki vso.serviceendpoint_query offline_access';

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        scope: SCOPES,
      });

      const response = await fetch(
        `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to request device code: ${response.statusText}\n${errorText}`);
      }

      const deviceCode = (await response.json()) as DeviceCodeResponse;

      // Store for polling endpoint to complete
      pendingAzureAuths.set(deviceCode.device_code, {
        deviceCode,
        startTime: Date.now(),
      });

      logger.info(`Device code generated: ${deviceCode.user_code}`);

      // Return device code info immediately
      res.json({
        success: true,
        deviceCode: {
          verificationUri: deviceCode.verification_uri,
          userCode: deviceCode.user_code,
          expiresIn: deviceCode.expires_in,
          deviceCodeId: deviceCode.device_code, // Client needs this for polling
          interval: deviceCode.interval, // Tell client how often to poll (in seconds)
          message: deviceCode.message,
        },
      });
    } catch (error) {
      logger.error('Failed to start Azure DevOps authentication:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}
