/**
 * Usage Statistics Display Component
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Zap, TrendingUp, BarChart3, Cpu, Loader2, Calendar, X } from 'lucide-react';
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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [hasCustomRange, setHasCustomRange] = useState(false);

  useEffect(() => {
    // Load dates from URL params
    const params = new URLSearchParams(window.location.search);
    const urlStartDate = params.get('startDate');
    const urlEndDate = params.get('endDate');

    if (urlStartDate) setStartDate(urlStartDate);
    if (urlEndDate) setEndDate(urlEndDate);
    if (urlStartDate || urlEndDate) setHasCustomRange(true);

    // Load stats with URL params
    loadStats(urlStartDate || undefined, urlEndDate || undefined);
  }, [projectPath, featureId]);

  const loadStats = async (customStartDate?: string, customEndDate?: string) => {
    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      let response;

      const queryParams: Record<string, string> = {};
      if (customStartDate) queryParams.startDate = customStartDate;
      if (customEndDate) queryParams.endDate = customEndDate;

      if (featureId && projectPath) {
        // Get feature stats
        response = await api.usage.getStats({ featureId, projectPath, ...queryParams });
      } else if (projectPath) {
        // Get project stats - use general stats with projectPath filter
        response = await api.usage.getStats({ projectPath, ...queryParams });
      } else {
        // Get overall stats
        response = await api.usage.getStats(queryParams);
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

  const applyDateFilter = () => {
    if (!startDate && !endDate) {
      toast.error('Please select at least one date');
      return;
    }
    setHasCustomRange(true);
    // Update URL params
    const params = new URLSearchParams(window.location.search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    loadStats(startDate, endDate);
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
    setHasCustomRange(false);
    // Clear URL params
    const params = new URLSearchParams(window.location.search);
    params.delete('startDate');
    params.delete('endDate');
    window.history.replaceState(
      {},
      '',
      params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
    );
    loadStats();
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

  const hasData = stats && stats.entryCount > 0;
  const isProjectStats = stats && 'features' in stats;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Date Range Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={applyDateFilter} className="flex-1">
                Apply Filter
              </Button>
              {hasCustomRange && (
                <Button onClick={clearDateFilter} variant="outline" size="icon">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          {hasCustomRange && (
            <p className="text-sm text-muted-foreground mt-2">
              Showing filtered results
              {startDate && ` from ${new Date(startDate).toLocaleDateString()}`}
              {endDate && ` to ${new Date(endDate).toLocaleDateString()}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Show message if no data */}
      {!hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Usage Statistics</CardTitle>
            <CardDescription>
              {hasCustomRange
                ? 'No usage data found for the selected date range'
                : 'No usage data available yet'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Overview Cards - only show if we have data */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCost(stats.totalCost, stats.currency)}
              </div>
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
      )}

      {/* Breakdown Tabs */}
      {hasData && (
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
      )}

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
      {(hasCustomRange || (stats.periodStart && stats.periodEnd)) && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              {hasCustomRange ? (
                <>
                  Filtered Period:
                  {startDate && <> from {new Date(startDate).toLocaleDateString()}</>}
                  {endDate && <> to {new Date(endDate).toLocaleDateString()}</>}
                  {!startDate && endDate && <> up to {new Date(endDate).toLocaleDateString()}</>}
                  {startDate && !endDate && (
                    <> from {new Date(startDate).toLocaleDateString()} onwards</>
                  )}
                </>
              ) : (
                <>
                  Period: {new Date(stats.periodStart!).toLocaleString()} -{' '}
                  {new Date(stats.periodEnd!).toLocaleString()}
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
