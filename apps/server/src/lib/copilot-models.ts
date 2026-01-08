/**
 * GitHub Copilot Model Configuration
 * Based on: https://docs.github.com/en/copilot/reference/ai-models/supported-models
 */

export type CopilotPlan = 'free' | 'pro' | 'pro+' | 'business' | 'enterprise';

export interface CopilotModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  multiplier: number; // Premium request multiplier
  availability: CopilotPlan[]; // Which plans have access
}

/**
 * All available GitHub Copilot models
 * Updated: January 2026
 */
export const COPILOT_MODELS: CopilotModel[] = [
  // Claude Models
  {
    id: 'claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fast, efficient model for quick tasks',
    multiplier: 0.33,
    availability: ['free', 'pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    description: 'Balanced performance and capability',
    multiplier: 1,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Enhanced Sonnet with improved reasoning',
    multiplier: 1,
    availability: ['pro+', 'enterprise'],
  },
  {
    id: 'claude-opus-4.1',
    name: 'Claude Opus 4.1',
    provider: 'Anthropic',
    description: 'Most capable Claude model',
    multiplier: 10,
    availability: ['enterprise'],
  },
  {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
    description: 'Latest flagship Claude model',
    multiplier: 3,
    availability: ['pro+', 'enterprise'],
  },

  // GPT Models
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'OpenAI',
    description: 'Improved GPT-4 model',
    multiplier: 0,
    availability: ['free', 'pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'OpenAI',
    description: 'Latest flagship OpenAI model',
    multiplier: 1,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 mini',
    provider: 'OpenAI',
    description: 'Compact, efficient GPT-5 variant',
    multiplier: 0,
    availability: ['free', 'pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gpt-5-codex',
    name: 'GPT-5-Codex',
    provider: 'OpenAI',
    description: 'Specialized for code generation',
    multiplier: 1,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    provider: 'OpenAI',
    description: 'Enhanced GPT-5 model',
    multiplier: 1,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1-Codex',
    provider: 'OpenAI',
    description: 'Latest code-specialized model',
    multiplier: 1,
    availability: ['pro+', 'enterprise'],
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1-Codex-Mini',
    provider: 'OpenAI',
    description: 'Compact code model',
    multiplier: 0.33,
    availability: ['pro+', 'enterprise'],
  },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1-Codex-Max',
    provider: 'OpenAI',
    description: 'Maximum capability code model',
    multiplier: 1,
    availability: ['pro+', 'enterprise'],
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'OpenAI',
    description: 'Latest GPT model',
    multiplier: 1,
    availability: ['pro+', 'enterprise'],
  },

  // Gemini Models
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Advanced Gemini model',
    multiplier: 1,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'Google',
    description: 'Fast Gemini variant',
    multiplier: 0.33,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'Google',
    description: 'Latest Gemini Pro model',
    multiplier: 1,
    availability: ['pro+', 'enterprise'],
  },

  // Other Models
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    provider: 'xAI',
    description: 'Fast code generation from xAI',
    multiplier: 0.25,
    availability: ['pro', 'pro+', 'business', 'enterprise'],
  },
  {
    id: 'raptor-mini',
    name: 'Raptor mini',
    provider: 'Fine-tuned GPT-5 mini',
    description: 'Optimized mini model',
    multiplier: 0,
    availability: ['free', 'pro', 'pro+', 'business', 'enterprise'],
  },
];

/**
 * Get models available for a specific Copilot plan
 */
export function getModelsForPlan(plan: CopilotPlan): CopilotModel[] {
  return COPILOT_MODELS.filter((model) => model.availability.includes(plan));
}

/**
 * Check if a model is available for a specific plan
 */
export function isModelAvailableForPlan(modelId: string, plan: CopilotPlan): boolean {
  const model = COPILOT_MODELS.find((m) => m.id === modelId);
  return model ? model.availability.includes(plan) : false;
}

/**
 * Get model by ID
 */
export function getModelById(modelId: string): CopilotModel | undefined {
  return COPILOT_MODELS.find((m) => m.id === modelId);
}
