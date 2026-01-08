/**
 * GitHub Copilot Setup Step
 *
 * Users can authenticate with GitHub Copilot either:
 * 1. By setting GITHUB_TOKEN environment variable
 * 2. By using interactive device flow authentication
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSetupStore, type CopilotStatus } from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('CopilotSetupStep');

interface CopilotSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface DeviceCodeInfo {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
  deviceCodeId: string;
  interval: number;
}

export function CopilotSetupStep({ onNext, onBack, onSkip }: CopilotSetupStepProps) {
  const { copilotStatus, setCopilotStatus } = useSetupStore();

  const [isChecking, setIsChecking] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentIntervalRef = useRef<number>(5000); // Start with 5 seconds
  const slowDownCountRef = useRef<number>(0); // Track consecutive slow_down responses

  // Check Copilot status
  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const api = getHttpApiClient();
      const result = await api.setup.getCopilotStatus();

      logger.info('Copilot status result:', result);

      if (result.success) {
        const status: CopilotStatus = {
          installed: result.installed,
          authenticated: result.authenticated,
          hasApiKey: result.hasApiKey,
          method: result.method,
          error: result.error,
          instructions: result.instructions,
        };

        logger.info('Setting Copilot status:', status);
        setCopilotStatus(status);
      } else {
        logger.error('Status check failed:', result);
        // Still set a status even if not successful
        setCopilotStatus({
          installed: false,
          authenticated: false,
          hasApiKey: false,
          method: 'none',
          error: 'Failed to check status',
        });
      }
    } catch (error) {
      logger.error('Failed to check Copilot status:', error);
      toast.error('Failed to check GitHub Copilot status');
      // Set error status
      setCopilotStatus({
        installed: false,
        authenticated: false,
        hasApiKey: false,
        method: 'none',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsChecking(false);
    }
  }, [setCopilotStatus]);

  // Copy code to clipboard
  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  }, []);

  // Open browser to verification URL
  const openBrowser = useCallback(async (url: string) => {
    try {
      const api = getElectronAPI();
      if (api?.openExternalLink) {
        await api.openExternalLink(url);
      } else {
        // Fallback for web mode
        window.open(url, '_blank');
      }
    } catch (error) {
      logger.error('Failed to open browser:', error);
      toast.error('Failed to open browser. Please visit the URL manually.');
    }
  }, []);

  // Poll for authentication completion
  const startPolling = useCallback(
    (deviceCodeId: string, intervalSeconds: number) => {
      // Use the interval provided by GitHub (usually 5 seconds)
      currentIntervalRef.current = intervalSeconds * 1000;

      logger.info(`Starting polling with interval: ${intervalSeconds} seconds`);

      const doPoll = async () => {
        try {
          logger.debug('Polling for Copilot authentication...');
          const result = await getHttpApiClient().setup.pollCopilotAuth(deviceCodeId);

          if (result.slowDown) {
            // GitHub asked us to slow down - use exponential backoff
            slowDownCountRef.current += 1;
            const backoffMultiplier = Math.pow(2, Math.min(slowDownCountRef.current, 4)); // Cap at 2^4 = 16x
            const newInterval = Math.min(intervalSeconds * 1000 * backoffMultiplier, 30000); // Cap at 30 seconds

            logger.warn(
              `Slow down requested (${slowDownCountRef.current} times), ` +
                `backing off to ${newInterval / 1000}s (${backoffMultiplier}x multiplier)`
            );

            // Clear current interval and restart with new timing
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            currentIntervalRef.current = newInterval;
            pollIntervalRef.current = setInterval(doPoll, newInterval);
            return; // Skip this poll, wait for next interval
          } else {
            // Reset slow down counter on successful poll
            if (slowDownCountRef.current > 0) {
              logger.info('Poll successful, resetting backoff');
              slowDownCountRef.current = 0;
            }
          }

          if (result.status === 'completed' && result.authenticated) {
            // Authentication complete!
            logger.info('Authentication completed successfully!');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            slowDownCountRef.current = 0;

            // Show success toast
            toast.success('Successfully authenticated with GitHub Copilot!');

            // Refresh status to get updated info from server
            logger.info('Refreshing Copilot status after authentication...');
            try {
              await checkStatus();
              logger.info('Status refresh completed');
            } catch (error) {
              logger.error('Failed to refresh status after auth:', error);
            }

            // Close modal and reset state after status is updated
            setShowAuthModal(false);
            setIsAuthenticating(false);
          } else if (result.status === 'expired') {
            // Expired - stop polling
            logger.error('Device code expired');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            slowDownCountRef.current = 0;
            setShowAuthModal(false);
            setIsAuthenticating(false);
            toast.error('Authentication expired. Please try again.');
          } else if (result.status === 'pending') {
            // Still waiting - continue polling
            logger.debug('Still waiting for authorization...');
          }
          // If pending, the interval will continue
        } catch (error) {
          logger.error('Error polling status:', error);
          // Don't stop polling on network errors - keep trying
        }
      };

      // Do initial poll
      doPoll();

      // Set up interval
      pollIntervalRef.current = setInterval(doPoll, currentIntervalRef.current);
    },
    [checkStatus]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Authenticate with GitHub Copilot
  const handleAuthenticate = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const api = getHttpApiClient();

      // Start authentication - get device code
      const result = await api.setup.startCopilotAuth();

      if (result.success && result.deviceCode) {
        // Show modal with device code
        setDeviceCode(result.deviceCode);
        setShowAuthModal(true);

        // Auto-open browser
        const url = result.deviceCode.verificationUri;
        await openBrowser(url);

        // Start polling for completion (use GitHub's recommended interval)
        const pollInterval = result.deviceCode.interval || 5;
        logger.info(`Starting auth flow with ${pollInterval}s polling interval`);
        startPolling(result.deviceCode.deviceCodeId, pollInterval);

        toast.info('Authorization page opened in browser');
      } else {
        throw new Error(result.error || 'Failed to start authentication');
      }
    } catch (error) {
      logger.error('Copilot authentication failed:', error);
      toast.error(error instanceof Error ? error.message : 'Authentication failed');
      setIsAuthenticating(false);
      setShowAuthModal(false);
    }
  }, [openBrowser, startPolling]);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const isReady = copilotStatus?.authenticated;

  const getStatusContent = () => {
    if (!copilotStatus && isChecking) {
      return (
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          <span>Checking status...</span>
        </div>
      );
    }

    if (!copilotStatus) {
      return (
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <span>Unable to check status</span>
        </div>
      );
    }

    if (copilotStatus.authenticated) {
      return (
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="bg-green-500/10 border-2 border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-500 rounded-full p-1.5 flex-shrink-0">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-green-700 dark:text-green-400">
                  GitHub Copilot is ready!
                </div>
                <p className="text-sm text-green-600 dark:text-green-500 mt-0.5">
                  You can use Copilot models for AI tasks
                </p>
              </div>
            </div>
          </div>

          {/* Available Models */}
          <div className="text-sm text-muted-foreground">
            <div className="font-medium mb-2">Available models:</div>
            <ul className="space-y-1 ml-4">
              <li>• GPT-4o - Most capable GPT-4 model</li>
              <li>• GPT-4o Mini - Fast and efficient</li>
              <li>• Claude 3.5 Sonnet - Via Copilot</li>
              <li>• o1-preview & o1-mini - Advanced reasoning</li>
            </ul>
          </div>
        </div>
      );
    }

    // Not authenticated - show auth options
    return null;
  };

  return (
    <>
      {/* Authentication Modal */}
      {showAuthModal && deviceCode && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
        >
          <div className="bg-background border-2 border-border rounded-xl shadow-2xl max-w-md w-full p-8 space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-3">Authorize GitHub Copilot</h3>
              <p className="text-sm text-muted-foreground">
                A browser window has been opened. Please enter this code on the GitHub authorization
                page:
              </p>
            </div>

            <div className="bg-primary/10 border-2 border-primary/20 p-6 rounded-xl text-center">
              <div className="text-sm text-muted-foreground mb-2 font-medium">
                Your Authorization Code:
              </div>
              <div className="text-4xl font-mono font-bold tracking-[0.3em] text-primary select-all">
                {deviceCode.userCode}
              </div>
            </div>

            <button
              onClick={() => copyCode(deviceCode.userCode)}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy Code to Clipboard
            </button>

            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="font-medium">Waiting for authorization...</span>
            </div>

            <button
              onClick={() => {
                setShowAuthModal(false);
                setIsAuthenticating(false);
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
              }}
              className="w-full px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors font-medium"
            >
              Cancel Authentication
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold">GitHub Copilot Status</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                Optional
              </span>
              {copilotStatus && (
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 ${
                    copilotStatus.authenticated
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      copilotStatus.authenticated ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                  />
                  {copilotStatus.authenticated ? 'Ready' : 'Not Configured'}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {copilotStatus?.authenticated
                ? `Authenticated via ${copilotStatus.method === 'sdk' ? 'GitHub Token' : copilotStatus.method}`
                : 'Connect your GitHub Copilot subscription to use GPT-4o, o1, and Claude models'}
            </p>
          </div>
          <button
            onClick={checkStatus}
            disabled={isChecking}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Refresh status"
          >
            <svg
              className={`w-5 h-5 ${isChecking ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Status Card */}
        <div className="space-y-4 p-6 border-2 rounded-xl bg-card">
          {getStatusContent()}

          {copilotStatus?.error && !copilotStatus.authenticated && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
              <div className="font-medium mb-1">Error</div>
              {copilotStatus.error}
            </div>
          )}

          {copilotStatus?.instructions && !copilotStatus.authenticated && (
            <div className="text-sm text-muted-foreground bg-muted/50 border p-3 rounded-lg">
              {copilotStatus.instructions}
            </div>
          )}

          {!isReady && !isAuthenticating && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">Option 1: Environment Variable (Recommended)</h4>
                <p className="text-sm text-muted-foreground">
                  Set <code className="bg-muted px-1 py-0.5 rounded">GITHUB_TOKEN</code> environment
                  variable:
                </p>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                  export GITHUB_TOKEN="ghp_your_token_here"
                </pre>
                <p className="text-xs text-muted-foreground">
                  Get a token at:{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    github.com/settings/tokens
                  </a>
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Option 2: Interactive Login</h4>
                <p className="text-sm text-muted-foreground">
                  Use GitHub device flow to authenticate.
                </p>
                <button
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating || isChecking}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAuthenticating ? 'Authenticating...' : 'Start Interactive Login'}
                </button>
              </div>
            </div>
          )}

          {isAuthenticating && !showAuthModal && (
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground bg-muted/50 border p-4 rounded-lg">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="font-medium">Completing authentication...</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            ← Back
          </button>
          {!isReady && (
            <button
              onClick={onSkip}
              className="px-6 py-2 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
            >
              Skip for Now
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!isReady}
            className={`flex-1 px-6 py-3 rounded font-semibold transition-all ${
              isReady
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl scale-100 hover:scale-[1.02]'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            {isReady ? '✓ Continue →' : 'Continue →'}
          </button>
        </div>
      </div>
    </>
  );
}
