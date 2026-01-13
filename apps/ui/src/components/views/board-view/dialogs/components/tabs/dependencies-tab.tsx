import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, ArrowRight, Network } from 'lucide-react';
import type { DirectImpact, AffectedFile } from '@automaker/types';
import { DependencyGraph } from '../dependency-graph';

interface DependenciesTabProps {
  directImpacts: DirectImpact[];
  indirectImpacts: DirectImpact[];
  affectedFiles?: AffectedFile[];
}

export function DependenciesTab({
  directImpacts,
  indirectImpacts,
  affectedFiles = [],
}: DependenciesTabProps) {
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('graph');
  const renderImpactList = (impacts: DirectImpact[], title: string) => {
    if (impacts.length === 0) return null;

    return (
      <div className="space-y-2">
        <h4 className="font-medium text-sm text-muted-foreground">{title}</h4>
        <div className="space-y-2">
          {impacts.map((impact, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-mono text-sm flex-1">{impact.file}</span>
              <Badge variant="outline">{impact.relationship}</Badge>
              <Badge variant="secondary">
                {impact.hops} hop{impact.hops !== 1 ? 's' : ''}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (directImpacts.length === 0 && indirectImpacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No dependency impacts detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {directImpacts.length + indirectImpacts.length} Dependencies
        </h4>
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-2 h-8"
            onClick={() => setViewMode('graph')}
          >
            <Network className="h-4 w-4" />
            Graph
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-2 h-8"
            onClick={() => setViewMode('list')}
          >
            <GitBranch className="h-4 w-4" />
            List
          </Button>
        </div>
      </div>

      {/* Graph View */}
      {viewMode === 'graph' && (
        <DependencyGraph
          affectedFiles={affectedFiles}
          directImpacts={directImpacts}
          indirectImpacts={indirectImpacts}
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            {renderImpactList(directImpacts, `Direct Impacts (${directImpacts.length})`)}
            {renderImpactList(indirectImpacts, `Indirect Impacts (${indirectImpacts.length})`)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
