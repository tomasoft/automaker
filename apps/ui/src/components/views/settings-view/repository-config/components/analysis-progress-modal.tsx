/**
 * Analysis Progress Modal
 *
 * Shows real-time progress during repository analysis
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface AnalysisProgressModalProps {
  isOpen: boolean;
  progress: number;
  currentStep: string;
}

export function AnalysisProgressModal({
  isOpen,
  progress,
  currentStep,
}: AnalysisProgressModalProps) {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyzing Repository
          </DialogTitle>
          <DialogDescription>
            Deep analysis in progress. This may take a few moments...
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-muted-foreground text-center">{currentStep}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
