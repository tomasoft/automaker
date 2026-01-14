/**
 * Branch Analysis Section
 *
 * Analyze the current branch codebase for structure and dependencies
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { GitBranch, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AnalysisProgressModal } from './components/analysis-progress-modal';
import { ServiceBoundaryExplorer } from './components/service-boundary-explorer';
import type { RepositoryConfiguration, ServiceBoundary, RepositoryGraph } from '@automaker/types';
import { getHttpApiClient, getServerUrlSync, getSessionToken } from '@/lib/http-api-client';

export function BranchAnalysisSection() {
  const { currentProject } = useAppStore();

  const [analysisConfig, setAnalysisConfig] = useState<RepositoryConfiguration | null>(null);
  const [services, setServices] = useState<ServiceBoundary[]>([]);
  const [graph, setGraph] = useState<RepositoryGraph | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAnalyzed = analysisConfig?.analyzed || false;

  // Load existing analysis results on mount
  useEffect(() => {
    if (!currentProject?.path) return;

    const loadAnalysis = async () => {
      try {
        const httpClient = getHttpApiClient();
        const result = await httpClient.settings.getProject(currentProject.path);

        if (result.success && result.settings?.targetRepository) {
          const config = result.settings.targetRepository;
          console.log('[Branch Analysis] Loaded config:', {
            hasServices: !!config.services,
            servicesCount: config.services?.length,
            hasGraph: !!result.settings.repositoryGraph,
            graphNodesCount: result.settings.repositoryGraph?.nodes?.length,
          });

          setAnalysisConfig(config);

          if (result.settings.repositoryGraph) {
            setGraph(result.settings.repositoryGraph);
          }

          if (config.services) {
            setServices(config.services);
          }
        }
      } catch (err) {
        console.error('Failed to load branch analysis:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalysis();
  }, [currentProject?.path]);

  const handleAnalyze = async () => {
    if (!currentProject) {
      toast.error('No project selected');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setCurrentStep('Initializing analysis...');
    setError(null);

    try {
      console.log('[Branch Analysis] Starting analysis for project:', currentProject.path);

      setCurrentStep('Scanning local file tree...');
      setAnalysisProgress(20);

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
          projectPath: currentProject.path,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      setCurrentStep('Building component graph...');
      setAnalysisProgress(60);

      const result = await response.json();

      setCurrentStep('Detecting service boundaries...');
      setAnalysisProgress(80);

      if (!result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      console.log('[Branch Analysis] Analysis result:', {
        servicesCount: result.data.services?.length,
        graphNodesCount: result.data.graph?.nodes?.length,
        fileTreeLength: result.data.fileTree?.length,
      });

      // Update project settings with analysis results
      const updatedConfig: RepositoryConfiguration = {
        type: 'local',
        organization: '',
        project: '',
        repository: currentProject.name || 'current-branch',
        defaultBranch: result.data.currentBranch || 'main',
        analyzed: true,
        analyzedAt: new Date().toISOString(),
        architecture: result.data.graph.stats.architecture || undefined,
        services: result.data.services,
        sourceBranchSHA: result.data.commitSHA,
        lastIndexed: new Date().toISOString(),
      };

      const httpClient = getHttpApiClient();
      await httpClient.settings.updateProject(currentProject.path, {
        targetRepository: updatedConfig,
        repositoryFileTree: result.data.fileTree,
        repositoryGraph: result.data.graph,
      });

      // Update local state
      setAnalysisConfig(updatedConfig);
      setServices(result.data.services);
      setGraph(result.data.graph);

      setCurrentStep('Analysis complete!');
      setAnalysisProgress(100);

      toast.success('Branch Analysis Complete', {
        description: `Detected ${result.data.services.length} services and ${result.data.graph.nodes.length} components`,
      });

      // Close modal after short delay
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMessage);
      setIsAnalyzing(false);
      toast.error('Analysis failed', {
        description: errorMessage,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Branch Analysis
          </CardTitle>
          <CardDescription>
            Analyze your current branch to understand codebase structure, detect service boundaries,
            and build a dependency graph for impact analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Analysis Status and Action */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              {isAnalyzed && analysisConfig ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    Last analyzed: {new Date(analysisConfig.analyzedAt!).toLocaleString()} •{' '}
                    {(analysisConfig.services || []).length} services detected
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>No analysis performed yet</span>
                </div>
              )}
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={!currentProject || isAnalyzing}
              className="gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <GitBranch className="h-4 w-4" />
                  Analyze Branch
                </>
              )}
            </Button>
          </div>

          {/* Error Display */}
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
