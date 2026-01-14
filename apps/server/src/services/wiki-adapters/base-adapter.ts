/**
 * Wiki Adapter Base Class
 *
 * Abstract base class for wiki integrations (Azure DevOps, Confluence, GitHub Wiki, etc.)
 * Provides common interface for fetching pages and searching across different wiki systems.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('WikiAdapter');

/**
 * Wiki page metadata
 */
export interface WikiPageMetadata {
  /** Unique page identifier */
  id: string | number;
  /** Page path (e.g., "Coding/Features-Architecture") */
  path: string;
  /** Page title */
  title: string;
  /** Last modified timestamp (ISO) */
  lastModified: string;
  /** ETag for cache validation */
  etag?: string;
}

/**
 * Wiki page content with metadata
 */
export interface WikiPageContent extends WikiPageMetadata {
  /** Markdown content */
  content: string;
  /** Whether content is from cache */
  isCached: boolean;
  /** Whether cached content is stale */
  isStale: boolean;
  /** When content was last fetched */
  lastFetched: string;
}

/**
 * Wiki search result
 */
export interface WikiSearchResult {
  /** Matching pages */
  pages: WikiPageMetadata[];
  /** Total result count */
  totalCount: number;
  /** Whether results are truncated */
  hasMore: boolean;
}

/**
 * Abstract Wiki Adapter
 */
export abstract class WikiAdapter {
  protected logger = logger;

  /**
   * Get adapter name for logging
   */
  abstract getName(): string;

  /**
   * Fetch a wiki page by path
   *
   * @param path Page path (e.g., "Coding/Features-Architecture")
   * @param options Fetch options
   * @returns Page content with metadata
   */
  abstract getPage(
    path: string,
    options?: {
      /** Use cached version if available */
      useCache?: boolean;
      /** ETag for conditional fetch */
      etag?: string;
      /** Timeout in milliseconds */
      timeout?: number;
    }
  ): Promise<WikiPageContent>;

  /**
   * Search wiki pages
   *
   * @param query Search query
   * @param options Search options
   * @returns Search results
   */
  abstract searchPages(
    query: string,
    options?: {
      /** Maximum results to return */
      max?: number;
      /** Category/tag filter */
      category?: string;
      /** Timeout in milliseconds */
      timeout?: number;
    }
  ): Promise<WikiSearchResult>;

  /**
   * Update a wiki page
   *
   * @param path Page path
   * @param content New markdown content
   * @param options Update options
   */
  abstract updatePage(
    path: string,
    content: string,
    options?: {
      /** Optional comment for the change */
      comment?: string;
      /** Timeout in milliseconds */
      timeout?: number;
    }
  ): Promise<WikiPageMetadata>;

  /**
   * Get all pages in the wiki (for indexing)
   *
   * @param options Crawl options
   * @returns All page metadata
   */
  abstract getAllPages(options?: {
    /** Maximum depth for recursive crawling */
    maxDepth?: number;
    /** Timeout in milliseconds */
    timeout?: number;
  }): Promise<WikiPageMetadata[]>;

  /**
   * Test connection to wiki service
   *
   * @returns True if connection is valid
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Clear adapter cache
   */
  abstract clearCache(): void;
}
