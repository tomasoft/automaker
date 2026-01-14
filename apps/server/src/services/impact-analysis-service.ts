/**
 * Impact Analysis Service
 *
 * Extracts affected files from feature specs, computes dependencies,
 * detects gotchas, and links wiki documentation.
 */

import { createLogger } from '@automaker/utils';
import type {
  Feature,
  AffectedFile,
  DirectImpact,
  CrossBoundaryRisk,
  DetectedGotcha,
  ImpactAnalysisResult,
  FileTreeNode,
  RepositoryGraph,
  ImpactRule,
  ServiceBoundary,
  WikiReference,
  FeatureTextFilePath,
} from '@automaker/types';

const logger = createLogger('ImpactAnalysisService');

export interface ImpactAnalysisContext {
  fileTree: FileTreeNode[];
  graph: RepositoryGraph;
  services: ServiceBoundary[];
  features: Feature[];
  rules: ImpactRule[];
  dependencyDepth: number;
}

/**
 * Extract file paths from feature spec using configured regex patterns
 */
export function extractAffectedFiles(
  spec: string,
  patterns: string[],
  fileTree: FileTreeNode[]
): AffectedFile[] {
  const affectedFiles: AffectedFile[] = [];
  const seenPaths = new Set<string>();

  for (const patternStr of patterns) {
    try {
      const regex = new RegExp(patternStr, 'gi');
      let match;

      while ((match = regex.exec(spec)) !== null) {
        // Extract the file path from the capture group
        const filePath = match[1];
        if (!filePath || seenPaths.has(filePath)) continue;

        seenPaths.add(filePath);

        // Check if file exists in file tree
        const exists = fileTree.some((node) => node.path === filePath);

        // Determine confidence based on pattern type
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        if (patternStr.includes('`')) {
          confidence = 'high'; // Backtick-wrapped paths are explicit
        } else if (patternStr.includes('modify|create|update')) {
          confidence = 'high'; // Action verbs are explicit
        } else {
          confidence = 'low'; // Generic patterns are less reliable
        }

        affectedFiles.push({
          path: filePath,
          exists,
          confidence,
          matchedPattern: patternStr,
        });
      }
    } catch (error) {
      logger.warn(`[ImpactAnalysis] Invalid regex pattern: ${patternStr}`, error);
    }
  }

  logger.info(`[ImpactAnalysis] Extracted ${affectedFiles.length} affected files from spec`);
  return affectedFiles;
}

/**
 * Find direct dependencies of affected files
 */
export function findDirectImpacts(
  affectedFiles: AffectedFile[],
  graph: RepositoryGraph,
  depth: number
): DirectImpact[] {
  const impacts: DirectImpact[] = [];
  const visited = new Set<string>();

  for (const file of affectedFiles) {
    // Find component node for this file
    const node = graph.nodes.find((n) => n.path === file.path);
    if (!node) continue;

    // Traverse edges up to specified depth
    traverseDependencies(node.id, graph, depth, 1, impacts, visited);
  }

  logger.info(`[ImpactAnalysis] Found ${impacts.length} direct impacts`);
  return impacts;
}

/**
 * Recursive dependency traversal
 */
function traverseDependencies(
  nodeId: string,
  graph: RepositoryGraph,
  maxDepth: number,
  currentDepth: number,
  impacts: DirectImpact[],
  visited: Set<string>
): void {
  if (currentDepth > maxDepth || visited.has(nodeId)) return;
  visited.add(nodeId);

  // Find all edges where this node is the source
  const outgoingEdges = graph.edges.filter((e) => e.from === nodeId);

  for (const edge of outgoingEdges) {
    const targetNode = graph.nodes.find((n) => n.id === edge.to);
    if (!targetNode) continue;

    impacts.push({
      file: targetNode.path,
      relationship: edge.relationship,
      hops: currentDepth,
    });

    // Recurse to find transitive dependencies
    traverseDependencies(edge.to, graph, maxDepth, currentDepth + 1, impacts, visited);
  }
}

/**
 * Detect cross-service boundary risks
 */
export function detectCrossBoundaryRisks(
  affectedFiles: AffectedFile[],
  directImpacts: DirectImpact[],
  graph: RepositoryGraph,
  services: ServiceBoundary[]
): CrossBoundaryRisk[] {
  const risks: CrossBoundaryRisk[] = [];

  // Check all impacts for cross-boundary dependencies
  for (const impact of directImpacts) {
    const impactNode = graph.nodes.find((n) => n.path === impact.file);
    if (!impactNode || !impactNode.serviceId) continue;

    // Find the source file's service
    for (const affectedFile of affectedFiles) {
      const sourceNode = graph.nodes.find((n) => n.path === affectedFile.path);
      if (!sourceNode || !sourceNode.serviceId) continue;

      // Check if services differ
      if (sourceNode.serviceId !== impactNode.serviceId) {
        const fromService = services.find((s) => s.id === sourceNode.serviceId);
        const toService = services.find((s) => s.id === impactNode.serviceId);

        if (fromService && toService) {
          // Determine risk level based on relationship and hops
          let risk: 'low' | 'medium' | 'high' = 'medium';
          if (impact.relationship === 'publishes' || impact.relationship === 'consumes') {
            risk = 'high'; // Message contracts are critical
          } else if (impact.hops > 2) {
            risk = 'low'; // Distant relationships are lower risk
          }

          risks.push({
            fromService: fromService.name,
            toService: toService.name,
            dependency: `${impact.relationship} ${impactNode.name}`,
            risk,
          });
        }
      }
    }
  }

  logger.info(`[ImpactAnalysis] Detected ${risks.length} cross-boundary risks`);
  return risks;
}

/**
 * Execute impact rules to detect gotchas
 */
export function detectGotchas(
  affectedFiles: AffectedFile[],
  rules: ImpactRule[],
  fileTree: FileTreeNode[],
  graph: RepositoryGraph
): DetectedGotcha[] {
  const gotchas: DetectedGotcha[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      const triggerRegex = new RegExp(rule.triggerPattern, 'i');

      // Check if any affected file matches trigger
      const matchedFiles = affectedFiles.filter((f) => triggerRegex.test(f.path));
      if (matchedFiles.length === 0) continue;

      logger.debug(
        `[ImpactAnalysis] Rule "${rule.name}" triggered by ${matchedFiles.length} files`
      );

      // Evaluate conditions
      let conditionsFailed = false;
      if (rule.conditions && rule.conditions.length > 0) {
        for (const condition of rule.conditions) {
          const result = evaluateCondition(condition, matchedFiles, fileTree, graph);
          if (!result) {
            conditionsFailed = true;
            break;
          }
        }
      }

      // Check related patterns
      let relatedPatternMissing = false;
      if (rule.relatedPatterns && rule.relatedPatterns.length > 0) {
        for (const patternStr of rule.relatedPatterns) {
          const relatedRegex = new RegExp(patternStr, 'i');
          const hasRelated =
            affectedFiles.some((f) => relatedRegex.test(f.path)) ||
            fileTree.some((f) => relatedRegex.test(f.path));

          if (!hasRelated) {
            relatedPatternMissing = true;
            break;
          }
        }
      }

      // If conditions failed or related patterns missing, create gotcha
      if (conditionsFailed || relatedPatternMissing) {
        gotchas.push({
          rule: rule.name,
          ruleId: rule.id,
          severity: rule.severity,
          description: rule.description,
          suggestedAction: generateSuggestedAction(rule, matchedFiles),
          wikiPages: rule.suggestedWikiPages,
          acknowledged: false,
        });
      }
    } catch (error) {
      logger.warn(`[ImpactAnalysis] Failed to execute rule "${rule.name}":`, error);
    }
  }

  logger.info(`[ImpactAnalysis] Detected ${gotchas.length} gotchas`);
  return gotchas;
}

/**
 * Evaluate a single rule condition
 */
function evaluateCondition(
  condition: { type: string; value: string; negate: boolean },
  matchedFiles: AffectedFile[],
  fileTree: FileTreeNode[],
  graph: RepositoryGraph
): boolean {
  let result = false;

  switch (condition.type) {
    case 'file-exists':
      {
        const regex = new RegExp(condition.value, 'i');
        result = fileTree.some((f) => regex.test(f.path));
      }
      break;

    case 'file-missing':
      {
        const regex = new RegExp(condition.value, 'i');
        result = !fileTree.some((f) => regex.test(f.path));
      }
      break;

    case 'service-boundary':
      {
        // Check if matched files cross service boundaries
        const services = new Set(
          matchedFiles
            .map((f) => graph.nodes.find((n) => n.path === f.path)?.serviceId)
            .filter(Boolean)
        );
        result = services.size > 1;
      }
      break;

    default:
      logger.warn(`[ImpactAnalysis] Unknown condition type: ${condition.type}`);
      result = true; // Unknown conditions pass by default
  }

  return condition.negate ? !result : result;
}

/**
 * Generate suggested action text for a gotcha
 */
function generateSuggestedAction(rule: ImpactRule, matchedFiles: AffectedFile[]): string {
  const fileList = matchedFiles.map((f) => f.path).join(', ');

  switch (rule.id) {
    case 'ef-model-migration':
      return `Create an Entity Framework migration for the modified models: ${fileList}. Run: dotnet ef migrations add <MigrationName>`;

    case 'event-schema-subscribers':
      return `Review all subscribers of these event schemas: ${fileList}. Ensure message contracts are backward compatible or update all consumers.`;

    case 'api-endpoint-openapi':
      return `Update the OpenAPI/Swagger specification to reflect changes in: ${fileList}. Regenerate client SDKs if needed.`;

    case 'shared-model-cross-service':
      return `These shared models affect multiple services: ${fileList}. Coordinate deployment across all dependent services.`;

    default:
      return `Review the following files for potential issues: ${fileList}`;
  }
}

/**
 * Calculate overall risk score
 */
export function calculateRiskScore(
  affectedFiles: AffectedFile[],
  directImpacts: DirectImpact[],
  crossBoundaryRisks: CrossBoundaryRisk[],
  gotchas: DetectedGotcha[]
): { score: number; level: 'low' | 'medium' | 'high' } {
  let score = 0;

  // Files contribute based on existence and confidence
  score += affectedFiles.length * 5; // Base points per file
  score += affectedFiles.filter((f) => !f.exists).length * 10; // New files add more risk
  score += affectedFiles.filter((f) => f.confidence === 'high').length * 5; // High confidence adds certainty

  // Impacts contribute based on hop distance
  score += directImpacts.filter((i) => i.hops === 1).length * 10; // Direct dependencies
  score += directImpacts.filter((i) => i.hops === 2).length * 5; // Indirect dependencies
  score += directImpacts.filter((i) => i.hops === 3).length * 2; // Distant dependencies

  // Cross-boundary risks are significant
  score += crossBoundaryRisks.filter((r) => r.risk === 'high').length * 20;
  score += crossBoundaryRisks.filter((r) => r.risk === 'medium').length * 10;
  score += crossBoundaryRisks.filter((r) => r.risk === 'low').length * 5;

  // Gotchas contribute based on severity
  score += gotchas.filter((g) => g.severity === 'critical').length * 30;
  score += gotchas.filter((g) => g.severity === 'high').length * 20;
  score += gotchas.filter((g) => g.severity === 'medium').length * 10;
  score += gotchas.filter((g) => g.severity === 'low').length * 5;

  // Normalize to 0-100 scale (cap at 200 points = 100 score)
  const normalizedScore = Math.min(100, Math.round((score / 200) * 100));

  // Determine risk level
  let level: 'low' | 'medium' | 'high';
  if (normalizedScore >= 61) {
    level = 'high';
  } else if (normalizedScore >= 31) {
    level = 'medium';
  } else {
    level = 'low';
  }

  logger.info(`[ImpactAnalysis] Risk score: ${normalizedScore}/100 (${level})`);
  return { score: normalizedScore, level };
}

/**
 * Analyze wiki pages for file mentions and their impact
 */
export function analyzeWikiReferences(
  wikiPages: FeatureTextFilePath[],
  fileExtractionPatterns: string[],
  fileTree: FileTreeNode[],
  existingAffectedFiles: Set<string>
): { references: WikiReference[]; additionalFiles: AffectedFile[] } {
  const references: WikiReference[] = [];
  const additionalFiles: AffectedFile[] = [];
  const seenPaths = new Set<string>();

  for (const wiki of wikiPages) {
    if (!wiki.content) continue;

    const contributedFiles: string[] = [];
    const content = wiki.content;

    // Extract file paths from wiki content using the same patterns
    for (const patternStr of fileExtractionPatterns) {
      try {
        const regex = new RegExp(patternStr, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
          const filePath = match[1];
          if (!filePath) continue;

          contributedFiles.push(filePath);

          // Add to additional files if not already in affected files
          if (!existingAffectedFiles.has(filePath) && !seenPaths.has(filePath)) {
            seenPaths.add(filePath);
            const exists = fileTree.some((node) => node.path === filePath);

            additionalFiles.push({
              path: filePath,
              exists,
              confidence: 'medium', // Wiki mentions are less explicit than spec mentions
              matchedPattern: patternStr,
            });
          }
        }
      } catch (error) {
        logger.warn(`[WikiAnalysis] Invalid regex pattern: ${patternStr}`, error);
      }
    }

    // Only add wiki reference if it contributed files
    if (contributedFiles.length > 0) {
      // Generate impact explanation
      const uniqueFiles = [...new Set(contributedFiles)];
      const impact =
        uniqueFiles.length === 1
          ? `Mentions ${uniqueFiles[0]}, which may be affected by this feature`
          : `Mentions ${uniqueFiles.length} files that may be affected: ${uniqueFiles.slice(0, 3).join(', ')}${uniqueFiles.length > 3 ? '...' : ''}`;

      references.push({
        name: wiki.filename || 'Wiki Page',
        url: wiki.path,
        contributedFiles: uniqueFiles,
        impact,
      });
    }
  }

  logger.info(
    `[WikiAnalysis] Found ${references.length} relevant wiki pages contributing ${additionalFiles.length} additional files`
  );

  return { references, additionalFiles };
}

/**
 * Perform complete impact analysis for a feature
 */
export function analyzeFeatureImpact(
  feature: Feature,
  context: ImpactAnalysisContext,
  fileExtractionPatterns: string[]
): ImpactAnalysisResult {
  const timingStart = Date.now();
  const timing = { files: 0, graph: 0, rules: 0, wiki: 0, total: 0 };

  logger.info(`[ImpactAnalysis] Analyzing impact for feature: ${feature.description}`);

  if (!feature.spec) {
    logger.warn('[ImpactAnalysis] Feature has no spec, cannot analyze impact');
    return {
      affectedFiles: [],
      directImpacts: [],
      indirectImpacts: [],
      crossBoundaryRisks: [],
      gotchas: [],
      riskScore: 0,
      riskLevel: 'low',
      analyzedAt: new Date().toISOString(),
      analysisTiming: timing,
    };
  }

  // Step 1: Extract affected files from spec
  const filesStart = Date.now();
  const affectedFiles = extractAffectedFiles(
    feature.spec,
    fileExtractionPatterns,
    context.fileTree
  );
  timing.files = Date.now() - filesStart;

  // Step 1.5: Analyze wiki pages for additional file mentions
  const wikiStart = Date.now();
  const existingFilePaths = new Set(affectedFiles.map((f) => f.path));
  const { references: wikiReferences, additionalFiles } =
    feature.textFilePaths && feature.textFilePaths.length > 0
      ? analyzeWikiReferences(
          feature.textFilePaths,
          fileExtractionPatterns,
          context.fileTree,
          existingFilePaths
        )
      : { references: [], additionalFiles: [] };

  // Merge additional files from wiki into affected files
  const allAffectedFiles = [...affectedFiles, ...additionalFiles];
  timing.wiki = Date.now() - wikiStart;

  logger.info(
    `[ImpactAnalysis] Total affected files: ${allAffectedFiles.length} (${affectedFiles.length} from spec, ${additionalFiles.length} from wiki)`
  );

  // Step 2: Find dependencies
  const graphStart = Date.now();
  const allImpacts = findDirectImpacts(allAffectedFiles, context.graph, context.dependencyDepth);
  const directImpacts = allImpacts.filter((i) => i.hops === 1);
  const indirectImpacts = allImpacts.filter((i) => i.hops > 1);
  timing.graph = Date.now() - graphStart;

  // Step 3: Detect cross-boundary risks
  const crossBoundaryRisks = detectCrossBoundaryRisks(
    allAffectedFiles,
    allImpacts,
    context.graph,
    context.services
  );

  // Step 4: Execute gotcha rules
  const rulesStart = Date.now();
  const gotchas = detectGotchas(allAffectedFiles, context.rules, context.fileTree, context.graph);
  timing.rules = Date.now() - rulesStart;

  // Step 5: Calculate risk score
  const { score, level } = calculateRiskScore(
    allAffectedFiles,
    allImpacts,
    crossBoundaryRisks,
    gotchas
  );

  timing.total = Date.now() - timingStart;

  logger.info(
    `[ImpactAnalysis] Analysis complete in ${timing.total}ms: ${allAffectedFiles.length} files, ${allImpacts.length} impacts, ${gotchas.length} gotchas, ${wikiReferences.length} wiki references`
  );

  return {
    affectedFiles: allAffectedFiles,
    directImpacts,
    indirectImpacts,
    crossBoundaryRisks,
    gotchas,
    wikiReferences: wikiReferences.length > 0 ? wikiReferences : undefined,
    riskScore: score,
    riskLevel: level,
    analyzedAt: new Date().toISOString(),
    analysisTiming: timing,
  };
}
