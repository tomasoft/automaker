import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, StopCircle, FileEdit } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';

interface AgentStuckModalProps {
  open: boolean;
  onClose: () => void;
  featureId: string;
  featureTitle: string;
  errorCount: number;
  recentErrors: string[];
  onRetry?: () => void;
  onStop?: () => void;
  onEditPlan?: () => void;
}

export function AgentStuckModal({
  open,
  onClose,
  featureId,
  featureTitle,
  errorCount,
  recentErrors,
  onRetry,
  onStop,
  onEditPlan,
}: AgentStuckModalProps) {
  const [selectedAction, setSelectedAction] = useState<'retry' | 'stop' | 'edit' | null>(null);

  const handleAction = (action: 'retry' | 'stop' | 'edit') => {
    setSelectedAction(action);

    switch (action) {
      case 'retry':
        onRetry?.();
        break;
      case 'stop':
        onStop?.();
        break;
      case 'edit':
        onEditPlan?.();
        break;
    }

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Agent May Be Stuck</DialogTitle>
          </div>
          <DialogDescription>
            The agent has encountered {errorCount} similar error(s) while working on this feature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Feature Info */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-sm font-medium">Feature: {featureTitle}</p>
            <p className="text-xs text-muted-foreground">ID: {featureId}</p>
          </div>

          {/* Error Pattern */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Recent Error Pattern:</h4>
            <div className="rounded-lg border bg-destructive/10 p-3 text-sm">
              <ul className="list-disc space-y-1 pl-4">
                {recentErrors.slice(0, 3).map((error, idx) => (
                  <li key={idx} className="text-destructive">
                    {error}
                  </li>
                ))}
              </ul>
              {recentErrors.length > 3 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  ...and {recentErrors.length - 3} more similar error(s)
                </p>
              )}
            </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Suggested Actions:</h4>
            <div className="rounded-lg border bg-blue-500/10 p-3 text-sm">
              <Markdown className="text-sm">
                {`**Recommendations:**
- Check if the error indicates missing dependencies or incorrect configuration
- Review \`progress.md\` to see what has been tried so far
- Consider updating \`task_plan.md\` with a different approach
- The agent may need manual intervention or plan adjustment`}
              </Markdown>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleAction('edit')}
            className="w-full sm:w-auto"
          >
            <FileEdit className="mr-2 h-4 w-4" />
            Edit Plan
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAction('retry')}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry Anyway
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleAction('stop')}
            className="w-full sm:w-auto"
          >
            <StopCircle className="mr-2 h-4 w-4" />
            Stop Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
