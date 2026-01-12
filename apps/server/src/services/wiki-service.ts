/**
 * Wiki Service
 *
 * Manages wiki connections, resolves wiki placeholders in skill content,
 * and handles caching with offline support.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@automaker/utils';
import { AzureDevOpsWikiAdapter, WikiAdapter, WikiPageContent } from './wiki-adapters/index.js';
import type { AzureDevOpsAuthManager } from '../providers/azure-devops-auth.js';
import type { AzureDevOpsConfig } from '@automaker/types';

const logger = createLogger('WikiService');

/**
 * Wiki placeholder pattern: {{wiki:page:path}} or {{wiki:search:query|max:5}}
 */
const WIKI_PLACEHOLDER_REGEX =
  /\{\{wiki:(page|search):([^|}]+)(?:\|([^|}]+))?(?:\|max:(\d+))?\}\}/g;

/**
 * Resolved wiki content
 */
interface ResolvedWikiContent {
  /** Original placeholder */
  placeholder: string;
  /** Resolved content */
  content: string;
  /** Page path or search query */
  reference: string;
  /** Whether content is from cache */
  isCached: boolean;
  /** Whether cache is stale */
  isStale: boolean;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Wiki Service
 */
export class WikiService {
  private adapters = new Map<string, WikiAdapter>();
  private cacheFilePath: string;
  private persistentCache = new Map<string, WikiPageContent>();

  constructor(private dataDir: string) {
    this.cacheFilePath = path.join(dataDir, 'wiki-cache.json');
    this.loadPersistentCache();
  }

  /**
   * Register Azure DevOps wiki adapter
   */
  registerAzureDevOps(config: AzureDevOpsConfig, authManager: AzureDevOpsAuthManager): void {
    const adapterId = `azuredevops:${config.organization}:${config.project}:${config.wikiId}`;
    const adapter = new AzureDevOpsWikiAdapter(
      {
        organization: config.organization,
        project: config.project,
        wikiId: config.wikiId,
      },
      authManager
    );
    this.adapters.set(adapterId, adapter);
    logger.info(`Registered Azure DevOps wiki adapter: ${adapterId}`);
  }

  /**
   * Get default wiki adapter (first registered)
   */
  private getDefaultAdapter(): WikiAdapter | null {
    const first = this.adapters.values().next();
    return first.value || null;
  }

  /**
   * Resolve all wiki placeholders in content
   */
  async resolvePlaceholders(content: string): Promise<{
    resolvedContent: string;
    wikiPagesUsed: ResolvedWikiContent[];
    hasErrors: boolean;
  }> {
    const wikiPagesUsed: ResolvedWikiContent[] = [];
    let hasErrors = false;

    // Find all wiki placeholders
    const matches = Array.from(content.matchAll(WIKI_PLACEHOLDER_REGEX));

    if (matches.length === 0) {
      return { resolvedContent: content, wikiPagesUsed: [], hasErrors: false };
    }

    const adapter = this.getDefaultAdapter();
    if (!adapter) {
      logger.warn('No wiki adapter registered, cannot resolve placeholders');
      return {
        resolvedContent: content.replace(
          WIKI_PLACEHOLDER_REGEX,
          '<!-- Error: No wiki configured -->'
        ),
        wikiPagesUsed: [],
        hasErrors: true,
      };
    }

    // Resolve all placeholders in parallel
    const resolutions = await Promise.allSettled(
      matches.map((match) => this.resolveSinglePlaceholder(match, adapter))
    );

    // Replace placeholders with resolved content
    let resolvedContent = content;
    resolutions.forEach((result, index) => {
      const match = matches[index];
      const placeholder = match[0];

      if (result.status === 'fulfilled') {
        const resolved = result.value;
        wikiPagesUsed.push(resolved);
        resolvedContent = resolvedContent.replace(placeholder, resolved.content);
      } else {
        hasErrors = true;
        const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        logger.error(`Failed to resolve placeholder: ${placeholder}`, result.reason);
        resolvedContent = resolvedContent.replace(
          placeholder,
          `<!-- Error resolving wiki placeholder: ${errorMsg} -->`
        );
        wikiPagesUsed.push({
          placeholder,
          content: '',
          reference: match[2],
          isCached: false,
          isStale: false,
          error: errorMsg,
        });
      }
    });

    return { resolvedContent, wikiPagesUsed, hasErrors };
  }

  /**
   * Resolve a single wiki placeholder
   */
  private async resolveSinglePlaceholder(
    match: RegExpMatchArray,
    adapter: WikiAdapter
  ): Promise<ResolvedWikiContent> {
    const [placeholder, type, reference, category, maxStr] = match;
    const max = maxStr ? parseInt(maxStr, 10) : 5;

    if (type === 'page') {
      // Fetch page by path
      const page = await adapter.getPage(reference, { useCache: true });

      // Store in persistent cache
      this.persistentCache.set(reference, page);
      this.savePersistentCache();

      return {
        placeholder,
        content: page.content,
        reference,
        isCached: page.isCached,
        isStale: page.isStale,
      };
    } else if (type === 'search') {
      // Search pages
      const results = await adapter.searchPages(reference, { max, category });

      // Format search results as markdown
      const content =
        results.pages.length > 0
          ? results.pages.map((p) => `- **${p.title}** (${p.path})`).join('\n')
          : '_(No results found)_';

      return {
        placeholder,
        content,
        reference,
        isCached: false,
        isStale: false,
      };
    }

    throw new Error(`Unknown wiki placeholder type: ${type}`);
  }

  /**
   * Invalidate cache for a specific page
   */
  invalidatePage(pagePath: string): void {
    // Invalidate in adapters
    for (const adapter of this.adapters.values()) {
      if (adapter instanceof AzureDevOpsWikiAdapter) {
        adapter.invalidatePage(pagePath);
      }
    }

    // Remove from persistent cache
    this.persistentCache.delete(pagePath);
    this.savePersistentCache();

    logger.info(`Invalidated cache for page: ${pagePath}`);
  }

  /**
   * Load persistent cache from disk
   */
  private loadPersistentCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, 'utf8');
        const cacheData = JSON.parse(data) as Record<string, WikiPageContent>;
        this.persistentCache = new Map(Object.entries(cacheData));
        logger.debug(`Loaded ${this.persistentCache.size} pages from persistent cache`);
      }
    } catch (error) {
      logger.error('Failed to load persistent cache', error);
    }
  }

  /**
   * Save persistent cache to disk (atomic write)
   */
  private savePersistentCache(): void {
    try {
      const cacheData = Object.fromEntries(this.persistentCache.entries());
      const tempFile = `${this.cacheFilePath}.tmp`;

      // Ensure directory exists
      fs.mkdirSync(path.dirname(this.cacheFilePath), { recursive: true });

      // Write to temp file
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2), 'utf8');

      // Atomic rename
      fs.renameSync(tempFile, this.cacheFilePath);

      logger.debug('Saved persistent cache to disk');
    } catch (error) {
      logger.error('Failed to save persistent cache', error);
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    for (const adapter of this.adapters.values()) {
      adapter.clearCache();
    }
    this.persistentCache.clear();
    this.savePersistentCache();
    logger.info('Cleared all wiki caches');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    persistentCacheSize: number;
    adapterCaches: Record<string, { size: number; keys: string[] }>;
  } {
    const adapterCaches: Record<string, { size: number; keys: string[] }> = {};

    for (const [id, adapter] of this.adapters.entries()) {
      if (adapter instanceof AzureDevOpsWikiAdapter) {
        adapterCaches[id] = adapter.getCacheStats();
      }
    }

    return {
      persistentCacheSize: this.persistentCache.size,
      adapterCaches,
    };
  }
}
