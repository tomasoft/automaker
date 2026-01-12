/**
 * DevOps Resources Settings Section
 *
 * Allows users to:
 * - Authenticate with Azure DevOps
 * - Browse and index wiki pages
 * - Configure webhook integration
 * - Manage cache settings
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BookOpen,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { WikiBrowser } from './components/wiki-browser';

export function WikiSourcesSection() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const pollingActive = useRef(false);

  // Wiki configuration
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [wikiId, setWikiId] = useState('');
  const [showWikiBrowser, setShowWikiBrowser] = useState(false);

  const lastIndexed = null; // TODO: Get from global settings

  useEffect(() => {
    // Check current auth status on mount
    checkAuthStatus();

    // Cleanup on unmount - stop polling and reset auth state
    return () => {
      pollingActive.current = false;
      setIsAuthenticating(false);
      setDeviceCode(null);
      setUserCode(null);
      setExpiresAt(null);
      setTimeRemaining(null);
    };
  }, []);

  // Countdown timer for authentication
  useEffect(() => {
    if (!expiresAt || !isAuthenticating) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeRemaining(remaining);

      if (remaining === 0) {
        setIsAuthenticating(false);
        setDeviceCode(null);
        setUserCode(null);
        setExpiresAt(null);
        toast.error('Authentication timeout', {
          description: 'The device code has expired. Please try again.',
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isAuthenticating]);

  const checkAuthStatus = async () => {
    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/azure-auth/status`);

      if (!response.ok) {
        // Server might not be running or endpoint not available
        console.warn('Auth status check failed with status:', response.status);
        setIsAuthenticated(false);
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Server returned HTML instead of JSON - likely route not registered
        console.warn('Azure auth endpoint not available - server may need restart');
        setIsAuthenticated(false);
        return;
      }

      const result = await response.json();

      if (result.authenticated) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      // Silently handle errors - auth status is optional
      console.debug('Failed to check auth status:', error);
      setIsAuthenticated(false);
    }
  };

  const startAuthentication = async () => {
    setIsAuthenticating(true);

    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/azure-auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        setUserCode(result.deviceCode.userCode);
        setDeviceCode(result.deviceCode.deviceCodeId);
        setVerificationUri(result.deviceCode.verificationUri);
        setAuthMessage(result.deviceCode.message);

        // Set expiry time (expiresIn is in seconds)
        const expiryTime = Date.now() + result.deviceCode.expiresIn * 1000;
        setExpiresAt(expiryTime);

        // Automatically open the verification URL in the default browser
        window.open(result.deviceCode.verificationUri, '_blank');

        // Start polling for completion with the interval from server
        pollForCompletion(
          result.deviceCode.deviceCodeId,
          result.deviceCode.interval || 5,
          expiryTime
        );
      } else {
        toast.error('Failed to start authentication', {
          description: result.error || 'Unknown error',
        });
        setIsAuthenticating(false);
      }
    } catch (error) {
      toast.error('Failed to start authentication', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setIsAuthenticating(false);
    }
  };

  const pollForCompletion = async (
    deviceCodeValue: string,
    intervalSeconds: number,
    expiryTime: number
  ) => {
    // Set polling active flag
    pollingActive.current = true;

    // Get server URL once at the start
    const serverUrl = (window.electronAPI as any)?.getServerUrl
      ? await (window.electronAPI as any).getServerUrl()
      : 'http://localhost:3008';

    const poll = async () => {
      // Stop if polling was cancelled
      if (!pollingActive.current) {
        return;
      }

      // Check if expired
      if (Date.now() >= expiryTime) {
        // Timer effect will handle cleanup
        return;
      }

      try {
        const response = await fetch(`${serverUrl}/api/azure-auth/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCodeId: deviceCodeValue }),
        });

        const result = await response.json();

        if (result.authenticated) {
          pollingActive.current = false;
          toast.success('Successfully authenticated with Azure DevOps');
          setIsAuthenticated(true);
          setIsAuthenticating(false);
          setDeviceCode(null);
          setUserCode(null);
          setExpiresAt(null);
        } else if (result.status === 'pending') {
          // Continue polling - user hasn't completed auth yet
          if (pollingActive.current) {
            setTimeout(poll, intervalSeconds * 1000);
          }
        } else if (result.status === 'expired') {
          // Device code expired
          pollingActive.current = false;
          toast.error('Authentication expired', {
            description: 'The device code has expired. Please try again.',
          });
          setIsAuthenticating(false);
          setDeviceCode(null);
          setUserCode(null);
          setExpiresAt(null);
        } else {
          // Other errors - continue polling unless it's a fatal error
          if (pollingActive.current) {
            setTimeout(poll, intervalSeconds * 1000);
          }
        }
      } catch (error) {
        // Network errors - continue polling
        if (pollingActive.current) {
          setTimeout(poll, intervalSeconds * 1000);
        }
      }
    };

    // Start polling after server-provided interval
    setTimeout(poll, intervalSeconds * 1000);
  };

  const handleSignOut = async () => {
    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/azure-auth/logout`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setIsAuthenticated(false);
        toast.success('Signed out successfully');
      } else {
        toast.error('Failed to sign out', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      toast.error('Failed to sign out', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const copyUserCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode);
      toast.success('Code copied to clipboard');
    }
  };

  const openVerificationUrl = () => {
    if (verificationUri) {
      window.open(verificationUri, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">DevOps Resources</h2>
        <p className="text-muted-foreground mt-2">
          Connect to Azure DevOps wikis to provide agents with access to your technical
          documentation, best practices, and coding standards.
        </p>
      </div>

      {/* Azure DevOps Authentication Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Azure DevOps Connection
          </CardTitle>
          <CardDescription>
            Authenticate with Microsoft Entra ID to access your Azure DevOps wikis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAuthenticated && !isAuthenticating ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in with your Microsoft account to enable wiki access for agents. You'll be
                redirected to your organization's SSO login page.
              </p>
              <Button onClick={startAuthentication}>Sign in with Microsoft</Button>
            </div>
          ) : isAuthenticating && userCode ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <p className="font-medium text-blue-700 dark:text-blue-400">
                      Waiting for authentication...
                    </p>
                  </div>
                  {timeRemaining !== null && (
                    <div className="text-sm font-mono text-blue-600 dark:text-blue-400">
                      {Math.floor(timeRemaining / 60000)}:
                      {String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
                    </div>
                  )}
                </div>
                {timeRemaining !== null && expiresAt !== null && (
                  <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.max(0, Math.min(100, (timeRemaining / (expiresAt - (expiresAt - timeRemaining))) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Click the button below, enter the code, then sign in with your organization's SSO
                  credentials.
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Enter this code:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-4 py-2 rounded font-mono text-2xl tracking-widest text-center">
                      {userCode}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyUserCode}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : isAuthenticating ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Starting authentication...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Connected as: user@example.com</span>
              </div>

              <div className="grid gap-2 text-sm">
                <div>
                  <strong>Organization:</strong> ThomasStefanou
                </div>
                <div>
                  <strong>Project:</strong> DevOps
                </div>
                <div>
                  <strong>Wiki:</strong> DevOps.wiki
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // TODO: Trigger wiki re-indexing
                    console.log('TODO: Re-index wiki');
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Index
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  Sign Out
                </Button>
              </div>

              {lastIndexed && (
                <p className="text-xs text-muted-foreground">
                  Last indexed: {new Date(lastIndexed).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wiki Browser - shown when authenticated */}
      {isAuthenticated && !showWikiBrowser && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Configuration</CardTitle>
            <CardDescription>
              Configure your Azure DevOps organization and wiki details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="your-organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Input
                id="project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="your-project"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wikiId">Wiki ID</Label>
              <Input
                id="wikiId"
                value={wikiId}
                onChange={(e) => setWikiId(e.target.value)}
                placeholder="your-wiki-id"
              />
            </div>
            <Button
              onClick={() => setShowWikiBrowser(true)}
              disabled={!organization || !project || !wikiId}
              className="w-full"
            >
              Browse Wiki Pages
            </Button>
          </CardContent>
        </Card>
      )}

      {isAuthenticated && showWikiBrowser && organization && project && wikiId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Wiki Resources</CardTitle>
                <CardDescription>
                  {organization} / {project} / {wikiId}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowWikiBrowser(false)}>
                Back to Configuration
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <WikiBrowser organization={organization} project={project} wikiId={wikiId} />
          </CardContent>
        </Card>
      )}

      {isAuthenticated && !showWikiBrowser && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Resources</CardTitle>
            <CardDescription>
              Browse and access wiki pages from your Azure DevOps organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Configure your wiki details above to browse pages</p>
              <p className="text-xs mt-2">You can attach wiki pages to features once configured</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wiki Status Card */}
      {isAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Status</CardTitle>
            <CardDescription>Real-time synchronization and cache status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Webhook Status</span>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">Active</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Cache Entries</span>
              <span className="text-sm text-muted-foreground">42 pages cached</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Cache Hit Rate</span>
              <span className="text-sm text-muted-foreground">87%</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
