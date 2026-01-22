/**
 * Planning Files Service - Manus-style persistent markdown planning
 *
 * Implements the "planning-with-files" pattern inspired by Manus AI:
 * - Persistent markdown files for planning, findings, and progress
 * - Session recovery across context resets
 * - Automatic progress logging and plan re-reads
 * - Phase rotation with Quick Index for navigation
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { ExecuteOptions, EventType } from '@automaker/types';

const logger = createLogger('PlanningFiles');

const PLANNING_FILES_VERSION = 'v1';
const CATCHUP_MESSAGE_THRESHOLD = 20; // Use LLM summary if more than this many messages

export interface PlanningFilesMetadata {
  version: string;
  createdAt: string;
  featureId: string;
  projectPath: string;
  currentPhase?: string;
  errorReReadCount: number; // Track error-triggered re-reads
}

export interface CatchupReport {
  messageCount: number;
  strategy: 'verbatim' | 'llm-summary';
  modelUsed?: string;
  truncated: boolean;
  content: string;
}

export interface ProgressEntry {
  timestamp: string;
  taskId?: string;
  toolName: string;
  input: unknown;
  output: string;
  success: boolean;
}

export interface TaskMarker {
  id: string;
  title: string;
  line: number;
}

export interface QuickIndex {
  tasks: TaskMarker[];
  keyImplementations: Array<{ description: string; file: string; line: number }>;
}

export class PlanningFilesService {
  private eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Initialize planning files for a feature
   * Creates task_plan.md, findings.md, and progress.md with version headers
   */
  async initializePlanningFiles(
    projectPath: string,
    featureId: string,
    featureName: string,
    initialPlan?: string
  ): Promise<void> {
    const planningDir = this.getPlanningDir(projectPath, featureId);
    await secureFs.mkdir(planningDir, { recursive: true });

    const metadata: PlanningFilesMetadata = {
      version: PLANNING_FILES_VERSION,
      createdAt: new Date().toISOString(),
      featureId,
      projectPath,
      errorReReadCount: 0,
    };

    // Create task_plan.md
    const taskPlanPath = path.join(planningDir, 'task_plan.md');
    const taskPlanContent = `<!-- planning-files-${PLANNING_FILES_VERSION} -->
<!-- metadata: ${JSON.stringify(metadata)} -->

# Task Plan: ${featureName}

${initialPlan || '## Status\n\n⏳ Planning in progress...\n\n## Phases\n\n*To be generated*\n\n## Tasks\n\n*To be generated*'}

## Notes

*Add any important context or decisions here*
`;
    await secureFs.writeFile(taskPlanPath, taskPlanContent);

    // Create findings.md
    const findingsPath = path.join(planningDir, 'findings.md');
    const findingsContent = `<!-- planning-files-${PLANNING_FILES_VERSION} -->

# Research Findings: ${featureName}

## Overview

*Document research findings, external documentation, and key discoveries here*

## Key Findings

*To be added during research*
`;
    await secureFs.writeFile(findingsPath, findingsContent);

    // Create progress.md
    const progressPath = path.join(planningDir, 'progress.md');
    const progressContent = `<!-- planning-files-${PLANNING_FILES_VERSION} -->

# Progress Log: ${featureName}

Started: ${new Date().toISOString()}

## Current Session

*Task execution logs will appear here*
`;
    await secureFs.writeFile(progressPath, progressContent);

    this.eventEmitter.emit('planning-files:updated' as EventType, {
      featureId,
      projectPath,
      action: 'initialized',
    });

    logger.info(`Initialized planning files for feature ${featureId}`);
  }

  /**
   * Get the planning directory path for a feature
   */
  getPlanningDir(projectPath: string, featureId: string): string {
    return path.join(projectPath, '.automaker', 'features', featureId, 'planning');
  }

  /**
   * Read task_plan.md content
   */
  async readTaskPlan(projectPath: string, featureId: string): Promise<string | null> {
    const planPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    try {
      return (await secureFs.readFile(planPath, 'utf-8')) as string;
    } catch (error) {
      logger.warn(`Failed to read task_plan.md for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Update task_plan.md content
   */
  async updateTaskPlan(projectPath: string, featureId: string, content: string): Promise<void> {
    const planPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    await secureFs.writeFile(planPath, content);
    this.eventEmitter.emit('planning-files:updated' as EventType, {
      featureId,
      projectPath,
      file: 'task_plan.md',
      action: 'updated',
    });
  }

  /**
   * Append to findings.md
   */
  async appendFinding(
    projectPath: string,
    featureId: string,
    finding: string,
    category?: string
  ): Promise<void> {
    const findingsPath = path.join(this.getPlanningDir(projectPath, featureId), 'findings.md');
    let current = '';
    try {
      current = (await secureFs.readFile(findingsPath, 'utf-8')) as string;
    } catch {
      // File may not exist yet
    }

    const timestamp = new Date().toISOString();
    const entry = `\n### ${category || 'Finding'} - ${timestamp}\n\n${finding}\n`;
    await secureFs.writeFile(findingsPath, current + entry);

    this.eventEmitter.emit('planning-files:updated' as EventType, {
      featureId,
      projectPath,
      file: 'findings.md',
      action: 'appended',
    });
  }

  /**
   * Append to progress.md with task section marker
   */
  async appendProgress(
    projectPath: string,
    featureId: string,
    entry: ProgressEntry
  ): Promise<void> {
    const progressPath = path.join(this.getPlanningDir(projectPath, featureId), 'progress.md');
    let current = '';
    try {
      current = (await secureFs.readFile(progressPath, 'utf-8')) as string;
    } catch {
      // File may not exist yet
    }

    // Check if we need to add a task section marker
    let content = current;
    if (entry.taskId && !current.includes(`## [${entry.taskId}]`)) {
      content += `\n## [${entry.taskId}] Started - ${entry.timestamp}\n`;
    }

    // Add progress entry
    const status = entry.success ? '✅' : '❌';
    const progressLine = `\n**${entry.timestamp}** ${status} **${entry.toolName}**\n`;
    const inputLine = `  - Input: \`${JSON.stringify(entry.input).substring(0, 200)}${JSON.stringify(entry.input).length > 200 ? '...' : ''}\`\n`;
    const outputLine = `  - Output: ${entry.output.substring(0, 500)}${entry.output.length > 500 ? '...' : ''}\n`;

    content += progressLine + inputLine + outputLine;
    await secureFs.writeFile(progressPath, content);

    this.eventEmitter.emit('planning-files:updated' as EventType, {
      featureId,
      projectPath,
      file: 'progress.md',
      action: 'appended',
      taskId: entry.taskId,
    });
  }

  /**
   * Rotate progress.md to progress-phaseN.md and generate Quick Index
   */
  async rotateProgress(projectPath: string, featureId: string, phaseNumber: number): Promise<void> {
    const planningDir = this.getPlanningDir(projectPath, featureId);
    const progressPath = path.join(planningDir, 'progress.md');
    const archivePath = path.join(planningDir, `progress-phase${phaseNumber}.md`);

    let currentProgress = '';
    try {
      currentProgress = (await secureFs.readFile(progressPath, 'utf-8')) as string;
    } catch {
      logger.warn(`No progress.md found to rotate for phase ${phaseNumber}`);
      return;
    }

    // Generate Quick Index
    const index = this.generateQuickIndex(currentProgress);
    const indexContent = this.formatQuickIndex(index);

    // Prepend index to archived content
    const archivedContent = `${indexContent}\n\n---\n\n${currentProgress}`;
    await secureFs.writeFile(archivePath, archivedContent);

    // Reset progress.md for new phase
    const newProgressContent = `<!-- planning-files-${PLANNING_FILES_VERSION} -->

# Progress Log - Phase ${phaseNumber + 1}

Started: ${new Date().toISOString()}

## Current Phase

*Phase ${phaseNumber + 1} execution logs will appear here*

> See progress-phase${phaseNumber}.md for previous phase
`;
    await secureFs.writeFile(progressPath, newProgressContent);

    this.eventEmitter.emit('planning-files:updated' as EventType, {
      featureId,
      projectPath,
      file: 'progress.md',
      action: 'rotated',
      phase: phaseNumber,
    });

    logger.info(`Rotated progress.md to phase ${phaseNumber} for feature ${featureId}`);
  }

  /**
   * Generate Quick Index from progress content
   */
  private generateQuickIndex(content: string): QuickIndex {
    const lines = content.split('\n');
    const tasks: TaskMarker[] = [];
    const keyImplementations: Array<{ description: string; file: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Find task markers: ## [T001] Task Name
      const taskMatch = line.match(/^##\s*\[([^\]]+)\]\s*(.+)/);
      if (taskMatch) {
        tasks.push({
          id: taskMatch[1],
          title: taskMatch[2].replace(/Started - .+$/, '').trim(),
          line: i + 1,
        });
      }

      // Find key implementations (lines with "✅ Implemented:" or similar)
      if (line.includes('✅') && (line.includes('Implemented') || line.includes('Created'))) {
        const description = line.replace(/^\*\*.*?\*\*\s*✅\s*/, '').trim();
        keyImplementations.push({
          description,
          file: `progress.md`, // Reference to the archived file
          line: i + 1,
        });
      }
    }

    return { tasks, keyImplementations };
  }

  /**
   * Format Quick Index as markdown
   */
  private formatQuickIndex(index: QuickIndex): string {
    let content = `## Quick Index\n\n### Tasks\n\n`;

    if (index.tasks.length === 0) {
      content += '*No tasks found*\n';
    } else {
      for (const task of index.tasks) {
        content += `- [${task.id}] ${task.title} → Line ${task.line}\n`;
      }
    }

    content += `\n### Key Implementations\n\n`;

    if (index.keyImplementations.length === 0) {
      content += '*No key implementations logged*\n';
    } else {
      for (const impl of index.keyImplementations.slice(0, 10)) {
        // Limit to top 10
        content += `- ${impl.description} → Line ${impl.line}\n`;
      }
    }

    return content;
  }

  /**
   * Detect stale planning files (session recovery)
   * Returns session data that occurred after last planning file update
   */
  async detectStaleFiles(
    projectPath: string,
    featureId: string
  ): Promise<{ isStale: boolean; lastUpdate: Date | null; sessionData?: unknown[] }> {
    const planningDir = this.getPlanningDir(projectPath, featureId);
    const planPath = path.join(planningDir, 'task_plan.md');

    let lastPlanUpdate: Date | null = null;
    try {
      const stats = await secureFs.stat(planPath);
      lastPlanUpdate = stats.mtime;
    } catch {
      return { isStale: false, lastUpdate: null };
    }

    // Scan agent sessions for this project
    const sessionsDir = path.join(projectPath, '.automaker', 'agent-sessions');
    let sessionFiles: string[] = [];
    try {
      sessionFiles = await secureFs.readdir(sessionsDir);
    } catch {
      return { isStale: false, lastUpdate: lastPlanUpdate };
    }

    const lostMessages: unknown[] = [];

    for (const sessionFile of sessionFiles) {
      if (!sessionFile.endsWith('.json')) continue;

      try {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const sessionContent = (await secureFs.readFile(sessionPath, 'utf-8')) as string;
        const session = JSON.parse(sessionContent);

        // Check if session is for this project and feature
        if (session.projectPath !== projectPath || session.featureId !== featureId) {
          continue;
        }

        // Check if session has messages after last plan update
        if (session.endTime && new Date(session.endTime) > lastPlanUpdate) {
          // Extract messages that occurred after plan update
          if (session.messages && Array.isArray(session.messages)) {
            for (const msg of session.messages) {
              if (msg.timestamp && new Date(msg.timestamp) > lastPlanUpdate) {
                lostMessages.push(msg);
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to parse session file ${sessionFile}:`, error);
      }
    }

    return {
      isStale: lostMessages.length > 0,
      lastUpdate: lastPlanUpdate,
      sessionData: lostMessages.length > 0 ? lostMessages : undefined,
    };
  }

  /**
   * Generate catchup report for session recovery
   * Uses LLM summary for >20 messages, verbatim otherwise
   */
  async generateCatchupReport(
    projectPath: string,
    featureId: string,
    lostMessages: unknown[],
    model: string
  ): Promise<CatchupReport> {
    const messageCount = lostMessages.length;

    // Verbatim strategy for small number of messages
    if (messageCount <= CATCHUP_MESSAGE_THRESHOLD) {
      const content = this.formatMessagesVerbatim(lostMessages);
      this.eventEmitter.emit('planning-files:catchup-generated' as EventType, {
        featureId,
        projectPath,
        messageCount,
        strategy: 'verbatim',
        truncated: false,
      });

      return {
        messageCount,
        strategy: 'verbatim',
        truncated: false,
        content,
      };
    }

    // LLM summary strategy for many messages
    try {
      const summary = await this.summarizeMessagesWithLLM(lostMessages, model, projectPath);
      this.eventEmitter.emit('planning-files:catchup-generated' as EventType, {
        featureId,
        projectPath,
        messageCount,
        strategy: 'llm-summary',
        modelUsed: model,
        truncated: false,
      });

      return {
        messageCount,
        strategy: 'llm-summary',
        modelUsed: model,
        truncated: false,
        content: summary,
      };
    } catch (error) {
      logger.error('Failed to generate LLM summary, falling back to verbatim:', error);

      // Fallback to verbatim (last 20 messages)
      const recentMessages = lostMessages.slice(-20);
      const content = this.formatMessagesVerbatim(recentMessages);

      this.eventEmitter.emit('planning-files:catchup-generated' as EventType, {
        featureId,
        projectPath,
        messageCount,
        strategy: 'verbatim',
        truncated: true,
        error: String(error),
      });

      return {
        messageCount,
        strategy: 'verbatim',
        truncated: true,
        content: `⚠️ LLM summarization failed. Showing last ${recentMessages.length} of ${messageCount} messages.\n\n${content}`,
      };
    }
  }

  /**
   * Format messages as verbatim markdown
   */
  private formatMessagesVerbatim(messages: unknown[]): string {
    let content = `# Session Recovery - ${messages.length} Messages\n\n`;
    content += `*The following conversation occurred after the last planning file update:*\n\n`;

    for (const msg of messages) {
      if (typeof msg === 'object' && msg !== null) {
        const message = msg as Record<string, unknown>;
        const timestamp = message.timestamp
          ? new Date(String(message.timestamp)).toISOString()
          : 'Unknown';
        const role = message.role || 'unknown';
        const contentText = this.extractMessageContent(message);

        content += `**[${timestamp}] ${String(role).toUpperCase()}:**\n\n${contentText}\n\n---\n\n`;
      }
    }

    return content;
  }

  /**
   * Extract text content from message object
   */
  private extractMessageContent(message: Record<string, unknown>): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map((block) => {
          if (typeof block === 'object' && block !== null && 'text' in block) {
            return String(block.text);
          }
          return JSON.stringify(block);
        })
        .join('\n');
    }
    return JSON.stringify(message.content || message);
  }

  /**
   * Summarize messages using LLM
   */
  private async summarizeMessagesWithLLM(
    messages: unknown[],
    model: string,
    projectPath: string
  ): Promise<string> {
    const verbatim = this.formatMessagesVerbatim(messages);

    const prompt = `You are helping recover context after a session reset. The following conversation happened but was not reflected in the planning files.

Please provide a concise summary highlighting:
1. Key decisions made
2. Implementation progress
3. Errors encountered and solutions attempted
4. Files created or modified
5. Any blocked or incomplete tasks

${verbatim}

Provide a structured summary in markdown format.`;

    const provider = ProviderFactory.getProviderForModel(model);

    const executeOptions: ExecuteOptions = {
      prompt,
      model,
      cwd: projectPath,
      maxTurns: 1, // Single completion, no tool use
      systemPrompt: 'You are a technical assistant helping summarize development context.',
    };

    let summary = '';
    const stream = provider.executeQuery(executeOptions);

    for await (const msg of stream) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            summary += block.text;
          }
        }
      }
    }

    return summary || verbatim; // Fallback to verbatim if no summary generated
  }

  /**
   * Extract metadata from planning file
   */
  async getPlanningMetadata(
    projectPath: string,
    featureId: string
  ): Promise<PlanningFilesMetadata | null> {
    const planPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    try {
      const content = (await secureFs.readFile(planPath, 'utf-8')) as string;
      const metadataMatch = content.match(/<!-- metadata: ({.+?}) -->/);
      if (metadataMatch) {
        return JSON.parse(metadataMatch[1]) as PlanningFilesMetadata;
      }
    } catch {
      // File doesn't exist or no metadata
    }
    return null;
  }

  /**
   * Update metadata in planning file
   */
  async updatePlanningMetadata(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanningFilesMetadata>
  ): Promise<void> {
    const planPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    let content = '';
    try {
      content = (await secureFs.readFile(planPath, 'utf-8')) as string;
    } catch {
      return; // File doesn't exist
    }

    const metadataMatch = content.match(/<!-- metadata: ({.+?}) -->/);
    if (!metadataMatch) return;

    const currentMetadata = JSON.parse(metadataMatch[1]) as PlanningFilesMetadata;
    const newMetadata = { ...currentMetadata, ...updates };

    const newContent = content.replace(
      /<!-- metadata: {.+?} -->/,
      `<!-- metadata: ${JSON.stringify(newMetadata)} -->`
    );

    await secureFs.writeFile(planPath, newContent);
  }

  /**
   * Increment error re-read count
   */
  async incrementErrorReReadCount(projectPath: string, featureId: string): Promise<number> {
    const metadata = await this.getPlanningMetadata(projectPath, featureId);
    if (!metadata) return 0;

    const newCount = (metadata.errorReReadCount || 0) + 1;
    await this.updatePlanningMetadata(projectPath, featureId, { errorReReadCount: newCount });
    return newCount;
  }

  /**
   * Reset error re-read count
   */
  async resetErrorReReadCount(projectPath: string, featureId: string): Promise<void> {
    await this.updatePlanningMetadata(projectPath, featureId, { errorReReadCount: 0 });
  }

  /**
   * Check if planning files exist
   */
  async planningFilesExist(projectPath: string, featureId: string): Promise<boolean> {
    const planPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    try {
      await secureFs.access(planPath);
      return true;
    } catch {
      return false;
    }
  }
}
