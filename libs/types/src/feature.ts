/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel } from './settings.js';

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  autoAttached?: boolean; // Whether this was auto-attached by impact analysis
  [key: string]: unknown;
}

/**
 * AffectedFile - File extracted from spec during impact analysis
 */
export interface AffectedFile {
  /** File path relative to repository root */
  path: string;
  /** Whether file exists in repository */
  exists: boolean;
  /** Extraction confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Which regex pattern matched this file */
  matchedPattern?: string;
}

/**
 * DirectImpact - Direct dependency relationship discovered
 */
export interface DirectImpact {
  /** Affected file path */
  file: string;
  /** Relationship type */
  relationship: string;
  /** Hops from source file (1-3) */
  hops: number;
}

/**
 * CrossBoundaryRisk - Impact that crosses service boundaries
 */
export interface CrossBoundaryRisk {
  /** Source service */
  fromService: string;
  /** Target service */
  toService: string;
  /** Dependency description */
  dependency: string;
  /** Risk level */
  risk: 'low' | 'medium' | 'high';
}

/**
 * DetectedGotcha - Architectural rule violation
 */
export interface DetectedGotcha {
  /** Rule that was triggered */
  rule: string;
  /** Rule ID */
  ruleId: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description of the issue */
  description: string;
  /** Suggested actions to resolve */
  suggestedAction?: string;
  /** Related wiki pages */
  wikiPages?: string[];
  /** Whether user acknowledged this gotcha */
  acknowledged?: boolean;
}

/**
 * ImpactAnalysisResult - Complete impact analysis for a feature
 */
export interface ImpactAnalysisResult {
  /** Files that will be affected by this feature */
  affectedFiles: AffectedFile[];
  /** Direct dependency impacts (1-hop) */
  directImpacts: DirectImpact[];
  /** Indirect dependency impacts (2-3 hops) */
  indirectImpacts: DirectImpact[];
  /** Cross-service boundary risks */
  crossBoundaryRisks: CrossBoundaryRisk[];
  /** Detected architectural gotchas */
  gotchas: DetectedGotcha[];
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high';
  /** Timestamp when analysis was performed */
  analyzedAt?: string;
  /** Time taken for analysis (ms) */
  analysisTiming?: {
    files: number;
    graph: number;
    rules: number;
    wiki: number;
    total: number;
  };
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Impact analysis results
  impactAnalysis?: ImpactAnalysisResult;
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  thinkingLevel?: ThinkingLevel;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasks?: Array<{ id: string; description: string; status?: string }>;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  error?: string;
  summary?: string;
  startedAt?: string;
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';
