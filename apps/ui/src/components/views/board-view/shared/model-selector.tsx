import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Brain, Bot, Terminal, AlertTriangle, Github, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelAlias } from '@/store/app-store';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { getModelProvider, PROVIDER_PREFIXES, stripProviderPrefix } from '@automaker/types';
import type { ModelProvider } from '@automaker/types';
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  COPILOT_MODELS,
  LOCAL_LLM_MODELS,
  ModelOption,
} from './model-constants';
import { useLocalLlmModels } from '@/hooks/use-local-llm-models';

interface ModelSelectorProps {
  selectedModel: string; // Can be ModelAlias or "cursor-{id}"
  onModelSelect: (model: string) => void;
  testIdPrefix?: string;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  testIdPrefix = 'model-select',
}: ModelSelectorProps) {
  const {
    enabledCursorModels,
    cursorDefaultModel,
    enabledCopilotModels,
    enabledLocalLlmModels,
    seenLocalLlmModels,
    localLlmDefaultModel,
    setEnabledLocalLlmModels,
    setLocalLlmDefaultModel,
    updateSeenLocalLlmModels,
    isClaudeEnabled,
    isCursorEnabled,
    isCopilotEnabled,
    isLocalLlmEnabled,
  } = useAppStore();
  const { cursorCliStatus, copilotStatus } = useSetupStore();
  const { models: localLlmModels, isLoading: isLoadingLocalLlmModels } = useLocalLlmModels();

  const selectedProvider = getModelProvider(selectedModel);

  // Note: Auto-enable logic has been moved to Settings page only
  // This prevents infinite loops when this selector is rendered in dialogs

  // Check if Cursor CLI is available
  const isCursorAvailable = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  // Check if GitHub Copilot is available
  const isCopilotAvailable = copilotStatus?.authenticated;

  // Check if Local LLM is available (has models loaded)
  const isLocalLlmAvailable = !isLoadingLocalLlmModels && localLlmModels.length > 0;

  // Filter Cursor models based on enabled models from global settings
  const filteredCursorModels = CURSOR_MODELS.filter((model) => {
    // Extract the cursor model ID from the prefixed ID (e.g., "cursor-auto" -> "auto")
    const cursorModelId = stripProviderPrefix(model.id);
    return enabledCursorModels.includes(cursorModelId as any);
  });

  // Filter Copilot models based on enabled models from global settings
  const filteredCopilotModels = COPILOT_MODELS.filter((model) => {
    // Extract the copilot model ID from the prefixed ID (e.g., "copilot-gpt-4o" -> "gpt-4o")
    const copilotModelId = stripProviderPrefix(model.id);
    return enabledCopilotModels.includes(copilotModelId);
  });

  // Filter Local LLM models based on enabled models from global settings
  const filteredLocalLlmModels = localLlmModels
    .filter((model) => enabledLocalLlmModels.includes(model.id))
    .map((model) => ({
      id: `local-${model.id}`, // Add local- prefix for consistency
      label: model.label,
      description: model.description,
      badge: `${Math.round(model.contextWindow / 1000)}K`,
    }));

  const handleProviderChange = (provider: ModelProvider) => {
    if (provider === 'local-llm' && selectedProvider !== 'local-llm') {
      // Use user's favorited model, or first available enabled model, or empty if none
      const defaultModel = localLlmDefaultModel
        ? `local-${localLlmDefaultModel}`
        : filteredLocalLlmModels[0]?.id || '';

      if (defaultModel) {
        onModelSelect(defaultModel);
      }
    } else if (provider === 'cursor' && selectedProvider !== 'cursor') {
      // Switch to Cursor's default model (from global settings)
      onModelSelect(`${PROVIDER_PREFIXES.cursor}${cursorDefaultModel}`);
    } else if (provider === 'claude' && selectedProvider !== 'claude') {
      // Switch to Claude's default model
      onModelSelect('sonnet');
    } else if (provider === 'github-copilot' && selectedProvider !== 'github-copilot') {
      // Switch to Copilot's default model
      onModelSelect('copilot-gpt-4o');
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div className="space-y-2">
        <Label>AI Provider</Label>
        <div className="flex gap-2">
          {isClaudeEnabled && (
            <button
              type="button"
              onClick={() => handleProviderChange('claude')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                selectedProvider === 'claude'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid={`${testIdPrefix}-provider-claude`}
            >
              <Bot className="w-4 h-4" />
              Claude
            </button>
          )}
          {isCursorEnabled && (
            <button
              type="button"
              onClick={() => handleProviderChange('cursor')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                selectedProvider === 'cursor'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid={`${testIdPrefix}-provider-cursor`}
            >
              <Terminal className="w-4 h-4" />
              Cursor CLI
            </button>
          )}
          {isCopilotEnabled && (
            <button
              type="button"
              onClick={() => handleProviderChange('github-copilot')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                selectedProvider === 'github-copilot'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid={`${testIdPrefix}-provider-copilot`}
            >
              <Github className="w-4 h-4" />
              Copilot
            </button>
          )}
          {isLocalLlmEnabled && (
            <button
              type="button"
              onClick={() => handleProviderChange('local-llm')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                selectedProvider === 'local-llm'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent border-border'
              )}
              data-testid={`${testIdPrefix}-provider-local`}
            >
              <Server className="w-4 h-4" />
              Local LLM
            </button>
          )}
        </div>
      </div>

      {/* Claude Models */}
      {selectedProvider === 'claude' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Claude Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              Native SDK
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CLAUDE_MODELS.map((option) => {
              const isSelected = selectedModel === option.id;
              const shortName = option.label.replace('Claude ', '');
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onModelSelect(option.id)}
                  title={option.description}
                  className={cn(
                    'flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-input'
                  )}
                  data-testid={`${testIdPrefix}-${option.id}`}
                >
                  {shortName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GitHub Copilot Models */}
      {selectedProvider === 'github-copilot' && (
        <div className="space-y-3">
          {/* Warning when GitHub Copilot is not available */}
          {!isCopilotAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                GitHub Copilot is not authenticated. Configure it in Settings → AI Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Github className="w-4 h-4 text-primary" />
              Copilot Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              API
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredCopilotModels.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2 text-center">
                No Copilot models enabled.{' '}
                <span className="text-primary cursor-pointer hover:underline">
                  Configure in Settings
                </span>
              </div>
            ) : (
              filteredCopilotModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    {option.badge && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          isSelected
                            ? 'border-primary-foreground/50 text-primary-foreground'
                            : 'border-muted-foreground/50 text-muted-foreground'
                        )}
                      >
                        {option.badge}
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Cursor Models */}
      {selectedProvider === 'cursor' && (
        <div className="space-y-3">
          {/* Warning when Cursor CLI is not available */}
          {!isCursorAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                Cursor CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Cursor Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400">
              CLI
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredCursorModels.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                No Cursor models enabled. Enable models in Settings → AI Providers.
              </div>
            ) : (
              filteredCursorModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <div className="flex gap-1">
                      {option.hasThinking && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                          )}
                        >
                          Thinking
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Local LLM Models */}
      {selectedProvider === 'local-llm' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Local LLM Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              Local
            </span>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Running on your hardware via LM Studio, Ollama, or vLLM
          </div>

          {/* Warning when Local LLM is not available */}
          {!isLocalLlmAvailable && !isLoadingLocalLlmModels && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                  Local LLM Server Not Connected
                </p>
                <p className="text-xs text-muted-foreground">
                  Start LM Studio and load a model, then refresh this page.{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.reload();
                    }}
                    className="text-primary font-medium hover:underline"
                  >
                    Reload now
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoadingLocalLlmModels && (
            <div className="text-xs text-muted-foreground py-4 text-center flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent" />
              Loading models from server...
            </div>
          )}

          {/* No models enabled */}
          {isLocalLlmAvailable &&
            !isLoadingLocalLlmModels &&
            filteredLocalLlmModels.length === 0 && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                <p className="text-xs text-muted-foreground">
                  No Local LLM models enabled.{' '}
                  <a
                    href="/settings"
                    className="text-primary font-medium hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = '/#/settings';
                    }}
                  >
                    Configure in Settings
                  </a>
                </p>
              </div>
            )}

          {/* Models List */}
          {!isLoadingLocalLlmModels && filteredLocalLlmModels.length > 0 && (
            <div className="flex flex-col gap-2">
              {filteredLocalLlmModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    {option.badge && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          isSelected
                            ? 'border-primary-foreground/50 text-primary-foreground'
                            : 'border-muted-foreground/50 text-muted-foreground'
                        )}
                      >
                        {option.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
