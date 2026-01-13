import { useState, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryAutocomplete } from '@/components/ui/category-autocomplete';
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import {
  MessageSquare,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  ChevronDown,
  GitBranch,
  X,
  FileText,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { modelSupportsThinking } from '@/lib/utils';
import {
  Feature,
  ModelAlias,
  ThinkingLevel,
  AIProfile,
  useAppStore,
  PlanningMode,
} from '@/store/app-store';
import {
  ModelSelector,
  ThinkingLevelSelector,
  ProfileQuickSelect,
  TestingTabContent,
  PrioritySelector,
  BranchSelector,
  PlanningModeSelector,
} from '../shared';
import { ModelOverrideTrigger, useModelOverride } from '@/components/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DependencyTreeDialog } from './dependency-tree-dialog';
import { isCursorModel, PROVIDER_PREFIXES } from '@automaker/types';
import { ImpactAnalysisPanel } from './components/impact-analysis-panel';

const logger = createLogger('EditFeatureDialog');

interface EditFeatureDialogProps {
  feature: Feature | null;
  onClose: () => void;
  onUpdate: (
    featureId: string,
    updates: {
      title: string;
      category: string;
      description: string;
      skipTests: boolean;
      model: ModelAlias;
      thinkingLevel: ThinkingLevel;
      imagePaths: DescriptionImagePath[];
      textFilePaths: DescriptionTextFilePath[];
      branchName: string; // Can be empty string to use current branch
      priority: number;
      planningMode: PlanningMode;
      requirePlanApproval: boolean;
    }
  ) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  currentBranch?: string;
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
  allFeatures: Feature[];
}

export function EditFeatureDialog({
  feature,
  onClose,
  onUpdate,
  categorySuggestions,
  branchSuggestions,
  branchCardCounts,
  currentBranch,
  isMaximized,
  showProfilesOnly,
  aiProfiles,
  allFeatures,
}: EditFeatureDialogProps) {
  const [editingFeature, setEditingFeature] = useState<Feature | null>(feature);
  const [useCurrentBranch, setUseCurrentBranch] = useState(() => {
    // If feature has no branchName, default to using current branch
    return !feature?.branchName;
  });
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [showEditAdvancedOptions, setShowEditAdvancedOptions] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    'improve' | 'technical' | 'simplify' | 'acceptance'
  >('improve');
  const [showDependencyTree, setShowDependencyTree] = useState(false);
  const [planningMode, setPlanningMode] = useState<PlanningMode>(feature?.planningMode ?? 'skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(
    feature?.requirePlanApproval ?? false
  );
  const enhancementAbortRef = useRef<AbortController | null>(null);
  const enhancementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get worktrees setting from store
  const { useWorktrees } = useAppStore();

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  useEffect(() => {
    setEditingFeature(feature);
    if (feature) {
      setPlanningMode(feature.planningMode ?? 'skip');
      setRequirePlanApproval(feature.requirePlanApproval ?? false);
      // If feature has no branchName, default to using current branch
      setUseCurrentBranch(!feature.branchName);
    } else {
      setEditFeaturePreviewMap(new Map());
      setShowEditAdvancedOptions(false);
    }
  }, [feature]);

  const handleUpdate = () => {
    if (!editingFeature) return;

    // Validate branch selection when "other branch" is selected and branch selector is enabled
    const isBranchSelectorEnabled = editingFeature.status === 'backlog';
    if (
      useWorktrees &&
      isBranchSelectorEnabled &&
      !useCurrentBranch &&
      !editingFeature.branchName?.trim()
    ) {
      toast.error('Please select a branch name');
      return;
    }

    const selectedModel = (editingFeature.model ?? 'opus') as ModelAlias;
    const normalizedThinking: ThinkingLevel = modelSupportsThinking(selectedModel)
      ? (editingFeature.thinkingLevel ?? 'none')
      : 'none';

    // Use current branch if toggle is on
    // If currentBranch is provided (non-primary worktree), use it
    // Otherwise (primary worktree), use empty string which means "unassigned" (show only on primary)
    const finalBranchName = useCurrentBranch
      ? currentBranch || ''
      : editingFeature.branchName || '';

    const updates = {
      title: editingFeature.title ?? '',
      category: editingFeature.category,
      description: editingFeature.description,
      skipTests: editingFeature.skipTests ?? false,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      imagePaths: editingFeature.imagePaths ?? [],
      textFilePaths: editingFeature.textFilePaths ?? [],
      branchName: finalBranchName,
      priority: editingFeature.priority ?? 2,
      planningMode,
      requirePlanApproval,
    };

    onUpdate(editingFeature.id, updates);
    setEditFeaturePreviewMap(new Map());
    setShowEditAdvancedOptions(false);
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleModelSelect = (model: string) => {
    if (!editingFeature) return;
    // For Cursor models, thinking is handled by the model itself
    // For Claude models, check if it supports extended thinking
    const isCursor = isCursorModel(model);
    setEditingFeature({
      ...editingFeature,
      model: model as ModelAlias,
      thinkingLevel: isCursor
        ? 'none'
        : modelSupportsThinking(model)
          ? editingFeature.thinkingLevel
          : 'none',
    });
  };

  const handleProfileSelect = (profile: AIProfile) => {
    if (!editingFeature) return;
    if (profile.provider === 'cursor') {
      // Cursor profile - set cursor model
      const cursorModel = `${PROVIDER_PREFIXES.cursor}${profile.cursorModel || 'auto'}`;
      setEditingFeature({
        ...editingFeature,
        model: cursorModel as ModelAlias,
        thinkingLevel: 'none', // Cursor handles thinking internally
      });
    } else {
      // Claude profile
      setEditingFeature({
        ...editingFeature,
        model: profile.model || 'sonnet',
        thinkingLevel: profile.thinkingLevel || 'none',
      });
    }
  };

  const handleCancelEnhancement = () => {
    if (enhancementAbortRef.current) {
      enhancementAbortRef.current.abort();
      enhancementAbortRef.current = null;
    }
    if (enhancementTimeoutRef.current) {
      clearTimeout(enhancementTimeoutRef.current);
      enhancementTimeoutRef.current = null;
    }
    setIsEnhancing(false);
    toast.info('Enhancement cancelled');
  };

  const handleEnhanceDescription = async () => {
    if (!editingFeature?.description.trim() || isEnhancing) return;

    setIsEnhancing(true);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    enhancementAbortRef.current = abortController;

    // Set timeout to auto-cancel after 30 seconds
    enhancementTimeoutRef.current = setTimeout(() => {
      handleCancelEnhancement();
      toast.error('Enhancement timed out after 30 seconds');
    }, 30000);

    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        editingFeature.description,
        enhancementMode,
        enhancementOverride.effectiveModel, // API accepts string, extract from PhaseModelEntry
        enhancementOverride.effectiveModelEntry.thinkingLevel // Pass thinking level
      );

      // Clear timeout if successful
      if (enhancementTimeoutRef.current) {
        clearTimeout(enhancementTimeoutRef.current);
        enhancementTimeoutRef.current = null;
      }

      if (result?.success && result.enhancedText) {
        const enhancedText = result.enhancedText;
        setEditingFeature((prev) => (prev ? { ...prev, description: enhancedText } : prev));
        toast.success('Description enhanced!');
      } else {
        toast.error(result?.error || 'Failed to enhance description');
      }
    } catch (error) {
      // Clear timeout on error
      if (enhancementTimeoutRef.current) {
        clearTimeout(enhancementTimeoutRef.current);
        enhancementTimeoutRef.current = null;
      }

      // Don't show error if it was manually cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      logger.error('Enhancement failed:', error);
      toast.error('Failed to enhance description');
    } finally {
      enhancementAbortRef.current = null;
      setIsEnhancing(false);
    }
  };

  // Cursor models handle thinking internally, so only show thinking selector for Claude models
  const isCurrentModelCursor = isCursorModel(editingFeature?.model as string);
  const editModelAllowsThinking =
    !isCurrentModelCursor && modelSupportsThinking(editingFeature?.model);

  if (!editingFeature) {
    return null;
  }

  return (
    <Dialog open={!!editingFeature} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="edit-feature-dialog"
        onPointerDownOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Feature</DialogTitle>
          <DialogDescription>Modify the feature details.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="prompt" className="py-4 flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="prompt" data-testid="edit-tab-prompt">
              <MessageSquare className="w-4 h-4 mr-2" />
              Prompt
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="edit-tab-model">
              <Settings2 className="w-4 h-4 mr-2" />
              Model
            </TabsTrigger>
            <TabsTrigger value="options" data-testid="edit-tab-options">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Options
            </TabsTrigger>{' '}
            <TabsTrigger value="resources" data-testid="tab-resources">
              <FileText className="w-4 h-4 mr-2" />
              Resources
            </TabsTrigger>{' '}
          </TabsList>

          {/* Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4 overflow-y-auto cursor-default">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <DescriptionImageDropZone
                value={editingFeature.description}
                onChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    description: value,
                  })
                }
                images={editingFeature.imagePaths ?? []}
                onImagesChange={(images) =>
                  setEditingFeature({
                    ...editingFeature,
                    imagePaths: images,
                  })
                }
                textFiles={editingFeature.textFilePaths ?? []}
                onTextFilesChange={(textFiles) =>
                  setEditingFeature({
                    ...editingFeature,
                    textFilePaths: textFiles,
                  })
                }
                placeholder="Describe the feature..."
                previewMap={editFeaturePreviewMap}
                onPreviewMapChange={setEditFeaturePreviewMap}
                data-testid="edit-feature-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title (optional)</Label>
              <Input
                id="edit-title"
                value={editingFeature.title ?? ''}
                onChange={(e) =>
                  setEditingFeature({
                    ...editingFeature,
                    title: e.target.value,
                  })
                }
                placeholder="Leave blank to auto-generate"
                data-testid="edit-feature-title"
              />
            </div>
            <div className="flex w-fit items-center gap-3 select-none cursor-default">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[180px] justify-between">
                    {enhancementMode === 'improve' && 'Improve Clarity'}
                    {enhancementMode === 'technical' && 'Add Technical Details'}
                    {enhancementMode === 'simplify' && 'Simplify'}
                    {enhancementMode === 'acceptance' && 'Add Acceptance Criteria'}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setEnhancementMode('improve')}>
                    Improve Clarity
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnhancementMode('technical')}>
                    Add Technical Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnhancementMode('simplify')}>
                    Simplify
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnhancementMode('acceptance')}>
                    Add Acceptance Criteria
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {isEnhancing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEnhancement}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEnhanceDescription}
                  disabled={!editingFeature.description.trim()}
                  loading={isEnhancing}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Enhance with AI
                </Button>
              )}

              <ModelOverrideTrigger
                currentModelEntry={enhancementOverride.effectiveModelEntry}
                onModelChange={enhancementOverride.setOverride}
                phase="enhancementModel"
                isOverridden={enhancementOverride.isOverridden}
                size="sm"
                variant="icon"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category (optional)</Label>
              <CategoryAutocomplete
                value={editingFeature.category}
                onChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    category: value,
                  })
                }
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="edit-feature-category"
              />
            </div>
            {useWorktrees && (
              <BranchSelector
                useCurrentBranch={useCurrentBranch}
                onUseCurrentBranchChange={setUseCurrentBranch}
                branchName={editingFeature.branchName ?? ''}
                onBranchNameChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    branchName: value,
                  })
                }
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                disabled={editingFeature.status !== 'backlog'}
                testIdPrefix="edit-feature"
              />
            )}

            {/* Priority Selector */}
            <PrioritySelector
              selectedPriority={editingFeature.priority ?? 2}
              onPrioritySelect={(priority) =>
                setEditingFeature({
                  ...editingFeature,
                  priority,
                })
              }
              testIdPrefix="edit-priority"
            />
          </TabsContent>

          {/* Model Tab */}
          <TabsContent value="model" className="space-y-4 overflow-y-auto cursor-default">
            {/* Show Advanced Options Toggle */}
            {showProfilesOnly && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Simple Mode Active</p>
                  <p className="text-xs text-muted-foreground">
                    Only showing AI profiles. Advanced model tweaking is hidden.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditAdvancedOptions(!showEditAdvancedOptions)}
                  data-testid="edit-show-advanced-options-toggle"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  {showEditAdvancedOptions ? 'Hide' : 'Show'} Advanced
                </Button>
              </div>
            )}

            {/* Quick Select Profile Section */}
            <ProfileQuickSelect
              profiles={aiProfiles}
              selectedModel={editingFeature.model ?? 'opus'}
              selectedThinkingLevel={editingFeature.thinkingLevel ?? 'none'}
              selectedCursorModel={
                isCurrentModelCursor ? (editingFeature.model as string) : undefined
              }
              onSelect={handleProfileSelect}
              testIdPrefix="edit-profile-quick-select"
            />

            {/* Separator */}
            {aiProfiles.length > 0 && (!showProfilesOnly || showEditAdvancedOptions) && (
              <div className="border-t border-border" />
            )}

            {/* Claude Models Section */}
            {(!showProfilesOnly || showEditAdvancedOptions) && (
              <>
                <ModelSelector
                  selectedModel={(editingFeature.model ?? 'opus') as ModelAlias}
                  onModelSelect={handleModelSelect}
                  testIdPrefix="edit-model-select"
                />
                {editModelAllowsThinking && (
                  <ThinkingLevelSelector
                    selectedLevel={editingFeature.thinkingLevel ?? 'none'}
                    onLevelSelect={(level) =>
                      setEditingFeature({
                        ...editingFeature,
                        thinkingLevel: level,
                      })
                    }
                    testIdPrefix="edit-thinking-level"
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Options Tab */}
          <TabsContent value="options" className="space-y-4 overflow-y-auto cursor-default">
            {/* Planning Mode Section */}
            <PlanningModeSelector
              mode={planningMode}
              onModeChange={setPlanningMode}
              requireApproval={requirePlanApproval}
              onRequireApprovalChange={setRequirePlanApproval}
              featureDescription={editingFeature.description}
              testIdPrefix="edit-feature"
              compact
            />

            <div className="border-t border-border my-4" />

            {/* Testing Section */}
            <TestingTabContent
              skipTests={editingFeature.skipTests ?? false}
              onSkipTestsChange={(skipTests) => setEditingFeature({ ...editingFeature, skipTests })}
              testIdPrefix="edit"
            />
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-6 overflow-y-auto cursor-default">
            {/* Wiki Pages Section */}
            <div className="space-y-2">
              <Label>Attached Wiki Pages</Label>
              <p className="text-sm text-muted-foreground">
                These wiki pages will be available to the agent as context when executing this
                feature.
              </p>
              {editingFeature.textFilePaths && editingFeature.textFilePaths.length > 0 ? (
                <div className="space-y-2 mt-3">
                  {editingFeature.textFilePaths.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 border rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.filename}</p>
                          <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.path.startsWith('https://dev.azure.com/') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(file.path, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingFeature({
                              ...editingFeature,
                              textFilePaths: editingFeature.textFilePaths?.filter(
                                (f) => f.id !== file.id
                              ),
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No wiki pages attached</p>
                  <p className="text-xs mt-1">
                    Go to Settings → DevOps Resources to browse and attach wiki pages
                  </p>
                </div>
              )}
            </div>

            {/* Impact Analysis Section */}
            <div className="pt-4 border-t">
              <ImpactAnalysisPanel
                feature={editingFeature}
                projectPath={editingFeature.projectPath || ''}
              />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="sm:!justify-between">
          <Button
            variant="outline"
            onClick={() => setShowDependencyTree(true)}
            className="gap-2 h-10"
          >
            <GitBranch className="w-4 h-4" />
            View Dependency Tree
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleUpdate}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={!!editingFeature}
              data-testid="confirm-edit-feature"
              disabled={
                useWorktrees &&
                editingFeature.status === 'backlog' &&
                !useCurrentBranch &&
                !editingFeature.branchName?.trim()
              }
            >
              Save Changes
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>

      <DependencyTreeDialog
        open={showDependencyTree}
        onClose={() => setShowDependencyTree(false)}
        feature={editingFeature}
        allFeatures={allFeatures}
      />
    </Dialog>
  );
}
