import type { ModelAlias, ThinkingLevel } from '@/store/app-store';
import type { ModelProvider } from '@automaker/types';
import { CURSOR_MODEL_MAP } from '@automaker/types';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';

export type ModelOption = {
  id: string; // Claude models use ModelAlias, Cursor models use "cursor-{id}"
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
  hasThinking?: boolean;
};

export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'haiku',
    label: 'Claude Haiku',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'claude',
  },
  {
    id: 'sonnet',
    label: 'Claude Sonnet',
    description: 'Balanced performance with strong reasoning.',
    badge: 'Balanced',
    provider: 'claude',
  },
  {
    id: 'opus',
    label: 'Claude Opus',
    description: 'Most capable model for complex work.',
    badge: 'Premium',
    provider: 'claude',
  },
];

/**
 * Cursor models derived from CURSOR_MODEL_MAP
 * ID is prefixed with "cursor-" for ProviderFactory routing
 */
export const CURSOR_MODELS: ModelOption[] = Object.entries(CURSOR_MODEL_MAP).map(
  ([id, config]) => ({
    id: `cursor-${id}`,
    label: config.label,
    description: config.description,
    provider: 'cursor' as ModelProvider,
    hasThinking: config.hasThinking,
  })
);

/**
 * GitHub Copilot models
 * ID is prefixed with "copilot-" for ProviderFactory routing
 * Matches the comprehensive list from GitHub Copilot docs
 */
export const COPILOT_MODELS: ModelOption[] = [
  // Claude Models
  {
    id: 'copilot-claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Fast, efficient model',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-claude-sonnet-4',
    label: 'Claude Sonnet 4',
    description: 'Balanced performance',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    description: 'Enhanced Sonnet',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-claude-opus-4.1',
    label: 'Claude Opus 4.1',
    description: 'Most capable Claude',
    badge: 'Premium',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-claude-opus-4.5',
    label: 'Claude Opus 4.5',
    description: 'Latest flagship',
    badge: 'Premium',
    provider: 'github-copilot',
  },

  // GPT Models
  {
    id: 'copilot-gpt-4.1',
    label: 'GPT-4.1',
    description: 'Improved GPT-4',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-4o',
    label: 'GPT-4o',
    description: 'GPT-4 Optimized',
    badge: 'Premium',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Compact GPT-4o',
    badge: 'Fast',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5',
    label: 'GPT-5',
    description: 'Latest flagship',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5-mini',
    label: 'GPT-5 mini',
    description: 'Compact GPT-5',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5-codex',
    label: 'GPT-5-Codex',
    description: 'Code specialized',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5.1',
    label: 'GPT-5.1',
    description: 'Enhanced GPT-5',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5.1-codex',
    label: 'GPT-5.1-Codex',
    description: 'Latest code model',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5.1-codex-mini',
    label: 'GPT-5.1-Codex-Mini',
    description: 'Compact code',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5.1-codex-max',
    label: 'GPT-5.1-Codex-Max',
    description: 'Maximum capability',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gpt-5.2',
    label: 'GPT-5.2',
    description: 'Latest GPT',
    provider: 'github-copilot',
  },

  // Gemini Models
  {
    id: 'copilot-gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Advanced Gemini',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gemini-3-flash',
    label: 'Gemini 3 Flash',
    description: 'Fast Gemini',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-gemini-3-pro',
    label: 'Gemini 3 Pro',
    description: 'Latest Gemini Pro',
    provider: 'github-copilot',
  },

  // Other Models
  {
    id: 'copilot-grok-code-fast-1',
    label: 'Grok Code Fast 1',
    description: 'Fast code from xAI',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-raptor-mini',
    label: 'Raptor mini',
    description: 'Optimized mini',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-o1-preview',
    label: 'o1-preview',
    description: 'Reasoning model',
    badge: 'Reasoning',
    provider: 'github-copilot',
  },
  {
    id: 'copilot-o1-mini',
    label: 'o1-mini',
    description: 'Compact reasoning',
    provider: 'github-copilot',
  },
];

/**
 * Local LLM models (LM Studio, Ollama, vLLM)
 * ID is prefixed with "local-" for ProviderFactory routing
 */
export const LOCAL_LLM_MODELS: ModelOption[] = [
  // Qwen Models
  {
    id: 'local-qwen2.5-coder-32b',
    label: 'Qwen2.5-Coder 32B',
    description: 'Excellent coding (32B)',
    badge: 'Recommended',
    provider: 'local-llm',
  },
  {
    id: 'local-qwen2.5-coder-14b',
    label: 'Qwen2.5-Coder 14B',
    description: 'Good coding (14B)',
    provider: 'local-llm',
  },
  {
    id: 'local-qwen2.5-coder-7b',
    label: 'Qwen2.5-Coder 7B',
    description: 'Fast coding (7B)',
    badge: 'Fast',
    provider: 'local-llm',
  },

  // DeepSeek Models
  {
    id: 'local-deepseek-coder-v2-16b',
    label: 'DeepSeek Coder V2 16B',
    description: 'Capable coder (16B)',
    provider: 'local-llm',
  },
  {
    id: 'local-deepseek-coder-33b',
    label: 'DeepSeek Coder 33B',
    description: 'Strong coder (33B)',
    provider: 'local-llm',
  },

  // CodeLlama Models
  {
    id: 'local-codellama-34b',
    label: 'CodeLlama 34B',
    description: 'Meta code model (34B)',
    provider: 'local-llm',
  },
  {
    id: 'local-codellama-13b',
    label: 'CodeLlama 13B',
    description: 'Meta code model (13B)',
    provider: 'local-llm',
  },
  {
    id: 'local-codellama-7b',
    label: 'CodeLlama 7B',
    description: 'Fast Meta model (7B)',
    badge: 'Fast',
    provider: 'local-llm',
  },

  // Other Popular Models
  {
    id: 'local-mistral-7b',
    label: 'Mistral 7B',
    description: 'General purpose (7B)',
    provider: 'local-llm',
  },
  {
    id: 'local-mixtral-8x7b',
    label: 'Mixtral 8x7B',
    description: 'MoE model (8x7B)',
    provider: 'local-llm',
  },
  {
    id: 'local-llama-3.1-70b',
    label: 'Llama 3.1 70B',
    description: 'Meta flagship (70B)',
    provider: 'local-llm',
  },
  {
    id: 'local-phi-3-medium',
    label: 'Phi-3 Medium',
    description: 'Microsoft small model',
    badge: 'Fast',
    provider: 'local-llm',
  },
];

/**
 * All available models (Claude + Cursor + GitHub Copilot + Local LLM)
 */
export const ALL_MODELS: ModelOption[] = [
  ...CLAUDE_MODELS,
  ...CURSOR_MODELS,
  ...COPILOT_MODELS,
  ...LOCAL_LLM_MODELS,
];

export const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'ultrathink'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

// Profile icon mapping
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};
