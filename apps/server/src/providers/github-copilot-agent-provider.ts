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
import type { PlanningFilesService } from '../services/planning-files-service.js';
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
  private planningService?: PlanningFilesService;
  private featureId?: string;
  private projectPath?: string;

  constructor(config?: {
    githubToken?: string;
    projectRoot?: string;
    planningService?: PlanningFilesService;
    featureId?: string;
    projectPath?: string;
  }) {
    super(config || {});
    this.authManager = new CopilotAuthManager(config?.githubToken);
    this.projectRoot = config?.projectRoot || process.cwd();
    this.maxIterations = 30; // Maximum number of tool-calling iterations
    this.planningService = config?.planningService;
    this.featureId = config?.featureId;
    this.projectPath = config?.projectPath;
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

      // Add user prompt with platform-specific context
      const promptText = Array.isArray(prompt)
        ? prompt.map((p) => (typeof p === 'string' ? p : p.text || '')).join('\n')
        : prompt;

      // Inject platform-specific guidance
      const isWindows = process.platform === 'win32';
      const platformGuidance = isWindows
        ? '\n\n**CRITICAL - Platform Context:**\nYou are running on WINDOWS. Use PowerShell commands only:\n- ✅ Get-Content, Select-String, Select-Object\n- ❌ NEVER use: sed, awk, head, tail, grep (these are Unix/Linux commands)\n- File paths use backslashes: C:\\path\\to\\file\n- Use PowerShell syntax for all commands'
        : '';

      const outputFormattingRules = `\n\n**OUTPUT FORMATTING RULES:**
- Write natural conversational text only
- NEVER output tool names or checkmarks for tool usage: ❌ "✅ read_file✅ grep_search"
- Tools are logged automatically - don't mention them
- Good: "I've analyzed the project structure and created..."
- Bad: "✅ list_directory✅ read_file I've analyzed..."
- NEVER output "Phase: Verification" or similar headers
- Focus on RESULTS, not process`;

      // Detect simple tasks that should complete quickly
      const simpleTaskKeywords = [
        'password',
        'calculator',
        'hello world',
        'todo list',
        'counter',
        'greeting',
        'simple',
        'basic',
        'utility',
        'proof of concept',
        'demo',
      ];
      const isSimpleTask = simpleTaskKeywords.some((keyword) =>
        promptText.toLowerCase().includes(keyword)
      );

      const simpleTaskGuidance = isSimpleTask
        ? `\n\n**PERFORMANCE MODE - Simple Task Detected:**
This is a SIMPLE task that should complete in < 1 minute with minimal code.

MANDATORY RULES:
- ✅ Generate MINIMAL code (< 50 lines per file)
- ✅ Create skeleton first, verify it works, then extend
- ✅ Prefer simple, obvious solutions over clever ones
- ✅ Maximum 3-5 basic tests initially
- ❌ NO exploration phase - execute immediately
- ❌ NO reading examples or documentation
- ❌ NO over-engineering or complex patterns

Expected: 3-4 iterations, 30 seconds total time.
If you exceed 5 iterations or 1 minute, you are over-engineering.`
        : '';

      messages.push({
        role: 'user',
        content: promptText + platformGuidance + outputFormattingRules + simpleTaskGuidance,
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

    // Track errors for planning-with-files error re-read triggers
    let consecutiveErrors = 0;
    const MAX_ERROR_REREADS = 3;
    let totalErrorsSinceLastSuccess = 0;

    // Track repetitive errors to detect when agent is stuck
    const recentErrors: Array<{ error: string; iteration: number }> = [];
    const maxSameError = 3; // If same error 3 times, force strategy change

    // Track time and compilation failures for intervention
    const startTime = Date.now();
    const maxDuration = 120000; // 2 minutes
    let compilationFailures = 0;
    const maxCompilationFailures = 3;

    while (iteration < this.maxIterations && !isTaskComplete) {
      iteration++;

      // AUTO RE-READ: Every 5 turns inject task_plan.md (planning-with-files)
      if (this.planningService && this.featureId && this.projectPath && iteration % 5 === 0) {
        try {
          const planContent = await this.planningService.readTaskPlan(
            this.projectPath,
            this.featureId
          );
          if (planContent) {
            messages.push({
              role: 'user',
              content: `📋 PLAN RE-READ (Turn ${iteration}/5-turn auto-refresh):\n\n${planContent}`,
            });
            logger.info(`[Planning] Injected plan re-read at iteration ${iteration}`);
          }
        } catch (err) {
          logger.debug('[Planning] Could not read task plan for auto re-read:', err);
        }
      }

      // Check if taking too long - inject urgency
      const elapsed = Date.now() - startTime;
      if (elapsed > maxDuration && iteration > 5) {
        logger.warn(
          `[Time Limit] Task has been running for ${Math.round(elapsed / 1000)}s - forcing simplification`
        );
        messages.push({
          role: 'user',
          content: `⏰ TIME LIMIT WARNING: This task has been running for ${Math.round(elapsed / 1000)} seconds.

For a simple password utility, this should take < 30 seconds total.

**You are overthinking this. Simplify drastically:**
- If files have errors: DELETE and recreate with minimal code
- If stuck debugging: Start over with simpler approach
- Generate small files (50 lines), not large ones (800 lines)
- Stop exploring and start executing

**Every iteration from now on should move toward completion, not exploration.**`,
        });
      }

      logger.info(`[Iteration ${iteration}] Starting agentic loop iteration`);

      // Prune old messages if context is getting too large (prevent 64K token limit)
      // Keep: system message, last N messages while preserving tool call/response pairs
      if (messages.length > 20) {
        const systemMessage = messages[0];

        // Find a safe cutoff point that doesn't break tool call/response pairs
        // Work backwards from the end, keeping at least 15 messages
        let safeCutoff = Math.max(1, messages.length - 15);

        // CRITICAL: Ensure we don't break tool_use/tool_result pairs
        // Move back to include the complete assistant message and ALL its tool responses
        while (safeCutoff > 1) {
          const msgAtCutoff = messages[safeCutoff];

          // If we're starting with a 'tool' message, move back to find its assistant message
          if (msgAtCutoff.role === 'tool') {
            safeCutoff--;
            continue;
          }

          // If previous message is an assistant with tool_calls, check if all tool responses are included
          const prevMsg = messages[safeCutoff - 1];
          if (
            prevMsg &&
            prevMsg.role === 'assistant' &&
            prevMsg.tool_calls &&
            prevMsg.tool_calls.length > 0
          ) {
            // Count how many tool responses follow this assistant message
            const toolCallIds = new Set(prevMsg.tool_calls.map((tc) => tc.id));
            let toolResponsesFound = 0;

            for (let i = safeCutoff; i < messages.length && messages[i].role === 'tool'; i++) {
              const toolCallId = messages[i].tool_call_id;
              if (toolCallId && toolCallIds.has(toolCallId)) {
                toolResponsesFound++;
              }
            }

            // If not all tool responses are included, move cutoff back to before the assistant message
            if (toolResponsesFound < prevMsg.tool_calls.length) {
              safeCutoff--;
              continue;
            }
          }

          // Safe to cut here
          break;
        }

        const recentMessages = messages.slice(safeCutoff);
        const prunedCount = messages.length - recentMessages.length - 1;
        messages = [systemMessage, ...recentMessages];
        logger.warn(
          `[Context Pruning] Removed ${prunedCount} old messages to stay under token limit (kept ${recentMessages.length} recent messages)`
        );
      }

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

      // Check if output was truncated (finish_reason: 'length')
      if (finishReason === 'length' && toolCalls && toolCalls.length > 0) {
        logger.warn(
          `[Iteration ${iteration}] Output truncated (finish_reason: 'length'). Checking tool calls...`
        );

        // Check if tool calls look incomplete
        const hasIncompleteToolCall = toolCalls.some((tc) => {
          const args = tc.function?.arguments || '';
          return args.length < 20 || !args.includes('}') || args === '{}';
        });

        if (hasIncompleteToolCall) {
          logger.error('[Output Truncation] Detected incomplete tool call due to max_tokens limit');

          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: '⚠️ Output truncated - tool call incomplete' }],
            },
          };

          messages.push({
            role: 'assistant',
            content: 'Attempting to create file but output was truncated.',
            tool_calls: toolCalls,
          });

          messages.push({
            role: 'tool',
            content: `🚨 OUTPUT TRUNCATED - Tool call cut off mid-generation!

**What happened:**
- Hit max_tokens output limit while generating tool call
- Tool call JSON incomplete: ${JSON.stringify(toolCalls[0]?.function?.arguments || '').slice(0, 100)}...

**FIX - Create files incrementally:**

Instead of trying to generate a 2000-line file in one shot:
✅ create_file with minimal skeleton (class + 1 test method)
✅ Then update_file to add more methods one at a time

OR even better:
✅ Generate smaller, more focused test files
✅ Focus on quality over quantity (10 good tests > 50 mediocre tests)

**Do NOT retry the same massive file generation - it will truncate again.**`,
            tool_call_id: toolCalls[0]?.id || 'truncated',
          });

          continue; // Skip execution of incomplete tool calls, go to next iteration
        }
      }

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

      // Validate file sizes before execution - prevent massive broken files
      for (const tc of toolCallsToExecute) {
        if (tc.function.name === 'create_file' || tc.function.name === 'update_file') {
          try {
            const args = JSON.parse(tc.function.arguments);
            const content = args.content || args.newCode || '';
            const lineCount = content.split('\n').length;

            if (lineCount > 200) {
              logger.warn(
                `[File Size Warning] ${tc.function.name} has ${lineCount} lines (recommended: < 200)`
              );

              // Inject warning message to guide agent toward incremental approach
              messages.push({
                role: 'user',
                content: `⚠️ FILE SIZE WARNING: You're trying to ${tc.function.name} with ${lineCount} lines of code.

This is a code smell that indicates:
- Over-engineering for simple requirements
- Trying to do too much in one file
- High likelihood of syntax errors in large blocks

RECOMMENDED APPROACH:
1. Create a MINIMAL skeleton first (< 50 lines)
2. Verify it compiles successfully
3. Add functionality incrementally with update_file

For test files:
- Start with 3-5 basic tests (10-15 lines each)
- Verify they pass
- Add more tests incrementally

Proceeding with your large file, but STRONGLY recommend simplifying.`,
              });
            }
          } catch (e) {
            // Ignore JSON parse errors here - will be caught by tool executor
          }
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

      // Tool execution status messages - only send to UI if planning files are NOT enabled
      // (planning files mode expects clean agent output without tool spam)
      if (!this.planningService) {
        for (const tc of toolCallsToExecute) {
          const toolName = tc.function.name;
          const result = toolResults.find((r) => r.tool_call_id === tc.id);
          const status = result?.success ? '✅' : '❌';

          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: `${status} ${toolName}` }],
            },
          };
        }
      }

      // Add tool results to messages with enhanced error context
      for (const result of toolResults) {
        const toolCall = toolCalls.find((tc) => tc.id === result.tool_call_id);
        const toolName = toolCall?.function.name;

        // POST-TOOL-USE PROGRESS LOGGING removed - agents should manually log milestones
        // Automatic per-tool logging creates spam in progress.md

        // For failed tools, provide helpful error context to the model
        let toolContent = result.output;
        let sameErrorCount = 0; // Declare before use

        if (!result.success) {
          // Track consecutive errors for planning-with-files
          consecutiveErrors++;
          totalErrorsSinceLastSuccess++;

          // ERROR RE-READ TRIGGER (planning-with-files)
          if (this.planningService && this.featureId && this.projectPath) {
            if (consecutiveErrors <= MAX_ERROR_REREADS) {
              try {
                const planContent = await this.planningService.readTaskPlan(
                  this.projectPath,
                  this.featureId
                );
                if (planContent) {
                  messages.push({
                    role: 'user',
                    content: `⚠️ ERROR RE-READ (${consecutiveErrors}/${MAX_ERROR_REREADS}):\n\nReview your plan:\n${planContent}\n\nError: ${result.output.substring(0, 300)}`,
                  });
                  logger.warn(
                    `[Planning] Injected error re-read ${consecutiveErrors}/${MAX_ERROR_REREADS}`
                  );
                }
              } catch (err) {
                logger.debug('[Planning] Could not read plan for error re-read:', err);
              }
            } else if (totalErrorsSinceLastSuccess >= MAX_ERROR_REREADS + 10) {
              // After 10 more failures, log critical error
              // Note: Agent stuck detection happens in PlanningFilesService
              logger.error(
                `[Planning] Agent appears stuck - ${totalErrorsSinceLastSuccess} errors since last success`
              );
            }
          }

          // Track C# compilation failures
          if (result.output.includes('error CS') && result.output.includes('Build FAILED')) {
            compilationFailures++;
            logger.warn(
              `[Compilation Failure] Count: ${compilationFailures}/${maxCompilationFailures}`
            );
          }

          // Track repetitive errors to detect when agent is stuck in a loop
          const errorSignature = this.getErrorSignature(result.output);
          if (errorSignature) {
            recentErrors.push({ error: errorSignature, iteration });

            // Check if same error occurred multiple times recently
            sameErrorCount = recentErrors.filter((e) => e.error === errorSignature).length;

            if (sameErrorCount >= maxSameError) {
              logger.error(
                `[Repetitive Error] Same error occurred ${sameErrorCount} times: ${errorSignature}`
              );
              toolContent = `🚨 CRITICAL: You've encountered the SAME error ${sameErrorCount} times in a row!

Error: ${errorSignature}

**YOU ARE STUCK IN A LOOP. Your current approach is NOT working.**

What you tried (iterations ${recentErrors
                .filter((e) => e.error === errorSignature)
                .map((e) => e.iteration)
                .join(', ')}):
- Did not fix the issue
- Made the same mistake multiple times
- Wasted iterations on the same failed approach

**STOP and change strategy:**

1. ❌ DO NOT try the same fix again with slight variations
2. ❌ DO NOT adjust escape characters manually
3. ✅ DO read the file to see what's actually wrong
4. ✅ DO try a COMPLETELY DIFFERENT approach
5. ✅ DO ask yourself: "Why isn't my fix working?"

**For C# errors specifically:**
- If CS1009 (escape sequence): Use verbatim strings @"..." - this is non-negotiable
- If update_file fails: Read file, delete problematic line, create new line
- If compilation fails 3+ times: Delete the file and recreate it correctly

**Act now or this task will fail at iteration ${this.maxIterations}.**

Original error: ${result.output}`;

              // Clear old errors to give fresh start after intervention
              recentErrors.length = 0;
            }
          }

          // Check if too many compilation failures - force simplification
          if (compilationFailures >= maxCompilationFailures) {
            toolContent = `🚨 CRITICAL: ${compilationFailures} COMPILATION FAILURES IN A ROW!

**Your approach is fundamentally broken. STOP debugging and START OVER.**

**What's happening:**
- You've had ${compilationFailures} C# compilation failures
- The file you generated is broken beyond repair
- Debugging line-by-line is wasting time

**MANDATORY FIX - Do this NOW:**
1. delete_file PasswordUtility.Tests/PasswordGeneratorTests.cs
2. create_file PasswordUtility.Tests/PasswordGeneratorTests.cs with SIMPLE, MINIMAL content:
   - Just 3-5 basic tests (NOT 800 lines!)
   - Use @\"...\" for ALL strings with special characters
   - Keep each test to 10 lines max
   - Focus on ONE thing per test

**Example of what to create:**
\`\`\`csharp
using Xunit;
using PasswordUtility;

public class PasswordGeneratorTests
{
    [Fact]
    public void GeneratePassword_ReturnsCorrectLength()
    {
        var gen = new PasswordGenerator();
        var pwd = gen.GeneratePassword(12, true, true, true, true);
        Assert.Equal(12, pwd.Length);
    }
    // Add 2-3 more simple tests
}
\`\`\`

**DO NOT:**
- Try to fix the current file (it's too broken)
- Generate hundreds of tests
- Use complex logic

**DELETE AND RECREATE SIMPLY. NOW.**

Original error: ${result.output.substring(0, 500)}`;
            compilationFailures = 0; // Reset after intervention
          }
          // Standard error suggestion if not repetitive
          else if (sameErrorCount < maxSameError) {
            const errorSuggestion = this.getToolErrorSuggestion(toolName, result.output);

            // Special handling for JSON parse errors in tool arguments
            if (
              result.output.includes('Expected') &&
              result.output.includes('JSON') &&
              (toolName === 'update_file' || toolName === 'create_file')
            ) {
              toolContent = `ERROR: Tool '${toolName}' failed due to JSON escaping issues: ${result.output}

🚨 CRITICAL: You're trying to pass large code blocks through JSON strings, which is EXTREMELY fragile!

**The problem:**
- Your old_content/new_content has 1000+ characters
- Contains quotes, newlines (\\n), and special characters
- One missing escape breaks the entire JSON

**IMMEDIATE FIX - Use create_file instead:**

Instead of:
❌ update_file with massive old_content (FRAGILE - will fail again)

Do this:
✅ delete_file PasswordUtility.Tests/PasswordGeneratorTests.cs
✅ create_file PasswordUtility.Tests/PasswordGeneratorTests.cs (with full content)

This avoids JSON escaping hell completely.

**Alternative (if you MUST use update_file):**
- Keep old_content SMALL (3-10 lines max)
- Make multiple small updates instead of one giant replacement
- But seriously, just use delete + create_file for full file replacements

Original error: ${result.output}`;
            } else {
              toolContent = `ERROR: Tool '${toolName}' failed: ${result.output}\n\nSuggestion: ${errorSuggestion}`;
            }
          }

          logger.warn(`[Tool Error] ${toolName}: ${result.output}`);
        } else {
          // Reset error counters on success
          consecutiveErrors = 0;
          totalErrorsSinceLastSuccess = 0;
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

        // Log performance metrics
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        logger.info(`
╔════════════════════════════════════════════════════════════════════════════╗
║ TASK COMPLETED                                                             ║
╠════════════════════════════════════════════════════════════════════════════╣
║ Iterations:     ${iteration.toString().padEnd(58)} ║
║ Duration:       ${elapsedSeconds}s${' '.repeat(55 - elapsedSeconds.toString().length)} ║
║ Input Tokens:   ${totalInputTokens.toLocaleString().padEnd(58)} ║
║ Output Tokens:  ${totalOutputTokens.toLocaleString().padEnd(58)} ║
║ Total Tokens:   ${(totalInputTokens + totalOutputTokens).toLocaleString().padEnd(58)} ║
╚════════════════════════════════════════════════════════════════════════════╝
        `);

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
      temperature: 0.1, // Low temperature for deterministic, concise agent behavior
      max_tokens: 16384, // High enough to prevent truncation of large tool calls (e.g., create_file with full file content)
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

      // If it's an invalid tool call format error, log the request body for debugging
      if (
        errorText.includes('invalid_tool_call_format') ||
        errorText.includes('Invalid JSON format')
      ) {
        logger.error('[GitHub Copilot API] Invalid tool call format detected');
        logger.error('[GitHub Copilot API] Request messages count:', requestBody.messages.length);

        // Log the last few messages to see what led to this
        const lastMessages = requestBody.messages.slice(-3);
        logger.error(
          '[GitHub Copilot API] Last 3 messages:',
          JSON.stringify(lastMessages, null, 2)
        );

        // Provide actionable error message
        const detailedError = `GitHub Copilot rejected your tool call due to malformed JSON.

**Most Common Causes:**
1. Trying to pass huge code blocks (1000+ chars) through update_file old_content
2. Missing escape characters in JSON strings
3. Trailing commas in JSON objects
4. Quotes inside string values not escaped properly

**What happened:**
- Your PREVIOUS tool call failed with a JSON error
- You tried to fix it with ANOTHER tool call
- That new tool call ALSO had malformed JSON
- GitHub Copilot rejected it before even processing

**How to Fix This Loop:**
1. ✅ Use create_file instead of update_file for full file replacements
2. ✅ Keep old_content in update_file small (< 20 lines)
3. ✅ Use delete_file + create_file for complex updates
4. ❌ Don't try to escape massive code blocks manually

See the last 3 messages in logs to see what you tried to send.

Original error: ${errorText}`;

        throw new Error(detailedError);
      }

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

      // Validate tool call arguments are valid JSON
      for (const toolCall of toolCalls) {
        if (toolCall.function?.arguments) {
          try {
            JSON.parse(toolCall.function.arguments);
          } catch (err) {
            logger.error(
              `[Tool Call Validation] Invalid JSON in ${toolCall.function.name} arguments:`,
              toolCall.function.arguments
            );
            logger.error('[Tool Call Validation] Parse error:', err);

            // Try to sanitize common issues
            let sanitized = toolCall.function.arguments;

            // Remove trailing commas before closing braces/brackets
            sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

            // Try parsing again
            try {
              JSON.parse(sanitized);
              logger.warn(
                `[Tool Call Validation] Sanitized arguments for ${toolCall.function.name}`
              );
              toolCall.function.arguments = sanitized;
            } catch (sanitizeErr) {
              logger.error('[Tool Call Validation] Sanitization failed, arguments still invalid');
            }
          }
        }
      }
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
   * Get error signature for tracking repetitive failures
   */
  private getErrorSignature(errorMessage: string): string | null {
    // Extract key error patterns that indicate the same issue

    // C# compilation errors - extract error code and file
    const csErrorMatch = errorMessage.match(/(CS\d{4}).*?([^\\\/]+\.cs)/);
    if (csErrorMatch) {
      return `${csErrorMatch[1]}_${csErrorMatch[2]}`; // e.g., "CS1009_PasswordGeneratorTests.cs"
    }

    // dotnet command failures
    if (errorMessage.includes('Command failed with exit code')) {
      if (errorMessage.includes('dotnet test')) return 'dotnet_test_failed';
      if (errorMessage.includes('dotnet build')) return 'dotnet_build_failed';
      if (errorMessage.includes('dotnet restore')) return 'dotnet_restore_failed';
    }

    // File operation errors
    if (errorMessage.includes('Old content not found')) return 'update_file_not_found';
    if (errorMessage.includes('ENOENT')) return 'file_not_found';

    // Generic failures
    if (errorMessage.includes('No test is available')) return 'no_tests_available';

    return null; // Not a trackable error
  }

  /**
   * Check if a file path is a planning file that should trigger UI updates
   */
  private isPlanningFile(filePath: string): 'task_plan' | 'findings' | 'progress' | null {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/planning/task_plan.md')) return 'task_plan';
    if (normalizedPath.includes('/planning/findings.md')) return 'findings';
    if (normalizedPath.includes('/planning/progress.md')) return 'progress';
    return null;
  }

  /**
   * Get error suggestion for tool failures
   */
  private getToolErrorSuggestion(toolName: string | undefined, errorMessage: string): string {
    if (!toolName) return 'Try a different approach or skip this step.';

    // .NET project and test setup errors
    if (toolName === 'execute_command') {
      // Framework version mismatch between projects
      if (
        errorMessage.includes('You must install or update .NET') ||
        (errorMessage.includes('Framework:') && errorMessage.includes('version'))
      ) {
        return `Framework version mismatch or missing runtime. CRITICAL: When updating framework versions:
1. Check BOTH projects' target frameworks: read_file both .csproj files
2. Update BOTH to the same framework version (e.g., both to net6.0 or both to net8.0)
3. Main project: update_file to change <TargetFramework>
4. Test project: update_file to change <TargetFramework>
5. Restore: dotnet restore
6. Rebuild solution: dotnet build
7. Run tests: dotnet test

DO NOT update only one project - this breaks project references!`;
      }

      // Missing or wrong project structure
      if (
        errorMessage.includes('Specify a project or solution file') ||
        errorMessage.includes('does not contain a project or solution file')
      ) {
        return `No project/solution file found. For .NET projects, you need proper setup:
1. Use list_directory to find existing .sln or .csproj files
2. Create console app WITH -f net10.0: dotnet new console -n ProjectName -f net10.0
3. Create test project WITH -f net10.0: dotnet new xunit -n ProjectName.Tests -f net10.0
4. Create solution file (REQUIRED): dotnet new sln -n ProjectName
5. Add projects to solution: dotnet sln add ProjectName/ProjectName.csproj ProjectName.Tests/ProjectName.Tests.csproj
6. Add reference from test to main: cd ProjectName.Tests && dotnet add reference ../ProjectName/ProjectName.csproj
7. Restore and test: dotnet restore && dotnet test

IMPORTANT: Always use -f net10.0 flag when creating projects!`;
      }

      // Missing NuGet packages (XUnit, NUnit, etc.)
      if (
        errorMessage.includes(
          'could not be found (are you missing a using directive or an assembly reference?)'
        )
      ) {
        const isXunit = errorMessage.includes('Xunit');
        const isNunit = errorMessage.includes('NUnit');
        const framework = isXunit ? 'xunit' : isNunit ? 'nunit' : 'test framework';

        return `Missing NuGet packages. For .NET test projects:
1. Navigate to test project directory: cd ProjectName.Tests
2. Restore/install packages: dotnet restore
3. If still missing, explicitly add test packages:
   ${
     isXunit
       ? 'dotnet add package xunit\n   dotnet add package xunit.runner.visualstudio\n   dotnet add package Microsoft.NET.Test.Sdk'
       : isNunit
         ? 'dotnet add package NUnit\n   dotnet add package NUnit3TestAdapter\n   dotnet add package Microsoft.NET.Test.Sdk'
         : 'dotnet add package Microsoft.NET.Test.Sdk'
   }
4. Restore again: dotnet restore
5. Build the test project: dotnet build
6. Run tests: dotnet test`;
      }

      // C# regex/string escaping errors - IMMEDIATE FIX REQUIRED
      if (
        errorMessage.includes('CS1009') || // Unrecognized escape sequence
        (errorMessage.includes('CS1525') && errorMessage.includes('Invalid expression term')) ||
        (errorMessage.includes('CS1010') && errorMessage.includes('Newline in constant'))
      ) {
        const fileMatch = errorMessage.match(/([^\\\/]+\.cs)\(/);
        const fileName = fileMatch ? fileMatch[1] : 'the C# file';

        return `🚨 CRITICAL: C# String Escape Errors - FIX IMMEDIATELY 🚨

You wrote a regex pattern or string WITHOUT the @ prefix. This causes CS1009/CS1525 errors.

**THE FIX (apply RIGHT NOW, not in 10 iterations):**

1. Read the file to see line 57 (or the error line): read_file ${fileName}
2. Find the pattern that looks like: Assert.Matches("[regex]", ...)
3. Replace with: Assert.Matches(@"[regex]", ...)  ← ADD @ BEFORE THE QUOTE

**Examples of WRONG vs CORRECT:**

❌ WRONG (causes CS1009):
Assert.Matches("[0-9]+", password);
var path = "C:\\\\Users\\\\file.txt";
var pattern = "[a-zA-Z]+";

✅ CORRECT (use @ prefix):
Assert.Matches(@"[0-9]+", password);
var path = @"C:\\Users\\file.txt";
var pattern = @"[a-zA-Z]+";

**DO THIS RIGHT NOW:**
1. Read ${fileName} to see the current content
2. Find ALL regex patterns and file paths (look for patterns with [ ] or \\\\)
3. Add @ before EVERY string that contains: [ ] \\\\ or regex characters
4. Build again: dotnet build

DO NOT try to escape backslashes manually. Use @ prefix. This is C# 101.`;
      }

      // Wrong dotnet CLI syntax - immediate correction
      if (
        errorMessage.includes('Invalid option') &&
        (errorMessage.includes('--framework') || errorMessage.includes('--target-framework'))
      ) {
        return `🚨 WRONG DOTNET CLI SYNTAX 🚨

You used: --framework net7.0
Correct:  -f net10.0

**CRITICAL FIXES:**
1. The flag is -f NOT --framework
2. The version MUST be net10.0 (not net7.0, not net8.0)

**Correct commands:**
✅ dotnet new console -n ProjectName -f net10.0
✅ dotnet new xunit -n ProjectName.Tests -f net10.0

**NEVER use:**
❌ dotnet new console -n ProjectName --framework net7.0
❌ dotnet new console -n ProjectName -f net8.0

**Every .NET project you create MUST use -f net10.0**`;
      }

      // Microsoft.NET.Test.Sdk used as SDK instead of PackageReference
      if (
        (errorMessage.includes('Could not resolve SDK "Microsoft.NET.Test.Sdk"') ||
          errorMessage.includes("The SDK 'Microsoft.NET.Test.Sdk' specified could not be found")) &&
        errorMessage.includes('.csproj')
      ) {
        return `🚨 CRITICAL .CSPROJ ERROR - Microsoft.NET.Test.Sdk IS NOT AN SDK! 🚨

YOU ARE USING IT WRONG. This is a NuGet PACKAGE, not an SDK.

❌ WRONG - Using as SDK:
<Project Sdk="Microsoft.NET.Sdk">
  <Sdk Name="Microsoft.NET.Test.Sdk" Version="17.11.1" />  ← WRONG!
</Project>

✅ CORRECT - Using as PackageReference:
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.0" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
</Project>

**FIX NOW:**
1. Read the .csproj file that has the error
2. Remove any <Sdk Name="Microsoft.NET.Test.Sdk" /> tags
3. Add <ItemGroup> with <PackageReference> entries as shown above
4. Run: dotnet restore
5. Run: dotnet build
6. Run: dotnet test

This is a STRUCTURAL ERROR in the .csproj file. Fix the XML structure.`;
      }

      // Referenced project not found
      if (
        errorMessage.includes('The referenced project') &&
        errorMessage.includes('does not exist')
      ) {
        return `Test project cannot find main project reference. Fix the project structure:
1. Use list_directory to verify both projects exist
2. Check .csproj file for correct relative path in <ProjectReference>
3. Update reference: cd TestProject && dotnet add reference ../MainProject/MainProject.csproj
4. Verify solution structure: dotnet sln list
5. Rebuild: dotnet build`;
      }

      // Skipping project because it was not found
      if (
        errorMessage.includes('Skipping project') &&
        errorMessage.includes('because it was not found')
      ) {
        return `Solution file references projects that don't exist (often due to incorrect paths or nested directories).
1. Check for duplicate/nested directories: list_directory to see actual structure
2. Remove old solution: remove the .sln file
3. Create fresh solution: dotnet new sln -n ProjectName
4. Add existing projects with correct paths: dotnet sln add correct/path/to/Project.csproj
5. Verify: dotnet sln list`;
      }

      if (
        errorMessage.includes('Cannot find module') ||
        errorMessage.includes('MODULE_NOT_FOUND')
      ) {
        return `Node module not found. Try:
1. Check if node_modules exists
2. Run: npm install or npm ci
3. Verify package.json exists`;
      }

      if (errorMessage.includes('playwright') && errorMessage.includes('not installed')) {
        return `Playwright not installed. Run: npx playwright install`;
      }

      if (errorMessage.includes('connection refused') || errorMessage.includes('ECONNREFUSED')) {
        return `Cannot connect to server. The application server may not be running.
1. Check if the app needs to be started first
2. Verify the correct port is being used
3. Consider if this is a backend-only project that doesn't need a running server for tests`;
      }
    }

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
