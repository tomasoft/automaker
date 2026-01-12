/**
 * Wiki Adapter Index
 *
 * Exports all wiki adapters and provides factory for creating adapters
 */

export { WikiAdapter } from './base-adapter.js';
export type { WikiPageContent, WikiPageMetadata, WikiSearchResult } from './base-adapter.js';
export { AzureDevOpsWikiAdapter } from './azure-devops-adapter.js';
