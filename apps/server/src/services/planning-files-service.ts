/**
 * Planning Files Service - Persistent planning pattern implementation
 *
 * Implements Manus-style persistent markdown planning files:
 * - task_plan.md: Shared plan with phase markers and checkboxes
 * - findings.md: Accumulated research and findings
 * - progress.md: Per-task execution logs with timestamps
 *
 * Includes session recovery to restore context after resets
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { createLogger, stripIncompleteToolBlocks } from '@automaker/utils';
import type {
  CatchupReport,
  CatchupStrategy,
  PlanningFileMetrics,
  PlanningFileStatus,
  QuickIndex,
  ProgressRotationIndex,
  TaskSection,
  AgentSession,
  ConversationMessage,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { ProviderFactory } from '../providers/provider-factory.js';

const logger = createLogger('PlanningFiles');

// Helper function to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await secureFs.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

const PLANNING_FILES_VERSION = 'v1';
const CATCHUP_MESSAGE_THRESHOLD = 20;

export class PlanningFilesService {
  constructor(private eventEmitter: EventEmitter) {}

  /**
   * Initialize planning files for a feature
   */
  async initializePlanningFiles(
    projectPath: string,
    featureId: string,
    featureTitle: string,
    spec?: string
  ): Promise<void> {
    const planningDir = this.getPlanningDir(projectPath, featureId);

    // Ensure planning directory exists
    await secureFs.mkdir(planningDir, { recursive: true });

    // Create task_plan.md if it doesn't exist
    const taskPlanPath = path.join(planningDir, 'task_plan.md');
    if (!(await fileExists(taskPlanPath))) {
      const taskPlanContent = this.generateTaskPlanTemplate(featureTitle, spec);
      await secureFs.writeFile(taskPlanPath, taskPlanContent);
      logger.info(`Created task_plan.md for feature ${featureId}`);
    }

    // Create findings.md if it doesn't exist
    const findingsPath = path.join(planningDir, 'findings.md');
    if (!(await fileExists(findingsPath))) {
      const findingsContent = this.generateFindingsTemplate(featureTitle);
      await secureFs.writeFile(findingsPath, findingsContent);
      logger.info(`Created findings.md for feature ${featureId}`);
    }

    // Create progress.md if it doesn't exist
    const progressPath = path.join(planningDir, 'progress.md');
    if (!(await fileExists(progressPath))) {
      const progressContent = this.generateProgressTemplate(featureTitle);
      await secureFs.writeFile(progressPath, progressContent);
      logger.info(`Created progress.md for feature ${featureId}`);
    }

    this.eventEmitter.emit('planning-files:updated', {
      featureId,
      projectPath,
      fileType: 'task_plan',
      action: 'initialized',
    });
  }

  /**
   * Get planning directory path
   */
  private getPlanningDir(projectPath: string, featureId: string): string {
    return path.join(projectPath, '.automaker', 'features', featureId, 'planning');
  }

  /**
   * Generate task_plan.md template
   */
  private generateTaskPlanTemplate(featureTitle: string, spec?: string): string {
    const now = new Date().toISOString();

    return `<!-- planning-files-${PLANNING_FILES_VERSION} -->
# Task Plan: ${featureTitle}

**Created:** ${now}  
**Status:** Planning

## Goal

${spec ? spec.substring(0, 500) + (spec.length > 500 ? '...\n\n_See full spec in feature.json_' : '') : 'Define the goal and requirements for this feature.'}

## Phases

### Phase 1: Foundation
- [ ] Task 001: Setup and initial structure
- [ ] Task 002: Core dependencies

### Phase 2: Implementation
- [ ] Task 003: Main functionality
- [ ] Task 004: Integration points

### Phase 3: Testing & Polish
- [ ] Task 005: Tests
- [ ] Task 006: Documentation

## Current Focus

**Current Phase:** Phase 1 - Foundation  
**Current Task:** Not started

## Risks & Blockers

_None identified yet_

## Notes

- Update checkboxes as tasks complete
- Log errors in progress.md
- Save research findings to findings.md after 2+ read operations
`;
  }

  /**
   * Generate findings.md template
   */
  private generateFindingsTemplate(featureTitle: string): string {
    const now = new Date().toISOString();

    return `<!-- planning-files-${PLANNING_FILES_VERSION} -->
# Findings: ${featureTitle}

**Created:** ${now}

## Research Notes

_Save findings here after 2+ Read/Browser tool operations_

## Key Discoveries

_Document important findings that affect implementation_

## Architecture Insights

_Notes about system architecture relevant to this feature_

## Dependencies

_External dependencies, libraries, or services discovered_
`;
  }

  /**
   * Generate progress.md template
   */
  private generateProgressTemplate(featureTitle: string): string {
    const now = new Date().toISOString();

    return `<!-- planning-files-${PLANNING_FILES_VERSION} -->
# Progress Log: ${featureTitle}

**Created:** ${now}

## Execution Log

_Tool executions, errors, and progress updates will be logged here_

---
`;
  }

  /**
   * Append to progress.md
   */
  async appendToProgress(
    projectPath: string,
    featureId: string,
    content: string,
    taskId?: string,
    taskName?: string
  ): Promise<void> {
    const progressPath = path.join(this.getPlanningDir(projectPath, featureId), 'progress.md');

    let existingContent = '';
    if (await fileExists(progressPath)) {
      existingContent = (await secureFs.readFile(progressPath, 'utf-8')) as string;
    }

    const timestamp = new Date().toISOString();
    let entry = `\n### ${timestamp}`;

    if (taskId && taskName) {
      entry += ` - [${taskId}] ${taskName}`;
    }

    entry += `\n\n${content}\n\n---\n`;

    await secureFs.writeFile(progressPath, existingContent + entry);

    this.eventEmitter.emit('planning-files:updated', {
      featureId,
      projectPath,
      fileType: 'progress',
      action: 'append',
    });
  }

  /**
   * Update task_plan.md with new content (for task tracking)
   */
  async updateTaskPlan(projectPath: string, featureId: string, content: string): Promise<void> {
    const taskPlanPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');
    await secureFs.writeFile(taskPlanPath, content);

    this.eventEmitter.emit('planning-files:updated', {
      featureId,
      projectPath,
      fileType: 'task_plan',
      action: 'update',
    });
  }

  /**
   * Read task plan
   */
  async readTaskPlan(projectPath: string, featureId: string): Promise<string | null> {
    const taskPlanPath = path.join(this.getPlanningDir(projectPath, featureId), 'task_plan.md');

    if (!(await fileExists(taskPlanPath))) {
      return null;
    }

    return (await secureFs.readFile(taskPlanPath, 'utf-8')) as string;
  }

  /**
   * Read findings
   */
  async readFindings(projectPath: string, featureId: string): Promise<string | null> {
    const findingsPath = path.join(this.getPlanningDir(projectPath, featureId), 'findings.md');

    if (!(await fileExists(findingsPath))) {
      return null;
    }

    return (await secureFs.readFile(findingsPath, 'utf-8')) as string;
  }

  /**
   * Read progress
   */
  async readProgress(projectPath: string, featureId: string): Promise<string | null> {
    const progressPath = path.join(this.getPlanningDir(projectPath, featureId), 'progress.md');

    if (!(await fileExists(progressPath))) {
      return null;
    }

    return (await secureFs.readFile(progressPath, 'utf-8')) as string;
  }

  /**
   * Get planning file status
   */
  async getPlanningFileStatus(projectPath: string, featureId: string): Promise<PlanningFileStatus> {
    const planningDir = this.getPlanningDir(projectPath, featureId);
    const taskPlanPath = path.join(planningDir, 'task_plan.md');
    const findingsPath = path.join(planningDir, 'findings.md');
    const progressPath = path.join(planningDir, 'progress.md');

    const taskPlanExists = await fileExists(taskPlanPath);
    const findingsExists = await fileExists(findingsPath);
    const progressExists = await fileExists(progressPath);

    let lastUpdated: Date | null = null;
    let version = PLANNING_FILES_VERSION;

    if (taskPlanExists) {
      const stats = await secureFs.stat(taskPlanPath);
      lastUpdated = stats.mtime;

      // Check version from file content
      const content = (await secureFs.readFile(taskPlanPath, 'utf-8')) as string;
      const versionMatch = content.match(/<!-- planning-files-(v\d+) -->/);
      if (versionMatch) {
        version = versionMatch[1];
      }
    }

    return {
      taskPlanExists,
      findingsExists,
      progressExists,
      version,
      lastUpdated,
      isStale: false, // Will be determined by detectStaleFiles
    };
  }

  /**
   * Detect if planning files are stale (outdated compared to agent sessions)
   */
  async detectStaleFiles(
    projectPath: string,
    featureId: string
  ): Promise<{ isStale: boolean; lastSessionEnd?: Date; planningLastUpdate?: Date }> {
    const status = await this.getPlanningFileStatus(projectPath, featureId);

    if (!status.taskPlanExists || !status.lastUpdated) {
      return { isStale: false };
    }

    // Check agent sessions directory for this project
    const sessionsDir = path.join(projectPath, '.automaker', 'agent-sessions');

    if (!(await fileExists(sessionsDir))) {
      return { isStale: false };
    }

    const sessionFiles = await secureFs.readdir(sessionsDir);
    let mostRecentSessionEnd: Date | null = null;

    // Find most recent session for this project
    for (const sessionFile of sessionFiles) {
      if (!sessionFile.endsWith('.json')) continue;

      try {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const sessionContent = (await secureFs.readFile(sessionPath, 'utf-8')) as string;
        const session: any = JSON.parse(sessionContent);

        // Check if session is for this project
        if (session.projectPath !== projectPath) continue;

        // Check if session ended after planning files were last updated
        if (session.endTime) {
          const sessionEndDate = new Date(session.endTime);
          if (!mostRecentSessionEnd || sessionEndDate > mostRecentSessionEnd) {
            mostRecentSessionEnd = sessionEndDate;
          }
        }
      } catch (error) {
        logger.warn(`Failed to parse session file ${sessionFile}:`, error);
      }
    }

    if (mostRecentSessionEnd && mostRecentSessionEnd > status.lastUpdated) {
      return {
        isStale: true,
        lastSessionEnd: mostRecentSessionEnd,
        planningLastUpdate: status.lastUpdated,
      };
    }

    return { isStale: false, planningLastUpdate: status.lastUpdated };
  }

  /**
   * Generate catchup report from lost session messages
   */
  async generateCatchupReport(
    projectPath: string,
    featureId: string,
    model: string
  ): Promise<CatchupReport | null> {
    const staleCheck = await this.detectStaleFiles(projectPath, featureId);

    if (!staleCheck.isStale || !staleCheck.lastSessionEnd || !staleCheck.planningLastUpdate) {
      return null;
    }

    // Find messages from sessions that occurred after planning files were updated
    const lostMessages = await this.extractLostMessages(
      projectPath,
      staleCheck.planningLastUpdate,
      staleCheck.lastSessionEnd
    );

    if (lostMessages.length === 0) {
      return null;
    }

    const messageCount = lostMessages.length;
    let catchupContent: string;
    let strategy: CatchupStrategy;
    let modelUsed: string | undefined;
    let truncated = false;

    // Hybrid strategy: LLM summary if >20 messages, else verbatim
    if (messageCount > CATCHUP_MESSAGE_THRESHOLD) {
      try {
        const summary = await this.summarizeMessages(lostMessages, model);
        catchupContent = this.formatCatchupWithSummary(messageCount, summary);
        strategy = 'llm-summary';
        modelUsed = model;
      } catch (error) {
        logger.error('Failed to generate LLM summary, falling back to truncated:', error);
        catchupContent = this.formatCatchupVerbatim(lostMessages, true);
        strategy = 'truncated';
        truncated = true;
      }
    } else {
      catchupContent = this.formatCatchupVerbatim(lostMessages, false);
      strategy = 'verbatim';
    }

    const report: CatchupReport = {
      hasStaleFiles: true,
      messagesLost: messageCount,
      catchupContent,
      metrics: {
        messageCount,
        strategy,
        modelUsed,
        truncated,
      },
    };

    this.eventEmitter.emit('planning:catchup-generated', {
      featureId,
      projectPath,
      metrics: report.metrics,
    });

    return report;
  }

  /**
   * Extract messages from sessions that occurred after planning files were updated
   */
  private async extractLostMessages(
    projectPath: string,
    planningLastUpdate: Date,
    sessionEndTime: Date
  ): Promise<ConversationMessage[]> {
    const sessionsDir = path.join(projectPath, '.automaker', 'agent-sessions');
    const sessionFiles = await secureFs.readdir(sessionsDir);
    const lostMessages: ConversationMessage[] = [];

    for (const sessionFile of sessionFiles) {
      if (!sessionFile.endsWith('.json')) continue;

      try {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const sessionContent = (await secureFs.readFile(sessionPath, 'utf-8')) as string;
        const session: any = JSON.parse(sessionContent);

        // Check if session is for this project
        if (session.projectPath !== projectPath) continue;

        // Check if session occurred in the time window
        const sessionStart = new Date(session.createdAt);
        const sessionEnd = session.endTime ? new Date(session.endTime) : new Date();

        if (sessionStart > planningLastUpdate && sessionEnd <= sessionEndTime) {
          // Extract messages from this session
          if (session.messages && Array.isArray(session.messages)) {
            lostMessages.push(...session.messages);
          }
        }
      } catch (error) {
        logger.warn(`Failed to extract messages from session ${sessionFile}:`, error);
      }
    }

    return lostMessages;
  }

  /**
   * Summarize messages using LLM
   */
  private async summarizeMessages(messages: ConversationMessage[], model: string): Promise<string> {
    const provider = ProviderFactory.getProviderForModel(model);

    // Clean messages to remove incomplete tool_use/tool_result pairs that would cause API errors
    const cleanedMessages = stripIncompleteToolBlocks(messages);

    logger.debug(
      `[summarizeMessages] Cleaned ${messages.length} messages -> ${cleanedMessages.length} valid messages`
    );

    // Build conversation text
    const conversationText = cleanedMessages
      .map((msg) => {
        const role = msg.role.toUpperCase();
        const content = Array.isArray(msg.content)
          ? msg.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('\n')
          : msg.content;
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const summarizePrompt = `Summarize the following conversation that occurred after the planning files were last updated. Focus on:
- Key decisions made
- Files created or modified
- Errors encountered and how they were resolved
- Important discoveries or insights
- Current progress status

Provide a concise summary suitable for context recovery.

CONVERSATION:
${conversationText}`;

    const systemPrompt = `You are a technical summarizer. Create concise, factual summaries of development conversations.`;

    let summary = '';

    for await (const msg of provider.executeQuery({
      prompt: summarizePrompt,
      model,
      systemPrompt,
      cwd: '/', // Not used for summarization
      maxTurns: 1,
    })) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            summary += block.text;
          }
        }
      }
    }

    return summary;
  }

  /**
   * Format catchup report with LLM summary
   */
  private formatCatchupWithSummary(messageCount: number, summary: string): string {
    return `## Session Recovery

⚠️ **Context recovery in progress**

Your planning files (task_plan.md, findings.md, progress.md) were last updated before ${messageCount} conversation messages occurred. Those messages have been summarized below to restore context.

### Summary of Lost Context

${summary}

### Action Required

1. Review the summary above
2. Update task_plan.md with any completed tasks
3. Update findings.md with any discoveries mentioned
4. Update progress.md with any errors or approaches that failed

---
`;
  }

  /**
   * Format catchup report with verbatim messages
   */
  private formatCatchupVerbatim(messages: ConversationMessage[], truncate: boolean): string {
    const displayMessages = truncate ? messages.slice(-20) : messages;
    const truncatedCount = truncate ? messages.length - displayMessages.length : 0;

    let content = `## Session Recovery

⚠️ **Context recovery in progress**

Your planning files were last updated before ${messages.length} conversation messages occurred. ${
      truncate
        ? `Showing the last 20 messages (${truncatedCount} earlier messages truncated).`
        : 'Full conversation below.'
    }

### Lost Messages

`;

    for (const msg of displayMessages) {
      const role = msg.role.toUpperCase();
      const text = Array.isArray(msg.content)
        ? msg.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('\n')
        : msg.content;

      content += `**${role}:**\n${text}\n\n`;
    }

    content += `### Action Required

1. Review the messages above
2. Update task_plan.md with any completed tasks
3. Update findings.md with any discoveries mentioned
4. Update progress.md with any errors or approaches that failed

---
`;

    return content;
  }

  /**
   * Rotate progress.md to archived file and generate Quick Index
   */
  async rotateProgressFile(projectPath: string, featureId: string, phase: number): Promise<void> {
    const planningDir = this.getPlanningDir(projectPath, featureId);
    const progressPath = path.join(planningDir, 'progress.md');

    if (!(await fileExists(progressPath))) {
      logger.warn(`Cannot rotate progress.md - file doesn't exist for feature ${featureId}`);
      return;
    }

    const progressContent = (await secureFs.readFile(progressPath, 'utf-8')) as string;

    // Generate Quick Index
    const quickIndex = this.generateQuickIndex(progressContent);

    // Create archived file with index
    const archivedFileName = `progress-phase${phase}.md`;
    const archivedPath = path.join(planningDir, archivedFileName);

    const archivedContent = `<!-- planning-files-${PLANNING_FILES_VERSION} -->
# Progress Log - Phase ${phase} (Archived)

## Quick Index

### Tasks
${quickIndex.tasks.map((t: any) => `- [${t.taskId}] ${t.taskName} → Line ${t.lineNumber}`).join('\n')}

### Key Implementations
${quickIndex.keyImplementations.map((k: any) => `- ${k.description} → ${archivedFileName}#L${k.lineNumber}`).join('\n')}

---

${progressContent}
`;

    await secureFs.writeFile(archivedPath, archivedContent);

    // Reset progress.md for next phase
    const featureName = `Feature ${featureId}`;
    const newProgressContent = this.generateProgressTemplate(featureName);
    await secureFs.writeFile(progressPath, newProgressContent);

    logger.info(`Rotated progress.md to ${archivedFileName} for feature ${featureId}`);

    this.eventEmitter.emit('planning:file-updated', {
      featureId,
      projectPath,
      files: ['progress.md', archivedFileName],
      action: 'rotate',
      phase,
    });
  }

  /**
   * Generate Quick Index from progress content
   */
  private generateQuickIndex(progressContent: string): QuickIndex {
    const tasks: ProgressRotationIndex[] = [];
    const keyImplementations: ProgressRotationIndex[] = [];
    const lines = progressContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match task headers: ### 2026-01-21T14:30:00.000Z - [T001] Task Name
      const taskMatch = line.match(/^###\s+[\d-:TZ.]+\s+-\s+\[([^\]]+)\]\s+(.+)$/);
      if (taskMatch) {
        tasks.push({
          taskId: taskMatch[1],
          taskName: taskMatch[2],
          lineNumber: i + 1,
        });
      }

      // Match key implementations: ✅ Implemented: description
      const implMatch = line.match(/^✅\s+Implemented:\s+(.+)$/);
      if (implMatch) {
        keyImplementations.push({
          taskId: '', // Not task-specific
          taskName: implMatch[1],
          lineNumber: i + 1,
          description: implMatch[1],
        });
      }
    }

    return { tasks, keyImplementations };
  }
}
