/**
 * Planning files types for persistent planning pattern
 */

export type CatchupStrategy = 'verbatim' | 'llm-summary' | 'truncated';

export interface PlanningFileMetrics {
  messageCount: number;
  strategy: CatchupStrategy;
  modelUsed?: string;
  truncated: boolean;
}

export interface PlanningFileStatus {
  taskPlanExists: boolean;
  findingsExists: boolean;
  progressExists: boolean;
  version: string;
  lastUpdated: Date | null;
  isStale: boolean;
}

export interface CatchupReport {
  hasStaleFiles: boolean;
  messagesLost: number;
  catchupContent: string;
  metrics: PlanningFileMetrics;
  sessionId?: string;
}

export interface TaskSection {
  taskId: string;
  taskName: string;
  startLine: number;
  endLine: number;
  phase?: number;
}

export interface ProgressRotationIndex {
  taskId: string;
  taskName: string;
  lineNumber: number;
  description?: string;
}

export interface QuickIndex {
  tasks: ProgressRotationIndex[];
  keyImplementations: ProgressRotationIndex[];
}

export interface PlanCheckpointContext {
  turnsSinceLastRead: number;
  errorsSinceLastRead: number;
  totalErrorReReads: number;
  lastCheckpointTurn: number;
  shouldReRead: boolean;
}
