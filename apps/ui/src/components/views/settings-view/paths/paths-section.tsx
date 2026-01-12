/**
 * Paths Settings Section
 *
 * Displays the current base directory for projects and global skills.
 * The directory is configured via the ALLOWED_ROOT_DIRECTORY environment variable.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FolderOpen, ExternalLink, AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { getElectronAPI } from '@/lib/electron';
import { getDefaultWorkspaceDirectory } from '@/lib/workspace-config';

export function PathsSection() {
  const [baseDirectory, setBaseDirectory] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load current configuration
  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setIsLoading(true);
    try {
      const httpClient = getHttpApiClient();
      const result = await httpClient.workspace.getConfig();

      if (result.success) {
        setIsConfigured(result.configured ?? false);
      }

      // Use the same logic as new project modal
      const directory = await getDefaultWorkspaceDirectory();
      setBaseDirectory(directory);
    } catch (error) {
      toast.error('Failed to load configuration', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInExplorer = async () => {
    if (!baseDirectory) return;

    try {
      const api = getElectronAPI();
      if (api?.worktree?.openInExplorer) {
        await api.worktree.openInExplorer(baseDirectory);
      } else {
        toast.error('Open in Explorer not available');
      }
    } catch (error) {
      toast.error('Failed to open directory', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleCopyPath = () => {
    if (!baseDirectory) return;

    navigator.clipboard.writeText(baseDirectory);
    toast.success('Path copied to clipboard');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Paths</h2>
          <p className="text-muted-foreground mt-2">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Paths</h2>
        <p className="text-muted-foreground mt-2">
          Configure where projects and global resources are stored
        </p>
      </div>

      {/* Base Directory Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Base Directory</CardTitle>
          <CardDescription>
            The root directory where all projects and global skills are stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Path Display */}
          <div className="space-y-3">
            <Label>Current Base Directory</Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={baseDirectory || 'Not configured'}
                  readOnly
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {isConfigured ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {isConfigured ? (
                        <p>Configured via ALLOWED_ROOT_DIRECTORY</p>
                      ) : (
                        <p>Using default or last used directory</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            {!isConfigured && (
              <p className="text-xs text-muted-foreground">
                No base directory configured. Using default location.
              </p>
            )}
          </div>

          {/* Directory Structure Info */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium">Directory Structure</p>
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <div>{baseDirectory || '{base-directory}'}/</div>
              <div className="ml-4">├── skills/ ← Global skills (shared)</div>
              <div className="ml-4">├── project-1/</div>
              <div className="ml-4">├── project-2/</div>
              <div className="ml-4">└── project-3/</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleOpenInExplorer}
              disabled={!baseDirectory}
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Open in Explorer
            </Button>
            <Button
              onClick={handleCopyPath}
              disabled={!baseDirectory}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy Path
            </Button>
          </div>

          {/* Info Note */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              How to change the base directory:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 ml-4 list-decimal">
              <li>
                Set the <code className="bg-muted px-1 py-0.5 rounded">ALLOWED_ROOT_DIRECTORY</code>{' '}
                environment variable to your desired path
              </li>
              <li>Restart AutoMaker for the changes to take effect</li>
              <li>All new projects and global skills will use the new location</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
