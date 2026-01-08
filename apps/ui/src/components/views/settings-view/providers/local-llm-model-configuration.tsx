import { useState, useEffect } from 'react';
import { RefreshCw, Server, AlertTriangle, Star } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LocalLlmModel {
  id: string;
  label: string;
  description: string;
  provider: string;
  contextWindow: number;
}

export function LocalLlmModelConfiguration() {
  const {
    enabledLocalLlmModels,
    seenLocalLlmModels,
    localLlmDefaultModel,
    toggleLocalLlmModel,
    setEnabledLocalLlmModels,
    setLocalLlmDefaultModel,
    updateSeenLocalLlmModels,
  } = useAppStore();
  const [models, setModels] = useState<LocalLlmModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getHttpApiClient();
      const result = await api.localLlm.getModels();

      if (result.success && result.models) {
        setModels(result.models);

        const currentModelIds = result.models.map((m) => m.id);

        // Find new models (not seen before)
        const newModels = currentModelIds.filter((id) => !seenLocalLlmModels.includes(id));

        if (newModels.length > 0) {
          // Auto-enable only NEW models
          const updatedEnabled = [...new Set([...enabledLocalLlmModels, ...newModels])];
          setEnabledLocalLlmModels(updatedEnabled);
          toast.success(`Enabled ${newModels.length} new model(s)`);
        }

        // Validate default model: if it's set but no longer available, clear it
        if (localLlmDefaultModel && !currentModelIds.includes(localLlmDefaultModel)) {
          setLocalLlmDefaultModel('');
          toast.info('Default model is no longer available and has been cleared');
        }

        // Update seen models list
        updateSeenLocalLlmModels(currentModelIds);
      } else {
        setError(result.error || 'Failed to fetch models');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleToggleModel = (modelId: string, enabled: boolean) => {
    toggleLocalLlmModel(modelId, enabled);

    // If disabling the default model, clear the default
    if (!enabled && localLlmDefaultModel === modelId) {
      setLocalLlmDefaultModel('');
      toast.info('Model disabled and default cleared');
    } else {
      toast.success(`Model ${enabled ? 'enabled' : 'disabled'}`);
    }
  };

  const handleRefresh = async () => {
    toast.info('Refreshing models from server...');
    await fetchModels();
    toast.success('Models refreshed');
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Server className="w-5 h-5" />
              Available Models
            </h2>
            <p className="text-sm text-muted-foreground/80 mt-1">
              Models loaded in your local LLM server
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Fetching models from server...
            </span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-400/90 flex-1">
              <span className="font-medium">Failed to fetch models</span>
              <p className="text-xs text-red-400/70 mt-1">{error}</p>
              <p className="text-xs text-red-400/70 mt-2">
                Make sure LM Studio is running and a model is loaded
              </p>
            </div>
          </div>
        )}

        {/* No Models State */}
        {!isLoading && !error && models.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No models loaded</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Load a model in LM Studio and click Refresh
            </p>
          </div>
        )}

        {/* Models List */}
        {!isLoading && models.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {models.length} model{models.length !== 1 ? 's' : ''} available •{' '}
              {enabledLocalLlmModels.length} enabled
            </div>
            <div className="grid grid-cols-1 gap-3">
              {models.map((model) => {
                const isEnabled = enabledLocalLlmModels.includes(model.id);
                const isDefault = localLlmDefaultModel === model.id;
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'flex items-start justify-between rounded-lg border p-4 transition-colors',
                      isDefault && 'bg-amber-500/10 border-amber-500/30',
                      !isDefault && isEnabled && 'bg-primary/5 border-primary/20',
                      !isDefault && !isEnabled && 'bg-muted/10 border-border'
                    )}
                  >
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`model-${model.id}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {model.label}
                        </Label>
                        {isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{model.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground/70">
                          Context: {model.contextWindow.toLocaleString()} tokens
                        </span>
                        <span className="text-xs text-muted-foreground/50">•</span>
                        <span className="text-xs text-muted-foreground/70 font-mono">
                          {model.id}
                        </span>
                        {isEnabled && !isDefault && (
                          <>
                            <span className="text-xs text-muted-foreground/50">•</span>
                            <button
                              onClick={() => {
                                setLocalLlmDefaultModel(model.id);
                                toast.success(`Set ${model.label} as default`);
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              Set as default
                            </button>
                          </>
                        )}
                        {isDefault && (
                          <>
                            <span className="text-xs text-muted-foreground/50">•</span>
                            <button
                              onClick={() => {
                                setLocalLlmDefaultModel('');
                                toast.success('Cleared default model');
                              }}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Clear default
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <Switch
                      id={`model-${model.id}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleToggleModel(model.id, checked)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
