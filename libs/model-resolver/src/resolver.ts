/**
 * Model resolution utilities for handling model string mapping
 *
 * Provides centralized model resolution logic:
 * - Maps Claude model aliases to full model strings
 * - Adds copilot- prefix to GitHub Copilot models for provider routing
 * - Adds cursor- prefix to Cursor models for provider routing
 * - Provides default models per provider
 * - Handles multiple model sources with priority
 */

import {
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  DEFAULT_MODELS,
  PROVIDER_PREFIXES,
  isCursorModel,
  isGitHubCopilotModel,
  stripProviderPrefix,
  type PhaseModelEntry,
  type ThinkingLevel,
} from '@automaker/types';

/**
 * Resolve a model key/alias to a full model string
 *
 * @param modelKey - Model key (e.g., "opus", "gpt-4o", "cursor-composer-1", "claude-sonnet-4-20250514")
 * @param defaultModel - Fallback model if modelKey is undefined
 * @returns Full model string with provider prefix if applicable
 */
export function resolveModelString(
  modelKey?: string,
  defaultModel: string = DEFAULT_MODELS.claude
): string {
  console.log(
    `[ModelResolver] resolveModelString called with modelKey: "${modelKey}", defaultModel: "${defaultModel}"`
  );

  // No model specified - use default
  if (!modelKey) {
    console.log(`[ModelResolver] No model specified, using default: ${defaultModel}`);
    return defaultModel;
  }

  // Cursor model with explicit prefix (e.g., "cursor-composer-1") - pass through unchanged
  // CursorProvider will strip the prefix when calling the CLI
  if (modelKey.startsWith(PROVIDER_PREFIXES.cursor)) {
    const cursorModelId = stripProviderPrefix(modelKey);
    // Verify it's a valid Cursor model
    if (cursorModelId in CURSOR_MODEL_MAP) {
      console.log(
        `[ModelResolver] Using Cursor model: ${modelKey} (valid model ID: ${cursorModelId})`
      );
      return modelKey;
    }
    // Could be a cursor-prefixed model not in our map yet - still pass through
    console.log(`[ModelResolver] Passing through cursor-prefixed model: ${modelKey}`);
    return modelKey;
  }

  // GitHub Copilot model with explicit prefix (e.g., "copilot-gpt-4o") - pass through unchanged
  if (modelKey.startsWith(PROVIDER_PREFIXES['github-copilot'])) {
    console.log(`[ModelResolver] Using Copilot model with prefix: ${modelKey}`);
    return modelKey;
  }

  // Local LLM model with explicit prefix (e.g., "local-qwen2.5-coder-32b") - pass through unchanged
  if (modelKey.startsWith(PROVIDER_PREFIXES['local-llm'])) {
    console.log(`[ModelResolver] Using Local LLM model with prefix: ${modelKey}`);
    return modelKey;
  }

  // Check if it's a bare Copilot model ID (e.g., "gpt-4o", "gpt-4o-mini", "claude-sonnet-4")
  // isGitHubCopilotModel checks for common OpenAI/Copilot model names
  if (isGitHubCopilotModel(modelKey)) {
    // Return with copilot- prefix so provider routing works correctly
    const prefixedModel = `${PROVIDER_PREFIXES['github-copilot']}${modelKey}`;
    console.log(
      `[ModelResolver] Detected bare Copilot model ID: "${modelKey}" -> "${prefixedModel}"`
    );
    return prefixedModel;
  }

  // Check if it's a bare Cursor model ID (e.g., "composer-1", "auto")
  if (modelKey in CURSOR_MODEL_MAP) {
    // Return with cursor- prefix so provider routing works correctly
    const prefixedModel = `${PROVIDER_PREFIXES.cursor}${modelKey}`;
    console.log(
      `[ModelResolver] Detected bare Cursor model ID: "${modelKey}" -> "${prefixedModel}"`
    );
    return prefixedModel;
  }

  // Full Claude model string - pass through unchanged
  if (modelKey.includes('claude-')) {
    console.log(`[ModelResolver] Using full Claude model string: ${modelKey}`);
    return modelKey;
  }

  // Look up Claude model alias
  const resolved = CLAUDE_MODEL_MAP[modelKey];
  if (resolved) {
    console.log(`[ModelResolver] Resolved Claude model alias: "${modelKey}" -> "${resolved}"`);
    return resolved;
  }

  // Unknown model key - use default
  console.warn(`[ModelResolver] Unknown model key "${modelKey}", using default: "${defaultModel}"`);
  return defaultModel;
}

/**
 * Get the effective model from multiple sources
 * Priority: explicit model > session model > default
 *
 * @param explicitModel - Explicitly provided model (highest priority)
 * @param sessionModel - Model from session (medium priority)
 * @param defaultModel - Fallback default model (lowest priority)
 * @returns Resolved model string
 */
export function getEffectiveModel(
  explicitModel?: string,
  sessionModel?: string,
  defaultModel?: string
): string {
  return resolveModelString(explicitModel || sessionModel, defaultModel);
}

/**
 * Result of resolving a phase model entry
 */
export interface ResolvedPhaseModel {
  /** Resolved model string (full model ID) */
  model: string;
  /** Optional thinking level for extended thinking */
  thinkingLevel?: ThinkingLevel;
}

/**
 * Resolve a phase model entry to a model string and thinking level
 *
 * Handles both legacy format (string) and new format (PhaseModelEntry object).
 * This centralizes the pattern used across phase model routes.
 *
 * @param phaseModel - Phase model entry (string or PhaseModelEntry object)
 * @param defaultModel - Fallback model if resolution fails
 * @returns Resolved model string and optional thinking level
 *
 * @remarks
 * - For Cursor models, `thinkingLevel` is returned as `undefined` since Cursor
 *   handles thinking internally via model variants (e.g., 'claude-sonnet-4-thinking')
 * - Defensively handles null/undefined from corrupted settings JSON
 *
 * @example
 * ```ts
 * const phaseModel = settings?.phaseModels?.enhancementModel || DEFAULT_PHASE_MODELS.enhancementModel;
 * const { model, thinkingLevel } = resolvePhaseModel(phaseModel);
 * ```
 */
export function resolvePhaseModel(
  phaseModel: string | PhaseModelEntry | null | undefined,
  defaultModel: string = DEFAULT_MODELS.claude
): ResolvedPhaseModel {
  console.log(
    `[ModelResolver] resolvePhaseModel called with:`,
    JSON.stringify(phaseModel),
    `type: ${typeof phaseModel}`
  );

  // Handle null/undefined (defensive against corrupted JSON)
  if (!phaseModel) {
    console.log(`[ModelResolver] phaseModel is null/undefined, using default`);
    return {
      model: resolveModelString(undefined, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // Handle legacy string format
  if (typeof phaseModel === 'string') {
    console.log(`[ModelResolver] phaseModel is string format (legacy): "${phaseModel}"`);
    return {
      model: resolveModelString(phaseModel, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // Handle new PhaseModelEntry object format
  console.log(
    `[ModelResolver] phaseModel is object format: model="${phaseModel.model}", thinkingLevel="${phaseModel.thinkingLevel}"`
  );
  return {
    model: resolveModelString(phaseModel.model, defaultModel),
    thinkingLevel: phaseModel.thinkingLevel,
  };
}
