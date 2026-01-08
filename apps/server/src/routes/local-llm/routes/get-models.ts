/**
 * Get Local LLM Models Route
 *
 * Fetches available models from the local LLM server (LM Studio, Ollama, etc.)
 */

import { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LocalLLMModelsRoute');

interface LocalLLMModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

export function createGetLocalLLMModelsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const endpoint = process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:1234/v1';
      const apiKey = process.env.LOCAL_LLM_API_KEY || 'not-needed';

      logger.info(`Fetching models from: ${endpoint}/models`);

      // Fetch models from local LLM server
      const response = await fetch(`${endpoint}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        logger.warn('Unexpected response format from models endpoint:', data);
        res.json({
          success: false,
          error: 'Invalid response format from local LLM server',
          models: [],
        });
        return;
      }

      // Transform models to our format
      const models = data.data.map((model: LocalLLMModel) => ({
        id: model.id,
        label: formatModelName(model.id),
        description: getModelDescription(model.id),
        provider: 'local-llm',
        contextWindow: estimateContextWindow(model.id),
      }));

      logger.info(
        `Found ${models.length} models:`,
        models.map((m: any) => m.id)
      );

      res.json({
        success: true,
        models,
        endpoint,
      });
    } catch (error) {
      logger.error('Error fetching Local LLM models:', error);
      res.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models',
        models: [],
      });
    }
  };
}

/**
 * Format model ID into a readable label
 */
function formatModelName(modelId: string): string {
  // Remove file extensions and quantization suffixes
  let name = modelId
    .replace(/\.gguf$/i, '')
    .replace(/-Q[0-9]_K_[SML]$/i, '')
    .replace(/-[0-9]+-[0-9]+$/i, ''); // Remove timestamps

  // Handle common patterns
  name = name.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // Capitalize words
  name = name.replace(/\b\w/g, (char) => char.toUpperCase());

  return name;
}

/**
 * Get description based on model name patterns
 */
function getModelDescription(modelId: string): string {
  const lower = modelId.toLowerCase();

  if (lower.includes('qwen') && lower.includes('coder')) {
    return 'Excellent coding model from Alibaba';
  }
  if (lower.includes('deepseek') && lower.includes('coder')) {
    return 'Capable coding model from DeepSeek';
  }
  if (lower.includes('codellama') || lower.includes('code-llama')) {
    return "Meta's specialized code model";
  }
  if (lower.includes('starcoder')) {
    return "BigCode's coding model";
  }
  if (lower.includes('wizardcoder')) {
    return 'WizardLM coding variant';
  }
  if (lower.includes('mistral')) {
    return 'General purpose model from Mistral AI';
  }
  if (lower.includes('mixtral')) {
    return 'Mixture-of-Experts model';
  }
  if (lower.includes('llama') || lower.includes('llama3')) {
    return "Meta's foundation model";
  }
  if (lower.includes('phi')) {
    return "Microsoft's small language model";
  }
  if (lower.includes('gemma')) {
    return "Google's open model";
  }

  return 'Local language model';
}

/**
 * Estimate context window based on model name
 */
function estimateContextWindow(modelId: string): number {
  const lower = modelId.toLowerCase();

  // Look for explicit context length indicators
  if (lower.includes('32k')) return 32768;
  if (lower.includes('16k')) return 16384;
  if (lower.includes('8k')) return 8192;
  if (lower.includes('4k')) return 4096;

  // Model-specific defaults
  if (lower.includes('qwen2.5') || lower.includes('qwen-2.5')) return 32768;
  if (lower.includes('deepseek-v2') || lower.includes('deepseek-coder-v2')) return 16384;
  if (lower.includes('llama-3') || lower.includes('llama3')) return 8192;
  if (lower.includes('codellama')) return 16384;
  if (lower.includes('mistral')) return 8192;
  if (lower.includes('mixtral')) return 32768;

  // Default
  return 8192;
}
