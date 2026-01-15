/**
 * Usage Statistics Display Component
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Zap, TrendingUp, BarChart3, Cpu, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectUsageStats, UsageStats } from '@automaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

interface UsageStatsDisplayProps {
  projectPath?: string;
  featureId?: string;
  className?: string;
}

export function UsageStatsDisplay({ projectPath, featureId, className }: UsageStatsDisplayProps) {
  const [stats, setStats] = useState<UsageStats | ProjectUsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [projectPath, featureId]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      let response;

      if (featureId && projectPath) {
        // Get feature stats
        response = await api.usage.getStats({ featureId, projectPath });
      } else if (projectPath) {
        // Get project stats
        response = await api.usage.getProjectStats(projectPath);
      } else {
        // Get overall stats
        response = await api.usage.getStats();
      }

      if (response.success && response.stats) {
        setStats(response.stats);
      }
    } catch (error) {
      console.error('Failed to load usage stats:', error);
      toast.error('Failed to load usage statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCost = (cost: number, currency: string) => {
    // Always use GBP to match budget settings, regardless of stored currency
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost);
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(2)}M`;
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toLocaleString();
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.entryCount === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
          <CardDescription>No usage data available yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isProjectStats = 'features' in stats;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(stats.totalCost, stats.currency)}</div>
            <p className="text-xs text-muted-foreground">{stats.entryCount} API calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(stats.totalTokens)}</div>
            <p className="text-xs text-muted-foreground">
              {formatTokens(stats.totalInputTokens)} in / {formatTokens(stats.totalOutputTokens)}{' '}
              out
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Call</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(stats.totalCost / stats.entryCount, stats.currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatTokens(Math.round(stats.totalTokens / stats.entryCount))} tokens/call
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Tabs */}
      <Tabs defaultValue="models" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="models">By Model</TabsTrigger>
          <TabsTrigger value="providers">By Provider</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                Model Breakdown
              </CardTitle>
              <CardDescription>Cost and usage per model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.modelBreakdown.map((model) => (
                <div key={`${model.provider}-${model.model}`} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.model}</span>
                      <Badge variant="outline">{model.provider}</Badge>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCost(model.cost, stats.currency)}
                    </span>
                  </div>
                  <Progress value={(model.cost / stats.totalCost) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTokens(model.tokens)} tokens</span>
                    <span>{model.calls} calls</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Provider Breakdown
              </CardTitle>
              <CardDescription>Cost and usage per provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.providerBreakdown.map((provider) => (
                <div key={provider.provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{provider.provider}</span>
                    <span className="text-sm font-medium">
                      {formatCost(provider.cost, stats.currency)}
                    </span>
                  </div>
                  <Progress value={(provider.cost / stats.totalCost) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTokens(provider.tokens)} tokens</span>
                    <span>{provider.calls} calls</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Project Features Breakdown (if available) */}
      {isProjectStats && stats.features && stats.features.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Feature Breakdown</CardTitle>
            <CardDescription>Cost per completed feature</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.features
              .sort((a, b) => b.totalCost - a.totalCost)
              .map((feature) => (
                <div
                  key={feature.featureId}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {feature.featureTitle || feature.featureId}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {formatTokens(feature.totalTokens)}
                      </span>
                      <span>{feature.entryCount} calls</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatCost(feature.totalCost, feature.currency)}
                    </p>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Time Range */}
      {stats.periodStart && stats.periodEnd && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Period: {new Date(stats.periodStart).toLocaleString()} -{' '}
              {new Date(stats.periodEnd).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
