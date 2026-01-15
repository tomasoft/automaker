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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAppStore } from '@/store/app-store';

export function WikiSourcesSection() {
  const { defaultWikiPages, setDefaultWikiPages } = useAppStore();
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
  const [organization, setOrganization] = useState(() => {
    return localStorage.getItem('azure_devops_organization') || '';
  });
  const [project, setProject] = useState(() => {
    return localStorage.getItem('azure_devops_project') || '';
  });
  const [wikiId, setWikiId] = useState(() => {
    return localStorage.getItem('azure_devops_wikiId') || '';
  });

  // Available options from auto-discovery
  const [availableOrgs, setAvailableOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [availableProjects, setAvailableProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [availableWikis, setAvailableWikis] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);

  // Tenant ID for authentication (optional - for guest access)
  const [tenantId, setTenantId] = useState('91f5beba-e36c-4c8b-9c37-a2a1d1a82bef');
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false);

  // User info from auth
  const [userId, setUserId] = useState<string | null>(() => {
    // Restore from localStorage on mount
    return localStorage.getItem('azure_devops_userId') || null;
  });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    // Restore from localStorage on mount
    return localStorage.getItem('azure_devops_sessionId') || null;
  });
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(() => {
    const stored = localStorage.getItem('azure_devops_tokenExpiresAt');
    return stored ? parseInt(stored, 10) : null;
  });

  const lastIndexed = null; // TODO: Get from global settings

  // Persist wiki configuration to localStorage
  useEffect(() => {
    if (organization) {
      localStorage.setItem('azure_devops_organization', organization);
    } else {
      localStorage.removeItem('azure_devops_organization');
    }
  }, [organization]);

  useEffect(() => {
    if (project) {
      localStorage.setItem('azure_devops_project', project);
    } else {
      localStorage.removeItem('azure_devops_project');
    }
  }, [project]);

  useEffect(() => {
    if (wikiId) {
      localStorage.setItem('azure_devops_wikiId', wikiId);
    } else {
      localStorage.removeItem('azure_devops_wikiId');
    }
  }, [wikiId]);

  // Persist sessionId and userId to localStorage whenever they change
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('azure_devops_sessionId', sessionId);
    } else {
      localStorage.removeItem('azure_devops_sessionId');
    }
  }, [sessionId]);

  useEffect(() => {
    if (userId) {
      localStorage.setItem('azure_devops_userId', userId);
    } else {
      localStorage.removeItem('azure_devops_userId');
    }
  }, [userId]);

  useEffect(() => {
    if (tokenExpiresAt) {
      localStorage.setItem('azure_devops_tokenExpiresAt', tokenExpiresAt.toString());
    } else {
      localStorage.removeItem('azure_devops_tokenExpiresAt');
    }
  }, [tokenExpiresAt]);

  // Auto-discover projects when organization changes
  useEffect(() => {
    if (isAuthenticated && organization && organization.trim()) {
      discoverProjects(organization);
    }
  }, [organization, isAuthenticated]);

  // Auto-discover wikis when project changes
  useEffect(() => {
    if (isAuthenticated && organization && project && project.trim()) {
      discoverWikis(organization, project);
    }
  }, [project, organization, isAuthenticated]);

  const discoverProjects = async (org: string) => {
    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(
        `${serverUrl}/api/azure-devops-wiki/projects?organization=${encodeURIComponent(org)}`
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.projects) {
          setAvailableProjects(result.projects);
          // Auto-select first project if current selection is invalid
          if (!project && result.projects.length > 0) {
            setProject(result.projects[0].name);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to discover projects:', error);
    }
  };

  const discoverWikis = async (org: string, proj: string) => {
    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(
        `${serverUrl}/api/azure-devops-wiki/wikis?organization=${encodeURIComponent(org)}&project=${encodeURIComponent(proj)}`
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.wikis) {
          setAvailableWikis(result.wikis);
          // Auto-select first wiki if current selection is invalid
          if (!wikiId && result.wikis.length > 0) {
            setWikiId(result.wikis[0].id);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to discover wikis:', error);
    }
  };

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

      // Check if we have a persisted sessionId
      const storedSessionId = sessionId || localStorage.getItem('azure_devops_sessionId');
      if (!storedSessionId) {
        setIsAuthenticated(false);
        return;
      }

      const response = await fetch(
        `${serverUrl}/api/azure-auth/status?sessionId=${encodeURIComponent(storedSessionId)}`
      );

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
        setUserId(result.userId || null);
        setTokenExpiresAt(result.expiresAt || null);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
        setTokenExpiresAt(null);
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
        body: JSON.stringify({
          tenantId: tenantId || undefined, // Send tenant ID if provided
        }),
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
          body: JSON.stringify({
            deviceCodeId: deviceCodeValue,
          }),
        });

        const result = await response.json();

        if (result.authenticated || result.status === 'complete') {
          pollingActive.current = false;
          toast.success('Successfully authenticated with Azure DevOps');
          setIsAuthenticated(true);
          setUserId(result.userId || null);
          setSessionId(result.sessionId || null);
          setTokenExpiresAt(result.expiresAt || null);

          // Pre-populate wiki config if provided
          if (result.config) {
            if (result.config.organization) setOrganization(result.config.organization);
            if (result.config.project) setProject(result.config.project);
            if (result.config.wikiId) setWikiId(result.config.wikiId);

            // Store available options for dropdowns
            if (result.config.availableOrgs) setAvailableOrgs(result.config.availableOrgs);
            if (result.config.availableProjects)
              setAvailableProjects(result.config.availableProjects);
            if (result.config.availableWikis) setAvailableWikis(result.config.availableWikis);

            // Save config to server settings for other features to use
            if (result.config.organization && result.config.project && result.config.wikiId) {
              try {
                await fetch('http://localhost:3008/api/settings/global', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    azureDevOps: {
                      organization: result.config.organization,
                      project: result.config.project,
                      wikiId: result.config.wikiId,
                    },
                  }),
                });
              } catch (error) {
                console.error('Failed to save Azure DevOps config to settings:', error);
              }
            }
          }

          setIsAuthenticating(false);
          setDeviceCode(null);
          setUserCode(null);
          setExpiresAt(null);
        } else if (result.status === 'pending') {
          // Continue polling - user hasn't completed auth yet
          if (pollingActive.current) {
            setTimeout(poll, intervalSeconds * 1000);
          }
        } else if (result.status === 'expired' || result.error?.includes('expired')) {
          // Device code expired
          pollingActive.current = false;
          toast.error('Authentication expired', {
            description: 'The device code has expired. Please try again.',
          });
          setIsAuthenticating(false);
          setDeviceCode(null);
          setUserCode(null);
          setExpiresAt(null);
        } else if (result.error) {
          // Fatal error - stop polling
          pollingActive.current = false;
          toast.error('Authentication failed', {
            description: result.error,
          });
          setIsAuthenticating(false);
          setDeviceCode(null);
          setUserCode(null);
          setExpiresAt(null);
        } else {
          // Other responses - continue polling
          if (pollingActive.current) {
            setTimeout(poll, intervalSeconds * 1000);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Network errors - continue polling
        if (pollingActive.current) {
          setTimeout(poll, intervalSeconds * 1000);
        }
      }
    };

    // Start polling immediately (don't wait for first interval)
    poll();
  };

  const handleSignOut = async () => {
    try {
      const serverUrl = (window.electronAPI as any)?.getServerUrl
        ? await (window.electronAPI as any).getServerUrl()
        : 'http://localhost:3008';

      const response = await fetch(`${serverUrl}/api/azure-auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const result = await response.json();

      if (result.success) {
        setIsAuthenticated(false);
        setSessionId(null);
        setUserId(null);
        setTokenExpiresAt(null);
        setOrganization('');
        setProject('');
        setWikiId('');
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
                Sign in with your Microsoft account to enable wiki access for agents.
              </p>

              {/* Advanced auth options toggle */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedAuth(!showAdvancedAuth)}
                  className="text-xs"
                >
                  {showAdvancedAuth ? '▼' : '▶'} Advanced Options
                </Button>
              </div>

              {/* Tenant ID input for guest access */}
              {showAdvancedAuth && (
                <div className="space-y-2 pl-4 border-l-2 border-muted">
                  <Label htmlFor="tenantId" className="text-sm">
                    Tenant ID (Optional)
                  </Label>
                  <Input
                    id="tenantId"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="Leave empty for work account, or enter tenant GUID"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    For personal accounts with guest access, enter the organization's tenant ID.
                    <br />
                    Find it in Azure Portal → Entra ID → Overview → Tenant ID
                  </p>
                </div>
              )}

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
                <span>Connected{userId ? ` as: ${userId}` : ''}</span>
              </div>

              {tokenExpiresAt && (
                <div className="text-xs text-muted-foreground">
                  Token expires: {new Date(tokenExpiresAt).toLocaleString()}
                  {tokenExpiresAt < Date.now() && (
                    <span className="text-red-600 ml-2">
                      (Expired - will auto-refresh on next use)
                    </span>
                  )}
                </div>
              )}

              {organization && project && wikiId && (
                <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
                  <div>
                    <strong>Organization:</strong> {organization}
                  </div>
                  <div>
                    <strong>Project:</strong> {project}
                  </div>
                  <div>
                    <strong>Wiki:</strong> {wikiId}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // TODO: Trigger wiki re-indexing
                    console.log('TODO: Re-index wiki');
                  }}
                  disabled={!organization || !project || !wikiId}
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

      {/* Manual Wiki Configuration - shown when authenticated but no auto-config */}
      {isAuthenticated && (!organization || !project || !wikiId) && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Configuration</CardTitle>
            <CardDescription>
              Enter your Azure DevOps organization and wiki details manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              {availableOrgs.length > 0 ? (
                <Select value={organization} onValueChange={setOrganization}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.name}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="organization"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="your-organization"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              {availableProjects.length > 0 ? (
                <Select value={project} onValueChange={setProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((proj) => (
                      <SelectItem key={proj.id} value={proj.name}>
                        {proj.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="your-project"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wikiId">Wiki</Label>
              {availableWikis.length > 0 ? (
                <Select value={wikiId} onValueChange={setWikiId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a wiki" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWikis.map((wiki) => (
                      <SelectItem key={wiki.id} value={wiki.id}>
                        {wiki.name} ({wiki.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="wikiId"
                  value={wikiId}
                  onChange={(e) => setWikiId(e.target.value)}
                  placeholder="wiki-id (GUID)"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {availableOrgs.length > 0 || availableProjects.length > 0 || availableWikis.length > 0
                ? 'Select from auto-discovered options or enter manually'
                : "Auto-detection didn't find your wiki. Please enter the details manually."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Wiki Browser - shown when authenticated and configured */}
      {isAuthenticated && organization && project && wikiId && (
        <Card>
          <CardHeader>
            <CardTitle>Wiki Resources</CardTitle>
            <CardDescription>
              {organization} / {project} / {wikiId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WikiBrowser
              organization={organization}
              project={project}
              wikiId={wikiId}
              initialSelectedPages={defaultWikiPages}
              onSelectionChange={setDefaultWikiPages}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
