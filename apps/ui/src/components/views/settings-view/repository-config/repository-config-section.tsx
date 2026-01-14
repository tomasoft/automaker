/**
 * Repository Configuration Section
 *
 * Configure target repository for impact analysis
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { GitBranch, Database, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AnalysisProgressModal } from './components/analysis-progress-modal';
import { ServiceBoundaryExplorer } from './components/service-boundary-explorer';
import type { RepositoryConfiguration, ServiceBoundary, RepositoryGraph } from '@automaker/types';
import { getHttpApiClient, getServerUrlSync, getSessionToken } from '@/lib/http-api-client';

export function RepositoryConfigSection() {
  const { currentProject } = useAppStore();

  const [repositoryConfig, setRepositoryConfig] = useState<RepositoryConfiguration | null>(null);
  const [services, setServices] = useState<ServiceBoundary[]>([]);
  const [graph, setGraph] = useState<RepositoryGraph | null>(null);

  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [repository, setRepository] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [pat, setPat] = useState('');
  const [usePAT, setUsePAT] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isConfigured = !!(organization && project && repository);
  const isAnalyzed = repositoryConfig?.analyzed || false;

  // Load existing configuration on mount
  useEffect(() => {
    if (!currentProject?.path) return;

    const loadConfig = async () => {
      try {
        const httpClient = getHttpApiClient();
        const result = await httpClient.settings.getProject(currentProject.path);

        if (result.success && result.settings?.targetRepository) {
          const config = result.settings.targetRepository;
          console.log('[Repository Config] Loaded config:', {
            hasServices: !!config.services,
            servicesCount: config.services?.length,
            services: config.services,
            hasGraph: !!result.settings.repositoryGraph,
            graphNodesCount: result.settings.repositoryGraph?.nodes?.length,
          });

          setRepositoryConfig(config);
          setOrganization(config.organization);
          setProject(config.project);
          setRepository(config.repository);
          setDefaultBranch(config.defaultBranch);

          if (result.settings.repositoryGraph) {
            setGraph(result.settings.repositoryGraph);
            console.log(
              '[Repository Config] Set graph with',
              result.settings.repositoryGraph.nodes.length,
              'nodes'
            );
          }

          if (config.services) {
            setServices(config.services);
            console.log('[Repository Config] Set services:', config.services.length);
          } else {
            console.log('[Repository Config] No services in config');
          }
        }

        // Check if PAT exists for this project
        const sessionId = currentProject.path;
        const serverUrl = getServerUrlSync();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionToken = getSessionToken();
        if (sessionToken) {
          headers['X-Session-Token'] = sessionToken;
        }

        const patCheckResponse = await fetch(`${serverUrl}/api/repository/pat/check`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ sessionId }),
        });

        if (patCheckResponse.ok) {
          const patCheckData = await patCheckResponse.json();
          if (patCheckData.success && patCheckData.hasPAT) {
            setUsePAT(true);
          }
        }
      } catch (err) {
        console.error('Failed to load repository config:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [currentProject?.path]);

  const handleSaveConfig = async () => {
    if (!currentProject) {
      toast.error('No project selected');
      return;
    }

    const config: RepositoryConfiguration = {
      type: 'azure-devops',
      organization,
      project,
      repository,
      defaultBranch,
      analyzed: false,
      analyzedAt: undefined,
      architecture: undefined,
      services: [],
      sourceBranchSHA: undefined,
      lastIndexed: undefined,
    };

    try {
      const httpClient = getHttpApiClient();

      // Save PAT if provided
      if (usePAT && pat) {
        const sessionId = currentProject.path; // Use project path as sessionId for consistency
        console.log('[Repository Config] Saving PAT for session:', sessionId);

        const serverUrl = getServerUrlSync();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionToken = getSessionToken();
        if (sessionToken) {
          headers['X-Session-Token'] = sessionToken;
        }

        const patResponse = await fetch(`${serverUrl}/api/repository/pat`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            sessionId,
            pat,
          }),
        });

        if (!patResponse.ok) {
          const errorText = await patResponse.text();
          throw new Error(errorText || 'Failed to store PAT');
        }

        const patData = await patResponse.json();

        if (!patData.success) {
          throw new Error(patData.error || 'Failed to store PAT');
        }
      }

      await httpClient.settings.updateProject(currentProject.path, {
        targetRepository: config,
      });

      setRepositoryConfig(config);
      setError(null);

      toast.success('Configuration saved', {
        description:
          usePAT && pat
            ? 'Repository configuration and PAT have been saved successfully.'
            : 'Repository configuration has been saved successfully.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save configuration';
      setError(errorMessage);
      toast.error('Save failed', {
        description: errorMessage,
      });
    }
  };

  const handleAnalyze = async () => {
    if (!currentProject || !isConfigured) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setCurrentStep('Initializing analysis...');
    setError(null);

    try {
      const sessionId = currentProject.path; // Use project path as sessionId for consistency
      console.log('[Repository Config] Starting analysis for session:', sessionId);

      // Get access token from stored PAT or OAuth
      const accessToken = ''; // Will use stored PAT from session or OAuth token

      setCurrentStep('Fetching repository file tree...');
      setAnalysisProgress(20);

      const config: RepositoryConfiguration = {
        type: 'azure-devops',
        organization,
        project,
        repository,
        defaultBranch,
        analyzed: false,
        analyzedAt: undefined,
        architecture: undefined,
        services: [],
        sourceBranchSHA: undefined,
        lastIndexed: undefined,
      };

      const serverUrl = getServerUrlSync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionToken = getSessionToken();
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const response = await fetch(`${serverUrl}/api/repository/analyze`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          repositoryConfig: config,
          accessToken,
          sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      setCurrentStep('Building component graph...');
      setAnalysisProgress(60);

      const result = await response.json();

      setCurrentStep('Linking documentation...');
      setAnalysisProgress(80);

      console.log('[Deep Analyze] Analysis result:', {
        servicesCount: result.data.services?.length,
        services: result.data.services,
        graphNodesCount: result.data.graph?.nodes?.length,
        fileTreeLength: result.data.fileTree?.length,
      });

      // Update project settings with analysis results
      const updatedConfig: RepositoryConfiguration = {
        ...config,
        analyzed: true,
        analyzedAt: new Date().toISOString(),
        architecture: result.data.graph.stats.architecture || undefined,
        services: result.data.services,
        sourceBranchSHA: result.data.commitSHA,
        lastIndexed: new Date().toISOString(),
      };

      console.log('[Deep Analyze] Updated config services:', updatedConfig.services);

      const httpClient = getHttpApiClient();
      await httpClient.settings.updateProject(currentProject.path, {
        targetRepository: updatedConfig,
        repositoryFileTree: result.data.fileTree,
        repositoryGraph: result.data.graph,
      });

      console.log('[Deep Analyze] Settings saved, now updating state');

      // Update local state
      setRepositoryConfig(updatedConfig);
      setServices(result.data.services);
      setGraph(result.data.graph);

      console.log(
        '[Deep Analyze] State updated - services:',
        result.data.services?.length,
        'graph nodes:',
        result.data.graph?.nodes?.length
      );

      setCurrentStep('Analysis complete!');
      setAnalysisProgress(100);

      // Close modal after short delay
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Target Repository Configuration
          </CardTitle>
          <CardDescription>
            Configure the repository for impact analysis and gotcha detection. This allows AutoMaker
            to understand your codebase structure and provide holistic insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Repository Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                placeholder="myorg"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Input
                id="project"
                placeholder="MyProject"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="repository">Repository</Label>
              <Input
                id="repository"
                placeholder="my-repo"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Default Branch
              </Label>
              <Input
                id="branch"
                placeholder="main"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
              />
            </div>
          </div>

          {/* Authentication */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={usePAT}
                onChange={(e) => setUsePAT(e.target.checked)}
                className="rounded"
              />
              Use Personal Access Token (for personal repos)
            </Label>
            {usePAT && (
              <Input
                type="password"
                placeholder="Enter PAT with Code (Read) permission"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSaveConfig} disabled={!isConfigured} variant="outline">
              Save Configuration
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={!isConfigured || isAnalyzing}
              className="gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Deep Analyze Codebase
                </>
              )}
            </Button>
          </div>

          {/* Status */}
          {isAnalyzed && repositoryConfig && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Last analyzed: {new Date(repositoryConfig.analyzedAt!).toLocaleString()} •{' '}
                {(repositoryConfig.services || []).length} services detected
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Service Boundary Explorer */}
      {isAnalyzed && graph && <ServiceBoundaryExplorer services={services} graph={graph} />}

      {/* Analysis Progress Modal */}
      <AnalysisProgressModal
        isOpen={isAnalyzing}
        progress={analysisProgress}
        currentStep={currentStep}
      />
    </>
  );
}
