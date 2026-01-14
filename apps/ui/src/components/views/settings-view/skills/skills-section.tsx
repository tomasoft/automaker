/**
 * Skills Settings Section
 *
 * Allows users to:
 * - View global and project skills
 * - Add/Edit/Delete skills
 * - Configure auto-selection parameters
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { FileCode, Globe, FolderOpen, Plus, FolderCog, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';

export function SkillsSection() {
  const {
    currentProject,
    maxAutoSelectedSkills,
    skillSimilarityThreshold,
    setMaxAutoSelectedSkills,
    setSkillSimilarityThreshold,
  } = useAppStore();
  const api = getElectronAPI();
  const httpApi = getHttpApiClient();
  const [globalSkillsPath, setGlobalSkillsPath] = useState<string | null>(null);
  const [projectSkillsPath, setProjectSkillsPath] = useState<string | null>(null);

  const [globalSkillsCount, setGlobalSkillsCount] = useState(0);
  const [projectSkillsCount, setProjectSkillsCount] = useState(0);

  useEffect(() => {
    // Load global skills path - use userData directory (app data), not workspace directory
    api.getPath('userData').then((dir) => {
      if (dir) {
        // Normalize path separators to match the OS
        const normalizedDir = dir.replace(/\//g, '\\');
        setGlobalSkillsPath(`${normalizedDir}\\skills`);
      }
    });

    // Set project skills path
    if (currentProject) {
      // Normalize path separators to match the OS
      const normalizedPath = currentProject.path.replace(/\//g, '\\');
      setProjectSkillsPath(`${normalizedPath}\\skills`);
    }

    // Fetch skills counts and settings
    const fetchSkills = async () => {
      try {
        const result = await httpApi.skills.list(currentProject?.path);
        if (result.success) {
          setGlobalSkillsCount(result.global?.length || 0);
          setProjectSkillsCount(result.project?.length || 0);
        }

        // Fetch global settings and sync with store
        const settingsResult = await httpApi.settings.getGlobal();
        if (settingsResult.success && settingsResult.settings) {
          if (settingsResult.settings.maxAutoSelectedSkills !== undefined) {
            setMaxAutoSelectedSkills(settingsResult.settings.maxAutoSelectedSkills);
          }
          if (settingsResult.settings.skillSimilarityThreshold !== undefined) {
            setSkillSimilarityThreshold(settingsResult.settings.skillSimilarityThreshold);
          }
        }
      } catch (error) {
        console.error('Failed to fetch skills:', error);
      }
    };
    fetchSkills();
  }, [currentProject, setMaxAutoSelectedSkills, setSkillSimilarityThreshold]);

  const handleOpenGlobalSkillsFolder = async () => {
    if (!globalSkillsPath) return;

    try {
      const api = getElectronAPI();

      // Check if folder exists, create if not
      const exists = await api.exists(globalSkillsPath);
      if (!exists) {
        const mkdirResult = await api.mkdir(globalSkillsPath);
        if (!mkdirResult.success) {
          toast.error('Failed to create skills folder', {
            description: mkdirResult.error || 'Unknown error',
          });
          return;
        }
        toast.success('Created skills folder');
      }

      // Open in explorer
      if (api?.worktree?.openInExplorer) {
        await api.worktree.openInExplorer(globalSkillsPath);
      }
    } catch (error) {
      toast.error('Failed to open folder', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleOpenProjectSkillsFolder = async () => {
    if (!projectSkillsPath) {
      toast.error('No project selected');
      return;
    }

    try {
      const api = getElectronAPI();

      // Check if folder exists, create if not
      const exists = await api.exists(projectSkillsPath);
      if (!exists) {
        const mkdirResult = await api.mkdir(projectSkillsPath);
        if (!mkdirResult.success) {
          toast.error('Failed to create skills folder', {
            description: mkdirResult.error || 'Unknown error',
          });
          return;
        }
        toast.success('Created skills folder');
      }

      // Open in explorer
      if (api?.worktree?.openInExplorer) {
        await api.worktree.openInExplorer(projectSkillsPath);
      }
    } catch (error) {
      toast.error('Failed to open folder', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleCopyGlobalPath = () => {
    if (!globalSkillsPath) return;
    navigator.clipboard.writeText(globalSkillsPath);
    toast.success('Path copied to clipboard');
  };

  const handleCopyProjectPath = () => {
    if (!projectSkillsPath) return;
    navigator.clipboard.writeText(projectSkillsPath);
    toast.success('Path copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Skills</h2>
        <p className="text-muted-foreground mt-2">
          Skills are SKILL.md files that provide agents with domain knowledge, best practices, and
          coding standards. They are automatically selected based on message similarity. Global
          skills location is configured in{' '}
          <a
            href="#"
            className="text-brand-500 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              // TODO: Navigate to paths section
            }}
          >
            Paths settings
          </a>
          .
        </p>
      </div>

      {/* Auto-Selection Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Selection Settings</CardTitle>
          <CardDescription>
            Configure how skills are automatically selected for agent conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Max Skills */}
          <div className="space-y-3">
            <Label htmlFor="max-skills" className="flex items-center justify-between">
              <span>Maximum Auto-Selected Skills</span>
              <span className="text-sm font-normal text-muted-foreground">
                {maxAutoSelectedSkills}
              </span>
            </Label>
            <Input
              id="max-skills"
              type="number"
              min={1}
              max={10}
              value={maxAutoSelectedSkills}
              onChange={(e) => {
                const newValue = parseInt(e.target.value, 10);
                if (isNaN(newValue) || newValue < 1 || newValue > 10) return;
                setMaxAutoSelectedSkills(newValue);
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Number of skills to automatically load (1-10)
            </p>
          </div>

          {/* Similarity Threshold */}
          <div className="space-y-3">
            <Label htmlFor="similarity-threshold" className="flex items-center justify-between">
              <span>Similarity Threshold</span>
              <span className="text-sm font-normal text-muted-foreground">
                {skillSimilarityThreshold.toFixed(2)}
              </span>
            </Label>
            <Slider
              id="similarity-threshold"
              min={0}
              max={1}
              step={0.05}
              value={[skillSimilarityThreshold]}
              onValueChange={(value) => {
                const newValue = value[0];
                setSkillSimilarityThreshold(newValue);
              }}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Minimum similarity score (0.0 - 1.0). Lower values include more skills.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Global Skills Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Global Skills
          </CardTitle>
          <CardDescription>Skills shared across all projects</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Path Display */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Skills Directory</Label>
            <div className="flex items-center gap-2">
              <Input
                value={globalSkillsPath || 'Loading...'}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyGlobalPath}
                disabled={!globalSkillsPath}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Skills List or Empty State */}
          {globalSkillsCount === 0 ? (
            <div className="text-center py-6 space-y-3 border rounded-lg bg-muted/30">
              <FileCode className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No global skills found</p>
              <p className="text-xs text-muted-foreground px-4">
                Create SKILL.md files in this folder to add global skills
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* TODO: List skills with Edit/Delete buttons */}
              <p className="text-sm text-muted-foreground">
                {globalSkillsCount} global skills available
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleOpenGlobalSkillsFolder}
              disabled={!globalSkillsPath}
              className="flex items-center gap-2"
            >
              <FolderCog className="h-4 w-4" />
              Open Skills Folder
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Project Skills Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Project Skills
          </CardTitle>
          <CardDescription>
            Skills specific to {currentProject?.name || 'the current project'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Path Display */}
          {currentProject ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Skills Directory</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={projectSkillsPath || 'Loading...'}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyProjectPath}
                    disabled={!projectSkillsPath}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Skills List or Empty State */}
              {projectSkillsCount === 0 ? (
                <div className="text-center py-6 space-y-3 border rounded-lg bg-muted/30">
                  <FileCode className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No project skills found</p>
                  <p className="text-xs text-muted-foreground px-4">
                    Create SKILL.md files to add project-specific skills
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* TODO: List skills with Edit/Delete buttons */}
                  <p className="text-sm text-muted-foreground">
                    {projectSkillsCount} project skills available
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleOpenProjectSkillsFolder}
                  disabled={!projectSkillsPath}
                  className="flex items-center gap-2"
                >
                  <FolderCog className="h-4 w-4" />
                  Open Skills Folder
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-6 space-y-3 border rounded-lg bg-muted/30">
              <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No project selected</p>
              <p className="text-xs text-muted-foreground">
                Open a project to manage project-specific skills
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
