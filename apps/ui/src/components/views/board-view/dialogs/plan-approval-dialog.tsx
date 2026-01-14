'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Feature } from '@/store/app-store';
import { Check, RefreshCw, Edit2, Eye, Loader2, GitBranch } from 'lucide-react';
import { ImpactAnalysisPanel } from './components/impact-analysis-panel';
import { useAppStore } from '@/store/app-store';

interface PlanApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  planContent: string;
  onApprove: (editedPlan?: string) => void;
  onReject: (feedback?: string) => void;
  isLoading?: boolean;
  viewOnly?: boolean;
}

export function PlanApprovalDialog({
  open,
  onOpenChange,
  feature,
  planContent,
  onApprove,
  onReject,
  isLoading = false,
  viewOnly = false,
}: PlanApprovalDialogProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState(planContent);
  const [showRejectFeedback, setShowRejectFeedback] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [localFeature, setLocalFeature] = useState(feature);

  const { currentProject, updateFeature } = useAppStore();

  // Reset state when dialog opens or plan content changes
  useEffect(() => {
    if (open) {
      setEditedPlan(planContent);
      setIsEditMode(false);
      setShowRejectFeedback(false);
      setRejectFeedback('');
      setLocalFeature(feature);
    }
  }, [open, planContent, feature]);

  const handleApprove = () => {
    // Only pass edited plan if it was modified
    const wasEdited = editedPlan !== planContent;
    onApprove(wasEdited ? editedPlan : undefined);
  };

  const handleReject = () => {
    if (showRejectFeedback) {
      onReject(rejectFeedback.trim() || undefined);
    } else {
      setShowRejectFeedback(true);
    }
  };

  const handleCancelReject = () => {
    setShowRejectFeedback(false);
    setRejectFeedback('');
  };

  const handleClose = (open: boolean) => {
    if (!open && !isLoading) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl" data-testid="plan-approval-dialog">
        <DialogHeader>
          <DialogTitle>{viewOnly ? 'View Plan' : 'Review Plan'}</DialogTitle>
          <DialogDescription>
            {viewOnly
              ? 'View the generated plan for this feature.'
              : 'Review the generated plan before implementation begins.'}
            {feature && (
              <span className="block mt-2 text-primary">
                Feature: {feature.description.slice(0, 150)}
                {feature.description.length > 150 ? '...' : ''}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="view">
              <Eye className="w-4 h-4 mr-2" />
              View
            </TabsTrigger>
            <TabsTrigger value="edit" disabled={viewOnly}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="impact">
              <GitBranch className="w-4 h-4 mr-2" />
              Impact
            </TabsTrigger>
          </TabsList>

          {/* View Tab */}
          <TabsContent value="view" className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto max-h-[70vh] border border-border rounded-lg">
              <div className="p-4 overflow-auto">
                <Markdown>{editedPlan || 'No plan content available.'}</Markdown>
              </div>
            </div>
          </TabsContent>

          {/* Edit Tab */}
          <TabsContent value="edit" className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto max-h-[70vh] border border-border rounded-lg">
              <Textarea
                value={editedPlan}
                onChange={(e) => setEditedPlan(e.target.value)}
                className="min-h-[400px] h-full w-full border-0 rounded-lg resize-none font-mono text-sm"
                placeholder="Enter plan content..."
                disabled={isLoading}
              />
            </div>
          </TabsContent>

          {/* Impact Tab */}
          <TabsContent value="impact" className="flex-1 overflow-y-auto max-h-[70vh]">
            {localFeature && (
              <ImpactAnalysisPanel
                feature={localFeature}
                projectPath={currentProject?.path || ''}
                onAnalysisComplete={(analysis) => {
                  const updatedFeature = {
                    ...localFeature,
                    impactAnalysis: analysis,
                  };
                  setLocalFeature(updatedFeature);
                  updateFeature(localFeature.id, { impactAnalysis: analysis });
                }}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Revision Feedback Section - Only show when not in viewOnly mode */}
        {showRejectFeedback && !viewOnly && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="reject-feedback">What changes would you like?</Label>
            <Textarea
              id="reject-feedback"
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Describe the changes you'd like to see in the plan..."
              className="min-h-[80px]"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to cancel the feature, or provide feedback to regenerate the plan.
            </p>
          </div>
        )}

        <DialogFooter className="flex-shrink-0 gap-2">
          {viewOnly ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : showRejectFeedback ? (
            <>
              <Button variant="ghost" onClick={handleCancelReject} disabled={isLoading}>
                Back
              </Button>
              <Button variant="secondary" onClick={handleReject} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {rejectFeedback.trim() ? 'Revise Plan' : 'Cancel Feature'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleReject} disabled={isLoading}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Request Changes
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
