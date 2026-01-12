/**
 * Azure DevOps Wiki Adapter
 *
 * Implements WikiAdapter for Azure DevOps Wikis using azure-devops-node-api
 */

import * as azdev from 'azure-devops-node-api';
import * as WikiApi from 'azure-devops-node-api/WikiApi.js';
import {
  WikiAdapter,
  WikiPageContent,
  WikiPageMetadata,
  WikiSearchResult,
} from './base-adapter.js';
import type { AzureDevOpsAuthManager } from '../../providers/azure-devops-auth.js';

interface AzureDevOpsWikiConfig {
  organization: string;
  project: string;
  wikiId: string;
}

/**
 * Azure DevOps Wiki Adapter
 */
export class AzureDevOpsWikiAdapter extends WikiAdapter {
  private connection: azdev.WebApi | null = null;
  private wikiApi: WikiApi.IWikiApi | null = null;
  private cache = new Map<string, WikiPageContent>();
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds

  constructor(
    private config: AzureDevOpsWikiConfig,
    private authManager: AzureDevOpsAuthManager
  ) {
    super();
  }

  getName(): string {
    return 'AzureDevOps';
  }

  /**
   * Initialize connection to Azure DevOps
   */
  private async getConnection(): Promise<WikiApi.IWikiApi> {
    if (this.wikiApi) {
      return this.wikiApi;
    }

    const accessToken = await this.authManager.getToken();
    const orgUrl = `https://dev.azure.com/${this.config.organization}`;

    this.connection = new azdev.WebApi(orgUrl, azdev.getBearerHandler(accessToken));
    this.wikiApi = await this.connection.getWikiApi();

    return this.wikiApi;
  }

  /**
   * Fetch a wiki page by path
   */
  async getPage(
    path: string,
    options?: {
      useCache?: boolean;
      etag?: string;
      timeout?: number;
    }
  ): Promise<WikiPageContent> {
    const cacheKey = `${this.config.wikiId}:${path}`;

    // Check cache first if requested
    if (options?.useCache !== false) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const age = Date.now() - new Date(cached.lastFetched).getTime();
        const isStale = age > this.CACHE_TTL;

        if (!isStale) {
          this.logger.debug(`Cache hit for page: ${path}`);
          return { ...cached, isCached: true, isStale: false };
        }

        // Stale cache - try to fetch, fallback to stale on error
        try {
          return await this.fetchPage(path, options);
        } catch (error) {
          this.logger.warn(`Failed to refresh page, using stale cache: ${path}`, error);
          return { ...cached, isCached: true, isStale: true };
        }
      }
    }

    // No cache or cache disabled - fetch fresh
    return await this.fetchPage(path, options);
  }

  /**
   * Fetch page from Azure DevOps API
   */
  private async fetchPage(
    path: string,
    options?: {
      etag?: string;
      timeout?: number;
    }
  ): Promise<WikiPageContent> {
    const timeout = options?.timeout || this.DEFAULT_TIMEOUT;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    );

    try {
      const wikiApi = await this.getConnection();

      // Fetch page content as stream
      const pagePromise = wikiApi.getPageText(this.config.project, this.config.wikiId, path);

      const pageStream = await Promise.race([pagePromise, timeoutPromise]);

      if (!pageStream) {
        throw new Error(`Page not found: ${path}`);
      }

      // Convert stream to string
      const chunks: Uint8Array[] = [];
      for await (const chunk of pageStream as any) {
        chunks.push(chunk);
      }
      const pageContent = Buffer.concat(chunks).toString('utf8');

      const content: WikiPageContent = {
        id: path, // Use path as ID since we don't have numeric ID from this API
        path: path,
        title: path.split('/').pop() || path,
        content: pageContent || '',
        lastModified: new Date().toISOString(),
        isCached: false,
        isStale: false,
        lastFetched: new Date().toISOString(),
      };

      // Cache the result
      const cacheKey = `${this.config.wikiId}:${path}`;
      this.cache.set(cacheKey, content);

      this.logger.debug(`Fetched page: ${path}`);
      return content;
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        throw new Error(`Timeout fetching page: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Search wiki pages
   */
  async searchPages(
    query: string,
    options?: {
      max?: number;
      category?: string;
      timeout?: number;
    }
  ): Promise<WikiSearchResult> {
    const max = options?.max || 10;
    const timeout = options?.timeout || this.DEFAULT_TIMEOUT;

    try {
      const wikiApi = await this.getConnection();

      // Azure DevOps Wiki doesn't have built-in search API
      // We need to get all pages and filter client-side (not ideal for large wikis)
      const allPages = await this.getAllPages({ timeout });

      // Simple text matching in path/title
      const searchLower = query.toLowerCase();
      const matchingPages = allPages
        .filter((page) => {
          const titleMatch = page.title.toLowerCase().includes(searchLower);
          const pathMatch = page.path.toLowerCase().includes(searchLower);
          return titleMatch || pathMatch;
        })
        .slice(0, max);

      return {
        pages: matchingPages,
        totalCount: matchingPages.length,
        hasMore: matchingPages.length === max,
      };
    } catch (error) {
      this.logger.error('Failed to search pages', error);
      throw error;
    }
  }

  /**
   * Get all pages in the wiki (for indexing)
   */
  async getAllPages(options?: {
    maxDepth?: number;
    timeout?: number;
  }): Promise<WikiPageMetadata[]> {
    try {
      const wikiApi = await this.getConnection();

      const pages = await wikiApi.getPagesBatch(
        {
          top: 1000, // Maximum pages per request
        },
        this.config.project,
        this.config.wikiId
      );

      if (!pages) {
        return [];
      }

      return pages.map((page) => ({
        id: page.id!,
        path: page.path!,
        title: page.path?.split('/').pop() || '',
        lastModified: new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.error('Failed to get all pages', error);
      throw error;
    }
  }

  /**
   * Test connection to Azure DevOps
   */
  async testConnection(): Promise<boolean> {
    try {
      const wikiApi = await this.getConnection();
      const wiki = await wikiApi.getWiki(this.config.project, this.config.wikiId);
      return !!wiki;
    } catch (error) {
      this.logger.error('Connection test failed', error);
      return false;
    }
  }

  /**
   * Invalidate cache for a specific page
   */
  invalidatePage(path: string): void {
    const cacheKey = `${this.config.wikiId}:${path}`;
    this.cache.delete(cacheKey);
    this.logger.debug(`Invalidated cache for page: ${path}`);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
