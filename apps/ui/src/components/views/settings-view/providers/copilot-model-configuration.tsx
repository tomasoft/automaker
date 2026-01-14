import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export interface CopilotModel {
  id: string;
  name: string;
  provider: string;
  description: string;
}

// All available Copilot models from https://docs.github.com/en/copilot/reference/ai-models/supported-models
const ALL_COPILOT_MODELS: CopilotModel[] = [
  // Claude Models
  {
    id: 'claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fast, efficient model',
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    description: 'Balanced performance',
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Enhanced Sonnet',
  },
  {
    id: 'claude-opus-4.1',
    name: 'Claude Opus 4.1',
    provider: 'Anthropic',
    description: 'Most capable Claude',
  },
  {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
    description: 'Latest flagship',
  },

  // GPT Models
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', description: 'Improved GPT-4' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', description: 'GPT-4 Optimized' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', description: 'Compact GPT-4o' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI', description: 'Latest flagship' },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', provider: 'OpenAI', description: 'Compact GPT-5' },
  { id: 'gpt-5-codex', name: 'GPT-5-Codex', provider: 'OpenAI', description: 'Code specialized' },
  { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'OpenAI', description: 'Enhanced GPT-5' },
  {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1-Codex',
    provider: 'OpenAI',
    description: 'Latest code model',
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1-Codex-Mini',
    provider: 'OpenAI',
    description: 'Compact code',
  },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1-Codex-Max',
    provider: 'OpenAI',
    description: 'Maximum capability',
  },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI', description: 'Latest GPT' },

  // Gemini Models
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Advanced Gemini',
  },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', description: 'Fast Gemini' },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'Google',
    description: 'Latest Gemini Pro',
  },

  // Other Models
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    provider: 'xAI',
    description: 'Fast code from xAI',
  },
  { id: 'raptor-mini', name: 'Raptor mini', provider: 'Fine-tuned', description: 'Optimized mini' },
  { id: 'o1-preview', name: 'o1-preview', provider: 'OpenAI', description: 'Reasoning model' },
  { id: 'o1-mini', name: 'o1-mini', provider: 'OpenAI', description: 'Compact reasoning' },
];

interface CopilotModelConfigurationProps {
  enabledModels: string[];
  onModelToggle: (modelId: string, enabled: boolean) => void;
  isSaving?: boolean;
  disabled?: boolean;
}

export function CopilotModelConfiguration({
  enabledModels,
  onModelToggle,
  isSaving = false,
  disabled,
}: CopilotModelConfigurationProps) {
  // Group models by provider
  const modelsByProvider = ALL_COPILOT_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, CopilotModel[]>
  );

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        disabled && 'opacity-50 pointer-events-none',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <Settings2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Available Models
            </h2>
            <p className="text-sm text-muted-foreground/80">
              Enable models based on your Copilot subscription tier
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mx-6 mt-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <div className="text-sm text-blue-400/90">
          <p className="font-medium mb-1">Configure Your Models</p>
          <p className="text-xs text-blue-400/70">
            Different Copilot plans (Free, Pro, Pro+, Business, Enterprise) have access to different
            models. Enable only the models available in your subscription.{' '}
            <a
              href="https://docs.github.com/en/copilot/reference/ai-models/supported-models#supported-ai-models-per-copilot-plan"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-300"
            >
              View plan details →
            </a>
          </p>
        </div>
      </div>

      {/* Models by Provider */}
      <div className="p-6 space-y-6">
        {Object.entries(modelsByProvider).map(([provider, models]) => (
          <div key={provider} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80">{provider}</h3>
            <div className="space-y-2">
              {models.map((model) => {
                const isEnabled = enabledModels.includes(model.id);
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg',
                      'border transition-colors',
                      isEnabled
                        ? 'bg-purple-500/5 border-purple-500/20'
                        : 'bg-muted/5 border-border/30 hover:border-border/50'
                    )}
                  >
                    <div className="flex-1">
                      <Label
                        htmlFor={`copilot-model-${model.id}`}
                        className="font-medium text-sm cursor-pointer"
                      >
                        {model.name}
                      </Label>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{model.description}</p>
                    </div>
                    <Switch
                      id={`copilot-model-${model.id}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => onModelToggle(model.id, checked)}
                      disabled={isSaving}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
