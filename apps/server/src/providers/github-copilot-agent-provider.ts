/**
 * GitHub Copilot Agent Provider - Autonomous agent using Copilot API
 *
 * This provider extends GitHub Copilot with full autonomous agent capabilities
 * using OpenAI-style function calling for file operations, command execution, etc.
 *
 * Supports:
 * - Function/tool calling for autonomous file operations
 * - Multi-turn agentic loops
 * - Full conversation history management
 * - Safe sandboxed tool execution
 * - All Copilot models (GPT-4o, Claude 3.5 Sonnet, etc.)
 */

import { BaseProvider } from './base-provider.js';
import { CopilotAuthManager } from './copilot-auth.js';
import { createLogger } from '@automaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import { stripProviderPrefix } from '@automaker/types';
import { ALL_TOOLS, type ToolDefinition } from './local-llm-tools.js';
import { ToolExecutor, type ToolCall, type ToolResult } from './tool-executor.js';

const logger = createLogger('GitHubCopilotAgentProvider');

interface ResponseMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ResponseMessage[];
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
  }>;
}

/**
 * GitHub Copilot Agent Provider with full autonomous capabilities
 */
export class GitHubCopilotAgentProvider extends BaseProvider {
  private static readonly CHAT_COMPLETIONS_URL = 'https://api.githubcopilot.com/chat/completions';
  private static readonly MODELS_URL = 'https://api.githubcopilot.com/models';

  private authManager: CopilotAuthManager;
  private maxIterations: number;
  private projectRoot: string;
  private cachedModels: string[] | null = null;

  constructor(config?: { githubToken?: string; projectRoot?: string }) {
    super(config || {});
    this.authManager = new CopilotAuthManager(config?.githubToken);
    this.projectRoot = config?.projectRoot || process.cwd();
    this.maxIterations = 20; // Maximum number of tool-calling iterations
    logger.info(`GitHubCopilotAgentProvider initialized`);
  }

  getName(): string {
    return 'github-copilot-agent';
  }

  /**
   * Execute a query with full agentic capabilities
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, systemPrompt } = options;

    try {
      // Build initial messages
      const messages: ResponseMessage[] = [];

      // Add system prompt if provided
      if (systemPrompt && typeof systemPrompt === 'string') {
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

      // Add user prompt
      const promptText = Array.isArray(prompt)
        ? prompt.map((p) => (typeof p === 'string' ? p : p.text || '')).join('\n')
        : prompt;

      messages.push({
        role: 'user',
        content: promptText,
      });

      // Strip provider prefix for the actual API call
      const bareModel = stripProviderPrefix(model);

      // Initialize tool executor
      const toolExecutor = new ToolExecutor(this.projectRoot, 'GitHubCopilotAgentProvider');

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
    toolExecutor: ToolExecutor
  ): AsyncGenerator<ProviderMessage> {
    let messages = [...initialMessages];
    let iteration = 0;
    let accumulatedText = '';
    let isTaskComplete = false;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Track recent tool calls to detect loops
    const recentToolCalls: string[] = [];
    const maxRecentCalls = 5;

    // Track exploration tool usage to prevent analysis paralysis
    const explorationTools = ['get_project_structure', 'list_directory'];
    let explorationCount = 0;
    const maxExplorationCalls = 3; // Hard limit

    while (iteration < this.maxIterations && !isTaskComplete) {
      iteration++;
      logger.info(`[Iteration ${iteration}] Starting agentic loop iteration`);

      // Call the model with current messages (full conversation history)
      const { content, toolCalls, finishReason, usage } = await this.callModel(model, messages);

      // Track token usage
      if (usage) {
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
      }

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

        // If no tool calls in this response, immediately yield result with usage
        // This ensures auto-mode receives usage BEFORE entering approval phase
        if (!toolCalls || toolCalls.length === 0) {
          logger.info(
            `[Iteration ${iteration}] No tool calls detected after content, yielding result immediately`
          );
          const normalizedResult = this.normalizeTaskFormat(accumulatedText);
          const hasUsage = totalInputTokens > 0 || totalOutputTokens > 0;
          logger.info(
            `[GitHub Copilot] Yielding result - hasUsage: ${hasUsage}, input: ${totalInputTokens}, output: ${totalOutputTokens}`
          );

          yield {
            type: 'result',
            subtype: 'success',
            result: normalizedResult,
            usage: hasUsage
              ? {
                  inputTokens: totalInputTokens,
                  outputTokens: totalOutputTokens,
                }
              : undefined,
          };
          logger.info(`[GitHub Copilot] Result yielded, breaking from loop`);
          break;
        }
      }

      // If no tool calls and no content, model is done (shouldn't normally happen)
      logger.info(
        `[Iteration ${iteration}] Checking tool calls - toolCalls: ${JSON.stringify(toolCalls)}, length: ${toolCalls?.length}`
      );
      if (!toolCalls || toolCalls.length === 0) {
        logger.info(`[Iteration ${iteration}] No tool calls and no content, finishing`);

        // Normalize task format before returning
        const normalizedResult = this.normalizeTaskFormat(accumulatedText);

        const hasUsage = totalInputTokens > 0 || totalOutputTokens > 0;
        logger.info(
          `[GitHub Copilot] Yielding result - hasUsage: ${hasUsage}, input: ${totalInputTokens}, output: ${totalOutputTokens}`
        );

        yield {
          type: 'result',
          subtype: 'success',
          result: normalizedResult,
          usage: hasUsage
            ? {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              }
            : undefined,
        };
        logger.info(`[GitHub Copilot] Result yielded, breaking from loop`);
        break;
      }

      // Check if task_complete was called
      const taskCompleteCall = toolCalls.find((tc) => tc.function.name === 'task_complete');
      if (taskCompleteCall) {
        logger.info(`[Iteration ${iteration}] Task marked as complete`);
        isTaskComplete = true;
      }

      // Track exploration tool usage and enforce hard limit
      const explorationCallsInThisIteration = toolCalls.filter((tc) =>
        explorationTools.includes(tc.function.name)
      );

      if (explorationCallsInThisIteration.length > 0) {
        explorationCount += explorationCallsInThisIteration.length;
        logger.info(
          `[Exploration Tracker] Total exploration calls: ${explorationCount}/${maxExplorationCalls}`
        );

        if (explorationCount >= maxExplorationCalls) {
          logger.warn(
            `[Exploration Limit] Hit maximum exploration calls (${maxExplorationCalls}). Forcing implementation mode.`
          );
          messages.push({
            role: 'user',
            content: `🛑 STOP EXPLORING - You've used ${explorationCount} exploration calls. This is enough!

You MUST start creating files NOW. Do NOT call get_project_structure or list_directory again.

Based on what you've already learned:
1. Use create_file to create the source files directly
2. Use create_file to create the test files
3. Use execute_command to run npm install (if needed)
4. Call task_complete when all files are created

START IMPLEMENTING NOW - NO MORE EXPLORATION!`,
          });
        }
      }

      // Detect infinite loops (same tool called repeatedly)
      // Use tool NAME only, ignore arguments for more robust detection
      const currentCallSignature = toolCalls
        .map((tc) => tc.function.name)
        .sort()
        .join(',');
      recentToolCalls.push(currentCallSignature);
      if (recentToolCalls.length > maxRecentCalls) {
        recentToolCalls.shift();
      }

      // Warn if the last 3 calls use the same tools (stuck in a loop)
      if (recentToolCalls.length >= 3) {
        const last3 = recentToolCalls.slice(-3);
        if (last3.every((call) => call === last3[0])) {
          logger.warn(
            `[Loop Detection] Model is repeating the same tool pattern (${last3[0]}). Breaking loop.`
          );
          messages.push({
            role: 'user',
            content: `⚠️ LOOP DETECTED: You've called the same tool(s) (${last3[0]}) 3 times in a row without making progress.

🚫 STOP exploring and START implementing!

Instead of calling tools repeatedly:
- Use create_file to write the code files NOW
- Skip exploration if you already know the project structure
- Move forward with implementation
- Call task_complete when all files are created`,
          });
        }
      }

      // Execute tool calls
      logger.info(`[Iteration ${iteration}] Executing ${toolCalls.length} tool(s)`);

      for (const toolCall of toolCalls) {
        logger.info(`  - ${toolCall.function.name}`);
      }

      // If exploration limit exceeded, filter out additional exploration calls
      let toolCallsToExecute = toolCalls;
      const blockedCalls: typeof toolCalls = [];

      if (explorationCount > maxExplorationCalls) {
        const filteredCalls = toolCalls.filter(
          (tc) => !explorationTools.includes(tc.function.name)
        );
        const blocked = toolCalls.filter((tc) => explorationTools.includes(tc.function.name));

        if (blocked.length > 0) {
          logger.warn(
            `[Exploration Limit] Blocking ${blocked.length} exploration tool calls that exceed limit`
          );
          toolCallsToExecute = filteredCalls;
          blockedCalls.push(...blocked);
        }
      }

      // CRITICAL: Add assistant message with tool_calls to conversation history
      // This is required by OpenAI/Copilot API - tool results must follow an assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: content || undefined, // Include any text content from the response
        tool_calls: toolCalls,
      });

      const toolResults = await toolExecutor.executeTools(toolCallsToExecute);

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
          type: 'result',
          result: `Tool ${toolCalls.find((tc) => tc.id === result.tool_call_id)?.function.name}: ${result.success ? 'Success' : 'Failed'}`,
        } as ProviderMessage;
      }

      // Add blocked tool results (exploration calls that exceeded limit)
      for (const blockedCall of blockedCalls) {
        messages.push({
          role: 'tool',
          content: `🚫 BLOCKED: ${blockedCall.function.name} call was blocked because you've exceeded the exploration limit (${maxExplorationCalls} calls). You MUST create files now using create_file. DO NOT explore anymore.`,
          tool_call_id: blockedCall.id,
        });

        logger.warn(`[Exploration Limit] Blocked ${blockedCall.function.name} call`);
      }

      // If task is complete, do one final call to get closing message
      if (isTaskComplete) {
        logger.info(`[Iteration ${iteration + 1}] Getting final response after task_complete`);
        const { content: finalContent, usage: finalUsage } = await this.callModel(model, messages);

        // Track usage from final call
        if (finalUsage) {
          totalInputTokens += finalUsage.inputTokens;
          totalOutputTokens += finalUsage.outputTokens;
        }

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

        // Normalize task format before returning (for spec generation)
        const normalizedResult = this.normalizeTaskFormat(accumulatedText);

        const hasUsage = totalInputTokens > 0 || totalOutputTokens > 0;
        logger.info(
          `[GitHub Copilot] Task complete - yielding result with usage: ${hasUsage}, input: ${totalInputTokens}, output: ${totalOutputTokens}`
        );

        yield {
          type: 'result',
          subtype: 'success',
          result: normalizedResult,
          usage: hasUsage
            ? {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              }
            : undefined,
        };
        break;
      }
    }

    // If we hit max iterations without completion
    if (iteration >= this.maxIterations && !isTaskComplete) {
      logger.warn(`Reached maximum iterations (${this.maxIterations})`);

      // Normalize task format before returning (for spec generation)
      const normalizedResult = this.normalizeTaskFormat(accumulatedText);

      yield {
        type: 'result',
        subtype: 'success',
        result: normalizedResult,
        usage:
          totalInputTokens > 0 || totalOutputTokens > 0
            ? {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              }
            : undefined,
      };
    }
  }

  /**
   * Call Copilot API with tools and parse response
   */
  private async callModel(
    model: string,
    messages: ResponseMessage[]
  ): Promise<{
    content: string | null;
    toolCalls: ToolCall[] | null;
    finishReason: string | null;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    // Get authentication token
    const token = await this.authManager.getToken();

    // Map model name to Copilot format
    const mappedModel = this.mapModelToCopilot(model);

    // Prepare request with tools
    const requestBody: ChatCompletionRequest = {
      model: mappedModel,
      messages,
      tools: ALL_TOOLS,
      temperature: 0.3, // Lower temperature for more focused agent behavior
      max_tokens: 4096,
      stream: true,
    };

    logger.info(`Sending request to Copilot API /v1/chat/completions: {
  model: '${mappedModel}',
  messageCount: ${messages.length},
  toolCount: ${ALL_TOOLS.length},
  hasTools: true
}`);

    // Make streaming request
    const response = await fetch(GitHubCopilotAgentProvider.CHAT_COMPLETIONS_URL, {
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
      throw new Error(`GitHub Copilot API error: ${response.statusText}\n${errorText}`);
    }

    // Parse streaming response
    return await this.parseStreamingResponse(response);
  }

  /**
   * Parse streaming response from Copilot API
   */
  private async parseStreamingResponse(response: Response): Promise<{
    content: string | null;
    toolCalls: ToolCall[] | null;
    finishReason: string | null;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    let buffer = '';
    let accumulatedContent = '';
    let toolCalls: ToolCall[] | null = null;
    let toolCallsBuffer = new Map<number, Partial<ToolCall>>();
    let finishReason: string | null = null;
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          try {
            const jsonStr = line.slice(6);
            const chunk: ResponseChunk = JSON.parse(jsonStr);

            if (chunk.choices && chunk.choices.length > 0) {
              const choice = chunk.choices[0];
              const delta = choice.delta;

              if (delta?.content) {
                accumulatedContent += delta.content;
              }

              if (delta?.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                  const index = toolCallDelta.index;
                  const buffered = toolCallsBuffer.get(index) || {};

                  if (toolCallDelta.id) {
                    buffered.id = toolCallDelta.id;
                  }
                  if (toolCallDelta.type) {
                    buffered.type = toolCallDelta.type;
                  }
                  if (toolCallDelta.function) {
                    buffered.function = buffered.function || { name: '', arguments: '' };
                    if (toolCallDelta.function.name) {
                      buffered.function.name += toolCallDelta.function.name;
                    }
                    if (toolCallDelta.function.arguments) {
                      buffered.function.arguments += toolCallDelta.function.arguments;
                    }
                  }

                  toolCallsBuffer.set(index, buffered);
                }
              }

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }

            // Capture usage data (typically in last chunk)
            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens || 0,
                outputTokens: chunk.usage.completion_tokens || 0,
              };
              logger.info(
                `[GitHub Copilot] Captured usage from chunk: ${usage.inputTokens} input, ${usage.outputTokens} output tokens`
              );
            }
          } catch (err) {
            logger.warn('Failed to parse SSE chunk:', err);
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
    }

    return {
      content: accumulatedContent || null,
      toolCalls,
      finishReason,
      usage,
    };
  }

  /**
   * Map model string to Copilot-compatible format
   */
  private mapModelToCopilot(model: string): string {
    // Map common model names to Copilot equivalents
    const modelMap: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4': 'gpt-4',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
      'claude-3.5-sonnet': 'claude-3.5-sonnet',
      'claude-3-opus': 'claude-3-opus',
      'claude-3-haiku': 'claude-3-haiku',
    };

    return modelMap[model.toLowerCase()] || model;
  }

  /**
   * Get error suggestion for tool failures
   */
  private getToolErrorSuggestion(toolName: string | undefined, errorMessage: string): string {
    if (!toolName) return 'Try a different approach or skip this step.';

    // Windows command syntax errors
    if (errorMessage.includes('The syntax of the command is incorrect')) {
      return `Command syntax error on Windows. IMPORTANT: 
- Use create_file tool instead of mkdir to create directories
- Avoid Unix commands like "mkdir -p" - use Windows syntax or create_file tool
- For nested directories, use create_file with the full path
Example: Instead of "mkdir -p src/utils", use create_file tool with path="src/utils/.gitkeep"`;
    }

    if (errorMessage.includes('The system cannot find the path specified')) {
      return `Path not found. The parent directory may not exist. Use create_file tool to create the full directory structure automatically, or create parent directories first.`;
    }

    // File/directory not found
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file or directory')) {
      if (toolName === 'list_directory' || toolName === 'read_file') {
        return 'The directory/file does not exist. Try using list_directory on the parent directory first, or create the directory structure using create_file.';
      }
      if (toolName === 'execute_command') {
        return 'Command failed because a path does not exist. Create necessary directories using create_file tool first.';
      }
    }

    // Permission denied
    if (errorMessage.includes('EACCES') || errorMessage.includes('permission denied')) {
      return 'Permission denied. This path may be outside the project root or protected.';
    }

    // Security violations
    if (
      errorMessage.includes('Security violation') ||
      errorMessage.includes('Command not allowed')
    ) {
      return 'This operation is not allowed for security reasons. Use the provided tools (create_file, read_file, update_file, list_directory) instead of shell commands when possible.';
    }

    // Type errors for create_file
    if (toolName === 'create_file' && errorMessage.includes('ERR_INVALID_ARG_TYPE')) {
      return 'The "content" parameter must be a STRING, not an object. For JSON files, stringify the object first:\nExample: {"path": "package.json", "content": "{\\"name\\": \\"my-project\\", \\"version\\": \\"1.0.0\\"}"}';
    }

    return 'Consider an alternative approach to accomplish this task.';
  }

  /**
   * Detect Copilot installation and availability
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      const token = await this.authManager.getToken();

      return {
        installed: true,
        method: 'api',
        hasApiKey: !!token,
        authenticated: true,
      };
    } catch (error) {
      return {
        installed: false,
        method: 'api',
        hasApiKey: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available models from Copilot API
   */
  async getAvailableModels(): Promise<ModelDefinition[]> {
    try {
      const modelIds = await this.fetchAvailableModels();

      return modelIds.map((modelId) => ({
        id: `copilot-${modelId}`,
        name: this.formatModelName(modelId),
        modelString: `copilot-${modelId}`,
        provider: 'github-copilot-agent',
        description: `GitHub Copilot ${this.formatModelName(modelId)}`,
        supportsTools: true, // All Copilot models support tools for agents
      }));
    } catch (error) {
      logger.error('Error fetching Copilot models:', error);
      return [];
    }
  }

  /**
   * Fetch available models from Copilot API
   */
  private async fetchAvailableModels(): Promise<string[]> {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    try {
      const token = await this.authManager.getToken();

      const response = await fetch(GitHubCopilotAgentProvider.MODELS_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Editor-Version': 'vscode/1.95.0',
          'Editor-Plugin-Version': 'copilot-chat/0.22.4',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || [];

      this.cachedModels = models;
      return models;
    } catch (error) {
      logger.error('Error fetching available Copilot models:', error);
      return [];
    }
  }

  /**
   * Format model ID to display name
   */
  private formatModelName(modelId: string): string {
    const nameMap: Record<string, string> = {
      'gpt-4o': 'GPT-4o',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'claude-3-opus': 'Claude 3 Opus',
      'claude-3-haiku': 'Claude 3 Haiku',
      'o1-preview': 'o1 Preview',
      'o1-mini': 'o1 Mini',
    };

    return nameMap[modelId.toLowerCase()] || modelId;
  }

  /**
   * Normalize task formatting in spec content to canonical format
   * Handles various task formats from different models and converts them to:
   * - [ ] T001: Description | File: path/to/file
   */
  private normalizeTaskFormat(content: string): string {
    // Check if content contains a tasks block or task-like content
    const hasTasksBlock = content.includes('```tasks') || /implementation.*task/i.test(content);
    if (!hasTasksBlock) {
      return content; // No task normalization needed
    }

    logger.info('[Task Normalization] Detecting and normalizing task formats');

    // Extract tasks block if it exists
    const tasksBlockMatch = content.match(/(```tasks\\s*[\\s\\S]*?```)/);
    if (!tasksBlockMatch) {
      // Look for tasks outside a code block
      return this.normalizeInlineTasks(content);
    }

    const tasksBlock = tasksBlockMatch[1];
    const beforeBlock = content.substring(0, content.indexOf(tasksBlock));
    const afterBlock = content.substring(content.indexOf(tasksBlock) + tasksBlock.length);

    // Extract content inside the tasks block
    const tasksContent = tasksBlock.match(/```tasks\\s*([\\s\\S]*?)```/)?.[1] || '';
    const lines = tasksContent.split('\\n');
    const normalizedLines: string[] = [];
    let taskCounter = 1;

    for (const line of lines) {
      const trimmed = line.trim();

      // Preserve phase headers
      if (trimmed.startsWith('##')) {
        normalizedLines.push(line);
        continue;
      }

      // Skip empty lines
      if (!trimmed) {
        normalizedLines.push(line);
        continue;
      }

      // Try to parse various task formats
      const normalized = this.normalizeTaskLine(trimmed, taskCounter);
      if (normalized) {
        normalizedLines.push(normalized);
        taskCounter++;
      } else {
        // Keep line as-is if we can't parse it
        normalizedLines.push(line);
      }
    }

    const normalizedBlock = '```tasks\\n' + normalizedLines.join('\\n') + '\\n```';
    const normalizedContent = beforeBlock + normalizedBlock + afterBlock;

    logger.info(`[Task Normalization] Normalized ${taskCounter - 1} tasks`);
    return normalizedContent;
  }

  /**
   * Normalize inline tasks (outside code blocks)
   */
  private normalizeInlineTasks(content: string): string {
    const lines = content.split('\\n');
    const normalizedLines: string[] = [];
    let taskCounter = 1;
    let inTaskSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect task section start
      if (/implementation.*task|task.*list|tasks:/i.test(trimmed)) {
        inTaskSection = true;
        normalizedLines.push(line);
        continue;
      }

      // If in task section, try to normalize
      if (inTaskSection && (trimmed.startsWith('-') || /^\\d+\\./.test(trimmed))) {
        const normalized = this.normalizeTaskLine(trimmed, taskCounter);
        if (normalized) {
          normalizedLines.push(normalized);
          taskCounter++;
          continue;
        }
      }

      // Stop task section if we hit empty line or new section
      if (inTaskSection && (!trimmed || trimmed.startsWith('#'))) {
        inTaskSection = false;
      }

      normalizedLines.push(line);
    }

    return normalizedLines.join('\\n');
  }

  /**
   * Normalize a single task line to canonical format
   * Returns null if line doesn't look like a task
   */
  private normalizeTaskLine(line: string, suggestedId: number): string | null {
    // Already in correct format: - [ ] T001: Description | File: path
    if (/^- \\[ \\] T\\d{3}:/.test(line)) {
      return line;
    }

    let description = '';
    let file = '';
    let taskId = `T${suggestedId.toString().padStart(3, '0')}`;

    // Pattern 1: - [ ] T001: Description (missing file)
    const pattern1 = line.match(/^- \\[ \\] (T\\d{3}):\\s*(.+)$/);
    if (pattern1) {
      taskId = pattern1[1];
      description = pattern1[2].trim();
      return `- [ ] ${taskId}: ${description}`;
    }

    // Pattern 2: - [ ] Description (missing T-ID)
    const pattern2 = line.match(/^- \\[ \\] (.+)$/);
    if (pattern2) {
      description = pattern2[1].trim();
      // Try to extract file from description
      const fileMatch = description.match(/\\|\\s*File:\\s*(.+)$/);
      if (fileMatch) {
        file = fileMatch[1].trim();
        description = description.substring(0, description.indexOf('|')).trim();
      }
      return file
        ? `- [ ] ${taskId}: ${description} | File: ${file}`
        : `- [ ] ${taskId}: ${description}`;
    }

    // Pattern 3: - [x] Description (checked)
    const pattern3 = line.match(/^- \\[x\\] (.+)$/i);
    if (pattern3) {
      description = pattern3[1].trim();
      // Try to extract file from description
      const fileMatch = description.match(/\\|\\s*File:\\s*(.+)$/);
      if (fileMatch) {
        file = fileMatch[1].trim();
        description = description.substring(0, description.indexOf('|')).trim();
      }
      return file
        ? `- [ ] ${taskId}: ${description} | File: ${file}`
        : `- [ ] ${taskId}: ${description}`;
    }

    // Pattern 4: - Task 001: Description or - T001: Description (missing checkbox)
    const pattern4 = line.match(/^-\\s*(?:Task\\s*)?(T?\\d{1,3}):\\s*(.+)$/i);
    if (pattern4) {
      const idPart = pattern4[1].toUpperCase();
      taskId = idPart.startsWith('T') ? idPart.padStart(4, 'T00') : `T${idPart.padStart(3, '0')}`;
      description = pattern4[2].trim();
      const fileMatch = description.match(/\\|\\s*File:\\s*(.+)$/);
      if (fileMatch) {
        file = fileMatch[1].trim();
        description = description.substring(0, description.indexOf('|')).trim();
      }
      return file
        ? `- [ ] ${taskId}: ${description} | File: ${file}`
        : `- [ ] ${taskId}: ${description}`;
    }

    // Pattern 5: 1. Description or 1) Description (numbered list)
    const pattern5 = line.match(/^(\\d+)[.)\\s]\\s*(.+)$/);
    if (pattern5) {
      description = pattern5[2].trim();
      const fileMatch = description.match(/\\|\\s*File:\\s*(.+)$/);
      if (fileMatch) {
        file = fileMatch[1].trim();
        description = description.substring(0, description.indexOf('|')).trim();
      }
      return file
        ? `- [ ] ${taskId}: ${description} | File: ${file}`
        : `- [ ] ${taskId}: ${description}`;
    }

    // Pattern 6: - Description (plain bullet, no checkbox)
    if (line.startsWith('-') && !line.startsWith('- [ ]') && !line.startsWith('- [x]')) {
      description = line.substring(1).trim();
      // Only convert if it looks like a task (has verb or common task keywords)
      const taskKeywords =
        /^(create|add|update|modify|delete|implement|write|build|setup|configure|install)/i;
      if (taskKeywords.test(description)) {
        const fileMatch = description.match(/\\|\\s*File:\\s*(.+)$/);
        if (fileMatch) {
          file = fileMatch[1].trim();
          description = description.substring(0, description.indexOf('|')).trim();
        }
        return file
          ? `- [ ] ${taskId}: ${description} | File: ${file}`
          : `- [ ] ${taskId}: ${description}`;
      }
    }

    // Not a recognizable task format
    return null;
  }
}
