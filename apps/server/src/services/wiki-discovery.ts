/**
 * Wiki Discovery Service
 *
 * Crawls Azure DevOps wiki pages, builds an index, and registers webhooks
 * for real-time updates when wiki pages change.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@automaker/utils';
import { WikiAdapter, WikiPageMetadata } from './wiki-adapters/index.js';
import type { AzureDevOpsConfig } from '@automaker/types';
import * as azdev from 'azure-devops-node-api';

const logger = createLogger('WikiDiscovery');

/**
 * Wiki index entry
 */
interface WikiIndexEntry extends WikiPageMetadata {
  /** Indexed timestamp */
  indexedAt: string;
}

/**
 * Wiki index structure
 */
interface WikiIndex {
  /** Wiki configuration */
  config: AzureDevOpsConfig;
  /** All indexed pages */
  pages: WikiIndexEntry[];
  /** Last index timestamp */
  lastIndexed: string;
  /** Webhook ID if registered */
  webhookId?: string;
}

/**
 * Wiki Discovery Service
 */
export class WikiDiscoveryService {
  private indexFilePath: string;
  private index: WikiIndex | null = null;

  constructor(private dataDir: string) {
    this.indexFilePath = path.join(dataDir, 'wiki-index.json');
    this.loadIndex();
  }

  /**
   * Index all pages from a wiki adapter
   */
  async indexWiki(adapter: WikiAdapter, config: AzureDevOpsConfig): Promise<void> {
    try {
      logger.info('Starting wiki indexing...');

      const pages = await adapter.getAllPages({ maxDepth: 10 });

      const indexedPages: WikiIndexEntry[] = pages.map((page) => ({
        ...page,
        indexedAt: new Date().toISOString(),
      }));

      this.index = {
        config,
        pages: indexedPages,
        lastIndexed: new Date().toISOString(),
      };

      this.saveIndex();

      logger.info(`Indexed ${indexedPages.length} pages from wiki`);
    } catch (error) {
      logger.error('Failed to index wiki', error);
      throw error;
    }
  }

  /**
   * Register webhook for real-time wiki updates
   *
   * NOTE: Temporarily disabled - Azure DevOps Node API doesn't expose ServiceHooks API in TypeScript types
   * TODO: Implement using REST API directly or wait for SDK update
   */
  async registerWebhook(
    config: AzureDevOpsConfig,
    accessToken: string,
    webhookUrl: string
  ): Promise<string> {
    logger.warn('Webhook registration temporarily disabled - using manual refresh only');

    // Return a placeholder webhook ID
    return 'manual-refresh-mode';
  }

  /**
   * Delete webhook subscription
   *
   * NOTE: Temporarily disabled - Azure DevOps Node API doesn't expose ServiceHooks API in TypeScript types
   * TODO: Implement using REST API directly or wait for SDK update
   */
  async deleteWebhook(config: AzureDevOpsConfig, accessToken: string): Promise<void> {
    logger.warn('Webhook deletion temporarily disabled - webhook is in manual refresh mode');
    return;
  }

  /**
   * Find page by path
   */
  findPage(path: string): WikiIndexEntry | undefined {
    if (!this.index) {
      return undefined;
    }

    return this.index.pages.find((p) => p.path === path);
  }

  /**
   * Get all indexed pages
   */
  getAllPages(): WikiIndexEntry[] {
    return this.index?.pages || [];
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalPages: number;
    lastIndexed: string | null;
    hasWebhook: boolean;
  } {
    return {
      totalPages: this.index?.pages.length || 0,
      lastIndexed: this.index?.lastIndexed || null,
      hasWebhook: !!this.index?.config.webhookId,
    };
  }

  /**
   * Load index from disk
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexFilePath)) {
        const data = fs.readFileSync(this.indexFilePath, 'utf8');
        this.index = JSON.parse(data) as WikiIndex;
        logger.debug(`Loaded wiki index with ${this.index.pages.length} pages`);
      }
    } catch (error) {
      logger.error('Failed to load wiki index', error);
    }
  }

  /**
   * Save index to disk (atomic write)
   */
  private saveIndex(): void {
    if (!this.index) {
      return;
    }

    try {
      const tempFile = `${this.indexFilePath}.tmp`;

      // Ensure directory exists
      fs.mkdirSync(path.dirname(this.indexFilePath), { recursive: true });

      // Write to temp file
      fs.writeFileSync(tempFile, JSON.stringify(this.index, null, 2), 'utf8');

      // Atomic rename
      fs.renameSync(tempFile, this.indexFilePath);

      logger.debug('Saved wiki index to disk');
    } catch (error) {
      logger.error('Failed to save wiki index', error);
    }
  }
}
