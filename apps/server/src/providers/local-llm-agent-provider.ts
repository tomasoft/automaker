/**
 * Local LLM Agent Provider - Autonomous agent using /v1/chat/completions API
 *
 * This provider uses the OpenAI-compatible /v1/chat/completions API
 * (supported by LM Studio, Ollama, vLLM, etc.) to enable full autonomous
 * agent capabilities with function calling.
 *
 * Supports:
 * - Function/tool calling for file operations
 * - Multi-turn agentic loops
 * - Full conversation history management
 * - Safe sandboxed tool execution
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
import { stripProviderPrefix } from '@automaker/types';
import { ALL_TOOLS, type ToolDefinition } from './local-llm-tools.js';
import { LocalLLMToolExecutor, type ToolCall, type ToolResult } from './local-llm-tool-executor.js';

const logger = createLogger('LocalLLMAgentProvider');

interface ResponseMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ResponseMessage[]; // Standard OpenAI format
  tools?: ToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  stream: boolean;
}

interface ResponseChunk {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
    message?: {
      role: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
  }>;
}

/**
 * Local LLM Agent Provider with full autonomous capabilities
 */
export class LocalLLMAgentProvider extends BaseProvider {
  private endpoint: string;
  private apiKey: string;
  private maxIterations: number;
  private projectRoot: string;

  constructor(config: { endpoint?: string; apiKey?: string; projectRoot?: string } = {}) {
    super(config);
    this.endpoint = config.endpoint || process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:1234/v1';
    this.apiKey = config.apiKey || process.env.LOCAL_LLM_API_KEY || 'not-needed';
    this.projectRoot = config.projectRoot || process.cwd();
    this.maxIterations = 20; // Maximum number of tool-calling iterations
    logger.info(`LocalLLMAgentProvider initialized with endpoint: ${this.endpoint}`);
  }

  getName(): string {
    return 'local-llm-agent';
  }

  /**
   * Execute a query with full agentic capabilities
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, systemPrompt, conversationHistory = [] } = options;

    try {
      // Build messages array
      const messages: ResponseMessage[] = [];

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

      // Strip provider prefix for the actual API call
      const bareModel = stripProviderPrefix(model);

      // Initialize tool executor
      const toolExecutor = new LocalLLMToolExecutor(this.projectRoot);

      // Start agentic loop
      yield* this.agenticLoop(bareModel, messages, toolExecutor);
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
   * Agentic loop: model thinks → calls tools → repeats until done
   */
  private async *agenticLoop(
    model: string,
    initialMessages: ResponseMessage[],
    toolExecutor: LocalLLMToolExecutor
  ): AsyncGenerator<ProviderMessage> {
    let messages = [...initialMessages];
    let iteration = 0;
    let accumulatedText = '';
    let isTaskComplete = false;

    while (iteration < this.maxIterations && !isTaskComplete) {
      iteration++;
      logger.info(`[Iteration ${iteration}] Starting agentic loop iteration`);

      // Call the model with current messages (full conversation history)
      const { responseId, content, toolCalls, finishReason } = await this.callModel(
        model,
        messages
      );

      // If model generated text content, yield it
      if (content) {
        accumulatedText += content;
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: content }],
          },
        };
      }

      // Add assistant message to history
      messages.push({
        role: 'assistant',
        content: content || undefined,
        tool_calls: toolCalls || undefined,
      });

      // If no tool calls, we're done
      if (!toolCalls || toolCalls.length === 0) {
        logger.info(`[Iteration ${iteration}] No tool calls, finishing`);

        yield {
          type: 'result',
          subtype: 'success',
          result: accumulatedText,
        };
        break;
      }

      // Check if task_complete was called
      const taskCompleteCall = toolCalls.find((tc) => tc.function.name === 'task_complete');
      if (taskCompleteCall) {
        logger.info(`[Iteration ${iteration}] Task marked as complete`);
        isTaskComplete = true;
      }

      // Execute tool calls
      logger.info(`[Iteration ${iteration}] Executing ${toolCalls.length} tool(s)`);

      for (const toolCall of toolCalls) {
        logger.info(`  - ${toolCall.function.name}`);
      }

      const toolResults = await toolExecutor.executeTools(toolCalls);

      // Add tool results to messages with enhanced error context
      for (const result of toolResults) {
        // For failed tools, provide helpful error context to the model
        let toolContent = result.output;
        if (!result.success) {
          const toolName = toolCalls.find((tc) => tc.id === result.tool_call_id)?.function.name;
          toolContent = `ERROR: Tool '${toolName}' failed: ${result.output}\n\nSuggestion: ${this.getToolErrorSuggestion(toolName, result.output)}`;
          logger.warn(`[Tool Error] ${toolName}: ${result.output}`);
        }

        messages.push({
          role: 'tool',
          content: toolContent,
          tool_call_id: result.tool_call_id,
        });

        // Yield tool execution update
        yield {
          type: 'info',
          message: `Tool ${toolCalls.find((tc) => tc.id === result.tool_call_id)?.function.name}: ${result.success ? 'Success' : 'Failed'}`,
        };
      }

      // If task is complete, do one final call to get closing message
      if (isTaskComplete) {
        logger.info(`[Iteration ${iteration + 1}] Getting final response after task_complete`);
        const { content: finalContent } = await this.callModel(model, messages);

        if (finalContent) {
          accumulatedText += finalContent;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: finalContent }],
            },
          };
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: accumulatedText,
        };
        break;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.warn(`Reached maximum iterations (${this.maxIterations})`);
      yield {
        type: 'warning',
        message: `Reached maximum iterations limit (${this.maxIterations}). Task may be incomplete.`,
      };
    }
  }

  /**
   * Provide helpful suggestions for common tool errors
   */
  private getToolErrorSuggestion(toolName: string | undefined, errorMessage: string): string {
    if (!toolName) return 'Try a different approach or skip this step.';

    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file or directory')) {
      if (toolName === 'list_directory' || toolName === 'read_file') {
        return 'The directory/file does not exist. Try using list_directory on the parent directory first, or create the directory structure using create_file.';
      }
    }

    if (errorMessage.includes('EACCES') || errorMessage.includes('permission denied')) {
      return 'Permission denied. This path may be outside the project root or protected.';
    }

    if (errorMessage.includes('Security violation')) {
      return 'This path is outside the allowed project directory. Use relative paths within the project.';
    }

    return 'Consider an alternative approach to accomplish this task.';
  }

  /**
   * Call the model once (may return tool calls)
   */
  private async callModel(
    model: string,
    messages: ResponseMessage[]
  ): Promise<{
    responseId: string;
    content: string | null;
    toolCalls: ToolCall[] | null;
    finishReason: string | null;
  }> {
    // Use /v1/chat/completions (traditional OpenAI-compatible endpoint)
    // This is more mature and well-tested than /v1/responses
    const requestBody: ChatCompletionRequest = {
      model,
      messages, // Send full conversation history
      tools: ALL_TOOLS,
      stream: true,
      temperature: 0.7,
      max_tokens: 8192,
    };

    logger.info('Sending request to Local LLM /v1/chat/completions:', {
      endpoint: `${this.endpoint}/chat/completions`,
      model: requestBody.model,
      messageCount: messages.length,
      toolCount: ALL_TOOLS.length,
      hasTools: true,
    });

    logger.debug('Full request body:', {
      requestBody: JSON.stringify(requestBody, null, 2),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (this.apiKey && this.apiKey !== 'not-needed') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Add timeout to prevent hanging on unresponsive server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.error('[LocalLLMAgentProvider] Request timed out after 60 seconds');
    }, 60000); // 60 second timeout

    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local LLM API error: ${response.statusText}\n${errorText}`);
      }

      return await this.parseStreamingResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          'Local LLM API request timed out after 60 seconds. The server may be unresponsive or overloaded.'
        );
      }

      throw error;
    }
  }

  /**
   * Parse streaming response to extract content and tool calls
   */
  private async parseStreamingResponse(response: Response): Promise<{
    responseId: string;
    content: string | null;
    toolCalls: ToolCall[] | null;
    finishReason: string | null;
  }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let responseId = '';
    let accumulatedContent = '';
    let toolCalls: ToolCall[] | null = null;
    let finishReason: string | null = null;
    const toolCallsBuffer: Map<number, Partial<ToolCall>> = new Map();

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
              const chunk: ResponseChunk = JSON.parse(data);

              if (!responseId) {
                responseId = chunk.id;
              }

              for (const choice of chunk.choices) {
                // Accumulate text content
                if (choice.delta?.content) {
                  accumulatedContent += choice.delta.content;
                  logger.debug(`[Stream] Content delta: ${choice.delta.content}`);
                }

                // Accumulate tool calls
                if (choice.delta?.tool_calls) {
                  logger.debug(
                    `[Stream] Tool calls delta:`,
                    JSON.stringify(choice.delta.tool_calls, null, 2)
                  );
                  for (const toolCallDelta of choice.delta.tool_calls) {
                    const index = toolCallDelta.index;

                    if (!toolCallsBuffer.has(index)) {
                      toolCallsBuffer.set(index, {
                        id: toolCallDelta.id,
                        type: 'function',
                        function: {
                          name: toolCallDelta.function?.name || '',
                          arguments: toolCallDelta.function?.arguments || '',
                        },
                      });
                    } else {
                      const existing = toolCallsBuffer.get(index)!;
                      if (toolCallDelta.function?.arguments) {
                        existing.function!.arguments += toolCallDelta.function.arguments;
                      }
                    }
                  }
                }

                // Check for finish
                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;

                  // If we have a complete message with tool_calls, use it
                  if (choice.message?.tool_calls) {
                    toolCalls = choice.message.tool_calls;
                  }
                }
              }
            } catch (parseError) {
              logger.warn('Failed to parse stream chunk:', data, parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Convert buffer to final tool calls if we have any
    if (toolCallsBuffer.size > 0 && !toolCalls) {
      toolCalls = Array.from(toolCallsBuffer.values()) as ToolCall[];
    }

    logger.info('Parsed response:', {
      responseId,
      contentLength: accumulatedContent.length,
      toolCallCount: toolCalls?.length || 0,
      finishReason,
    });

    if (toolCalls && toolCalls.length > 0) {
      logger.info('[Tool Calls Parsed]:', JSON.stringify(toolCalls, null, 2));
    }

    if (accumulatedContent && accumulatedContent.length > 0) {
      logger.info(
        '[Content Preview]:',
        accumulatedContent.substring(0, 300) + (accumulatedContent.length > 300 ? '...' : '')
      );

      // Warn if content looks like it contains tool calls (model may not be well-trained for tool use)
      if (
        accumulatedContent.includes('<tool_call>') ||
        accumulatedContent.includes('function') ||
        accumulatedContent.includes('"name"')
      ) {
        logger.warn(
          '[Warning] Content contains keywords that suggest tool calls, but no tool_calls were parsed. ' +
            'This may indicate the model is not well-trained for tool use. Consider using a model with native tool support.'
        );
      }
    }

    return {
      responseId,
      content: accumulatedContent || null,
      toolCalls,
      finishReason,
    };
  }

  /**
   * Detect Local LLM API availability
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      logger.debug(`Checking Local LLM API at: ${this.endpoint}/models`);
      const response = await fetch(`${this.endpoint}/models`, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey &&
            this.apiKey !== 'not-needed' && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          `Local LLM API check failed: ${response.status} ${response.statusText}\n${errorText}`
        );
        return {
          installed: false,
          method: 'api',
          hasApiKey: !!this.apiKey && this.apiKey !== 'not-needed',
          authenticated: false,
          error: `API endpoint not reachable or returned error: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const models = data.data || [];
      logger.info(`Local LLM API detected, ${models.length} models available.`);

      return {
        installed: true,
        method: 'api',
        hasApiKey: !!this.apiKey && this.apiKey !== 'not-needed',
        authenticated: true,
        models: models.map((m: any) => ({
          id: m.id,
          name: m.id,
          modelString: m.id,
          provider: 'local-llm',
          description: `Local model: ${m.id}`,
        })),
      };
    } catch (error) {
      logger.warn('Failed to detect Local LLM API:', error);
      return {
        installed: false,
        method: 'api',
        hasApiKey: !!this.apiKey && this.apiKey !== 'not-needed',
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available Local LLM models (will fetch dynamically)
   */
  getAvailableModels(): ModelDefinition[] {
    // Return empty array - models are fetched dynamically via detectInstallation
    return [];
  }
}
