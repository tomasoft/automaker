import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle, Play, SkipForward, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface AgentStuckModalProps {
  open: boolean;
  onClose: () => void;
  featureId: string;
  featureName: string;
  errorCount: number;
  lastError?: string;
  onResumeWithGuidance: (guidance: string) => Promise<void>;
  onSkipTask: () => Promise<void>;
  onRestartTask: () => Promise<void>;
}

export function AgentStuckModal({
  open,
  onClose,
  featureId,
  featureName,
  errorCount,
  lastError,
  onResumeWithGuidance,
  onSkipTask,
  onRestartTask,
}: AgentStuckModalProps) {
  const [guidance, setGuidance] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleResumeWithGuidance = async () => {
    if (!guidance.trim()) {
      alert('Please provide guidance for the agent');
      return;
    }

    setIsProcessing(true);
    try {
      await onResumeWithGuidance(guidance);
      setGuidance('');
      onClose();
    } catch (error) {
      console.error('Failed to resume with guidance:', error);
      alert('Failed to resume agent. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipTask = async () => {
    if (!confirm('Skip this task and move to the next one?')) return;

    setIsProcessing(true);
    try {
      await onSkipTask();
      onClose();
    } catch (error) {
      console.error('Failed to skip task:', error);
      alert('Failed to skip task. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestartTask = async () => {
    if (!confirm('Restart this task from the beginning? All progress will be lost.')) return;

    setIsProcessing(true);
    try {
      await onRestartTask();
      onClose();
    } catch (error) {
      console.error('Failed to restart task:', error);
      alert('Failed to restart task. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !isProcessing && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-500">
            <AlertTriangle className="w-5 h-5" />
            Agent Stuck - Intervention Required
          </DialogTitle>
          <DialogDescription>
            The agent has encountered <strong>{errorCount} consecutive errors</strong> and appears
            to be stuck on feature: <strong>{featureName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lastError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs font-semibold text-red-400 mb-1">Last Error:</p>
              <p className="text-xs text-red-300 font-mono whitespace-pre-wrap">{lastError}</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-2">Intervention Options:</h4>
            </div>

            {/* Option 1: Resume with Guidance */}
            <div className="p-4 border border-zinc-700 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <Play className="w-4 h-4 mt-0.5 text-green-500" />
                <div className="flex-1">
                  <h5 className="text-sm font-semibold text-green-400">Resume with Guidance</h5>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provide specific instructions to help the agent overcome the issue
                  </p>
                </div>
              </div>
              <Textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="Example: 'Use npm instead of yarn' or 'Check the API documentation at https://...'"
                className="min-h-[80px] text-xs"
                disabled={isProcessing}
              />
              <Button
                onClick={handleResumeWithGuidance}
                disabled={!guidance.trim() || isProcessing}
                className="w-full"
                variant="default"
              >
                <Play className="w-3.5 h-3.5 mr-2" />
                Resume with Guidance
              </Button>
            </div>

            {/* Option 2: Skip Task */}
            <div className="p-4 border border-zinc-700 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <SkipForward className="w-4 h-4 mt-0.5 text-blue-500" />
                <div className="flex-1">
                  <h5 className="text-sm font-semibold text-blue-400">Skip Task</h5>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mark this task as blocked and continue with remaining tasks
                  </p>
                </div>
              </div>
              <Button
                onClick={handleSkipTask}
                disabled={isProcessing}
                className="w-full"
                variant="outline"
              >
                <SkipForward className="w-3.5 h-3.5 mr-2" />
                Skip This Task
              </Button>
            </div>

            {/* Option 3: Restart Task */}
            <div className="p-4 border border-zinc-700 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <RotateCcw className="w-4 h-4 mt-0.5 text-orange-500" />
                <div className="flex-1">
                  <h5 className="text-sm font-semibold text-orange-400">Restart Task</h5>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clear all progress and restart this task from the beginning
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRestartTask}
                disabled={isProcessing}
                className="w-full"
                variant="destructive"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Restart Task
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="ghost" disabled={isProcessing}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
