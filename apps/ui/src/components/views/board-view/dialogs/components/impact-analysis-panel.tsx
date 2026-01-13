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
} from 'lucide-react';
import type { Feature, ImpactAnalysisResult } from '@automaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { FilesTab } from './tabs/files-tab';
import { DependenciesTab } from './tabs/dependencies-tab';
import { ServicesTab } from './tabs/services-tab';
import { GotchasTab } from './tabs/gotchas-tab';

interface ImpactAnalysisPanelProps {
  feature: Feature;
  projectPath: string;
}

export function ImpactAnalysisPanel({ feature, projectPath }: ImpactAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ImpactAnalysisResult | null>(
    feature.impactAnalysis || null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const httpClient = getHttpApiClient();
      const response = await fetch('/api/features/analyze-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, projectPath }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setAnalysis(result.data);
      } else {
        setError(result.message || result.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze impact');
    } finally {
      setIsAnalyzing(false);
    }
  };

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

## Gotchas Detected (${analysis.gotchas.length})

${analysis.gotchas
  .map(
    (g) => `### ${g.severity.toUpperCase()}: ${g.rule}

${g.description}

**Suggested Action:** ${g.suggestedAction}

${g.wikiPages && g.wikiPages.length > 0 ? `**Related Documentation:**\n${g.wikiPages.map((w) => `- ${w}`).join('\n')}` : ''}
`
  )
  .join('\n')}

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
        <TabsList className="grid w-full grid-cols-4">
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
            Services ({analysis.crossBoundaryRisks.length})
          </TabsTrigger>
          <TabsTrigger value="gotchas" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Gotchas ({analysis.gotchas.length})
          </TabsTrigger>
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
          <ServicesTab crossBoundaryRisks={analysis.crossBoundaryRisks} />
        </TabsContent>

        <TabsContent value="gotchas">
          <GotchasTab gotchas={analysis.gotchas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
