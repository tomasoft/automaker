/**
 * Chat service for interactive AI conversations
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ChatSession,
  ChatMessage,
  CreateChatSessionRequest,
  SendChatMessageRequest,
  SendChatMessageResponse,
  CreateFeatureFromChatRequest,
  ChatSessionListItem,
  ChatType,
} from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { ProviderFactory } from '../providers/provider-factory.js';
import { getUsageTrackingService } from './usage-tracking-service.js';

const logger = createLogger('chat-service');

export class ChatService {
  private chatDir: string;
  private sessionsCache: Map<string, ChatSession> = new Map();
  private cacheLoaded = false;

  constructor(dataDir?: string) {
    this.chatDir = dataDir || path.join(process.cwd(), 'data', 'chat');
  }

  /**
   * Initialize the chat service
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.chatDir, { recursive: true });
      await this.loadCache();
      logger.info('Chat service initialized');
    } catch (error) {
      logger.error('Failed to initialize chat service:', error);
      throw error;
    }
  }

  /**
   * Load all chat sessions into cache
   */
  private async loadCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.chatDir);
      this.sessionsCache.clear();

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.chatDir, file), 'utf-8');
          const session: ChatSession = JSON.parse(content);
          this.sessionsCache.set(session.id, session);
        }
      }

      this.cacheLoaded = true;
      logger.info(`Loaded ${this.sessionsCache.size} chat sessions into cache`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.cacheLoaded = true;
        logger.info('No existing chat sessions found, starting fresh');
      } else {
        logger.error('Failed to load chat cache:', error);
        throw error;
      }
    }
  }

  /**
   * Save a session to disk
   */
  private async saveSession(session: ChatSession): Promise<void> {
    const filePath = path.join(this.chatDir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    // Update cache with the saved session
    this.sessionsCache.set(session.id, session);
  }

  /**
   * Create a new chat session
   */
  async createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session: ChatSession = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      title: request.title || this.generateDefaultTitle(request.type),
      type: request.type,
      model: request.model,
      provider: request.provider,
      projectPath: request.projectPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      associatedFeatures: [],
      totalTokens: 0,
      totalCost: 0,
      currency: 'GBP',
      metadata: {},
    };

    // If there's an initial message, add it
    if (request.initialMessage) {
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-1`,
        role: 'user',
        content: request.initialMessage,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMessage);
    }

    this.sessionsCache.set(session.id, session);
    await this.saveSession(session);

    return session;
  }

  /**
   * Generate a default title based on chat type
   */
  private generateDefaultTitle(type: ChatType): string {
    const titles: Record<ChatType, string> = {
      general: 'General Chat',
      'feature-creation': 'New Feature Discussion',
      'feature-enhancement': 'Feature Enhancement',
      'code-review': 'Code Review Session',
      debugging: 'Debugging Session',
      refactoring: 'Refactoring Discussion',
      architecture: 'Architecture Discussion',
      documentation: 'Documentation Help',
    };
    return `${titles[type]} - ${new Date().toLocaleString()}`;
  }

  /**
   * Send a message in a chat session
   */
  async *sendMessage(request: SendChatMessageRequest): AsyncGenerator<{
    type: 'message' | 'done';
    content?: string;
    message?: ChatMessage;
    session?: ChatSession;
  }> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(request.sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${request.sessionId}`);
    }

    let promptContent = request.content || '';
    let historyMessages = session.messages;

    if (request.content) {
      // Add user message
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-${session.messages.length + 1}`,
        role: 'user',
        content: request.content,
        timestamp: new Date().toISOString(),
      };

      // History is existing messages before adding the new one
      historyMessages = [...session.messages];

      // Add the new user message to session
      session.messages.push(userMessage);
    } else {
      // If no content, try to use the last message as prompt if it's a user message
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        promptContent = lastMsg.content;
        historyMessages = session.messages.slice(0, -1);
      }
    }

    // Get provider and execute query
    const provider = ProviderFactory.getProviderForModel(session.model);

    // For conversation context: pass previous messages as history
    const conversationHistory = historyMessages.map((msg) => ({
      role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: msg.content,
    }));

    // Stream response
    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = provider.executeQuery({
        prompt: promptContent,
        systemPrompt: this.getSystemPromptForChatType(session.type),
        conversationHistory,
        model: session.model,
        cwd: process.cwd(),
      });

      for await (const message of stream) {
        // Handle assistant messages
        if (message.type === 'assistant' && message.message) {
          // Extract text content from all text blocks
          const textContent = message.message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');

          if (textContent) {
            // The provider sends the new chunk directly, not cumulative text
            // So we just append it to our accumulated response
            fullResponse += textContent;

            // Stream the chunk as-is
            yield {
              type: 'message',
              content: textContent,
            };
          }
        }
        // Handle result messages with usage info
        else if (message.type === 'result') {
          if (message.usage) {
            inputTokens = message.usage.inputTokens;
            outputTokens = message.usage.outputTokens;
          }
        }
        // Handle errors
        else if (message.type === 'error' && message.error) {
          throw new Error(message.error);
        }
      }

      // Estimate tokens if not provided by the provider
      // This is a rough approximation: ~4 chars per token
      if (inputTokens === 0) {
        const totalInputChars = session.messages
          .filter((m) => m.role === 'user')
          .reduce((sum, m) => sum + m.content.length, 0);
        inputTokens = Math.ceil(totalInputChars / 4);
      }
      if (outputTokens === 0) {
        outputTokens = Math.ceil(fullResponse.length / 4);
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-${session.messages.length + 1}`,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        model: session.model,
        provider: session.provider,
      };

      session.messages.push(assistantMessage);
      session.updatedAt = new Date().toISOString();

      // Log usage
      if (inputTokens > 0 || outputTokens > 0) {
        const usageService = getUsageTrackingService();
        const usageEntry = await usageService.logUsage({
          provider: session.provider,
          model: session.model,
          projectPath: request.projectPath,
          sessionId: session.id,
          contextType: 'chat',
          tokens: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });

        // Update session totals
        session.totalTokens += usageEntry.tokens.totalTokens;
        session.totalCost += usageEntry.cost.totalCost;
        session.currency = usageEntry.cost.currency;

        // Update message with cost
        assistantMessage.cost = {
          amount: usageEntry.cost.totalCost,
          currency: usageEntry.cost.currency,
        };
      }

      await this.saveSession(session);

      logger.debug('Session saved:', {
        sessionId: session.id,
        messageCount: session.messages.length,
        totalTokens: session.totalTokens,
      });

      yield {
        type: 'done',
        message: assistantMessage,
        session,
      };
    } catch (error) {
      logger.error('Error in chat message stream:', error);
      throw error;
    }
  }

  /**
   * Get system prompt for a chat type
   */
  private getSystemPromptForChatType(type: ChatType): string {
    const prompts: Record<ChatType, string> = {
      general:
        'You are a helpful AI assistant for software development. Provide clear, concise, and accurate answers.',
      'feature-creation':
        'You are a helpful AI assistant focused on helping create new features. Ask clarifying questions and help define clear, implementable feature specifications.',
      'feature-enhancement':
        'You are a helpful AI assistant focused on improving existing features. Suggest enhancements, improvements, and optimizations.',
      'code-review':
        'You are an expert code reviewer. Provide constructive feedback on code quality, best practices, potential bugs, and improvements.',
      debugging:
        'You are a debugging expert. Help identify issues, suggest solutions, and guide through the debugging process systematically.',
      refactoring:
        'You are a refactoring expert. Suggest improvements to code structure, maintainability, and design patterns while preserving functionality.',
      architecture:
        'You are a software architecture expert. Discuss system design, architectural patterns, scalability, and technical decisions.',
      documentation:
        'You are a documentation expert. Help write clear, comprehensive documentation including README files, API docs, and code comments.',
    };

    return prompts[type];
  }

  /**
   * Get a chat session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }
    return this.sessionsCache.get(sessionId) || null;
  }

  /**
   * List all chat sessions for a project
   */
  async listSessions(projectPath: string): Promise<ChatSessionListItem[]> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const sessions = Array.from(this.sessionsCache.values())
      .filter((s) => s.projectPath === projectPath)
      .map(
        (s): ChatSessionListItem => ({
          id: s.id,
          title: s.title,
          type: s.type,
          model: s.model,
          provider: s.provider,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
          totalTokens: s.totalTokens,
          totalCost: s.totalCost,
          currency: s.currency,
        })
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return sessions;
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    // Remove from cache
    this.sessionsCache.delete(sessionId);

    // Delete file
    const filePath = path.join(this.chatDir, `${sessionId}.json`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.error('Failed to delete session file:', error);
    }
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<ChatSession> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    session.title = title;
    session.updatedAt = new Date().toISOString();

    await this.saveSession(session);
    return session;
  }

  /**
   * Associate a feature with a chat session
   */
  async associateFeature(sessionId: string, featureId: string): Promise<ChatSession> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    if (!session.associatedFeatures) {
      session.associatedFeatures = [];
    }

    if (!session.associatedFeatures.includes(featureId)) {
      session.associatedFeatures.push(featureId);
      session.updatedAt = new Date().toISOString();
      await this.saveSession(session);
    }

    return session;
  }

  /**
   * Link a feature to the chat session for prompt refinement
   */
  async linkFeature(
    sessionId: string,
    featureId: string,
    featureName: string
  ): Promise<ChatSession> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    session.linkedFeatureId = featureId;
    session.linkedFeatureName = featureName;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);

    return session;
  }

  /**
   * Unlink the feature from the chat session
   */
  async unlinkFeature(sessionId: string): Promise<ChatSession> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const session = this.sessionsCache.get(sessionId);
    if (!session) {
      throw new Error(`Chat session not found: ${sessionId}`);
    }

    delete session.linkedFeatureId;
    delete session.linkedFeatureName;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);

    return session;
  }
}

// Singleton instance
let chatService: ChatService | null = null;

export function getChatService(dataDir?: string): ChatService {
  if (!chatService) {
    chatService = new ChatService(dataDir);
  }
  return chatService;
}
