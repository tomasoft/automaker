/**
 * Usage tracking service for monitoring token and cost usage across all providers
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  UsageEntry,
  UsageStats,
  FeatureUsageStats,
  ProjectUsageStats,
  LogUsageRequest,
  UsageQuery,
  TokenUsage,
  CostBreakdown,
  ModelProvider,
} from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('usage-tracking');

// Pricing data per model (cost per 1M tokens)
const MODEL_PRICING: Record<
  string,
  {
    inputCostPer1M: number;
    outputCostPer1M: number;
    cacheCreationCostPer1M?: number;
    cacheReadCostPer1M?: number;
    currency: string;
  }
> = {
  // Claude models (prices in GBP to match budget settings)
  'claude-opus-4-5-20251101': {
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    cacheCreationCostPer1M: 18.75,
    cacheReadCostPer1M: 1.5,
    currency: 'GBP',
  },
  'claude-sonnet-4-20250514': {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheCreationCostPer1M: 3.75,
    cacheReadCostPer1M: 0.3,
    currency: 'GBP',
  },
  'claude-3-5-sonnet-20241022': {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheCreationCostPer1M: 3.75,
    cacheReadCostPer1M: 0.3,
    currency: 'GBP',
  },
  'claude-haiku-4-5-20251001': {
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
    cacheCreationCostPer1M: 1.0,
    cacheReadCostPer1M: 0.08,
    currency: 'GBP',
  },
  // Add more models as needed
  // GitHub Copilot models (estimates, actual costs may vary)
  'gpt-4o': {
    inputCostPer1M: 5.0,
    outputCostPer1M: 15.0,
    currency: 'GBP',
  },
  'gpt-4o-mini': {
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    currency: 'GBP',
  },
  // Default for unknown models
  default: {
    inputCostPer1M: 1.0,
    outputCostPer1M: 3.0,
    currency: 'GBP',
  },
};

export class UsageTrackingService {
  private usageDir: string;
  private usageFilePath: string;
  private cache: Map<string, UsageEntry> = new Map();
  private cacheLoaded = false;

  constructor(dataDir?: string) {
    this.usageDir = dataDir || path.join(process.cwd(), 'data', 'usage');
    this.usageFilePath = path.join(this.usageDir, 'usage-log.jsonl');
  }

  /**
   * Initialize the usage tracking service
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.usageDir, { recursive: true });
      await this.loadCache();
      logger.info('Usage tracking service initialized');
    } catch (error) {
      logger.error('Failed to initialize usage tracking service:', error);
      throw error;
    }
  }

  /**
   * Load all usage entries into cache
   */
  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.usageFilePath, 'utf-8');
      const lines = content.trim().split('\n');
      this.cache.clear();

      for (const line of lines) {
        if (line.trim()) {
          const entry: UsageEntry = JSON.parse(line);
          this.cache.set(entry.id, entry);
        }
      }

      this.cacheLoaded = true;
      logger.info(`Loaded ${this.cache.size} usage entries into cache`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, that's okay
        this.cacheLoaded = true;
        logger.info('No existing usage log found, starting fresh');
      } else {
        logger.error('Failed to load usage cache:', error);
        throw error;
      }
    }
  }

  /**
   * Calculate cost for a usage entry
   */
  private calculateCost(model: string, tokens: TokenUsage): CostBreakdown {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;

    const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputCostPer1M;

    let cacheCreationCost = 0;
    let cacheReadCost = 0;

    if (tokens.cacheCreationTokens && pricing.cacheCreationCostPer1M) {
      cacheCreationCost = (tokens.cacheCreationTokens / 1_000_000) * pricing.cacheCreationCostPer1M;
    }

    if (tokens.cacheReadTokens && pricing.cacheReadCostPer1M) {
      cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * pricing.cacheReadCostPer1M;
    }

    return {
      inputCost,
      outputCost,
      cacheCreationCost: cacheCreationCost > 0 ? cacheCreationCost : undefined,
      cacheReadCost: cacheReadCost > 0 ? cacheReadCost : undefined,
      totalCost: inputCost + outputCost + cacheCreationCost + cacheReadCost,
      currency: pricing.currency,
    };
  }

  /**
   * Log a usage entry
   */
  async logUsage(request: LogUsageRequest): Promise<UsageEntry> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const entry: UsageEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      provider: request.provider,
      model: request.model,
      featureId: request.featureId,
      featureTitle: request.featureTitle,
      projectPath: request.projectPath,
      sessionId: request.sessionId,
      contextType: request.contextType,
      tokens: request.tokens,
      cost: request.cost || this.calculateCost(request.model, request.tokens),
      metadata: {},
    };

    // Add to cache
    this.cache.set(entry.id, entry);

    // Append to file
    try {
      await fs.appendFile(this.usageFilePath, JSON.stringify(entry) + '\n');
    } catch (error) {
      logger.error('Failed to write usage entry to file:', error);
      // Don't throw - we still have it in cache
    }

    return entry;
  }

  /**
   * Get usage statistics based on query
   */
  async getStats(query: UsageQuery): Promise<UsageStats> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const entries = Array.from(this.cache.values()).filter((entry) => {
      if (query.projectPath && entry.projectPath !== query.projectPath) return false;
      if (query.featureId && entry.featureId !== query.featureId) return false;
      if (query.provider && entry.provider !== query.provider) return false;
      if (query.model && entry.model !== query.model) return false;
      if (query.contextType && entry.contextType !== query.contextType) return false;
      if (query.startDate && entry.timestamp < query.startDate) return false;
      if (query.endDate && entry.timestamp > query.endDate) return false;
      return true;
    });

    return this.aggregateStats(entries);
  }

  /**
   * Get usage statistics for a specific feature
   */
  async getFeatureStats(projectPath: string, featureId: string): Promise<FeatureUsageStats | null> {
    const stats = await this.getStats({ projectPath, featureId });
    if (stats.entryCount === 0) return null;

    return {
      ...stats,
      featureId,
    };
  }

  /**
   * Get usage statistics for a project
   */
  async getProjectStats(projectPath: string): Promise<ProjectUsageStats> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const projectEntries = Array.from(this.cache.values()).filter(
      (e) => e.projectPath === projectPath
    );

    const totalStats = this.aggregateStats(projectEntries);

    // Get unique features
    const featureIds = new Set(projectEntries.filter((e) => e.featureId).map((e) => e.featureId!));

    const features: FeatureUsageStats[] = [];
    for (const featureId of featureIds) {
      const featureStats = await this.getFeatureStats(projectPath, featureId);
      if (featureStats) {
        features.push(featureStats);
      }
    }

    return {
      ...totalStats,
      projectPath,
      projectName: path.basename(projectPath),
      features,
    };
  }

  /**
   * Aggregate usage entries into statistics
   */
  private aggregateStats(entries: UsageEntry[]): UsageStats {
    if (entries.length === 0) {
      return {
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        currency: 'USD',
        entryCount: 0,
        modelBreakdown: [],
        providerBreakdown: [],
      };
    }

    const totalTokens = entries.reduce((sum, e) => sum + e.tokens.totalTokens, 0);
    const totalInputTokens = entries.reduce((sum, e) => sum + e.tokens.inputTokens, 0);
    const totalOutputTokens = entries.reduce((sum, e) => sum + e.tokens.outputTokens, 0);
    const totalCost = entries.reduce((sum, e) => sum + e.cost.totalCost, 0);

    // Model breakdown
    const modelMap = new Map<
      string,
      { model: string; provider: ModelProvider; tokens: number; cost: number; calls: number }
    >();

    for (const entry of entries) {
      const key = `${entry.provider}:${entry.model}`;
      const existing = modelMap.get(key);
      if (existing) {
        existing.tokens += entry.tokens.totalTokens;
        existing.cost += entry.cost.totalCost;
        existing.calls += 1;
      } else {
        modelMap.set(key, {
          model: entry.model,
          provider: entry.provider,
          tokens: entry.tokens.totalTokens,
          cost: entry.cost.totalCost,
          calls: 1,
        });
      }
    }

    // Provider breakdown
    const providerMap = new Map<
      ModelProvider,
      { provider: ModelProvider; tokens: number; cost: number; calls: number }
    >();

    for (const entry of entries) {
      const existing = providerMap.get(entry.provider);
      if (existing) {
        existing.tokens += entry.tokens.totalTokens;
        existing.cost += entry.cost.totalCost;
        existing.calls += 1;
      } else {
        providerMap.set(entry.provider, {
          provider: entry.provider,
          tokens: entry.tokens.totalTokens,
          cost: entry.cost.totalCost,
          calls: 1,
        });
      }
    }

    const timestamps = entries.map((e) => e.timestamp).sort();

    return {
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      currency: entries[0]?.cost.currency || 'USD',
      entryCount: entries.length,
      modelBreakdown: Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost),
      providerBreakdown: Array.from(providerMap.values()).sort((a, b) => b.cost - a.cost),
      periodStart: timestamps[0],
      periodEnd: timestamps[timestamps.length - 1],
    };
  }

  /**
   * Clear all usage data (for testing or reset)
   */
  async clear(): Promise<void> {
    this.cache.clear();
    try {
      await fs.writeFile(this.usageFilePath, '');
      logger.info('Usage data cleared');
    } catch (error) {
      logger.error('Failed to clear usage data:', error);
      throw error;
    }
  }
}

// Singleton instance
let usageTrackingService: UsageTrackingService | null = null;

export function getUsageTrackingService(dataDir?: string): UsageTrackingService {
  if (!usageTrackingService) {
    usageTrackingService = new UsageTrackingService(dataDir);
  }
  return usageTrackingService;
}
