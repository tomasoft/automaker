/**
 * Chat interface types for interactive AI conversations
 */

import type { ModelProvider } from './settings.js';
import type { Feature } from './feature.js';

/**
 * Types of chat/enhancement interactions
 */
export type ChatType =
  | 'general' // General chat/questions
  | 'feature-creation' // Create new feature from chat
  | 'feature-enhancement' // Enhance existing feature
  | 'code-review' // Code review discussion
  | 'debugging' // Debugging help
  | 'refactoring' // Refactoring suggestions
  | 'architecture' // Architecture discussion
  | 'documentation'; // Documentation assistance

/**
 * Single chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: {
    amount: number;
    currency: string;
  };
  model?: string;
  provider?: ModelProvider;
  metadata?: Record<string, unknown>;
}

/**
 * Chat session/conversation
 */
export interface ChatSession {
  id: string;
  title: string;
  type: ChatType;
  model: string;
  provider: ModelProvider;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  // Associated features created or modified during this chat
  associatedFeatures?: string[];
  // Currently linked feature for spec/prompt refinement
  linkedFeatureId?: string;
  linkedFeatureName?: string;
  // Cumulative usage stats for this session
  totalTokens: number;
  totalCost: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to create a new chat session
 */
export interface CreateChatSessionRequest {
  title?: string;
  type: ChatType;
  model: string;
  provider: ModelProvider;
  projectPath: string;
  initialMessage?: string;
}

/**
 * Request to send a message in a chat
 */
export interface SendChatMessageRequest {
  sessionId: string;
  content?: string;
  projectPath: string;
}

/**
 * Response from sending a chat message
 */
export interface SendChatMessageResponse {
  message: ChatMessage;
  session: ChatSession;
  // Optional feature created from this interaction
  createdFeature?: Feature;
}

/**
 * Request to create a feature from chat
 */
export interface CreateFeatureFromChatRequest {
  sessionId: string;
  messageId?: string; // Specific message to base feature on
  title: string;
  description: string;
  category: string;
  priority?: number;
  model?: string; // Override session model
  projectPath: string;
}

/**
 * Chat session list item (lightweight)
 */
export interface ChatSessionListItem {
  id: string;
  title: string;
  type: ChatType;
  model: string;
  provider: ModelProvider;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
  totalCost: number;
  currency: string;
  linkedFeatureId?: string;
  linkedFeatureName?: string;
}

/**
 * Request to link a feature to a chat session
 */
export interface LinkFeatureToChatRequest {
  sessionId: string;
  featureId: string;
  projectPath: string;
}

/**
 * Request to load feature context into chat
 */
export interface LoadFeatureContextRequest {
  sessionId: string;
  featureId: string;
  projectPath: string;
}

/**
 * Response from loading feature context
 */
export interface LoadFeatureContextResponse {
  success: boolean;
  feature: Feature;
  contextMessage: ChatMessage; // The message sent to the chat
  session: ChatSession;
}

/**
 * Request to update feature spec based on chat
 */
export interface UpdateFeatureSpecRequest {
  sessionId: string;
  featureId: string;
  newSpec?: string;
  title?: string;
  description?: string;
  projectPath: string;
}

/**
 * Response from updating feature spec
 */
export interface UpdateFeatureSpecResponse {
  success: boolean;
  feature: Feature;
  session: ChatSession;
}
