import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import type { DetectedGotcha } from '@automaker/types';

interface GotchasTabProps {
  gotchas: DetectedGotcha[];
}

export function GotchasTab({ gotchas }: GotchasTabProps) {
  const [expandedGotchas, setExpandedGotchas] = useState<Set<number>>(new Set());
  const [acknowledgedGotchas, setAcknowledgedGotchas] = useState<Set<number>>(
    new Set(gotchas.map((g, i) => (g.acknowledged ? i : -1)).filter((i) => i !== -1))
  );

  const toggleGotcha = (index: number) => {
    const newExpanded = new Set(expandedGotchas);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedGotchas(newExpanded);
  };

  const toggleAcknowledged = (index: number) => {
    const newAcknowledged = new Set(acknowledgedGotchas);
    if (newAcknowledged.has(index)) {
      newAcknowledged.delete(index);
    } else {
      newAcknowledged.add(index);
    }
    setAcknowledgedGotchas(newAcknowledged);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertOctagon className="h-5 w-5 text-red-600" />;
      case 'high':
        return <AlertCircle className="h-5 w-5 text-orange-600" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'high':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      default:
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    }
  };

  if (gotchas.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No architectural gotchas detected</p>
          <p className="text-sm mt-2">Your changes align with existing patterns</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          {gotchas.map((gotcha, index) => {
            const isExpanded = expandedGotchas.has(index);
            const isAcknowledged = acknowledgedGotchas.has(index);

            return (
              <div
                key={index}
                className={`border rounded-lg transition-all ${isAcknowledged ? 'opacity-60' : ''}`}
              >
                <button
                  onClick={() => toggleGotcha(index)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0" />
                    )}
                    {getSeverityIcon(gotcha.severity)}
                    <span className="font-medium text-left">{gotcha.rule}</span>
                  </div>
                  <Badge variant="secondary" className={getSeverityColor(gotcha.severity)}>
                    {gotcha.severity}
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="pl-10 space-y-3">
                      <p className="text-sm">{gotcha.description}</p>

                      {gotcha.suggestedAction && (
                        <div className="bg-accent/50 rounded-lg p-3">
                          <p className="text-sm font-medium mb-1">Suggested Action:</p>
                          <p className="text-sm text-muted-foreground">{gotcha.suggestedAction}</p>
                        </div>
                      )}

                      {gotcha.wikiPages && gotcha.wikiPages.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            Related Documentation:
                          </p>
                          <div className="space-y-1">
                            {gotcha.wikiPages.map((page, pageIndex) => (
                              <div key={pageIndex} className="text-sm text-muted-foreground pl-6">
                                • {page}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <Checkbox
                          id={`gotcha-${index}`}
                          checked={isAcknowledged}
                          onCheckedChange={() => toggleAcknowledged(index)}
                        />
                        <label
                          htmlFor={`gotcha-${index}`}
                          className="text-sm cursor-pointer select-none"
                        >
                          I acknowledge this gotcha and will handle it appropriately
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
