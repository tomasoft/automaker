import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, FilePlus, CheckCircle2 } from 'lucide-react';
import type { AffectedFile } from '@automaker/types';

interface FilesTabProps {
  affectedFiles: AffectedFile[];
}

export function FilesTab({ affectedFiles }: FilesTabProps) {
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'low':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  if (affectedFiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No affected files detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          {affectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                {file.exists ? (
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <FilePlus className="h-4 w-4 text-blue-600 flex-shrink-0" />
                )}
                <span className="font-mono text-sm">{file.path}</span>
              </div>
              <div className="flex items-center gap-2">
                {file.exists && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                <Badge variant="secondary" className={getConfidenceColor(file.confidence)}>
                  {file.confidence}
                </Badge>
                {file.matchedPattern && (
                  <Badge variant="outline" className="text-xs">
                    {file.matchedPattern}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
