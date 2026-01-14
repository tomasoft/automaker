/**
 * Impact Analysis Panel
 *
 * Displays comprehensive impact analysis results for a feature
 */

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  Server,
  Download,
  Loader2,
  AlertCircle,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import type { Feature, ImpactAnalysisResult } from '@automaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { FilesTab } from './tabs/files-tab';
import { DependenciesTab } from './tabs/dependencies-tab';
import { ServicesTab } from './tabs/services-tab';

interface ImpactAnalysisPanelProps {
  feature: Feature;
  projectPath: string;
  onAnalysisComplete?: (analysis: ImpactAnalysisResult) => void;
}

export function ImpactAnalysisPanel({
  feature,
  projectPath,
  onAnalysisComplete,
}: ImpactAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ImpactAnalysisResult | null>(
    feature.impactAnalysis || null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      console.log('[ImpactAnalysis] Starting analysis', {
        featureId: feature.id,
        hasSpec: !!feature.spec,
        projectPath,
      });

      const httpClient = getHttpApiClient();
      const result = await httpClient.features.analyzeImpact(feature, projectPath);

      console.log('[ImpactAnalysis] Result:', result);

      if (result.success && result.data) {
        setAnalysis(result.data);
        // Notify parent to save the analysis to the feature
        if (onAnalysisComplete) {
          onAnalysisComplete(result.data);
        }
      } else {
        setError(result.message || result.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('[ImpactAnalysis] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze impact');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Extract service names from affected files for count
  const extractServiceName = (filePath: string): string | null => {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Try to match common service patterns:
    // 1. Backend/AzureFaultExplorer.* or Frontend/AzureFaultExplorer.* (from Service-Boundaries wiki)
    const backendFrontendMatch = normalizedPath.match(
      /(?:Backend|Frontend)\/AzureFaultExplorer\.([A-Z][a-z]+)\//i
    );
    if (backendFrontendMatch) {
      return `AzureFaultExplorer.${backendFrontendMatch[1]}`;
    }

    // 2. Microservices/Service[A-Z] (from Service-Boundaries wiki)
    const microserviceMatch = normalizedPath.match(/Microservices\/(Service[A-Z])\//i);
    if (microserviceMatch) {
      return microserviceMatch[1];
    }

    // 3. AzureFaultExplorer.* pattern without prefix (e.g., Core/... or Blazor/...)
    const azureMatch = normalizedPath.match(/^(?:.*\/)?(?:AzureFaultExplorer\.)?([A-Z][a-z]+)\//);
    if (azureMatch && ['Core', 'Api', 'Blazor'].includes(azureMatch[1])) {
      return `AzureFaultExplorer.${azureMatch[1]}`;
    }

    // 4. *Service pattern (e.g., OrderingService/, PaymentService/)
    const serviceMatch = normalizedPath.match(/([A-Z][a-z]+Service)\//);
    if (serviceMatch) {
      return serviceMatch[1];
    }

    // 5. Service[A-Z] pattern (e.g., ServiceA/, ServiceB/)
    const serviceLetterMatch = normalizedPath.match(/(?:^|\/)(Service[A-Z])\//);
    if (serviceLetterMatch) {
      return serviceLetterMatch[1];
    }

    // 6. Infrastructure folder
    if (normalizedPath.match(/(?:^|\/)Infrastructure\//i)) {
      return 'Infrastructure';
    }

    // 7. Tests folder
    if (normalizedPath.match(/(?:^|\/)(?:tests?|e2e|E2ETests)\//i)) {
      return 'E2ETests';
    }

    // 8. src/Services pattern - likely a shared services folder
    if (normalizedPath.match(/^src\/Services\//)) {
      return 'Shared Services';
    }

    return null;
  };

  const affectedServicesCount = React.useMemo(() => {
    if (!analysis) return 0;
    const serviceNames = new Set(
      analysis.affectedFiles
        .map((f) => extractServiceName(f.path))
        .filter((name): name is string => name !== null)
    );
    return serviceNames.size;
  }, [analysis]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'high':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  const getRiskRecommendation = (level: string) => {
    switch (level) {
      case 'low':
        return 'Safe to proceed. Minimal cross-service impact detected.';
      case 'medium':
        return 'Review carefully. Some cross-boundary risks detected.';
      case 'high':
        return 'High risk. Requires careful review and testing. Consider getting approval.';
      default:
        return 'Impact analysis not available.';
    }
  };

  const exportReport = () => {
    if (!analysis) return;

    const markdown = `# Impact Analysis Report: ${feature.title}

**Feature ID:** ${feature.id}
**Analyzed:** ${analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : 'N/A'}
**Risk Score:** ${analysis.riskScore}/100 (${analysis.riskLevel})

## Summary

${getRiskRecommendation(analysis.riskLevel)}

## Affected Files (${analysis.affectedFiles.length})

${analysis.affectedFiles
  .map(
    (f) =>
      `- ${f.path} ${f.exists ? '✓' : '(new)'} - Confidence: ${f.confidence} - Pattern: ${f.matchedPattern}`
  )
  .join('\n')}

## Direct Impacts (${analysis.directImpacts.length})

${analysis.directImpacts
  .map((i) => `- ${i.file} (${i.relationship}, ${i.hops} hop${i.hops !== 1 ? 's' : ''})`)
  .join('\n')}

## Cross-Boundary Risks (${analysis.crossBoundaryRisks.length})

${analysis.crossBoundaryRisks
  .map((r) => `- **${r.risk.toUpperCase()}**: ${r.fromService} → ${r.toService} (${r.dependency})`)
  .join('\n')}

${
  analysis.wikiReferences && analysis.wikiReferences.length > 0
    ? `## Wiki References (${analysis.wikiReferences.length})

Documentation pages that contributed to this impact analysis:

${analysis.wikiReferences
  .map(
    (ref) => `### ${ref.name}

**URL:** ${ref.url}

**Impact:** ${ref.impact}

**Contributed Files:**
${ref.contributedFiles.map((f) => `- \`${f}\``).join('\n')}
`
  )
  .join('\n')}
`
    : ''
}

## Analysis Timing

- Total: ${analysis.analysisTiming?.total || 0}ms
- Files: ${analysis.analysisTiming?.files || 0}ms
- Graph: ${analysis.analysisTiming?.graph || 0}ms
- Rules: ${analysis.analysisTiming?.rules || 0}ms
- Wiki: ${analysis.analysisTiming?.wiki || 0}ms
`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impact-analysis-${feature.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!feature.spec) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Generate a spec first to enable impact analysis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !analysis) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={runAnalysis} disabled={isAnalyzing}>
              Retry Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center">
            <Server className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              Run impact analysis to understand how this feature will affect your codebase
            </p>
            <Button onClick={runAnalysis} disabled={isAnalyzing} className="gap-2">
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Run Impact Analysis'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk Score Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Impact Analysis
                {analysis.riskLevel === 'low' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {analysis.riskLevel === 'medium' && (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                {analysis.riskLevel === 'high' && <AlertCircle className="h-5 w-5 text-red-600" />}
              </CardTitle>
              <CardDescription>
                Analyzed{' '}
                {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : 'N/A'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={getRiskColor(analysis.riskLevel)} variant="secondary">
                Risk Score: {analysis.riskScore}/100
              </Badge>
              <Button variant="outline" size="sm" onClick={exportReport} className="gap-2">
                <Download className="h-4 w-4" />
                Export Report
              </Button>
              <Button variant="outline" size="sm" onClick={runAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GitBranch className="h-4 w-4" />
                )}
                Re-analyze
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {getRiskRecommendation(analysis.riskLevel)}
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="files" className="w-full">
        <TabsList
          className={`grid w-full ${analysis.wikiReferences && analysis.wikiReferences.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}
        >
          <TabsTrigger value="files" className="gap-2">
            <FileText className="h-4 w-4" />
            Files ({analysis.affectedFiles.length})
          </TabsTrigger>
          <TabsTrigger value="dependencies" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Dependencies ({analysis.directImpacts.length + analysis.indirectImpacts.length})
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-2">
            <Server className="h-4 w-4" />
            Services ({affectedServicesCount})
          </TabsTrigger>
          {analysis.wikiReferences && analysis.wikiReferences.length > 0 && (
            <TabsTrigger value="wiki" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Wiki Refs ({analysis.wikiReferences.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="files">
          <FilesTab affectedFiles={analysis.affectedFiles} />
        </TabsContent>

        <TabsContent value="dependencies">
          <DependenciesTab
            affectedFiles={analysis.affectedFiles}
            directImpacts={analysis.directImpacts}
            indirectImpacts={analysis.indirectImpacts}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesTab
            crossBoundaryRisks={analysis.crossBoundaryRisks}
            affectedFiles={analysis.affectedFiles}
          />
        </TabsContent>

        {analysis.wikiReferences && analysis.wikiReferences.length > 0 && (
          <TabsContent value="wiki">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Wiki References</CardTitle>
                <CardDescription>
                  Documentation that contributed to this impact analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.wikiReferences.map((ref, idx) => (
                    <div
                      key={idx}
                      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h4 className="font-medium text-sm truncate">{ref.name}</h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-2"
                          onClick={() => window.open(ref.url, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{ref.impact}</p>
                      {ref.contributedFiles.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Contributed Files:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ref.contributedFiles.map((file, fileIdx) => (
                              <Badge
                                key={fileIdx}
                                variant="secondary"
                                className="text-xs font-mono"
                              >
                                {file}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
