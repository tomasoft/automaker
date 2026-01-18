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
  Play,
  X,
  FileText,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { modelSupportsThinking } from '@/lib/utils';
import { useAppStore, Feature, FeatureImage } from '@/store/app-store';
import type { ModelAlias, ThinkingLevel, AIProfile, PlanningMode } from '@automaker/types';
import {
  ModelSelector,
  ThinkingLevelSelector,
  ProfileQuickSelect,
  TestingTabContent,
  PrioritySelector,
  BranchSelector,
  PlanningModeSelector,
  AncestorContextSection,
  SkillsInfo,
} from '../shared';
import { ModelOverrideTrigger, useModelOverride } from '@/components/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import {
  getAncestors,
  formatAncestorContextForPrompt,
  type AncestorContext,
} from '@automaker/dependency-resolver';
import {
  isCursorModel,
  PROVIDER_PREFIXES,
  getModelProvider,
  addProviderPrefix,
} from '@automaker/types';
import { WikiBrowser } from '../../settings-view/wiki-sources/components/wiki-browser';

const logger = createLogger('AddFeatureDialog');

type FeatureData = {
  title: string;
  category: string;
  description: string;
  images: FeatureImage[];
  imagePaths: DescriptionImagePath[];
  textFilePaths: DescriptionTextFilePath[];
  skipTests: boolean;
  model: ModelAlias;
  thinkingLevel: ThinkingLevel;
  branchName: string; // Can be empty string to use current branch
  priority: number;
  planningMode: PlanningMode;
  requirePlanApproval: boolean;
  dependencies?: string[];
};

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: FeatureData) => void;
  onAddAndStart?: (feature: FeatureData) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  defaultSkipTests: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
  // Spawn task mode props
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onAdd,
  onAddAndStart,
  categorySuggestions,
  branchSuggestions,
  branchCardCounts,
  defaultSkipTests,
  defaultBranch = 'main',
  currentBranch,
  isMaximized,
  showProfilesOnly,
  aiProfiles,
  parentFeature = null,
  allFeatures = [],
}: AddFeatureDialogProps) {
  const isSpawnMode = !!parentFeature;
  const navigate = useNavigate();
  const httpApi = getHttpApiClient();
  const { currentProject, defaultWikiPages, phaseModels } = useAppStore();
  const [useCurrentBranch, setUseCurrentBranch] = useState(true);
  const [globalSkillsCount, setGlobalSkillsCount] = useState(0);
  const [projectSkillsCount, setProjectSkillsCount] = useState(0);
  const [skillsAutoLoad, setSkillsAutoLoad] = useState(true);
  const [matchedSkills, setMatchedSkills] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      score: number;
      scope: 'global' | 'project';
      tags?: string[];
    }>
  >([]);
  const [isLoadingSkillsPreview, setIsLoadingSkillsPreview] = useState(false);

  const [newFeature, setNewFeature] = useState(() => {
    // Get initial default model from phase models
    const defaultPhaseModel = phaseModels.featureGenerationModel;
    let initialModel: string = 'sonnet'; // Fallback to sonnet instead of opus
    let initialThinking: ThinkingLevel = 'none';

    if (defaultPhaseModel?.model) {
      const modelString = defaultPhaseModel.model as string;
      const provider = getModelProvider(modelString);
      initialModel = addProviderPrefix(modelString, provider);
      initialThinking = defaultPhaseModel.thinkingLevel ?? 'none';
    }

    return {
      title: '',
      category: '',
      description: '',
      images: [] as FeatureImage[],
      imagePaths: [] as DescriptionImagePath[],
      textFilePaths: [] as DescriptionTextFilePath[],
      skipTests: false,
      model: initialModel as ModelAlias,
      thinkingLevel: initialThinking,
      branchName: '',
      priority: 2 as number, // Default to medium priority
    };
  });
  const [newFeaturePreviewMap, setNewFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    'improve' | 'technical' | 'simplify' | 'acceptance'
  >('improve');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const enhancementAbortRef = useRef<AbortController | null>(null);
  const enhancementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Wiki configuration from localStorage
  const [wikiOrganization] = useState(
    () => localStorage.getItem('azure_devops_organization') || ''
  );
  const [wikiProject] = useState(() => localStorage.getItem('azure_devops_project') || '');
  const [wikiId] = useState(() => localStorage.getItem('azure_devops_wikiId') || '');
  const hasWikiConfig = wikiOrganization && wikiProject && wikiId;

  // Get planning mode defaults and worktrees setting from store
  const { defaultPlanningMode, defaultRequirePlanApproval, defaultAIProfileId, useWorktrees } =
    useAppStore();

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  // Sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      // Find the default profile if one is set
      const defaultProfile = defaultAIProfileId
        ? aiProfiles.find((p) => p.id === defaultAIProfileId)
        : null;

      // Get default model from phase models (Model Defaults) - this is the primary source
      const defaultPhaseModel = phaseModels.featureGenerationModel;

      // Normalize the model to include provider prefix if needed
      let normalizedModel: string;
      if (defaultPhaseModel?.model) {
        const modelString = defaultPhaseModel.model as string;
        const provider = getModelProvider(modelString);
        normalizedModel = addProviderPrefix(modelString, provider);
      } else if (defaultProfile?.model) {
        const provider = getModelProvider(defaultProfile.model);
        normalizedModel = addProviderPrefix(defaultProfile.model, provider);
      } else {
        normalizedModel = 'sonnet'; // Fallback to sonnet for consistency
      }

      setNewFeature((prev) => ({
        ...prev,
        skipTests: defaultSkipTests,
        branchName: defaultBranch || '',
        // Priority: 1) Phase model defaults, 2) Default profile, 3) Fallback to 'sonnet'
        model: normalizedModel,
        thinkingLevel: defaultPhaseModel?.thinkingLevel ?? defaultProfile?.thinkingLevel ?? 'none',
      }));
      setUseCurrentBranch(true);
      setPlanningMode(defaultPlanningMode);
      setRequirePlanApproval(defaultRequirePlanApproval);

      // Initialize ancestors for spawn mode
      if (parentFeature) {
        const ancestorList = getAncestors(parentFeature, allFeatures);
        setAncestors(ancestorList);
        // Only select parent by default - ancestors are optional context
        setSelectedAncestorIds(new Set([parentFeature.id]));
      } else {
        setAncestors([]);
        setSelectedAncestorIds(new Set());
      }
    }
  }, [
    open,
    defaultSkipTests,
    defaultBranch,
    defaultPlanningMode,
    defaultRequirePlanApproval,
    defaultAIProfileId,
    aiProfiles,
    parentFeature,
    allFeatures,
    phaseModels,
  ]);

  // Fetch skills count when dialog opens
  useEffect(() => {
    if (open) {
      const fetchSkillsData = async () => {
        try {
          // Fetch skills count
          const skillsResult = await httpApi.skills.list(currentProject?.path);
          if (skillsResult.success) {
            setGlobalSkillsCount(skillsResult.global?.length || 0);
            setProjectSkillsCount(skillsResult.project?.length || 0);
          }

          // Fetch global settings for skillsAutoLoad
          const settings = await httpApi.settings.getGlobal();
          if (settings.success && settings.settings) {
            setSkillsAutoLoad(settings.settings.skillsAutoLoad ?? true);
          }
        } catch (error) {
          console.error('Failed to fetch skills data:', error);
        }
      };
      fetchSkillsData();
    }
  }, [open, currentProject?.path]);

  // Preview skills when description changes (debounced)
  useEffect(() => {
    console.log('[AddFeatureDialog] Skills preview effect triggered:', {
      open,
      description: newFeature.description,
      skillsAutoLoad,
      globalSkillsCount,
      projectSkillsCount,
    });

    if (!open || !newFeature.description.trim() || !skillsAutoLoad) {
      setMatchedSkills([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      console.log('[AddFeatureDialog] Fetching skills preview for:', newFeature.description);
      setIsLoadingSkillsPreview(true);
      try {
        const result = await httpApi.skills.preview(newFeature.description, currentProject?.path);
        console.log('[AddFeatureDialog] Skills preview result:', result);
        if (result.success && result.skills) {
          setMatchedSkills(result.skills);
        }
      } catch (error) {
        console.error('Failed to preview skills:', error);
      } finally {
        setIsLoadingSkillsPreview(false);
      }
    }, 800); // Debounce 800ms

    return () => clearTimeout(timeoutId);
  }, [newFeature.description, open, skillsAutoLoad, currentProject?.path]);

  const buildFeatureData = (): FeatureData | null => {
    if (!newFeature.description.trim()) {
      setDescriptionError(true);
      return null;
    }

    // Validate branch selection when "other branch" is selected
    if (useWorktrees && !useCurrentBranch && !newFeature.branchName.trim()) {
      toast.error('Please select a branch name');
      return null;
    }

    const category = newFeature.category || 'Uncategorized';
    const selectedModel = newFeature.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? newFeature.thinkingLevel
      : 'none';

    // Use current branch if toggle is on
    // If currentBranch is provided (non-primary worktree), use it
    // Otherwise (primary worktree), use empty string which means "unassigned" (show only on primary)
    const finalBranchName = useCurrentBranch ? currentBranch || '' : newFeature.branchName || '';

    // Build final description - prepend ancestor context in spawn mode
    let finalDescription = newFeature.description;
    if (isSpawnMode && parentFeature && selectedAncestorIds.size > 0) {
      // Create parent context as an AncestorContext
      const parentContext: AncestorContext = {
        id: parentFeature.id,
        title: parentFeature.title,
        description: parentFeature.description,
        spec: parentFeature.spec as string | undefined,
        summary: parentFeature.summary as string | undefined,
        depth: -1,
      };

      const allAncestorsWithParent = [parentContext, ...ancestors];
      const contextText = formatAncestorContextForPrompt(
        allAncestorsWithParent,
        selectedAncestorIds
      );

      if (contextText) {
        finalDescription = `${contextText}\n\n---\n\n## Task Description\n\n${newFeature.description}`;
      }
    }

    return {
      title: newFeature.title,
      category,
      description: finalDescription,
      images: newFeature.images,
      imagePaths: newFeature.imagePaths,
      textFilePaths: newFeature.textFilePaths,
      skipTests: newFeature.skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      branchName: finalBranchName,
      priority: newFeature.priority,
      planningMode,
      requirePlanApproval,
      // In spawn mode, automatically add parent as dependency
      dependencies: isSpawnMode && parentFeature ? [parentFeature.id] : undefined,
    };
  };

  const resetForm = () => {
    // Get default model from phase models for reset
    const defaultPhaseModel = phaseModels.featureGenerationModel;
    let resetModel: string = 'sonnet'; // Fallback to sonnet
    let resetThinking: ThinkingLevel = 'none';

    if (defaultPhaseModel?.model) {
      const modelString = defaultPhaseModel.model as string;
      const provider = getModelProvider(modelString);
      resetModel = addProviderPrefix(modelString, provider);
      resetThinking = defaultPhaseModel.thinkingLevel ?? 'none';
    }

    setNewFeature({
      title: '',
      category: '',
      description: '',
      images: [],
      imagePaths: [],
      textFilePaths: [],
      skipTests: defaultSkipTests,
      model: resetModel as ModelAlias,
      priority: 2,
      thinkingLevel: resetThinking,
      branchName: '',
    });
    setUseCurrentBranch(true);
    setPlanningMode(defaultPlanningMode);
    setRequirePlanApproval(defaultRequirePlanApproval);
    setNewFeaturePreviewMap(new Map());
    setShowAdvancedOptions(false);
    setDescriptionError(false);
    onOpenChange(false);
  };

  const handleAction = (actionFn?: (data: FeatureData) => void) => {
    if (!actionFn) return;

    const featureData = buildFeatureData();
    if (!featureData) return;

    actionFn(featureData);
    resetForm();
  };

  const handleAdd = () => handleAction(onAdd);

  const handleAddAndStart = () => handleAction(onAddAndStart);

  const handleDialogClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setNewFeaturePreviewMap(new Map());
      setShowAdvancedOptions(false);
      setDescriptionError(false);
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
    if (!newFeature.description.trim() || isEnhancing) return;

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
        newFeature.description,
        enhancementMode,
        enhancementOverride.effectiveModel // API accepts string, extract from PhaseModelEntry
      );

      // Clear timeout if successful
      if (enhancementTimeoutRef.current) {
        clearTimeout(enhancementTimeoutRef.current);
        enhancementTimeoutRef.current = null;
      }

      if (result?.success && result.enhancedText) {
        const enhancedText = result.enhancedText;
        setNewFeature((prev) => ({ ...prev, description: enhancedText }));
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

  const handleModelSelect = (model: string) => {
    // For Cursor models, thinking is handled by the model itself
    // For Claude models, check if it supports extended thinking
    const isCursor = isCursorModel(model);
    setNewFeature({
      ...newFeature,
      model: model as ModelAlias,
      thinkingLevel: isCursor
        ? 'none'
        : modelSupportsThinking(model)
          ? newFeature.thinkingLevel
          : 'none',
    });
  };

  const handleProfileSelect = (profile: AIProfile) => {
    if (profile.provider === 'cursor') {
      // Cursor profile - set cursor model
      const cursorModel = `${PROVIDER_PREFIXES.cursor}${profile.cursorModel || 'auto'}`;
      setNewFeature({
        ...newFeature,
        model: cursorModel as ModelAlias,
        thinkingLevel: 'none', // Cursor handles thinking internally
      });
    } else {
      // Claude profile
      setNewFeature({
        ...newFeature,
        model: profile.model || 'sonnet',
        thinkingLevel: profile.thinkingLevel || 'none',
      });
    }
  };

  // Cursor models handle thinking internally, so only show thinking selector for Claude models
  const isCurrentModelCursor = isCursorModel(newFeature.model);
  const newModelAllowsThinking =
    !isCurrentModelCursor && modelSupportsThinking(newFeature.model || 'sonnet');

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="add-feature-dialog"
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
          <DialogTitle>{isSpawnMode ? 'Spawn Sub-Task' : 'Add New Feature'}</DialogTitle>
          <DialogDescription>
            {isSpawnMode
              ? `Create a sub-task that depends on "${parentFeature?.title || parentFeature?.description.slice(0, 50)}..."`
              : 'Create a new feature card for the Kanban board.'}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="prompt" className="py-4 flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="prompt" data-testid="tab-prompt">
              <MessageSquare className="w-4 h-4 mr-2" />
              Prompt
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="tab-model">
              <Settings2 className="w-4 h-4 mr-2" />
              Model
            </TabsTrigger>
            <TabsTrigger value="options" data-testid="tab-options">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Options
            </TabsTrigger>
            <TabsTrigger value="resources" data-testid="tab-resources">
              <FileText className="w-4 h-4 mr-2" />
              Resources
            </TabsTrigger>
          </TabsList>

          {/* Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4 overflow-y-auto cursor-default">
            {/* Ancestor Context Section - only in spawn mode */}
            {isSpawnMode && parentFeature && (
              <AncestorContextSection
                parentFeature={{
                  id: parentFeature.id,
                  title: parentFeature.title,
                  description: parentFeature.description,
                  spec: parentFeature.spec as string | undefined,
                  summary: parentFeature.summary as string | undefined,
                }}
                ancestors={ancestors}
                selectedAncestorIds={selectedAncestorIds}
                onSelectionChange={setSelectedAncestorIds}
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <DescriptionImageDropZone
                value={newFeature.description}
                onChange={(value) => {
                  setNewFeature({ ...newFeature, description: value });
                  if (value.trim()) {
                    setDescriptionError(false);
                  }
                }}
                images={newFeature.imagePaths}
                onImagesChange={(images) => setNewFeature({ ...newFeature, imagePaths: images })}
                textFiles={newFeature.textFilePaths}
                onTextFilesChange={(textFiles) =>
                  setNewFeature({ ...newFeature, textFilePaths: textFiles })
                }
                placeholder="Describe the feature..."
                previewMap={newFeaturePreviewMap}
                onPreviewMapChange={setNewFeaturePreviewMap}
                autoFocus
                error={descriptionError}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={newFeature.title}
                onChange={(e) => setNewFeature({ ...newFeature, title: e.target.value })}
                placeholder="Leave blank to auto-generate"
              />
            </div>
            <div className="flex w-fit items-center gap-3 select-none cursor-default">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-between">
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
                  disabled={!newFeature.description.trim()}
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
              <Label htmlFor="category">Category (optional)</Label>
              <CategoryAutocomplete
                value={newFeature.category}
                onChange={(value) => setNewFeature({ ...newFeature, category: value })}
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="feature-category-input"
              />
            </div>
            {useWorktrees && (
              <BranchSelector
                useCurrentBranch={useCurrentBranch}
                onUseCurrentBranchChange={setUseCurrentBranch}
                branchName={newFeature.branchName}
                onBranchNameChange={(value) => setNewFeature({ ...newFeature, branchName: value })}
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                testIdPrefix="feature"
              />
            )}

            {/* Priority Selector */}
            <PrioritySelector
              selectedPriority={newFeature.priority}
              onPrioritySelect={(priority) => setNewFeature({ ...newFeature, priority })}
              testIdPrefix="priority"
            />

            {/* Skills Info */}
            <SkillsInfo
              enabled={skillsAutoLoad}
              globalSkillsCount={globalSkillsCount}
              projectSkillsCount={projectSkillsCount}
              matchedSkills={matchedSkills}
              isLoadingPreview={isLoadingSkillsPreview}
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
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  data-testid="show-advanced-options-toggle"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  {showAdvancedOptions ? 'Hide' : 'Show'} Advanced
                </Button>
              </div>
            )}

            {/* Quick Select Profile Section */}
            <ProfileQuickSelect
              profiles={aiProfiles}
              selectedModel={newFeature.model}
              selectedThinkingLevel={newFeature.thinkingLevel}
              selectedCursorModel={isCurrentModelCursor ? newFeature.model : undefined}
              onSelect={handleProfileSelect}
              showManageLink
              onManageLinkClick={() => {
                onOpenChange(false);
                navigate({ to: '/profiles' });
              }}
            />

            {/* Separator */}
            {aiProfiles.length > 0 && (!showProfilesOnly || showAdvancedOptions) && (
              <div className="border-t border-border" />
            )}

            {/* Claude Models Section */}
            {(!showProfilesOnly || showAdvancedOptions) && (
              <>
                <ModelSelector selectedModel={newFeature.model} onModelSelect={handleModelSelect} />
                {newModelAllowsThinking && (
                  <ThinkingLevelSelector
                    selectedLevel={newFeature.thinkingLevel}
                    onLevelSelect={(level) =>
                      setNewFeature({ ...newFeature, thinkingLevel: level })
                    }
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
              featureDescription={newFeature.description}
              testIdPrefix="add-feature"
              compact
            />

            <div className="border-t border-border my-4" />

            {/* Testing Section */}
            <TestingTabContent
              skipTests={newFeature.skipTests}
              onSkipTestsChange={(skipTests) => setNewFeature({ ...newFeature, skipTests })}
            />
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-4 overflow-y-auto cursor-default">
            {/* Wiki Pages */}
            <div>
              {hasWikiConfig ? (
                <WikiBrowser
                  organization={wikiOrganization}
                  project={wikiProject}
                  wikiId={wikiId}
                  resetKey={open ? 'add-feature-dialog' : undefined}
                  initialSelectedPages={[
                    ...(defaultWikiPages || []),
                    ...(newFeature.textFilePaths || []),
                  ]}
                  lockedPages={defaultWikiPages || []}
                  onSelectionChange={(pages) => {
                    setNewFeature({
                      ...newFeature,
                      textFilePaths: pages.map((page) => {
                        // Try to preserve existing ID if this page was already attached
                        const existingFile = newFeature.textFilePaths?.find(
                          (f) => f.path === page.url
                        );
                        return {
                          id: existingFile?.id || `wiki-${page.id}-${Date.now()}`,
                          path: page.url,
                          filename: page.name,
                          mimeType: 'text/markdown',
                          content: page.content,
                        };
                      }),
                    });
                  }}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Wiki not configured</p>
                  <p className="text-xs mt-1">
                    Go to Settings → DevOps Resources to configure your wiki
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {onAddAndStart && (
            <Button
              onClick={handleAddAndStart}
              variant="secondary"
              data-testid="confirm-add-and-start-feature"
              disabled={useWorktrees && !useCurrentBranch && !newFeature.branchName.trim()}
            >
              <Play className="w-4 h-4 mr-2" />
              Make
            </Button>
          )}
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-add-feature"
            disabled={useWorktrees && !useCurrentBranch && !newFeature.branchName.trim()}
          >
            {isSpawnMode ? 'Spawn Task' : 'Add Feature'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
