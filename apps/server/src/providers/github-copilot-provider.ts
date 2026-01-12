/**
 * GitHub Copilot Provider - Executes queries using GitHub Copilot API
 *
 * Provides OpenAI-compatible chat completions using GitHub Copilot as the backend.
 * Based on: https://github.com/ericc-ch/copilot-api
 */

import { BaseProvider } from './base-provider.js';
import { CopilotAuthManager } from './copilot-auth.js';
import { createLogger } from '@automaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ConversationMessage,
} from './types.js';

const logger = createLogger('GitHubCopilotProvider');

interface CopilotChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CopilotChatRequest {
  messages: CopilotChatMessage[];
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream: boolean;
}

interface CopilotStreamChunk {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
    };
    index: number;
    finish_reason?: string | null;
  }>;
}

/**
 * GitHub Copilot Provider
 */
export class GitHubCopilotProvider extends BaseProvider {
  private static readonly CHAT_COMPLETIONS_URL = 'https://api.githubcopilot.com/chat/completions';
  private static readonly MODELS_URL = 'https://api.githubcopilot.com/models';
  private authManager: CopilotAuthManager;
  private cachedModels: string[] | null = null;

  constructor(config?: { githubToken?: string }) {
    super(config || {});
    this.authManager = new CopilotAuthManager(config?.githubToken);
  }

  getName(): string {
    return 'github-copilot';
  }

  /**
   * Execute a query using GitHub Copilot API
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, systemPrompt, conversationHistory = [] } = options;

    try {
      // Get Copilot authentication token
      const token = await this.authManager.getToken();

      // Build messages array
      const messages: CopilotChatMessage[] = [];

      // Add system prompt if provided
      if (systemPrompt && typeof systemPrompt === 'string') {
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

      // Add conversation history
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: Array.isArray(msg.content)
            ? this.extractTextFromContent(msg.content)
            : msg.content,
        });
      }

      // Add current prompt
      const promptText = Array.isArray(prompt) ? this.extractTextFromContent(prompt) : prompt;

      messages.push({
        role: 'user',
        content: promptText,
      });

      // Prepare request
      const mappedModel = this.mapModelToCopilot(model);
      const requestBody: CopilotChatRequest = {
        messages,
        model: mappedModel,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      logger.info(`Copilot API request: original model="${model}", mapped model="${mappedModel}"`);
      logger.debug('Sending request to GitHub Copilot:', {
        model: requestBody.model,
        messageCount: messages.length,
      });

      // Make streaming request to GitHub Copilot
      const response = await fetch(GitHubCopilotProvider.CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Editor-Version': 'vscode/1.95.0',
          'Editor-Plugin-Version': 'copilot-chat/0.22.4',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // If model is not supported, fetch and log available models
        if (errorText.includes('model_not_supported')) {
          const availableModels = await this.fetchAvailableModels();
          const availableModelsMsg =
            availableModels.length > 0
              ? `\n\nAvailable models for your Copilot subscription: ${availableModels.join(', ')}`
              : '\n\nUnable to fetch available models. Your Copilot plan may not support this model.';
          throw new Error(
            `GitHub Copilot API error: ${response.statusText}\n${errorText}${availableModelsMsg}`
          );
        }

        throw new Error(`GitHub Copilot API error: ${response.statusText}\n${errorText}`);
      }

      // Stream the response
      yield* this.streamResponse(response);
    } catch (error) {
      logger.error('Error executing query:', error);

      // Yield error message
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      throw error;
    }
  }

  /**
   * Stream and parse the response from GitHub Copilot
   */
  private async *streamResponse(response: Response): AsyncGenerator<ProviderMessage> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            try {
              const chunk: CopilotStreamChunk = JSON.parse(data);

              for (const choice of chunk.choices) {
                if (choice.delta.content) {
                  accumulatedText += choice.delta.content;

                  // Yield only the delta (new content), not the accumulated text
                  // This prevents duplication when the consumer appends chunks
                  yield {
                    type: 'assistant',
                    message: {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: choice.delta.content, // Only the new content
                        },
                      ],
                    },
                  };
                }

                // Check for finish - yield the final accumulated result
                if (choice.finish_reason === 'stop') {
                  yield {
                    type: 'result',
                    subtype: 'success',
                    result: accumulatedText,
                  };
                }
              }
            } catch (parseError) {
              logger.error('Error parsing SSE chunk:', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Extract text content from multi-part content array
   */
  private extractTextFromContent(
    content: Array<{ type: string; text?: string; source?: object }>
  ): string {
    return content
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('\n');
  }

  /**
   * Map model names to GitHub Copilot model identifiers
   */
  private mapModelToCopilot(model: string): string {
    // Strip copilot- prefix if present
    const bareModel = model.startsWith('copilot-') ? model.slice(8) : model;

    const modelMap: Record<string, string> = {
      // Claude 4.x models (via Copilot)
      'claude-haiku-4.5': 'claude-3-haiku',
      'claude-sonnet-4': 'claude-3-5-sonnet',
      'claude-sonnet-4.5': 'claude-3-5-sonnet',
      'claude-opus-4.1': 'claude-3-opus',
      'claude-opus-4.5': 'claude-3-opus',

      // Claude 3.x models (via Copilot)
      'claude-3.5-sonnet': 'claude-3-5-sonnet',
      'claude-3-opus': 'claude-3-opus',
      'claude-3-sonnet': 'claude-3-sonnet',
      'claude-3-haiku': 'claude-3-haiku',

      // GPT-4 models
      'gpt-4': 'gpt-4',
      'gpt-4.1': 'gpt-4',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',

      // GPT-5 models (map to closest available)
      'gpt-5': 'gpt-4o',
      'gpt-5-mini': 'gpt-4o-mini',
      'gpt-5-codex': 'gpt-4o',
      'gpt-5.1': 'gpt-4o',
      'gpt-5.1-codex': 'gpt-4o',
      'gpt-5.1-codex-mini': 'gpt-4o-mini',
      'gpt-5.1-codex-max': 'gpt-4o',
      'gpt-5.2': 'gpt-4o',

      // GPT-3.5
      'gpt-3.5-turbo': 'gpt-3.5-turbo',

      // Gemini models (map to closest available)
      'gemini-2.5-pro': 'gpt-4o',
      'gemini-3-flash': 'gpt-4o-mini',
      'gemini-3-pro': 'gpt-4o',

      // o1 models
      'o1-preview': 'o1-preview',
      'o1-mini': 'o1-mini',

      // Other models (map to closest available)
      'grok-code-fast-1': 'gpt-4o-mini',
      'raptor-mini': 'gpt-4o-mini',
    };

    const mapped = modelMap[bareModel] || bareModel;
    logger.debug(`Mapped Copilot model: "${model}" (bare: "${bareModel}") -> "${mapped}"`);
    return mapped;
  }

  /**
   * Fetch available models from GitHub Copilot API
   */
  private async fetchAvailableModels(): Promise<string[]> {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    try {
      const token = await this.authManager.getToken();

      const response = await fetch(GitHubCopilotProvider.MODELS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Editor-Version': 'vscode/1.95.0',
          'Editor-Plugin-Version': 'copilot-chat/0.22.4',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch models from Copilot API: ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as
        | {
            data?: Array<{ id?: string; model?: string; name?: string }>;
          }
        | Array<{ id?: string; model?: string; name?: string }>;
      logger.info('Fetched available models from Copilot API:', data);

      // Extract model IDs from the response
      // The API response format varies, but typically has a 'data' array with model objects
      if (Array.isArray((data as any)?.data)) {
        this.cachedModels = (data as any).data
          .map((m: any) => m.id || m.model || m.name)
          .filter(Boolean);
      } else if (Array.isArray(data)) {
        this.cachedModels = (data as any[])
          .map((m: any) => m.id || m.model || m.name)
          .filter(Boolean);
      } else {
        this.cachedModels = [];
      }

      logger.info(`Available Copilot models: ${this.cachedModels?.join(', ') || 'none'}`);
      return this.cachedModels || [];
    } catch (error) {
      logger.error('Error fetching available models:', error);
      return [];
    }
  }

  /**
   * Detect GitHub Copilot installation status
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      const hasAccess = await this.authManager.checkAccess();

      // Try to fetch available models to verify API access
      if (hasAccess) {
        await this.fetchAvailableModels();
      }

      return {
        installed: true,
        method: 'sdk',
        hasApiKey: hasAccess,
        authenticated: hasAccess,
      };
    } catch (error) {
      return {
        installed: true,
        method: 'sdk',
        hasApiKey: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available GitHub Copilot models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        modelString: 'gpt-4o',
        provider: 'github-copilot',
        description: 'Most capable GPT-4 model via GitHub Copilot',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
        default: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        modelString: 'gpt-4o-mini',
        provider: 'github-copilot',
        description: 'Fast and efficient GPT-4 model',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard',
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        modelString: 'gpt-4-turbo',
        provider: 'github-copilot',
        description: 'Previous generation GPT-4 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
      },
      {
        id: 'claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3.5-sonnet',
        provider: 'github-copilot',
        description: 'Claude 3.5 Sonnet via GitHub Copilot',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
      },
      {
        id: 'o1-preview',
        name: 'OpenAI o1 Preview',
        modelString: 'o1-preview',
        provider: 'github-copilot',
        description: 'Advanced reasoning model (preview)',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsTools: false,
        tier: 'premium',
      },
      {
        id: 'o1-mini',
        name: 'OpenAI o1 Mini',
        modelString: 'o1-mini',
        provider: 'github-copilot',
        description: 'Faster reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsTools: false,
        tier: 'standard',
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'streaming'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Perform GitHub authentication flow
   */
  async authenticate(): Promise<string> {
    return this.authManager.authenticate();
  }

  /**
   * Get current Copilot token
   */
  async getToken(): Promise<string> {
    return this.authManager.getToken();
  }
}
