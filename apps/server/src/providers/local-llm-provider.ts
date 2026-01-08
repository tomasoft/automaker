/**
 * Local LLM Provider - Executes queries using local LLM servers
 *
 * Supports LM Studio, Ollama, vLLM, and any OpenAI-compatible local server.
 * Provides full autonomous agent capabilities while keeping everything local.
 */

import { BaseProvider } from './base-provider.js';
import { createLogger } from '@automaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ConversationMessage,
} from './types.js';

const logger = createLogger('LocalLLMProvider');

interface LocalLLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LocalLLMChatRequest {
  messages: LocalLLMChatMessage[];
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream: boolean;
}

interface LocalLLMStreamChunk {
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
 * Local LLM Provider
 * Works with LM Studio, Ollama, vLLM, or any OpenAI-compatible API
 */
export class LocalLLMProvider extends BaseProvider {
  private endpoint: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(
    config: {
      endpoint?: string;
      apiKey?: string;
      defaultModel?: string;
    } = {}
  ) {
    super(config);

    // Default to LM Studio's standard endpoint
    this.endpoint = config.endpoint || process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:1234/v1';
    this.apiKey = config.apiKey || process.env.LOCAL_LLM_API_KEY || 'not-needed';
    this.defaultModel = config.defaultModel || process.env.LOCAL_LLM_MODEL || 'local-model';

    logger.info(`LocalLLMProvider initialized with endpoint: ${this.endpoint}`);
  }

  getName(): string {
    return 'local-llm';
  }

  /**
   * Execute a query using local LLM
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, systemPrompt, conversationHistory = [] } = options;

    try {
      // Build messages array
      const messages: LocalLLMChatMessage[] = [];

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

      // Prepare request - use the model name directly (e.g., "qwen2.5-coder-30b")
      const modelName = this.stripLocalPrefix(model) || this.defaultModel;
      const requestBody: LocalLLMChatRequest = {
        messages,
        model: modelName,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      logger.info(
        `Local LLM request: model="${modelName}", endpoint="${this.endpoint}/chat/completions"`
      );
      logger.debug('Sending request to Local LLM:', {
        model: requestBody.model,
        messageCount: messages.length,
      });

      // Make streaming request to local LLM
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Local LLM API error: ${response.statusText}\n${errorText}\n\nMake sure LM Studio is running and the server is started.`
        );
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
   * Strip local- prefix from model name if present
   */
  private stripLocalPrefix(model: string): string {
    if (model.startsWith('local-')) {
      return model.slice(6);
    }
    return model;
  }

  /**
   * Stream and parse the response from local LLM
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
              const chunk: LocalLLMStreamChunk = JSON.parse(data);

              for (const choice of chunk.choices) {
                if (choice.delta.content) {
                  // Yield only the delta (new content), not accumulated
                  yield {
                    type: 'assistant',
                    message: {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: choice.delta.content,
                        },
                      ],
                    },
                  };

                  accumulatedText += choice.delta.content;
                }

                // Check for finish
                if (choice.finish_reason === 'stop' || choice.finish_reason === 'end_turn') {
                  yield {
                    type: 'result',
                    subtype: 'success',
                    result: accumulatedText,
                  };
                }
              }
            } catch (parseError) {
              logger.debug('Failed to parse chunk, skipping:', parseError);
            }
          }
        }
      }

      // If we didn't get an explicit finish, yield final result
      if (accumulatedText) {
        yield {
          type: 'result',
          subtype: 'success',
          result: accumulatedText,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Extract text content from message content blocks
   */
  private extractTextFromContent(content: any[]): string {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text || '')
      .join('\n');
  }

  /**
   * Detect local LLM server installation/availability
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      // Try to connect to the server
      const response = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        return {
          installed: false,
          method: 'local',
          hasApiKey: false,
          authenticated: false,
          error: `Server returned ${response.status}. Is LM Studio running?`,
        };
      }

      const data = await response.json();
      const hasModels = data.data && Array.isArray(data.data) && data.data.length > 0;

      return {
        installed: true,
        method: 'local',
        hasApiKey: true,
        authenticated: true,
        error: hasModels ? undefined : 'No models loaded. Load a model in LM Studio.',
      };
    } catch (error) {
      return {
        installed: false,
        method: 'local',
        hasApiKey: false,
        authenticated: false,
        error: `Cannot connect to ${this.endpoint}. Is LM Studio running and the server started?`,
      };
    }
  }

  /**
   * Get available local LLM models
   */
  getAvailableModels(): ModelDefinition[] {
    // These are common model types users might load
    return [
      {
        id: 'qwen2.5-coder-32b',
        name: 'Qwen2.5-Coder 32B',
        modelString: 'qwen2.5-coder-32b',
        provider: 'local-llm',
        description: 'Excellent coding model (32B parameters)',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard',
        default: true,
      },
      {
        id: 'deepseek-coder-v2-16b',
        name: 'DeepSeek Coder V2 16B',
        modelString: 'deepseek-coder-v2-16b',
        provider: 'local-llm',
        description: 'Capable coding model (16B parameters)',
        contextWindow: 16384,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard',
      },
      {
        id: 'codellama-34b',
        name: 'CodeLlama 34B',
        modelString: 'codellama-34b',
        provider: 'local-llm',
        description: "Meta's code specialist",
        contextWindow: 16384,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard',
      },
    ];
  }
}
