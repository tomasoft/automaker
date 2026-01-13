import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CrossBoundaryRisk } from '@automaker/types';

interface ServicesTabProps {
  crossBoundaryRisks: CrossBoundaryRisk[];
}

export function ServicesTab({ crossBoundaryRisks }: ServicesTabProps) {
  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'high':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Server className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
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

  if (crossBoundaryRisks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No cross-service impacts detected</p>
          <p className="text-sm mt-2">Changes are contained within a single service</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {crossBoundaryRisks.map((risk, index) => (
            <div key={index} className="p-4 rounded-lg border bg-card">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getRiskIcon(risk.risk)}</div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{risk.fromService}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{risk.toService}</span>
                    <Badge variant="secondary" className={getRiskColor(risk.risk)}>
                      {risk.risk} risk
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{risk.dependency}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
