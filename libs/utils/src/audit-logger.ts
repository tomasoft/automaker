/**
 * Audit Logger - Structured logging for compliance and debugging
 *
 * Provides append-only JSONL (JSON Lines) logging for skills system events,
 * wiki fetches, and OAuth operations. Each log entry is a complete JSON object
 * on a single line for easy parsing and querying.
 *
 * Storage: {dataDir}/skill-audit-log.jsonl
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('AuditLogger');

/**
 * Audit event types for skills system
 */
export type AuditAction =
  | 'azure_oauth_started'
  | 'azure_oauth_completed'
  | 'azure_oauth_failed'
  | 'skill_loaded'
  | 'wiki_page_fetched'
  | 'wiki_indexed'
  | 'wiki_webhook_received'
  | 'wiki_search_executed'
  | 'wiki_offline_fallback'
  | 'wiki_page_invalidated'
  | 'wiki_page_deleted'
  | 'skill_enabled'
  | 'skill_disabled'
  | 'skill_refreshed';

/**
 * Audit log entry structure
 */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Action type */
  action: AuditAction;
  /** Additional context specific to the action */
  details: Record<string, unknown>;
  /** User identifier (optional) */
  userId?: string;
  /** Project path (optional) */
  projectPath?: string;
  /** Success status */
  success: boolean;
  /** Error message if success=false */
  errorMessage?: string;
}

/**
 * Query filters for audit log
 */
export interface AuditQueryFilters {
  /** Filter by action type */
  action?: AuditAction;
  /** Filter by user ID */
  userId?: string;
  /** Filter by project path */
  projectPath?: string;
  /** Filter entries after this timestamp (ISO) */
  since?: string;
  /** Filter entries before this timestamp (ISO) */
  until?: string;
  /** Filter by success status */
  success?: boolean;
  /** Maximum number of entries to return */
  limit?: number;
}

/**
 * Audit logger class for skills system events
 */
export class AuditLogger {
  private logFilePath: string;

  constructor(dataDir: string) {
    this.logFilePath = path.join(dataDir, 'skill-audit-log.jsonl');
  }

  /**
   * Log an audit event
   */
  async log(
    action: AuditAction,
    details: Record<string, unknown>,
    options?: {
      userId?: string;
      projectPath?: string;
      success?: boolean;
      errorMessage?: string;
    }
  ): Promise<void> {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      userId: options?.userId,
      projectPath: options?.projectPath,
      success: options?.success ?? true,
      errorMessage: options?.errorMessage,
    };

    try {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(this.logFilePath), { recursive: true });

      // Append entry as single JSON line
      const line = JSON.stringify(entry) + '\n';
      await fs.promises.appendFile(this.logFilePath, line, 'utf8');

      logger.debug(`Audit logged: ${action}`, details);
    } catch (error) {
      logger.error('Failed to write audit log', error);
      // Don't throw - audit logging failure shouldn't break functionality
    }
  }

  /**
   * Query audit log with filters
   */
  async query(filters?: AuditQueryFilters): Promise<AuditEntry[]> {
    try {
      // Check if log file exists
      if (!fs.existsSync(this.logFilePath)) {
        return [];
      }

      // Read entire log file
      const content = await fs.promises.readFile(this.logFilePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Parse each line
      let entries: AuditEntry[] = lines.map((line) => JSON.parse(line));

      // Apply filters
      if (filters) {
        if (filters.action) {
          entries = entries.filter((e) => e.action === filters.action);
        }
        if (filters.userId) {
          entries = entries.filter((e) => e.userId === filters.userId);
        }
        if (filters.projectPath) {
          entries = entries.filter((e) => e.projectPath === filters.projectPath);
        }
        if (filters.since) {
          entries = entries.filter((e) => e.timestamp >= filters.since!);
        }
        if (filters.until) {
          entries = entries.filter((e) => e.timestamp <= filters.until!);
        }
        if (filters.success !== undefined) {
          entries = entries.filter((e) => e.success === filters.success);
        }
        if (filters.limit && filters.limit > 0) {
          entries = entries.slice(-filters.limit); // Last N entries
        }
      }

      return entries;
    } catch (error) {
      logger.error('Failed to query audit log', error);
      return [];
    }
  }

  /**
   * Get statistics about audit log
   */
  async getStats(): Promise<{
    totalEntries: number;
    actionCounts: Record<AuditAction, number>;
    successRate: number;
    firstEntry?: string;
    lastEntry?: string;
  }> {
    const entries = await this.query();

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        actionCounts: {} as Record<AuditAction, number>,
        successRate: 0,
      };
    }

    const actionCounts: Record<string, number> = {};
    let successCount = 0;

    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
      if (entry.success) successCount++;
    }

    return {
      totalEntries: entries.length,
      actionCounts: actionCounts as Record<AuditAction, number>,
      successRate: successCount / entries.length,
      firstEntry: entries[0]?.timestamp,
      lastEntry: entries[entries.length - 1]?.timestamp,
    };
  }

  /**
   * Clear audit log (use with caution)
   */
  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this.logFilePath)) {
        await fs.promises.unlink(this.logFilePath);
        logger.info('Audit log cleared');
      }
    } catch (error) {
      logger.error('Failed to clear audit log', error);
      throw error;
    }
  }
}

/**
 * Create a singleton audit logger instance
 */
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(dataDir: string): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(dataDir);
  }
  return auditLoggerInstance;
}

/**
 * Helper function to log skill-related events
 */
export async function logSkillEvent(
  dataDir: string,
  action: Extract<
    AuditAction,
    'skill_loaded' | 'skill_enabled' | 'skill_disabled' | 'skill_refreshed'
  >,
  details: Record<string, unknown>,
  options?: {
    userId?: string;
    projectPath?: string;
    success?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  const auditLogger = getAuditLogger(dataDir);
  await auditLogger.log(action, details, options);
}

/**
 * Helper function to log wiki-related events
 */
export async function logWikiEvent(
  dataDir: string,
  action: Extract<
    AuditAction,
    | 'wiki_page_fetched'
    | 'wiki_indexed'
    | 'wiki_webhook_received'
    | 'wiki_search_executed'
    | 'wiki_offline_fallback'
    | 'wiki_page_invalidated'
    | 'wiki_page_deleted'
  >,
  details: Record<string, unknown>,
  options?: {
    userId?: string;
    projectPath?: string;
    success?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  const auditLogger = getAuditLogger(dataDir);
  await auditLogger.log(action, details, options);
}

/**
 * Helper function to log Azure OAuth events
 */
export async function logAzureOAuthEvent(
  dataDir: string,
  action: Extract<
    AuditAction,
    'azure_oauth_started' | 'azure_oauth_completed' | 'azure_oauth_failed'
  >,
  details: Record<string, unknown>,
  options?: {
    userId?: string;
    success?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  const auditLogger = getAuditLogger(dataDir);
  await auditLogger.log(action, details, options);
}
