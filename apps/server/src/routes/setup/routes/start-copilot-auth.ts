/**
 * GitHub Copilot authentication - start device flow
 *
 * Returns device code immediately for the client to display
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CopilotAuthRoute');

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// Store pending authentications (in production, use Redis or similar)
const pendingAuths = new Map<string, { deviceCode: DeviceCodeResponse; startTime: number }>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of pendingAuths.entries()) {
    if (now - data.startTime > data.deviceCode.expires_in * 1000) {
      pendingAuths.delete(code);
    }
  }
}, 60000);

export function createStartCopilotAuthHandler() {
  return async (_req: Request, res: Response) => {
    try {
      logger.info('Initiating GitHub Copilot device flow...');

      // Request device code from GitHub
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: 'Iv1.b507a08c87ecfe98',
          scope: 'read:user',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to request device code: ${response.statusText}`);
      }

      const deviceCode = (await response.json()) as DeviceCodeResponse;

      // Store for polling endpoint to complete
      pendingAuths.set(deviceCode.device_code, {
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
        },
      });
    } catch (error) {
      logger.error('Failed to start Copilot authentication:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };
}

// Export for use by polling endpoint
export { pendingAuths };
