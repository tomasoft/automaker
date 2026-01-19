/**
 * Usage tracking types for token and cost monitoring across all providers
 */

import type { ModelProvider } from './settings.js';

/**
 * Token usage for a single API call
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Cost calculation for a single API call
 */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheCreationCost?: number;
  cacheReadCost?: number;
  totalCost: number;
  currency: string; // Defaults to 'GBP' (£) to match budget settings
}

/**
 * Single usage entry for tracking
 */
export interface UsageEntry {
  id: string;
  timestamp: string;
  provider: ModelProvider;
  model: string;
  featureId?: string;
  featureTitle?: string;
  projectPath: string;
  sessionId?: string;
  contextType?:
    | 'chat'
    | 'feature'
    | 'planning'
    | 'implementation'
    | 'verification'
    | 'spec-generation'
    | 'agent';
  tokens: TokenUsage;
  cost: CostBreakdown;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated usage statistics for a specific scope
 */
export interface UsageStats {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  currency: string; // Defaults to 'GBP' (£) to match budget settings
  entryCount: number;
  modelBreakdown: Array<{
    model: string;
    provider: ModelProvider;
    tokens: number;
    cost: number;
    calls: number;
  }>;
  providerBreakdown: Array<{
    provider: ModelProvider;
    tokens: number;
    cost: number;
    calls: number;
  }>;
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Usage statistics for a specific feature
 */
export interface FeatureUsageStats extends UsageStats {
  featureId: string;
  featureTitle?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Usage statistics for a project
 */
export interface ProjectUsageStats extends UsageStats {
  projectPath: string;
  projectName: string;
  features: FeatureUsageStats[];
}

/**
 * Request to log a usage entry
 */
export interface LogUsageRequest {
  provider: ModelProvider;
  model: string;
  featureId?: string;
  featureTitle?: string;
  projectPath: string;
  sessionId?: string;
  contextType?:
    | 'chat'
    | 'feature'
    | 'planning'
    | 'implementation'
    | 'verification'
    | 'spec-generation'
    | 'agent';
  tokens: TokenUsage;
  cost?: CostBreakdown; // Optional, will be calculated if not provided
}

/**
 * Query parameters for retrieving usage stats
 */
export interface UsageQuery {
  projectPath?: string;
  featureId?: string;
  provider?: ModelProvider;
  model?: string;
  startDate?: string;
  endDate?: string;
  contextType?: string;
}
