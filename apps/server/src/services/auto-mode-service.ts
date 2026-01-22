/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import { ProviderFactory } from '../providers/provider-factory.js';
import { PlanningFilesService } from './planning-files-service.js';
import type {
  ExecuteOptions,
  Feature,
  ModelProvider,
  PipelineConfig,
  PipelineStep,
  ThinkingLevel,
  PlanningMode,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';
import {
  buildPromptWithImages,
  isAbortError,
  classifyError,
  loadContextFiles,
  createLogger,
} from '@automaker/utils';

const logger = createLogger('AutoMode');
import { resolveModelString, resolvePhaseModel, DEFAULT_MODELS } from '@automaker/model-resolver';
import { resolveDependencies, areDependenciesSatisfied } from '@automaker/dependency-resolver';
import { getFeatureDir, getAutomakerDir, getFeaturesDir } from '@automaker/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import {
  createAutoModeOptions,
  createCustomOptions,
  validateWorkingDirectory,
} from '../lib/sdk-options.js';
import { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { WikiService } from './wiki-service.js';
import mammoth from 'mammoth';
import { pipelineService, PipelineService } from './pipeline-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getEnableSandboxModeSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getPromptCustomization,
} from '../lib/settings-helpers.js';
import { getUsageTrackingService } from './usage-tracking-service.js';

const execAsync = promisify(exec);

// PlanningMode type is imported from @automaker/types

interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string;
  version: number;
  generatedAt?: string;
  approvedAt?: string;
  reviewedByUser: boolean;
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string;
  tasks?: ParsedTask[];
}

/**
 * Parse tasks from generated spec content
 * Looks for the ```tasks code block and extracts task lines
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTasksFromSpec(specContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Extract content within ```tasks ... ``` block
  const tasksBlockMatch = specContent.match(/```tasks\s*([\s\S]*?)```/);
  if (!tasksBlockMatch) {
    // Try fallback: look for task lines anywhere in content
    const taskLines = specContent.match(/- \[ \] T\d{3}:.*$/gm);
    if (!taskLines) {
      return tasks;
    }
    // Parse fallback task lines
    let currentPhase: string | undefined;
    for (const line of taskLines) {
      const parsed = parseTaskLine(line, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
    return tasks;
  }

  const tasksContent = tasksBlockMatch[1];
  const lines = tasksContent.split('\n');

  let currentPhase: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for phase header (e.g., "## Phase 1: Foundation")
    const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Check for task line
    if (trimmedLine.startsWith('- [ ]')) {
      const parsed = parseTaskLine(trimmedLine, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
  }

  return tasks;
}

/**
 * Parse a single task line
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
  // Match pattern: - [ ] T###: Description | File: path
  const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
  if (!taskMatch) {
    // Try simpler pattern without file
    const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
    if (simpleMatch) {
      return {
        id: simpleMatch[1],
        description: simpleMatch[2].trim(),
        phase: currentPhase,
        status: 'pending',
      };
    }
    return null;
  }

  return {
    id: taskMatch[1],
    description: taskMatch[2].trim(),
    filePath: taskMatch[3]?.trim(),
    phase: currentPhase,
    status: 'pending',
  };
}

// Feature type is imported from feature-loader.js
// Extended type with planning fields for local use
interface FeatureWithPlanning extends Feature {
  planningMode?: PlanningMode;
  planSpec?: PlanSpec;
  requirePlanApproval?: boolean;
}

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
  model?: string;
  provider?: ModelProvider;
}

interface AutoLoopState {
  projectPath: string;
  maxConcurrency: number;
  abortController: AbortController;
  isRunning: boolean;
}

interface PendingApproval {
  resolve: (result: { approved: boolean; editedPlan?: string; feedback?: string }) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
}

// Constants for consecutive failure tracking
const CONSECUTIVE_FAILURE_THRESHOLD = 3; // Pause after 3 consecutive failures
const FAILURE_WINDOW_MS = 60000; // Failures within 1 minute count as consecutive

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoop: AutoLoopState | null = null;
  private featureLoader = new FeatureLoader();
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  private settingsService: SettingsService | null = null;
  private dataDir: string;
  private wikiService: WikiService;
  private planningFilesService: PlanningFilesService;
  // Track consecutive failures to detect quota/API issues
  private consecutiveFailures: { timestamp: number; error: string }[] = [];
  private pausedDueToFailures = false;

  constructor(events: EventEmitter, dataDir: string, settingsService?: SettingsService) {
    this.events = events;
    this.dataDir = dataDir;
    this.settingsService = settingsService ?? null;
    this.wikiService = new WikiService(dataDir);
    this.planningFilesService = new PlanningFilesService(events);
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures.
   * This handles cases where the SDK doesn't return useful error messages.
   */
  private trackFailureAndCheckPause(errorInfo: { type: string; message: string }): boolean {
    const now = Date.now();

    // Add this failure
    this.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    this.consecutiveFailures = this.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (this.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      return true; // Should pause
    }

    // Also immediately pause for known quota/rate limit errors
    if (errorInfo.type === 'quota_exhausted' || errorInfo.type === 'rate_limit') {
      return true;
    }

    return false;
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion.
   * This will pause the auto loop to prevent repeated failures.
   */
  private signalShouldPause(errorInfo: { type: string; message: string }): void {
    if (this.pausedDueToFailures) {
      return; // Already paused
    }

    this.pausedDueToFailures = true;
    const failureCount = this.consecutiveFailures.length;
    logger.info(
      `Pausing auto loop after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    this.emitAutoModeEvent('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. This may indicate a quota limit or API issue. Please check your usage and try again.`
          : 'Auto Mode paused: Usage limit or API error detected. Please wait for your quota to reset or check your API configuration.',
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath: this.config?.projectPath,
    });

    // Stop the auto loop
    this.stopAutoLoop();
  }

  /**
   * Reset failure tracking (called when user manually restarts auto mode)
   */
  private resetFailureTracking(): void {
    this.consecutiveFailures = [];
    this.pausedDueToFailures = false;
  }

  /**
   * Record a successful feature completion to reset consecutive failure count
   */
  private recordSuccess(): void {
    this.consecutiveFailures = [];
  }

  /**
   * Start the auto mode loop - continuously picks and executes pending features
   */
  async startAutoLoop(projectPath: string, maxConcurrency = 3): Promise<void> {
    if (this.autoLoopRunning) {
      throw new Error('Auto mode is already running');
    }

    // Reset failure tracking when user manually starts auto mode
    this.resetFailureTracking();

    this.autoLoopRunning = true;
    this.autoLoopAbortController = new AbortController();
    this.config = {
      maxConcurrency,
      useWorktrees: true,
      projectPath,
    };

    this.emitAutoModeEvent('auto_mode_started', {
      message: `Auto mode started with max ${maxConcurrency} concurrent features`,
      projectPath,
    });

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      logger.error('Loop error:', error);
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        error: errorInfo.message,
        errorType: errorInfo.type,
      });
    });
  }

  private async runAutoLoop(): Promise<void> {
    while (
      this.autoLoopRunning &&
      this.autoLoopAbortController &&
      !this.autoLoopAbortController.signal.aborted
    ) {
      try {
        // Check if we have capacity
        if (this.runningFeatures.size >= (this.config?.maxConcurrency || 3)) {
          await this.sleep(5000);
          continue;
        }

        // Load pending features
        const pendingFeatures = await this.loadPendingFeatures(this.config!.projectPath);

        if (pendingFeatures.length === 0) {
          this.emitAutoModeEvent('auto_mode_idle', {
            message: 'No pending features - auto mode idle',
            projectPath: this.config!.projectPath,
          });
          await this.sleep(10000);
          continue;
        }

        // Find a feature not currently running
        const nextFeature = pendingFeatures.find((f) => !this.runningFeatures.has(f.id));

        if (nextFeature) {
          // Start feature execution in background
          this.executeFeature(
            this.config!.projectPath,
            nextFeature.id,
            this.config!.useWorktrees,
            true
          ).catch((error) => {
            logger.error(`Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        logger.error('Loop iteration error:', error);
        await this.sleep(5000);
      }
    }

    this.autoLoopRunning = false;
  }

  /**
   * Stop the auto mode loop
   */
  async stopAutoLoop(): Promise<number> {
    const wasRunning = this.autoLoopRunning;
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Emit stop event immediately when user explicitly stops
    if (wasRunning) {
      this.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath: this.config?.projectPath,
      });
    }

    return this.runningFeatures.size;
  }

  /**
   * Execute a single feature
   * @param projectPath - The main project path
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: {
      continuationPrompt?: string;
    }
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error('already running');
    }

    // Add to running features immediately to prevent race conditions
    const abortController = new AbortController();
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null,
      abortController,
      isAutoMode,
      startTime: Date.now(),
    };
    this.runningFeatures.set(featureId, tempRunningFeature);

    try {
      // Validate that project path is allowed using centralized validation
      validateWorkingDirectory(projectPath);

      // Check if feature has existing context - if so, resume instead of starting fresh
      // Skip this check if we're already being called with a continuation prompt (from resumeFeature)
      if (!options?.continuationPrompt) {
        const hasExistingContext = await this.contextExists(projectPath, featureId);
        if (hasExistingContext) {
          logger.info(
            `Feature ${featureId} has existing context, resuming instead of starting fresh`
          );
          // Remove from running features temporarily, resumeFeature will add it back
          this.runningFeatures.delete(featureId);
          return this.resumeFeature(projectPath, featureId, useWorktrees);
        }
      }

      // Emit feature start event early
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        feature: {
          id: featureId,
          title: 'Loading...',
          description: 'Feature is starting',
        },
      });
      // Load feature details FIRST to get branchName
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Derive workDir from feature.branchName
      // Worktrees should already be created when the feature is added/edited
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        // Try to find existing worktree for this branch
        // Worktree should already exist (created when feature was added/edited)
        worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

        if (worktreePath) {
          logger.info(`Using worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          // Worktree doesn't exist - log warning and continue with project path
          logger.warn(`Worktree for branch "${branchName}" not found, using project path`);
        }
      }

      // Ensure workDir is always an absolute path for cross-platform compatibility
      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // Validate that working directory is allowed using centralized validation
      validateWorkingDirectory(workDir);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;
      tempRunningFeature.branchName = branchName ?? null;

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Load autoLoadClaudeMd setting to determine context loading strategy
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Build the prompt - use continuation prompt if provided (for recovery after plan approval)
      let prompt: string;
      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        // Continuation prompt is used when recovering from a plan approval
        // The plan was already approved, so skip the planning phase
        prompt = options.continuationPrompt;
        logger.info(`Using continuation prompt for feature ${featureId}`);
      } else {
        // Normal flow: build prompt with planning phase
        const featurePrompt = await this.buildFeaturePrompt(feature);
        const planningPrefix = await this.getPlanningPromptPrefix(feature);
        prompt = planningPrefix + featurePrompt;

        // Initialize planning files for persistent mode
        if (feature.planningMode && feature.planningMode === 'persistent') {
          try {
            await this.planningFilesService.initializePlanningFiles(
              projectPath,
              featureId,
              feature.title || 'Untitled Feature',
              feature.description || ''
            );
            logger.info(`Initialized planning files for feature ${featureId} in persistent mode`);
          } catch (error) {
            logger.error(`Failed to initialize planning files:`, error);
            // Don't fail the feature execution, just log the error
          }
        }

        // Emit planning mode info
        if (feature.planningMode && feature.planningMode !== 'skip') {
          this.emitAutoModeEvent('planning_started', {
            featureId: feature.id,
            mode: feature.planningMode,
            message: `Starting ${feature.planningMode} planning phase`,
          });
        }
      }

      // Note: feature.imagePaths contains ALL binary files, but we only pass actual images to buildPromptWithImages
      // Documents are already extracted and included in the text prompt by buildFeaturePrompt
      const imagePaths = feature.imagePaths
        ?.filter((img) => {
          const mimeType = typeof img === 'string' ? '' : (img.mimeType as string) || '';
          return mimeType.startsWith('image/');
        })
        .map((img) => (typeof img === 'string' ? img : (img.path as string)));

      // Get model from feature and determine provider
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      const provider = ProviderFactory.getProviderNameForModel(model);
      logger.info(
        `Executing feature ${featureId} with model: ${model}, provider: ${provider} in ${workDir}`
      );

      // Store model and provider in running feature for tracking
      tempRunningFeature.model = model;
      tempRunningFeature.provider = provider;

      // Log context details before sending to agent
      logger.info(`\n${'='.repeat(80)}`);
      logger.info(`CONTEXT SENT TO AGENT - Feature ${featureId}`);
      logger.info(`Model: ${model}, Provider: ${provider}`);
      logger.info(`Prompt length: ${prompt.length} characters`);
      logger.info(`Image files: ${imagePaths?.length || 0}`);
      if (imagePaths && imagePaths.length > 0) {
        logger.info(`  Images: ${imagePaths.map((p) => path.basename(p)).join(', ')}`);
      }
      logger.info(`Context files: ${contextFilesPrompt ? 'Yes' : 'No'}`);
      logger.info(`First 500 chars of prompt:\n${prompt.substring(0, 500)}...`);
      logger.info(`${'='.repeat(80)}\n`);

      // Run the agent with the feature's model and images
      // Context files are passed as system prompt for higher priority
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        model,
        {
          projectPath,
          planningMode: feature.planningMode,
          requirePlanApproval: feature.requirePlanApproval,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
        }
      );

      // Check for pipeline steps and execute them
      const pipelineConfig = await pipelineService.getPipelineConfig(projectPath);
      const sortedSteps = [...(pipelineConfig?.steps || [])].sort((a, b) => a.order - b.order);

      if (sortedSteps.length > 0) {
        // Execute pipeline steps sequentially
        await this.executePipelineSteps(
          projectPath,
          featureId,
          feature,
          sortedSteps,
          workDir,
          abortController,
          autoLoadClaudeMd
        );
      }

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): check test results, verify only if tests passed
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      let finalStatus: 'waiting_approval' | 'verified' = 'waiting_approval';

      if (!feature.skipTests) {
        // Automated testing mode - read agent output and check if tests passed
        const featureDir = getFeatureDir(projectPath, featureId);
        const outputPath = path.join(featureDir, 'agent-output.md');

        try {
          const agentOutput = await secureFs.readFile(outputPath, 'utf-8');
          const testsPassed = this.checkTestResults(agentOutput.toString());
          finalStatus = testsPassed ? 'verified' : 'waiting_approval';

          if (!testsPassed) {
            logger.warn(`Tests failed for feature ${featureId}, requiring manual verification`);
          }
        } catch (error) {
          logger.error(`Failed to read agent output for test validation:`, error);
          // If we can't read output, require manual verification
          finalStatus = 'waiting_approval';
        }
      }

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccess();

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round(
          (Date.now() - tempRunningFeature.startTime) / 1000
        )}s${finalStatus === 'verified' ? ' - auto-verified (tests passed)' : finalStatus === 'waiting_approval' && !feature.skipTests ? ' - tests failed, needs verification' : ''}`,
        projectPath,
        model: tempRunningFeature.model,
        provider: tempRunningFeature.provider,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          passes: false,
          message: 'Feature stopped by user',
          projectPath,
        });
      } else {
        logger.error(`Feature ${featureId} failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, 'backlog');
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });

        // Track this failure and check if we should pause auto mode
        // This handles both specific quota/rate limit errors AND generic failures
        // that may indicate quota exhaustion (SDK doesn't always return useful errors)
        const shouldPause = this.trackFailureAndCheckPause({
          type: errorInfo.type,
          message: errorInfo.message,
        });

        if (shouldPause) {
          this.signalShouldPause({
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      logger.info(`Feature ${featureId} execution ended, cleaning up runningFeatures`);
      logger.info(
        `Pending approvals at cleanup: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
      );
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Execute pipeline steps sequentially after initial feature implementation
   */
  private async executePipelineSteps(
    projectPath: string,
    featureId: string,
    feature: Feature,
    steps: PipelineStep[],
    workDir: string,
    abortController: AbortController,
    autoLoadClaudeMd: boolean
  ): Promise<void> {
    logger.info(`Executing ${steps.length} pipeline step(s) for feature ${featureId}`);

    // Load context files once
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
    });
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Load previous agent output for context continuity
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const pipelineStatus = `pipeline_${step.id}`;

      // Update feature status to current pipeline step
      await this.updateFeatureStatus(projectPath, featureId, pipelineStatus);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: `Starting pipeline step ${i + 1}/${steps.length}: ${step.name}`,
        projectPath,
      });

      this.emitAutoModeEvent('pipeline_step_started', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      // Build prompt for this pipeline step
      const prompt = await this.buildPipelineStepPrompt(step, feature, previousContext);

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);

      // Run the agent for this pipeline step
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        undefined, // no images for pipeline steps
        model,
        {
          projectPath,
          planningMode: 'skip', // Pipeline steps don't need planning
          requirePlanApproval: false,
          previousContent: previousContext,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
        }
      );

      // Load updated context for next step
      try {
        previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      } catch {
        // No context update
      }

      this.emitAutoModeEvent('pipeline_step_complete', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      logger.info(
        `Pipeline step ${i + 1}/${steps.length} (${step.name}) completed for feature ${featureId}`
      );
    }

    logger.info(`All pipeline steps completed for feature ${featureId}`);
  }

  /**
   * Build the prompt for a pipeline step
   */
  private async buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string
  ): Promise<string> {
    let prompt = `## Pipeline Step: ${step.name}

This is an automated pipeline step following the initial feature implementation.

### Feature Context
${await this.buildFeaturePrompt(feature)}

`;

    if (previousContext) {
      prompt += `### Previous Work
The following is the output from the previous work on this feature:

${previousContext}

`;
    }

    prompt += `### Pipeline Step Instructions
${step.instructions}

### Task
Complete the pipeline step instructions above. Review the previous work and apply the required changes or actions.`;

    return prompt;
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    // Cancel any pending plan approval for this feature
    this.cancelPlanApproval(featureId);

    running.abortController.abort();

    // Remove from running features immediately to allow resume
    // The abort signal will still propagate to stop any ongoing execution
    this.runningFeatures.delete(featureId);

    return true;
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(projectPath: string, featureId: string, useWorktrees = false): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error('already running');
    }

    // Check for stale planning files in persistent mode
    try {
      const feature = await this.loadFeature(projectPath, featureId);
      if (feature && feature.planningMode === 'persistent') {
        const staleInfo = await this.planningFilesService.detectStaleFiles(projectPath, featureId);

        if (staleInfo.isStale && staleInfo.lastUpdate) {
          const ageMs = Date.now() - staleInfo.lastUpdate.getTime();
          const hours = Math.round(ageMs / 3600000);
          logger.warn(`Stale planning files detected for feature ${featureId} (${hours}h old)`);
          // Note: Could emit event here to notify UI if needed
        }
      }
    } catch (err) {
      // Don't fail resume if planning file check fails
      logger.debug('Could not check planning file staleness:', err);
    }

    // Check if context exists in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      return this.executeFeatureWithContext(projectPath, featureId, context, useWorktrees);
    }

    // No context, start fresh - executeFeature will handle adding to runningFeatures
    // Remove the temporary entry we added
    this.runningFeatures.delete(featureId);
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    // Validate project path early for fast failure
    validateWorkingDirectory(projectPath);

    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Load feature info for context FIRST to get branchName
    const feature = await this.loadFeature(projectPath, featureId);

    // Derive workDir from feature.branchName
    // If no branchName, derive from feature ID: feature/{featureId}
    let workDir = path.resolve(projectPath);
    let worktreePath: string | null = null;
    const branchName = feature?.branchName || `feature/${featureId}`;

    if (useWorktrees && branchName) {
      // Try to find existing worktree for this branch
      worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

      if (worktreePath) {
        workDir = worktreePath;
        logger.info(`Follow-up using worktree for branch "${branchName}": ${workDir}`);
      }
    }

    // Load previous agent output if it exists
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    // Load autoLoadClaudeMd setting to determine context loading strategy
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      this.settingsService,
      '[AutoMode]'
    );

    // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
    });

    // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
    // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? await this.buildFeaturePrompt(feature) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    // Get model from feature and determine provider early for tracking
    const model = resolveModelString(feature?.model, DEFAULT_MODELS.claude);
    const provider = ProviderFactory.getProviderNameForModel(model);
    logger.info(`Follow-up for feature ${featureId} using model: ${model}, provider: ${provider}`);

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
      model,
      provider,
    });

    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId,
      projectPath,
      feature: feature || {
        id: featureId,
        title: 'Follow-up',
        description: prompt.substring(0, 100),
      },
      model,
      provider,
    });

    try {
      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Copy follow-up images to feature folder
      const copiedImagePaths: string[] = [];
      if (imagePaths && imagePaths.length > 0) {
        const featureDirForImages = getFeatureDir(projectPath, featureId);
        const featureImagesDir = path.join(featureDirForImages, 'images');

        await secureFs.mkdir(featureImagesDir, { recursive: true });

        for (const imagePath of imagePaths) {
          try {
            // Get the filename from the path
            const filename = path.basename(imagePath);
            const destPath = path.join(featureImagesDir, filename);

            // Copy the image
            await secureFs.copyFile(imagePath, destPath);

            // Store the absolute path (external storage uses absolute paths)
            copiedImagePaths.push(destPath);
          } catch (error) {
            logger.error(`Failed to copy follow-up image ${imagePath}:`, error);
          }
        }
      }

      // Update feature object with new follow-up images BEFORE building prompt
      if (copiedImagePaths.length > 0 && feature) {
        const currentImagePaths = feature.imagePaths || [];
        const newImagePaths = copiedImagePaths.map((p) => ({
          path: p,
          filename: path.basename(p),
          mimeType: 'image/png', // Default, could be improved
        }));

        feature.imagePaths = [...currentImagePaths, ...newImagePaths];
      }

      // Combine original feature images with new follow-up images
      const allImagePaths: string[] = [];

      // Add all images from feature (now includes both original and new)
      if (feature?.imagePaths) {
        const allPaths = feature.imagePaths.map((img) =>
          typeof img === 'string' ? img : img.path
        );
        allImagePaths.push(...allPaths);
      }

      // Save updated feature.json with new images
      if (copiedImagePaths.length > 0 && feature) {
        const featureDirForSave = getFeatureDir(projectPath, featureId);
        const featurePath = path.join(featureDirForSave, 'feature.json');

        try {
          await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
        } catch (error) {
          logger.error(`Failed to save feature.json:`, error);
        }
      }

      // Use fullPrompt (already built above) with model and all images
      // Note: Follow-ups skip planning mode - they continue from previous work
      // Pass previousContext so the history is preserved in the output file
      // Context files are passed as system prompt for higher priority
      await this.runAgent(
        workDir,
        featureId,
        fullPrompt,
        abortController,
        projectPath,
        allImagePaths.length > 0 ? allImagePaths : imagePaths,
        model,
        {
          projectPath,
          planningMode: 'skip', // Follow-ups don't require approval
          previousContent: previousContext || undefined,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature?.thinkingLevel,
        }
      );

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): check test results, verify only if tests passed
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      let finalStatus: 'waiting_approval' | 'verified' = 'waiting_approval';

      if (!feature?.skipTests) {
        // Automated testing mode - read agent output and check if tests passed
        const featureDir = getFeatureDir(projectPath, featureId);
        const outputPath = path.join(featureDir, 'agent-output.md');

        try {
          const agentOutput = await secureFs.readFile(outputPath, 'utf-8');
          const testsPassed = this.checkTestResults(agentOutput.toString());
          finalStatus = testsPassed ? 'verified' : 'waiting_approval';

          if (!testsPassed) {
            logger.warn(`Tests failed for feature ${featureId}, requiring manual verification`);
          }
        } catch (error) {
          logger.error(`Failed to read agent output for test validation:`, error);
          // If we can't read output, require manual verification
          finalStatus = 'waiting_approval';
        }
      }

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccess();

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Follow-up completed successfully${finalStatus === 'verified' ? ' - auto-verified (tests passed)' : finalStatus === 'waiting_approval' && !feature?.skipTests ? ' - tests failed, needs verification' : ''}`,
        projectPath,
        model,
        provider,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      if (!errorInfo.isCancellation) {
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });

        // Track this failure and check if we should pause auto mode
        const shouldPause = this.trackFailureAndCheckPause({
          type: errorInfo.type,
          message: errorInfo.message,
        });

        if (shouldPause) {
          this.signalShouldPause({
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {
    // Worktrees are in project dir
    const worktreePath = path.join(projectPath, '.worktrees', featureId);
    let workDir = projectPath;

    try {
      await secureFs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: 'npm run lint', name: 'Lint' },
      { cmd: 'npm run typecheck', name: 'Type check' },
      { cmd: 'npm test', name: 'Tests' },
      { cmd: 'npm run build', name: 'Build' },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> = [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({
          check: check.name,
          passed: true,
          output: stdout || stderr,
        });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent('auto_mode_feature_complete', {
      featureId,
      passes: allPassed,
      message: allPassed
        ? 'All verification checks passed'
        : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   * @param projectPath - The main project path
   * @param featureId - The feature ID to commit
   * @param providedWorktreePath - Optional: the worktree path where the feature's changes are located
   */
  async commitFeature(
    projectPath: string,
    featureId: string,
    providedWorktreePath?: string
  ): Promise<string | null> {
    let workDir = projectPath;

    // Use the provided worktree path if given
    if (providedWorktreePath) {
      try {
        await secureFs.access(providedWorktreePath);
        workDir = providedWorktreePath;
        logger.info(`Committing in provided worktree: ${workDir}`);
      } catch {
        logger.info(
          `Provided worktree path doesn't exist: ${providedWorktreePath}, using project path`
        );
      }
    } else {
      // Fallback: try to find worktree at legacy location
      const legacyWorktreePath = path.join(projectPath, '.worktrees', featureId);
      try {
        await secureFs.access(legacyWorktreePath);
        workDir = legacyWorktreePath;
        logger.info(`Committing in legacy worktree: ${workDir}`);
      } catch {
        logger.info(`No worktree found, committing in project path: ${workDir}`);
      }
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
      });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${this.extractTitleFromDescription(
            feature.description
          )}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync('git add -A', { cwd: workDir });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', {
        cwd: workDir,
      });

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
      });

      return hash.trim();
    } catch (error) {
      logger.error(`Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature
   */
  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    // Context is stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    try {
      await secureFs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId: analysisFeatureId,
      projectPath,
      feature: {
        id: analysisFeatureId,
        title: 'Project Analysis',
        description: 'Analyzing project structure',
      },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      // Get model from phase settings
      const settings = await this.settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.projectAnalysisModel || DEFAULT_PHASE_MODELS.projectAnalysisModel;
      const { model: analysisModel, thinkingLevel: analysisThinkingLevel } =
        resolvePhaseModel(phaseModelEntry);
      logger.info('Using model for project analysis:', analysisModel);

      // For custom agents (Copilot, Local LLM), enable agenticMode for full codebase access
      const isCustomAgent =
        analysisModel.startsWith('copilot-') || analysisModel.startsWith('local-llm-');
      const provider = isCustomAgent
        ? ProviderFactory.getProviderForModel(analysisModel, {
            agenticMode: true,
            projectRoot: projectPath,
          })
        : ProviderFactory.getProviderForModel(analysisModel);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Use createCustomOptions for centralized SDK configuration with CLAUDE.md support
      const sdkOptions = createCustomOptions({
        cwd: projectPath,
        model: analysisModel,
        maxTurns: 5,
        allowedTools: ['Read', 'Glob', 'Grep'],
        abortController,
        autoLoadClaudeMd,
        thinkingLevel: analysisThinkingLevel,
      });

      const options: ExecuteOptions = {
        prompt,
        model: sdkOptions.model ?? analysisModel,
        cwd: sdkOptions.cwd ?? projectPath,
        maxTurns: sdkOptions.maxTurns,
        allowedTools: sdkOptions.allowedTools as string[],
        abortController,
        settingSources: sdkOptions.settingSources,
        sandbox: sdkOptions.sandbox, // Pass sandbox configuration
        thinkingLevel: analysisThinkingLevel, // Pass thinking level
      };

      const stream = provider.executeQuery(options);
      let analysisResult = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              analysisResult = block.text || '';
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          // Capture usage from result message
          if (msg.usage) {
            inputTokens += msg.usage.inputTokens || 0;
            outputTokens += msg.usage.outputTokens || 0;
          }
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis to .automaker directory
      const automakerDir = getAutomakerDir(projectPath);
      const analysisPath = path.join(automakerDir, 'project-analysis.md');
      await secureFs.mkdir(automakerDir, { recursive: true });
      await secureFs.writeFile(analysisPath, analysisResult);

      // Log usage statistics for cost tracking
      if (inputTokens > 0 || outputTokens > 0) {
        try {
          logger.info(
            `Analysis ${analysisFeatureId} consumed ${inputTokens} input + ${outputTokens} output tokens, logging usage...`
          );
          const usageService = getUsageTrackingService();
          await usageService.logUsage({
            provider: ProviderFactory.getProviderNameForModel(analysisModel),
            model: analysisModel,
            projectPath,
            sessionId: analysisFeatureId,
            contextType: 'planning',
            tokens: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          });
          logger.info(
            `Logged usage for analysis ${analysisFeatureId}: ${inputTokens} input, ${outputTokens} output tokens`
          );
        } catch (error) {
          logger.error(`Failed to log usage for analysis ${analysisFeatureId}:`, error);
        }
      }

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId: analysisFeatureId,
        passes: true,
        message: 'Project analysis completed',
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        featureId: analysisFeatureId,
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.runningFeatures.size > 0,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get detailed info about all running agents
   */
  async getRunningAgents(): Promise<
    Array<{
      featureId: string;
      projectPath: string;
      projectName: string;
      isAutoMode: boolean;
      model?: string;
      provider?: ModelProvider;
      title?: string;
      description?: string;
    }>
  > {
    const agents = await Promise.all(
      Array.from(this.runningFeatures.values()).map(async (rf) => {
        // Try to fetch feature data to get title and description
        let title: string | undefined;
        let description: string | undefined;

        try {
          const feature = await this.featureLoader.get(rf.projectPath, rf.featureId);
          if (feature) {
            title = feature.title;
            description = feature.description;
          }
        } catch (error) {
          // Silently ignore errors - title/description are optional
        }

        return {
          featureId: rf.featureId,
          projectPath: rf.projectPath,
          projectName: path.basename(rf.projectPath),
          isAutoMode: rf.isAutoMode,
          model: rf.model,
          provider: rf.provider,
          title,
          description,
        };
      })
    );
    return agents;
  }

  /**
   * Wait for plan approval from the user.
   * Returns a promise that resolves when the user approves/rejects the plan.
   * Times out after 30 minutes to prevent indefinite memory retention.
   */
  waitForPlanApproval(
    featureId: string,
    projectPath: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }> {
    const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    logger.info(`Registering pending approval for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    return new Promise((resolve, reject) => {
      // Set up timeout to prevent indefinite waiting and memory leaks
      const timeoutId = setTimeout(() => {
        const pending = this.pendingApprovals.get(featureId);
        if (pending) {
          logger.warn(`Plan approval for feature ${featureId} timed out after 30 minutes`);
          this.pendingApprovals.delete(featureId);
          reject(
            new Error('Plan approval timed out after 30 minutes - feature execution cancelled')
          );
        }
      }, APPROVAL_TIMEOUT_MS);

      // Wrap resolve/reject to clear timeout when approval is resolved
      const wrappedResolve = (result: {
        approved: boolean;
        editedPlan?: string;
        feedback?: string;
      }) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      this.pendingApprovals.set(featureId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        featureId,
        projectPath,
      });
      logger.info(`Pending approval registered for feature ${featureId} (timeout: 30 minutes)`);
    });
  }

  /**
   * Resolve a pending plan approval.
   * Called when the user approves or rejects the plan via API.
   */
  async resolvePlanApproval(
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string,
    projectPathFromClient?: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.info(`resolvePlanApproval called for feature ${featureId}, approved=${approved}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);

    if (!pending) {
      logger.info(`No pending approval in Map for feature ${featureId}`);

      // RECOVERY: If no pending approval but we have projectPath from client,
      // check if feature's planSpec.status is 'generated' and handle recovery
      if (projectPathFromClient) {
        logger.info(`Attempting recovery with projectPath: ${projectPathFromClient}`);
        const feature = await this.loadFeature(projectPathFromClient, featureId);

        if (feature?.planSpec?.status === 'generated') {
          logger.info(`Feature ${featureId} has planSpec.status='generated', performing recovery`);

          if (approved) {
            // Update planSpec to approved
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'approved',
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
              content: editedPlan || feature.planSpec.content,
            });

            // Build continuation prompt and re-run the feature
            const planContent = editedPlan || feature.planSpec.content || '';
            let continuationPrompt = `The plan/specification has been approved. `;
            if (feedback) {
              continuationPrompt += `\n\nUser feedback: ${feedback}\n\n`;
            }
            continuationPrompt += `Now proceed with the implementation as specified in the plan:\n\n${planContent}\n\nImplement the feature now.`;

            logger.info(`Starting recovery execution for feature ${featureId}`);

            // Start feature execution with the continuation prompt (async, don't await)
            // Pass undefined for providedWorktreePath, use options for continuation prompt
            this.executeFeature(projectPathFromClient, featureId, true, false, undefined, {
              continuationPrompt,
            }).catch((error) => {
              logger.error(`Recovery execution failed for feature ${featureId}:`, error);
            });

            return { success: true };
          } else {
            // Rejected - update status and emit event
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'rejected',
              reviewedByUser: true,
            });

            await this.updateFeatureStatus(projectPathFromClient, featureId, 'backlog');

            this.emitAutoModeEvent('plan_rejected', {
              featureId,
              projectPath: projectPathFromClient,
              feedback,
            });

            return { success: true };
          }
        }
      }

      logger.info(
        `ERROR: No pending approval found for feature ${featureId} and recovery not possible`
      );
      return {
        success: false,
        error: `No pending approval for feature ${featureId}`,
      };
    }
    logger.info(`Found pending approval for feature ${featureId}, proceeding...`);

    const { projectPath } = pending;

    // Update feature's planSpec status
    await this.updateFeaturePlanSpec(projectPath, featureId, {
      status: approved ? 'approved' : 'rejected',
      approvedAt: approved ? new Date().toISOString() : undefined,
      reviewedByUser: true,
      content: editedPlan, // Update content if user provided an edited version
    });

    // If rejected with feedback, we can store it for the user to see
    if (!approved && feedback) {
      // Emit event so client knows the rejection reason
      this.emitAutoModeEvent('plan_rejected', {
        featureId,
        projectPath,
        feedback,
      });
    }

    // Resolve the promise with all data including feedback
    pending.resolve({ approved, editedPlan, feedback });
    this.pendingApprovals.delete(featureId);

    return { success: true };
  }

  /**
   * Cancel a pending plan approval (e.g., when feature is stopped).
   */
  cancelPlanApproval(featureId: string): void {
    logger.info(`cancelPlanApproval called for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);
    if (pending) {
      logger.info(`Found and cancelling pending approval for feature ${featureId}`);
      pending.reject(new Error('Plan approval cancelled - feature was stopped'));
      this.pendingApprovals.delete(featureId);
    } else {
      logger.info(`No pending approval to cancel for feature ${featureId}`);
    }
  }

  /**
   * Check if a feature has a pending plan approval.
   */
  hasPendingApproval(featureId: string): boolean {
    return this.pendingApprovals.has(featureId);
  }

  // Private helpers

  /**
   * Find an existing worktree for a given branch by checking git worktree list
   */
  private async findExistingWorktreeForBranch(
    projectPath: string,
    branchName: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '' && currentPath && currentBranch) {
          // End of a worktree entry
          if (currentBranch === branchName) {
            // Resolve to absolute path - git may return relative paths
            // On Windows, this is critical for cwd to work correctly
            // On all platforms, absolute paths ensure consistent behavior
            const resolvedPath = path.isAbsolute(currentPath)
              ? path.resolve(currentPath)
              : path.resolve(projectPath, currentPath);
            return resolvedPath;
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check the last entry (if file doesn't end with newline)
      if (currentPath && currentBranch && currentBranch === branchName) {
        // Resolve to absolute path for cross-platform compatibility
        const resolvedPath = path.isAbsolute(currentPath)
          ? path.resolve(currentPath)
          : path.resolve(projectPath, currentPath);
        return resolvedPath;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch {
      // Feature file may not exist
    }
  }

  /**
   * Update the planSpec of a feature
   */
  private async updateFeaturePlanSpec(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanSpec>
  ): Promise<void> {
    const featurePath = path.join(projectPath, '.automaker', 'features', featureId, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      const feature = JSON.parse(data);

      // Initialize planSpec if it doesn't exist
      if (!feature.planSpec) {
        feature.planSpec = {
          status: 'pending',
          version: 1,
          reviewedByUser: false,
        };
      }

      // Apply updates
      Object.assign(feature.planSpec, updates);

      // If content is being updated and it's a new version, increment version
      if (updates.content && updates.content !== feature.planSpec.content) {
        feature.planSpec.version = (feature.planSpec.version || 0) + 1;
      }

      feature.updatedAt = new Date().toISOString();
      await secureFs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch (error) {
      logger.error(`Failed to update planSpec for ${featureId}:`, error);
    }
  }

  private async loadPendingFeatures(projectPath: string): Promise<Feature[]> {
    // Features are stored in .automaker directory
    const featuresDir = getFeaturesDir(projectPath);

    try {
      const entries = await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      });
      const allFeatures: Feature[] = [];
      const pendingFeatures: Feature[] = [];

      // Load all features (for dependency checking)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');
          try {
            const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
            const feature = JSON.parse(data);
            allFeatures.push(feature);

            // Track pending features separately
            if (
              feature.status === 'pending' ||
              feature.status === 'ready' ||
              feature.status === 'backlog'
            ) {
              pendingFeatures.push(feature);
            }
          } catch {
            // Skip invalid features
          }
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures } = resolveDependencies(pendingFeatures);

      // Filter to only features with satisfied dependencies
      const readyFeatures = orderedFeatures.filter((feature: Feature) =>
        areDependenciesSatisfied(feature, allFeatures)
      );

      return readyFeatures;
    } catch {
      return [];
    }
  }

  /**
   * Extract a title from feature description (first line or truncated)
   */
  private extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return 'Untitled Feature';
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split('\n')[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + '...';
  }

  /**
   * Get the planning prompt prefix based on feature's planning mode
   */
  private async getPlanningPromptPrefix(feature: Feature): Promise<string> {
    const mode = feature.planningMode || 'skip';

    if (mode === 'skip') {
      return ''; // No planning phase
    }

    // Load prompts from settings (no caching - allows hot reload of custom prompts)
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const planningPrompts: Record<string, string> = {
      lite: prompts.autoMode.planningLite,
      lite_with_approval: prompts.autoMode.planningLiteWithApproval,
      spec: prompts.autoMode.planningSpec,
      full: prompts.autoMode.planningFull,
    };

    // For lite mode, use the approval variant if requirePlanApproval is true
    let promptKey: string = mode;
    if (mode === 'lite' && feature.requirePlanApproval === true) {
      promptKey = 'lite_with_approval';
    }

    const planningPrompt = planningPrompts[promptKey];
    if (!planningPrompt) {
      return '';
    }

    return planningPrompt + '\n\n---\n\n## Feature Request\n\n';
  }

  /**
   * Extract text content from a binary file (docx, pdf, xlsx)
   */
  private async extractDocumentContent(filePath: string): Promise<string | null> {
    try {
      const extension = path.extname(filePath).toLowerCase();
      logger.info(`Extracting content from document: ${path.basename(filePath)} (${extension})`);
      const buffer = await secureFs.readFile(filePath);

      if (extension === '.docx') {
        const result = await mammoth.extractRawText({ buffer: buffer as Buffer });
        const content = result.value.trim();
        logger.info(
          `Extracted ${content.length} characters from .docx file: ${path.basename(filePath)}`
        );
        return content;
      } else if (extension === '.pdf') {
        // Use pdfjs-dist for PDF extraction
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const uint8Array = new Uint8Array(buffer as Buffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;

        const textParts: string[] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          textParts.push(pageText);
        }

        const content = textParts.join('\n\n').trim();
        logger.info(
          `Extracted ${content.length} characters from ${pdf.numPages} pages of PDF: ${path.basename(filePath)}`
        );
        return content;
      } else if (extension === '.xlsx') {
        // For Excel files, we could use xlsx library, but for now return a note
        return '[Excel file - content extraction not yet implemented]';
      }

      return null;
    } catch (error) {
      logger.error(`Failed to extract content from ${filePath}:`, error);
      return null;
    }
  }

  private async buildFeaturePrompt(feature: Feature): Promise<string> {
    const title = this.extractTitleFromDescription(feature.description);

    // Log what files are attached to this feature
    logger.info(`Building feature prompt for ${feature.id}`);
    logger.info(`  imagePaths count: ${feature.imagePaths?.length || 0}`);
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      logger.info(`  imagePaths raw data:`, JSON.stringify(feature.imagePaths, null, 2));
    }

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Note: feature.imagePaths contains ALL binary files (images, documents, spreadsheets, etc.)
    // despite the misleading name - kept for backward compatibility
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      // Categorize files by type
      const images: string[] = [];
      const documents: Array<{ info: string; path: string; filename: string }> = [];
      const otherFiles: string[] = [];

      for (let idx = 0; idx < feature.imagePaths.length; idx++) {
        const img = feature.imagePaths[idx];
        const path = typeof img === 'string' ? img : (img.path as string);
        const filename: string | undefined =
          typeof img === 'string'
            ? path.split('/').pop()
            : (img.filename as string | undefined) || path.split('/').pop();
        const mimeType: string =
          typeof img === 'string' ? 'image/*' : (img.mimeType as string) || 'image/*';
        const fileInfo = `   ${idx + 1}. ${filename} (${mimeType})\n      Path: ${path}`;

        // Categorize by MIME type or extension
        if (mimeType.startsWith('image/')) {
          images.push(fileInfo);
        } else if (
          mimeType.includes('document') ||
          mimeType.includes('word') ||
          mimeType.includes('pdf') ||
          mimeType.includes('text') ||
          mimeType.includes('spreadsheet') ||
          mimeType.includes('excel') ||
          (filename && (filename.endsWith('.docx') || filename.endsWith('.doc'))) ||
          (filename && filename.endsWith('.pdf')) ||
          (filename && (filename.endsWith('.xlsx') || filename.endsWith('.xls'))) ||
          (filename && filename.endsWith('.txt'))
        ) {
          documents.push({ info: fileInfo, path, filename: filename || 'unknown' });
        } else {
          otherFiles.push(fileInfo);
        }
      }

      logger.info(
        `Binary files for feature ${feature.id}: ${images.length} images, ${documents.length} documents, ${otherFiles.length} other files`
      );

      let attachmentSection = '';

      if (images.length > 0) {
        attachmentSection += `
**📷 Images Attached (${images.length}):**
${images.join('\n')}

These images are provided visually in the initial message and can be viewed using the Read tool.
`;
      }

      if (documents.length > 0) {
        attachmentSection += `\n**📄 Documents Attached (${documents.length}):**\n`;

        // Extract and include document contents
        for (const doc of documents) {
          attachmentSection += `${doc.info}\n`;

          // Extract content for supported formats
          const content = await this.extractDocumentContent(doc.path);
          if (content) {
            attachmentSection += `\n**Content of ${doc.filename}:**\n\`\`\`\n${content}\n\`\`\`\n\n`;
          } else {
            attachmentSection += `\n**Note:** Content could not be extracted from ${doc.filename}. Use the Read tool if needed.\n\n`;
          }
        }
      }

      if (otherFiles.length > 0) {
        attachmentSection += `
**📎 Other Files Attached (${otherFiles.length}):**
${otherFiles.join('\n')}

Use the Read tool to access these files as needed.
`;
      }

      prompt += attachmentSection;
    }

    // Add text files that already have extracted content (from Azure DevOps import, etc.)
    if (feature.textFilePaths && feature.textFilePaths.length > 0) {
      logger.info(`Adding ${feature.textFilePaths.length} pre-extracted text files to prompt`);
      prompt += `\n**📝 Additional Context Files (${feature.textFilePaths.length}):**\n\n`;

      for (const textFile of feature.textFilePaths) {
        if (textFile.content) {
          prompt += `${textFile.content}\n\n`;
        } else {
          prompt += `[File: ${textFile.filename}]\nPath: ${textFile.path}\n\n`;
        }
      }
    }

    // Add verification instructions based on testing mode
    if (feature.skipTests) {
      // Manual verification - just implement the feature
      prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Ensure the code follows existing patterns and conventions

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;
    } else {
      // Automated testing - implement and verify with appropriate testing framework
      prompt += `
## Instructions

**CRITICAL: Implementation Before Testing**
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. **Implement ALL functionality in the MAIN PROJECT** (e.g., PasswordUtility/PasswordGenerator.cs)
4. **NEVER create mock/stub implementations in test files** - tests should reference real code
5. **Verify implementation files exist** before writing tests that reference them
6. Ensure the code follows existing patterns and conventions

**Common Mistake to Avoid:**
❌ DO NOT create placeholder classes in test files (e.g., "public class PasswordGenerator { }" in test file)
✅ DO create real implementations in the main project, THEN write tests that use them

## Verification with Tests (REQUIRED)

After implementing the feature, you MUST verify it works correctly using an appropriate testing framework:

### For Web/UI Applications:
- Use **Playwright** for end-to-end testing
- Create a temporary test to verify UI functionality
- Run: \`npx playwright test my-verification-test.spec.ts\`

### For C#/.NET Applications:

**CRITICAL REQUIREMENTS - MUST FOLLOW:**
- ✅ ALWAYS use .NET 10.0 (net10.0) for ALL .NET projects
- ✅ ALWAYS create a solution (.sln) file
- ✅ ALWAYS add all projects to the solution

**IMPORTANT: Follow this exact structure for .NET projects with tests:**

1. **Check existing structure first** - use list_directory to see if .csproj and .sln files exist

2. **If starting fresh, create proper structure:**

   Step 1: Create main console app **WITH -f net10.0 FLAG** (REQUIRED)
   \`\`\`
   dotnet new console -n ProjectName -f net10.0
   \`\`\`
   ⚠️ **NEVER omit the -f net10.0 flag!**

   Step 2: Create test project with xUnit **WITH -f net10.0 FLAG** (REQUIRED)
   \`\`\`
   dotnet new xunit -n ProjectName.Tests -f net10.0
   \`\`\`
   ⚠️ **NEVER omit the -f net10.0 flag!**

   Step 3: **Add required test packages** (CRITICAL - tests won't run without these)
   \`\`\`
   cd ProjectName.Tests
   dotnet add package Microsoft.NET.Test.Sdk
   dotnet add package xunit
   dotnet add package xunit.runner.visualstudio
   cd ..
   \`\`\`
   ⚠️ **Microsoft.NET.Test.Sdk is REQUIRED for dotnet test to work!**

   Step 4: Create solution file (REQUIRED)
   \`\`\`
   dotnet new sln -n ProjectName
   \`\`\`
   ⚠️ **Every .NET project MUST have a .sln file!**

   Step 5: Add both projects to solution
   \`\`\`
   dotnet sln add ProjectName/ProjectName.csproj
   dotnet sln add ProjectName.Tests/ProjectName.Tests.csproj
   \`\`\`

   Step 6: Add reference from test project to main project
   \`\`\`
   cd ProjectName.Tests
   dotnet add reference ../ProjectName/ProjectName.csproj
   cd ..
   \`\`\`

   Step 7: Restore packages
   \`\`\`
   dotnet restore
   \`\`\`

3. **Verify test project has required packages** - The .Tests.csproj MUST contain:
   - **Microsoft.NET.Test.Sdk** (CRITICAL - without this, dotnet test fails)
   - xunit
   - xunit.runner.visualstudio
   - ProjectReference to main project
   
   **If dotnet test fails with "No test is available", you forgot Microsoft.NET.Test.Sdk**

4. **IMPLEMENT FIRST, TEST SECOND:**
   
   Step A: **Create implementation classes in MAIN project** (e.g., ProjectName/PasswordGenerator.cs)
   - Implement ALL methods and functionality
   - Use proper namespaces (namespace ProjectName)
   - Make classes public so tests can access them
   
   Step B: **Verify implementation exists** before writing tests
   - Use read_file to check implementation file exists
   - Ensure all required classes/methods are implemented
   
   Step C: **Write tests in TEST project** (ProjectName.Tests/)
   - Reference main project namespace: using ProjectName;
   - Use [Fact] or [Theory] attributes
   - Follow Arrange-Act-Assert pattern
   - **NEVER create stub/mock classes in test files**
   - **For regex patterns:** ALWAYS use verbatim strings: \`@"[a-z]+"\` (NOT \`"[a-z]+"\`)
   - **For file paths:** ALWAYS use verbatim strings: \`@"C:\\path\\to\\file"\` (NOT \`"C:\\\\path\\\\to\\\\file"\`)
   - **String escaping:** Prefer \`@"..."\` over manual backslash escaping to avoid compilation errors
   
   **CRITICAL: Test Thoroughness Requirements:**
   - ❌ NEVER write placeholder tests like \`Assert.True(true);\` with "Replace with actual assertions"
   - ✅ Tests MUST validate ALL acceptance criteria from the spec
   - ✅ Each test MUST have meaningful assertions that verify behavior
   - ✅ Cover happy path, edge cases, AND error cases from the spec
   - ✅ If spec says "must exclude character X", write a test that verifies X is excluded
   - ✅ If spec says "must validate range 10-20", test valid values AND values outside range
   - ❌ DO NOT consider tests "done" if they contain placeholder assertions
   - Example of BAD test: \`Assert.True(true); // Replace with actual assertions\`
   - Example of GOOD test: \`Assert.DoesNotContain('B', password); // Verify B is excluded per spec\`

5. **C# Best Practices - FOLLOW THESE:**
   - **Regex patterns:** \`var regex = new Regex(@"[0-9]+");\` ← Use @ prefix
   - **Assert.Matches:** \`Assert.Matches(@"^[a-z]+$", result);\` ← Use @ prefix
   - **File paths:** \`var path = @"C:\\Users\\file.txt";\` ← Use @ prefix
   - **Why verbatim strings?** They prevent "Unrecognized escape sequence" errors
   - If you get CS1009 errors (Unrecognized escape sequence), you forgot the @ prefix

6. **Build and run tests:**
   \`\`\`
   dotnet build    # Build first to catch compilation errors
   dotnet test     # Run all tests in solution
   \`\`\`
   
   **❌ NEVER RUN INTERACTIVE CONSOLE APPLICATIONS DIRECTLY:**
   - DO NOT run: \`dotnet run\` for console apps that prompt for user input
   - DO NOT run: \`dotnet run --project ProjectName\` on interactive programs
   - WHY? Interactive programs wait for input and will hang indefinitely
   - ✅ INSTEAD: Verify functionality ONLY through \`dotnet test\`
   - ✅ Tests should validate all behavior without requiring user interaction
   - ✅ If program has Console.ReadLine() or prompts, ONLY validate via tests
   - Example: Password generator that prompts → Test the PasswordGenerator class, NOT the interactive Program.cs
   
   **When to use dotnet run:**
   - ✅ ONLY for non-interactive services/APIs/background tasks
   - ✅ ONLY when you need to verify the program starts without errors
   - ✅ ONLY for quick smoke tests (use timeout or background execution)
   - ❌ NEVER for programs with Console.ReadLine(), user prompts, or interactive menus
   
   **Completion criteria:**
   - ✅ \`dotnet build\` succeeds (no compilation errors)
   - ✅ \`dotnet test\` succeeds (all tests pass)
   - ❌ DO NOT require \`dotnet run\` to succeed for interactive console apps
   - The program works if tests pass - manual execution is for users, not validation

**Critical: Avoid These Mistakes:**
- ❌ DO NOT create projects without -f net10.0 flag
- ❌ DO NOT create .NET projects without a .sln file
- ❌ DO NOT write tests before implementing the actual functionality
- ❌ DO NOT create mock/placeholder classes in test files to make tests compile
- ✅ DO implement functionality in main project FIRST, then write tests
- ❌ DO NOT create nested ProjectName/ProjectName directories
- ❌ DO NOT forget project reference from test to main (step 5 above)
- ❌ DO NOT skip dotnet restore
- ❌ DO NOT use any framework version other than net10.0 (unless explicitly told otherwise)
- ✅ DO use list_directory to verify structure before creating files
- ✅ DO always specify -f net10.0 when creating any .NET project
- ✅ DO always create a .sln file and add all projects to it
- **CRITICAL: If you update target framework**, update BOTH projects to the same version (net10.0)
- **NEVER change only one project's framework** - this breaks project references and the solution won't load
- ❌ **NEVER use regular strings for regex patterns** - you'll get CS1009 "Unrecognized escape sequence"
- ✅ **ALWAYS use @"..." verbatim strings** for regex, file paths, and any string with backslashes
- ❌ **DO NOT write \`"[a-z]+"\` or \`"C:\\\\path"\`** - these cause compilation errors
- ✅ **DO write \`@"[a-z]+"\` and \`@"C:\\path"\`** - verbatim strings avoid escaping hell

### For Node.js/TypeScript Applications:
- Use **Vitest**, **Jest**, or the existing test framework
- Create unit/integration tests for the functionality
- Run: \`npm test\` or \`pnpm test\`

### For Python Applications:
- Use **pytest**, **unittest**, or the existing test framework
- Create unit tests for the implemented functionality
- Run: \`pytest\` or \`python -m unittest\`

**Important Testing Guidelines:**
1. **Explore first** - Check what testing framework is already set up in the project
2. **Match the project type** - Use appropriate testing tools for the language/framework
3. **Create proper project structure** - For .NET, ensure you have .sln and test .csproj files
4. **Verify tests pass** - Fix implementation if tests fail
5. **Clean up temporary tests** - Delete verification test files after successful verification

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Verification Status
- [Describe how the feature was verified and what tests were run]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;
    }

    return prompt;
  }

  private async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    projectPath: string,
    imagePaths?: string[],
    model?: string,
    options?: {
      projectPath?: string;
      planningMode?: PlanningMode;
      requirePlanApproval?: boolean;
      previousContent?: string;
      systemPrompt?: string;
      autoLoadClaudeMd?: boolean;
      thinkingLevel?: ThinkingLevel;
    }
  ): Promise<void> {
    const finalProjectPath = options?.projectPath || projectPath;
    const planningMode = options?.planningMode || 'skip';
    const previousContent = options?.previousContent;

    // Check if this planning mode can generate a spec/plan that needs approval
    // - spec and full always generate specs
    // - lite only generates approval-ready content when requirePlanApproval is true
    const planningModeRequiresApproval =
      planningMode === 'spec' ||
      planningMode === 'full' ||
      (planningMode === 'lite' && options?.requirePlanApproval === true);
    const requiresApproval = planningModeRequiresApproval && options?.requirePlanApproval === true;

    // CI/CD Mock Mode: Return early with mock response when AUTOMAKER_MOCK_AGENT is set
    // This prevents actual API calls during automated testing
    if (process.env.AUTOMAKER_MOCK_AGENT === 'true') {
      logger.info(`MOCK MODE: Skipping real agent execution for feature ${featureId}`);

      // Simulate some work being done
      await this.sleep(500);

      // Emit mock progress events to simulate agent activity
      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Analyzing the codebase...',
      });

      await this.sleep(300);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Implementing the feature...',
      });

      await this.sleep(300);

      // Create a mock file with "yellow" content as requested in the test
      const mockFilePath = path.join(workDir, 'yellow.txt');
      await secureFs.writeFile(mockFilePath, 'yellow');

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: "Mock agent: Created yellow.txt file with content 'yellow'",
      });

      await this.sleep(200);

      // Save mock agent output
      const featureDirForOutput = getFeatureDir(projectPath, featureId);
      const outputPath = path.join(featureDirForOutput, 'agent-output.md');

      const mockOutput = `# Mock Agent Output

## Summary
This is a mock agent response for CI/CD testing.

## Changes Made
- Created \`yellow.txt\` with content "yellow"

## Notes
This mock response was generated because AUTOMAKER_MOCK_AGENT=true was set.
`;

      await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
      await secureFs.writeFile(outputPath, mockOutput);

      logger.info(`MOCK MODE: Completed mock execution for feature ${featureId}`);
      return;
    }

    // Load autoLoadClaudeMd setting (project setting takes precedence over global)
    // Use provided value if available, otherwise load from settings
    const autoLoadClaudeMd =
      options?.autoLoadClaudeMd !== undefined
        ? options.autoLoadClaudeMd
        : await getAutoLoadClaudeMdSetting(finalProjectPath, this.settingsService, '[AutoMode]');

    // Load enableSandboxMode setting (global setting only)
    const enableSandboxMode = await getEnableSandboxModeSetting(this.settingsService, '[AutoMode]');

    // Load MCP servers from settings (global setting only)
    const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AutoMode]');

    // Load MCP permission settings (global setting only)

    // Build SDK options using centralized configuration for feature implementation
    const { options: sdkOptions } = await createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
      autoLoadClaudeMd,
      enableSandboxMode,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      thinkingLevel: options?.thinkingLevel,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    logger.info(
      `runAgent called for feature ${featureId} with model: ${finalModel}, planningMode: ${planningMode}, requiresApproval: ${requiresApproval}`
    );

    // Get provider for this model
    // For custom agents (Copilot, Local LLM), enable agenticMode for full codebase access
    const isCustomAgent = finalModel.startsWith('copilot-') || finalModel.startsWith('local-llm-');

    // Get feature for planning mode check
    const feature = await this.loadFeature(projectPath, featureId);
    const isPersistentMode = feature?.planningMode === 'persistent';

    const provider = isCustomAgent
      ? ProviderFactory.getProviderForModel(finalModel, {
          agenticMode: true,
          projectRoot: workDir,
          planningService: isPersistentMode ? this.planningFilesService : undefined,
          featureId: isPersistentMode ? featureId : undefined,
          projectPath: isPersistentMode ? projectPath : undefined,
        })
      : ProviderFactory.getProviderForModel(finalModel);

    logger.info(
      `Using provider "${provider.getName()}" for model "${finalModel}"${isCustomAgent ? ' (agentic mode enabled)' : ''}${isPersistentMode ? ' with planning-files' : ''}`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    // Debug: Log if system prompt is provided
    if (options?.systemPrompt) {
      logger.info(
        `System prompt provided (${options.systemPrompt.length} chars), first 200 chars:\n${options.systemPrompt.substring(0, 200)}...`
      );
    }

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: finalModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
      systemPrompt: sdkOptions.systemPrompt,
      settingSources: sdkOptions.settingSources,
      sandbox: sdkOptions.sandbox, // Pass sandbox configuration
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
      thinkingLevel: options?.thinkingLevel, // Pass thinking level for extended thinking
    };

    // Execute via provider
    logger.info(`Starting stream for feature ${featureId}...`);
    const stream = provider.executeQuery(executeOptions);
    logger.info(`Stream created, starting to iterate...`);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = false;

    // Track token usage for cost monitoring
    let inputTokens = 0;
    let outputTokens = 0;

    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');
    const rawOutputPath = path.join(featureDirForOutput, 'raw-output.jsonl');

    // Raw output logging is configurable via environment variable
    // Set AUTOMAKER_DEBUG_RAW_OUTPUT=true to enable raw stream event logging
    const enableRawOutput =
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === 'true' ||
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === '1';

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms

    // Raw output accumulator for debugging (NDJSON format)
    let rawOutputLines: string[] = [];
    let rawWriteTimeout: ReturnType<typeof setTimeout> | null = null;

    // Helper to append raw stream event for debugging (only when enabled)
    const appendRawEvent = (event: unknown): void => {
      if (!enableRawOutput) return;

      try {
        const timestamp = new Date().toISOString();
        const rawLine = JSON.stringify({ timestamp, event }, null, 4); // Pretty print for readability
        rawOutputLines.push(rawLine);

        // Debounced write of raw output
        if (rawWriteTimeout) {
          clearTimeout(rawWriteTimeout);
        }
        rawWriteTimeout = setTimeout(async () => {
          try {
            await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
            await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
            rawOutputLines = []; // Clear after writing
          } catch (error) {
            logger.error(`Failed to write raw output for ${featureId}:`, error);
          }
        }, WRITE_DEBOUNCE_MS);
      } catch {
        // Ignore serialization errors
      }
    };

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        logger.error(`Failed to write agent output for ${featureId}:`, error);
      }
    };

    // Debounced write - schedules a write after WRITE_DEBOUNCE_MS
    const scheduleWrite = (): void => {
      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }
      writeTimeout = setTimeout(() => {
        writeToFile();
      }, WRITE_DEBOUNCE_MS);
    };

    // Wrap stream processing in try/finally to ensure timeout cleanup on any error/abort
    try {
      streamLoop: for await (const msg of stream) {
        // Log raw stream event for debugging
        appendRawEvent(msg);

        logger.info(`Stream message received:`, msg.type, msg.subtype || '');
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              const newText = block.text || '';

              // Skip empty text
              if (!newText) continue;

              // Note: Cursor-specific dedup (duplicate blocks, accumulated text) is now
              // handled in CursorProvider.deduplicateTextBlocks() for cleaner separation

              // Only add separator when we're at a natural paragraph break:
              // - Previous text ends with sentence terminator AND new text starts a new thought
              // - Don't add separators mid-word or mid-sentence (for streaming providers like Cursor)
              if (responseText.length > 0 && newText.length > 0) {
                const lastChar = responseText.slice(-1);
                const endsWithSentence = /[.!?:]\s*$/.test(responseText);
                const endsWithNewline = /\n\s*$/.test(responseText);
                const startsNewParagraph = /^[\n#\-*>]/.test(newText);

                // Add paragraph break only at natural boundaries
                if (
                  !endsWithNewline &&
                  (endsWithSentence || startsNewParagraph) &&
                  !/[a-zA-Z0-9]/.test(lastChar) // Not mid-word
                ) {
                  responseText += '\n\n';
                }
              }
              responseText += newText;

              // Check for authentication errors in the response
              if (
                block.text &&
                (block.text.includes('Invalid API key') ||
                  block.text.includes('authentication_failed') ||
                  block.text.includes('Fix external API key'))
              ) {
                throw new Error(
                  'Authentication failed: Invalid or expired API key. ' +
                    "Please check your ANTHROPIC_API_KEY, or run 'claude login' to re-authenticate."
                );
              }

              // Schedule incremental file write (debounced)
              scheduleWrite();

              // Check for [SPEC_GENERATED] marker in planning modes (spec or full)
              if (
                planningModeRequiresApproval &&
                !specDetected &&
                responseText.includes('[SPEC_GENERATED]')
              ) {
                specDetected = true;

                // Extract plan content (everything before the marker)
                const markerIndex = responseText.indexOf('[SPEC_GENERATED]');
                const planContent = responseText.substring(0, markerIndex).trim();

                // Parse tasks from the generated spec (for spec and full modes)
                // Use let since we may need to update this after plan revision
                let parsedTasks = parseTasksFromSpec(planContent);
                const tasksTotal = parsedTasks.length;

                logger.info(`Parsed ${tasksTotal} tasks from spec for feature ${featureId}`);
                if (parsedTasks.length > 0) {
                  logger.info(`Tasks: ${parsedTasks.map((t) => t.id).join(', ')}`);
                }

                // Update planSpec status to 'generated' and save content with parsed tasks
                await this.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'generated',
                  content: planContent,
                  version: 1,
                  generatedAt: new Date().toISOString(),
                  reviewedByUser: false,
                  tasks: parsedTasks,
                  tasksTotal,
                  tasksCompleted: 0,
                });

                let approvedPlanContent = planContent;
                let userFeedback: string | undefined;
                let currentPlanContent = planContent;
                let planVersion = 1;

                // Only pause for approval if requirePlanApproval is true
                if (requiresApproval) {
                  // ========================================
                  // PLAN REVISION LOOP
                  // Keep regenerating plan until user approves
                  // ========================================
                  let planApproved = false;

                  while (!planApproved) {
                    logger.info(
                      `Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
                    );

                    // CRITICAL: Register pending approval BEFORE emitting event
                    const approvalPromise = this.waitForPlanApproval(featureId, projectPath);

                    // Emit plan_approval_required event
                    this.emitAutoModeEvent('plan_approval_required', {
                      featureId,
                      projectPath,
                      planContent: currentPlanContent,
                      planningMode,
                      planVersion,
                    });

                    // Wait for user response
                    try {
                      const approvalResult = await approvalPromise;

                      if (approvalResult.approved) {
                        // User approved the plan
                        logger.info(`Plan v${planVersion} approved for feature ${featureId}`);
                        planApproved = true;

                        // If user provided edits, use the edited version
                        if (approvalResult.editedPlan) {
                          approvedPlanContent = approvalResult.editedPlan;
                          await this.updateFeaturePlanSpec(projectPath, featureId, {
                            content: approvalResult.editedPlan,
                          });
                        } else {
                          approvedPlanContent = currentPlanContent;
                        }

                        // Capture any additional feedback for implementation
                        userFeedback = approvalResult.feedback;

                        // Emit approval event
                        this.emitAutoModeEvent('plan_approved', {
                          featureId,
                          projectPath,
                          hasEdits: !!approvalResult.editedPlan,
                          planVersion,
                        });
                      } else {
                        // User rejected - check if they provided feedback for revision
                        const hasFeedback =
                          approvalResult.feedback && approvalResult.feedback.trim().length > 0;
                        const hasEdits =
                          approvalResult.editedPlan && approvalResult.editedPlan.trim().length > 0;

                        if (!hasFeedback && !hasEdits) {
                          // No feedback or edits = explicit cancel
                          logger.info(
                            `Plan rejected without feedback for feature ${featureId}, cancelling`
                          );
                          throw new Error('Plan cancelled by user');
                        }

                        // User wants revisions - regenerate the plan
                        logger.info(
                          `Plan v${planVersion} rejected with feedback for feature ${featureId}, regenerating...`
                        );
                        planVersion++;

                        // Emit revision event
                        this.emitAutoModeEvent('plan_revision_requested', {
                          featureId,
                          projectPath,
                          feedback: approvalResult.feedback,
                          hasEdits: !!hasEdits,
                          planVersion,
                        });

                        // Build revision prompt
                        let revisionPrompt = `The user has requested revisions to the plan/specification.

## Previous Plan (v${planVersion - 1})
${hasEdits ? approvalResult.editedPlan : currentPlanContent}

## User Feedback
${approvalResult.feedback || 'Please revise the plan based on the edits above.'}

## Instructions
Please regenerate the specification incorporating the user's feedback.
Keep the same format with the \`\`\`tasks block for task definitions.
After generating the revised spec, output:
"[SPEC_GENERATED] Please review the revised specification above."
`;

                        // Update status to regenerating
                        await this.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generating',
                          version: planVersion,
                        });

                        // Make revision call
                        const revisionStream = provider.executeQuery({
                          prompt: revisionPrompt,
                          model: finalModel,
                          maxTurns: maxTurns || 100,
                          cwd: workDir,
                          allowedTools: allowedTools,
                          abortController,
                          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                        });

                        let revisionText = '';
                        for await (const msg of revisionStream) {
                          if (msg.type === 'assistant' && msg.message?.content) {
                            for (const block of msg.message.content) {
                              if (block.type === 'text') {
                                revisionText += block.text || '';
                                this.emitAutoModeEvent('auto_mode_progress', {
                                  featureId,
                                  content: block.text,
                                });
                              }
                            }
                          } else if (msg.type === 'error') {
                            throw new Error(msg.error || 'Error during plan revision');
                          } else if (msg.type === 'result' && msg.subtype === 'success') {
                            // Capture usage from result message
                            if (msg.usage) {
                              inputTokens += msg.usage.inputTokens || 0;
                              outputTokens += msg.usage.outputTokens || 0;
                            }
                            revisionText += msg.result || '';
                          }
                        }

                        // Extract new plan content
                        const markerIndex = revisionText.indexOf('[SPEC_GENERATED]');
                        if (markerIndex > 0) {
                          currentPlanContent = revisionText.substring(0, markerIndex).trim();
                        } else {
                          currentPlanContent = revisionText.trim();
                        }

                        // Re-parse tasks from revised plan
                        const revisedTasks = parseTasksFromSpec(currentPlanContent);
                        logger.info(`Revised plan has ${revisedTasks.length} tasks`);

                        // Update planSpec with revised content
                        await this.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generated',
                          content: currentPlanContent,
                          version: planVersion,
                          tasks: revisedTasks,
                          tasksTotal: revisedTasks.length,
                          tasksCompleted: 0,
                        });

                        // Update parsedTasks for implementation
                        parsedTasks = revisedTasks;

                        responseText += revisionText;
                      }
                    } catch (error) {
                      if ((error as Error).message.includes('cancelled')) {
                        throw error;
                      }
                      throw new Error(`Plan approval failed: ${(error as Error).message}`);
                    }
                  }
                } else {
                  // Auto-approve: requirePlanApproval is false, just continue without pausing
                  logger.info(
                    `Spec generated for feature ${featureId}, auto-approving (requirePlanApproval=false)`
                  );

                  // Emit info event for frontend
                  this.emitAutoModeEvent('plan_auto_approved', {
                    featureId,
                    projectPath,
                    planContent,
                    planningMode,
                  });

                  approvedPlanContent = planContent;
                }

                // CRITICAL: After approval, we need to make a second call to continue implementation
                // The agent is waiting for "approved" - we need to send it and continue
                logger.info(
                  `Making continuation call after plan approval for feature ${featureId}`
                );

                // Update planSpec status to approved (handles both manual and auto-approval paths)
                await this.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'approved',
                  approvedAt: new Date().toISOString(),
                  reviewedByUser: requiresApproval,
                });

                // ========================================
                // MULTI-AGENT TASK EXECUTION
                // Each task gets its own focused agent call
                // ========================================

                if (parsedTasks.length > 0) {
                  logger.info(
                    `Starting multi-agent execution: ${parsedTasks.length} tasks for feature ${featureId}`
                  );

                  // Execute each task with a separate agent
                  for (let taskIndex = 0; taskIndex < parsedTasks.length; taskIndex++) {
                    const task = parsedTasks[taskIndex];

                    // Check for abort
                    if (abortController.signal.aborted) {
                      throw new Error('Feature execution aborted');
                    }

                    // Emit task started
                    logger.info(`Starting task ${task.id}: ${task.description}`);
                    this.emitAutoModeEvent('auto_mode_task_started', {
                      featureId,
                      projectPath,
                      taskId: task.id,
                      taskDescription: task.description,
                      taskIndex,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with current task
                    await this.updateFeaturePlanSpec(projectPath, featureId, {
                      currentTaskId: task.id,
                    });

                    // Build focused prompt for this specific task
                    const taskPrompt = await this.buildTaskPrompt(
                      task,
                      parsedTasks,
                      taskIndex,
                      approvedPlanContent,
                      projectPath,
                      featureId,
                      userFeedback
                    );

                    // Execute task with dedicated agent
                    const taskStream = provider.executeQuery({
                      prompt: taskPrompt,
                      model: finalModel,
                      maxTurns: Math.min(maxTurns || 100, 50), // Limit turns per task
                      cwd: workDir,
                      allowedTools: allowedTools,
                      abortController,
                      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                    });

                    let taskOutput = '';

                    // Process task stream
                    for await (const msg of taskStream) {
                      if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                          if (block.type === 'text') {
                            taskOutput += block.text || '';
                            responseText += block.text || '';
                            this.emitAutoModeEvent('auto_mode_progress', {
                              featureId,
                              content: block.text,
                            });
                          } else if (block.type === 'tool_use') {
                            this.emitAutoModeEvent('auto_mode_tool', {
                              featureId,
                              tool: block.name,
                              input: block.input,
                            });
                          }
                        }
                      } else if (msg.type === 'error') {
                        throw new Error(msg.error || `Error during task ${task.id}`);
                      } else if (msg.type === 'result' && msg.subtype === 'success') {
                        // Capture usage from result message
                        logger.info(`[Task ${task.id}] Result message - has usage: ${!!msg.usage}`);
                        if (msg.usage) {
                          inputTokens += msg.usage.inputTokens || 0;
                          outputTokens += msg.usage.outputTokens || 0;
                          logger.info(
                            `[Task ${task.id}] Captured usage: ${msg.usage.inputTokens} input, ${msg.usage.outputTokens} output. Total: ${inputTokens} input, ${outputTokens} output`
                          );
                        }
                        taskOutput += msg.result || '';
                        responseText += msg.result || '';
                      }
                    }

                    // Emit task completed
                    logger.info(`Task ${task.id} completed for feature ${featureId}`);
                    this.emitAutoModeEvent('auto_mode_task_complete', {
                      featureId,
                      projectPath,
                      taskId: task.id,
                      tasksCompleted: taskIndex + 1,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with progress
                    await this.updateFeaturePlanSpec(projectPath, featureId, {
                      tasksCompleted: taskIndex + 1,
                    });

                    // Check for phase completion (group tasks by phase)
                    if (task.phase) {
                      const nextTask = parsedTasks[taskIndex + 1];
                      if (!nextTask || nextTask.phase !== task.phase) {
                        // Phase changed, emit phase complete
                        const phaseMatch = task.phase.match(/Phase\s*(\d+)/i);
                        if (phaseMatch) {
                          this.emitAutoModeEvent('auto_mode_phase_complete', {
                            featureId,
                            projectPath,
                            phaseNumber: parseInt(phaseMatch[1], 10),
                          });
                        }
                      }
                    }
                  }

                  logger.info(`All ${parsedTasks.length} tasks completed for feature ${featureId}`);
                } else {
                  // No parsed tasks - fall back to single-agent execution
                  logger.info(
                    `No parsed tasks, using single-agent execution for feature ${featureId}`
                  );

                  const continuationPrompt = `The plan/specification has been approved. Now implement it.
${userFeedback ? `\n## User Feedback\n${userFeedback}\n` : ''}
## Approved Plan

${approvedPlanContent}

## Instructions

Implement all the changes described in the plan above.`;

                  const continuationStream = provider.executeQuery({
                    prompt: continuationPrompt,
                    model: finalModel,
                    maxTurns: maxTurns,
                    cwd: workDir,
                    allowedTools: allowedTools,
                    abortController,
                    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                  });

                  for await (const msg of continuationStream) {
                    if (msg.type === 'assistant' && msg.message?.content) {
                      for (const block of msg.message.content) {
                        if (block.type === 'text') {
                          responseText += block.text || '';
                          this.emitAutoModeEvent('auto_mode_progress', {
                            featureId,
                            content: block.text,
                          });
                        } else if (block.type === 'tool_use') {
                          this.emitAutoModeEvent('auto_mode_tool', {
                            featureId,
                            tool: block.name,
                            input: block.input,
                          });
                        }
                      }
                    } else if (msg.type === 'error') {
                      throw new Error(msg.error || 'Unknown error during implementation');
                    } else if (msg.type === 'result' && msg.subtype === 'success') {
                      // Capture usage from result message
                      if (msg.usage) {
                        inputTokens += msg.usage.inputTokens || 0;
                        outputTokens += msg.usage.outputTokens || 0;
                      }
                      responseText += msg.result || '';
                    }
                  }
                }

                logger.info(`Implementation completed for feature ${featureId}`);
                // Exit the original stream loop since continuation is done
                break streamLoop;
              }

              // Only emit progress for non-marker text (marker was already handled above)
              if (!specDetected) {
                logger.info(
                  `Emitting progress event for ${featureId}, content length: ${block.text?.length || 0}`
                );
                this.emitAutoModeEvent('auto_mode_progress', {
                  featureId,
                  content: block.text,
                });
              }
            } else if (block.type === 'tool_use') {
              // Emit event for real-time UI
              this.emitAutoModeEvent('auto_mode_tool', {
                featureId,
                tool: block.name,
                input: block.input,
              });

              // Also add to file output for persistence
              if (responseText.length > 0 && !responseText.endsWith('\n')) {
                responseText += '\n';
              }
              responseText += `\n🔧 Tool: ${block.name}\n`;
              if (block.input) {
                responseText += `Input: ${JSON.stringify(block.input, null, 2)}\n`;
              }
              scheduleWrite();
            }
          }
        } else if (msg.type === 'error') {
          // Handle error messages
          throw new Error(msg.error || 'Unknown error');
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          // Capture usage from result message
          if (msg.usage) {
            inputTokens += msg.usage.inputTokens || 0;
            outputTokens += msg.usage.outputTokens || 0;
          }

          // Log tool executions (especially execute_command) to agent output for test validation
          if (msg.result && typeof msg.result === 'object' && 'tool' in msg.result) {
            const toolResult = msg.result as { tool?: string; output?: string; error?: string };
            if (toolResult.tool === 'execute_command' && (toolResult.output || toolResult.error)) {
              const toolLog = `\n\n---\n**Tool: ${toolResult.tool}**\n\n\`\`\`\n${toolResult.output || toolResult.error}\n\`\`\`\n---\n\n`;
              responseText += toolLog;
              scheduleWrite();
            }
          }
        }
      }

      // Final write - ensure all accumulated content is saved (on success path)
      await writeToFile();

      // Log usage statistics for cost tracking
      logger.info(
        `[Auto-Mode] Usage check: inputTokens=${inputTokens}, outputTokens=${outputTokens}`
      );
      if (inputTokens > 0 || outputTokens > 0) {
        try {
          logger.info(`[Auto-Mode] About to log usage to file...`);
          const usageService = getUsageTrackingService();
          await usageService.logUsage({
            provider: ProviderFactory.getProviderNameForModel(finalModel),
            model: finalModel,
            projectPath,
            sessionId: featureId,
            contextType: 'implementation',
            tokens: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          });
          logger.info(
            `Logged usage for feature ${featureId}: ${inputTokens} input, ${outputTokens} output tokens`
          );
        } catch (error) {
          logger.error(`Failed to log usage for feature ${featureId}:`, error);
        }
      } else {
        logger.warn(
          `[Auto-Mode] No tokens to log - inputTokens: ${inputTokens}, outputTokens: ${outputTokens}`
        );
      }

      // Flush remaining raw output (only if enabled, on success path)
      if (enableRawOutput && rawOutputLines.length > 0) {
        try {
          await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
          await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
        } catch (error) {
          logger.error(`Failed to write final raw output for ${featureId}:`, error);
        }
      }
    } finally {
      // ALWAYS clear pending timeouts to prevent memory leaks
      // This runs on success, error, or abort
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      if (rawWriteTimeout) {
        clearTimeout(rawWriteTimeout);
        rawWriteTimeout = null;
      }
    }
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const prompt = `## Continuing Feature Implementation

${await this.buildFeaturePrompt(feature)}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

${context}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

    return this.executeFeature(projectPath, featureId, useWorktrees, false, undefined, {
      continuationPrompt: prompt,
    });
  }

  /**
   * Build a focused prompt for executing a single task.
   * Each task gets minimal context to keep the agent focused.
   */
  private async buildTaskPrompt(
    task: ParsedTask,
    allTasks: ParsedTask[],
    taskIndex: number,
    planContent: string,
    projectPath: string,
    featureId: string,
    userFeedback?: string
  ): Promise<string> {
    const completedTasks = allTasks.slice(0, taskIndex);
    const remainingTasks = allTasks.slice(taskIndex + 1);

    let prompt = `# Task Execution: ${task.id}

You are executing a specific task as part of a larger feature implementation.

## Your Current Task

**Task ID:** ${task.id}
**Description:** ${task.description}
${task.filePath ? `**Primary File:** ${task.filePath}` : ''}
${task.phase ? `**Phase:** ${task.phase}` : ''}

## Context

`;

    // For persistent mode, inject task_plan.md
    try {
      const feature = await this.loadFeature(projectPath, featureId);
      if (feature && feature.planningMode === 'persistent') {
        const taskPlan = await this.planningFilesService.readTaskPlan(projectPath, featureId);
        if (taskPlan) {
          prompt += `### 📋 Current Plan (task_plan.md)

${taskPlan}

`;
        }
      }
    } catch (err) {
      // If we can't read planning file, continue without it
      logger.debug('Could not read task_plan.md for task prompt:', err);
    }

    // Show what's already done
    if (completedTasks.length > 0) {
      prompt += `### Already Completed (${completedTasks.length} tasks)
${completedTasks.map((t) => `- [x] ${t.id}: ${t.description}`).join('\n')}

`;
    }

    // Show remaining tasks
    if (remainingTasks.length > 0) {
      prompt += `### Coming Up Next (${remainingTasks.length} tasks remaining)
${remainingTasks
  .slice(0, 3)
  .map((t) => `- [ ] ${t.id}: ${t.description}`)
  .join('\n')}
${remainingTasks.length > 3 ? `... and ${remainingTasks.length - 3} more tasks` : ''}

`;
    }

    // Add user feedback if any
    if (userFeedback) {
      prompt += `### User Feedback
${userFeedback}

`;
    }

    // Add relevant excerpt from plan (just the task-related part to save context)
    prompt += `### Reference: Full Plan
<details>
${planContent}
</details>

## Instructions

1. Focus ONLY on completing task ${task.id}: "${task.description}"
2. Do not work on other tasks
3. Use the existing codebase patterns
4. When done, summarize what you implemented

Begin implementing task ${task.id} now.`;

    return prompt;
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   */
  private emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      // If signal is provided and already aborted, reject immediately
      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
        return;
      }

      // Listen for abort signal
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          },
          { once: true }
        );
      }
    });
  }

  /**
   * Check agent output for test results to determine if automated tests passed
   */
  private checkTestResults(agentOutput: string): boolean {
    logger.info('Checking test results in agent output...');

    // First, check if tests were actually executed
    const testExecutionPatterns = [
      /npx playwright test/i,
      /dotnet test/i,
      /npm test/i,
      /pnpm test/i,
      /pytest/i,
      /running.*tests?/i,
      /test.*run/i,
      /executing.*tests?/i,
    ];

    const testsWereRun = testExecutionPatterns.some((pattern) => {
      if (pattern.test(agentOutput)) {
        logger.info(`Found test execution pattern: ${pattern}`);
        return true;
      }
      return false;
    });

    if (!testsWereRun) {
      logger.warn(
        'No evidence of test execution found in agent output - requiring manual verification'
      );
      return false;
    }

    logger.info('Test execution detected, checking results...');

    // Common patterns indicating test failures
    const failurePatterns = [
      /\d+ failed/i,
      /\d+ error/i,
      /test.*failed/i,
      /failed.*test/i,
      /playwright.*\d+.*failed/i,
      /\d+\s+failing/i,
      /×.*failed/i,
      /✗.*failed/i,
      /error:.*test/i,
      /tests?.*did not pass/i,
      /connection.*refused/i, // Common when server isn't running
      /cannot.*connect/i,
      /ECONNREFUSED/i,
      /does not contain a project or solution file/i, // .NET test errors
      /no tests? found/i,
      /test run failed/i,
      /Skipping project.*because it was not found/i, // .NET solution issues
      /The referenced project.*does not exist/i, // .NET reference issues
      /could not be found \(are you missing a using directive/i, // .NET missing packages
      /error CS\d+:/i, // C# compilation errors
      /Build FAILED/i, // .NET build failures
      /MSBuild version.*Build FAILED/i,
    ];

    // Check if any failure patterns match
    const hasFailures = failurePatterns.some((pattern) => pattern.test(agentOutput));

    if (hasFailures) {
      logger.info('Detected test failures in agent output');
      return false;
    }

    // Patterns indicating successful test execution
    const successPatterns = [
      /\d+ passed/i,
      /all.*tests?.*passed/i,
      /playwright.*\d+.*passed/i,
      /✓.*passed/i,
      /√.*passed/i,
      /tests?.*successful/i,
      /test run successful/i,
      /passed!.*\d+/i,
    ];

    const hasSuccess = successPatterns.some((pattern) => pattern.test(agentOutput));

    if (hasSuccess) {
      logger.info('Detected successful test execution in agent output');
      return true;
    }

    // If tests were run but no clear success indicator, require manual verification
    logger.warn('Tests were run but results are unclear, requiring manual verification');
    return false;
  }
}
