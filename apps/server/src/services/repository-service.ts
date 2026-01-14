/**
 * Repository Service
 *
 * Handles repository indexing, file tree fetching, and dependency graph analysis
 * for Azure DevOps repositories to enable impact analysis.
 */

import { createLogger } from '@automaker/utils';
import type {
  RepositoryConfiguration,
  FileTreeNode,
  ServiceBoundary,
  ComponentNode,
  DependencyEdge,
  RepositoryGraph,
} from '@automaker/types';

const logger = createLogger('RepositoryService');

interface AzureGitItem {
  objectId: string;
  gitObjectType: 'blob' | 'tree' | 'commit';
  commitId?: string;
  path: string;
  isFolder: boolean;
  url?: string;
  size?: number;
}

interface AzureGitItemsResponse {
  count: number;
  value: AzureGitItem[];
}

interface AzureCommitResponse {
  commitId: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  comment: string;
  url: string;
}

interface AzureCommitsResponse {
  count: number;
  value: AzureCommitResponse[];
}

/**
 * Repository Indexer
 *
 * Fetches repository structure from Azure DevOps Git API
 * and builds file tree for impact analysis.
 */
export class RepositoryIndexer {
  private accessToken: string;
  private organization: string;
  private project: string;
  private repository: string;

  constructor(accessToken: string, organization: string, project: string, repository: string) {
    this.accessToken = accessToken;
    this.organization = organization;
    this.project = project;
    this.repository = repository;
  }

  /**
   * Fetch complete file tree from repository
   */
  async fetchFileTree(branch: string = 'main'): Promise<FileTreeNode[]> {
    const startTime = Date.now();
    logger.info(
      `[RepositoryIndexer] Fetching file tree for ${this.organization}/${this.project}/${this.repository} (${branch})`
    );

    try {
      const url = `https://dev.azure.com/${this.organization}/${this.project}/_apis/git/repositories/${this.repository}/items?recursionLevel=Full&versionDescriptor.version=${branch}&api-version=7.1-preview.1`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch file tree: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as AzureGitItemsResponse;

      const fileTree: FileTreeNode[] = data.value.map((item) => ({
        path: item.path,
        size: item.size,
        isDirectory: item.isFolder,
      }));

      const elapsed = Date.now() - startTime;
      logger.info(`[RepositoryIndexer] Indexed ${fileTree.length} items in ${elapsed}ms`);

      // Log sample paths to debug path format
      if (fileTree.length > 0) {
        const samplePaths = fileTree
          .slice(0, 5)
          .map((f) => `"${f.path}" (isDir: ${f.isDirectory})`);
        logger.info(`[RepositoryIndexer] Sample paths: ${samplePaths.join(', ')}`);
      }

      return fileTree;
    } catch (error) {
      logger.error(
        '[RepositoryIndexer] Failed to fetch file tree:',
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * Get latest commit SHA from branch
   */
  async getLatestCommitSHA(branch: string = 'main'): Promise<string> {
    logger.debug(`[RepositoryIndexer] Fetching latest commit SHA for branch ${branch}`);

    try {
      const url = `https://dev.azure.com/${this.organization}/${this.project}/_apis/git/repositories/${this.repository}/commits?searchCriteria.itemVersion.version=${branch}&searchCriteria.$top=1&api-version=7.1-preview.1`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch commits: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as AzureCommitsResponse;

      if (data.value.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitSHA = data.value[0].commitId;
      if (!commitSHA) {
        throw new Error('Commit SHA is undefined');
      }
      logger.debug(`[RepositoryIndexer] Latest commit SHA: ${commitSHA}`);

      return commitSHA;
    } catch (error) {
      logger.error(
        '[RepositoryIndexer] Failed to fetch commit SHA:',
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * Fetch file content from repository
   */
  async fetchFileContent(filePath: string, branch: string = 'main'): Promise<string> {
    logger.debug(`[RepositoryIndexer] Fetching content for ${filePath}`);

    try {
      const encodedPath = encodeURIComponent(filePath);
      const url = `https://dev.azure.com/${this.organization}/${this.project}/_apis/git/repositories/${this.repository}/items?path=${encodedPath}&versionDescriptor.version=${branch}&api-version=7.1-preview.1`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'text/plain',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const content = await response.text();
      return content;
    } catch (error) {
      logger.error(
        '[RepositoryIndexer] Failed to fetch file content:',
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * Detect service boundaries by finding manifest files
   */
  async detectServiceBoundaries(fileTree: FileTreeNode[]): Promise<ServiceBoundary[]> {
    logger.info('[RepositoryIndexer] Detecting service boundaries...');

    const manifestPatterns = [
      { pattern: /package\.json$/, technology: 'Node.js' },
      { pattern: /\.csproj$/, technology: '.NET' },
      { pattern: /pom\.xml$/, technology: 'Java' },
      { pattern: /build\.gradle$/, technology: 'Java (Gradle)' },
      { pattern: /Cargo\.toml$/, technology: 'Rust' },
      { pattern: /go\.mod$/, technology: 'Go' },
    ];

    const services: ServiceBoundary[] = [];

    for (const item of fileTree) {
      if (item.isDirectory) continue;

      for (const { pattern, technology } of manifestPatterns) {
        if (pattern.test(item.path)) {
          // Extract service root (parent directory of manifest)
          const pathParts = item.path.split('/').filter(Boolean);
          if (pathParts.length < 2) continue;

          const serviceName = pathParts[pathParts.length - 2];
          const rootPath = pathParts.slice(0, -1).join('/');

          // Check if already detected
          if (services.some((s) => s.rootPath === rootPath)) continue;

          services.push({
            id: `service-${services.length + 1}`,
            name: serviceName,
            rootPath,
            technology,
            documentation: [],
          });

          logger.info(
            `[RepositoryIndexer] Detected ${technology} service: ${serviceName} at rootPath="${rootPath}" (manifest: ${item.path})`
          );
        }
      }
    }

    logger.info(`[RepositoryIndexer] Found ${services.length} service boundaries`);
    return services;
  }

  /**
   * Build basic component nodes from file tree
   *
   * Note: Full dependency graph requires parsing file contents,
   * which is expensive. This creates nodes only; edges require deep analysis.
   */
  buildComponentNodes(fileTree: FileTreeNode[], services: ServiceBoundary[]): ComponentNode[] {
    logger.info('[RepositoryIndexer] Building component nodes...');

    const nodes: ComponentNode[] = [];
    const componentPatterns = [
      { pattern: /Models?[\\/].*\.(cs|ts|tsx|java)$/, type: 'Model' as const },
      { pattern: /Controllers?[\\/].*\.(cs|ts|tsx|java)$/, type: 'Controller' as const },
      { pattern: /Services?[\\/].*\.(cs|ts|tsx|java)$/, type: 'Service' as const },
      { pattern: /(Events?|Messages?)[\\/].*\.(cs|ts|tsx|java)$/, type: 'Event' as const },
      { pattern: /Migrations?[\\/].*\.cs$/, type: 'Migration' as const },
    ];

    for (const item of fileTree) {
      if (item.isDirectory) continue;

      for (const { pattern, type } of componentPatterns) {
        if (pattern.test(item.path)) {
          const pathParts = item.path.split('/').filter(Boolean);
          const fileName = pathParts[pathParts.length - 1];
          const componentName = fileName.replace(/\.(cs|ts|tsx|java|py)$/, '');

          // Find parent service (Azure DevOps paths start with '/')
          const serviceId = services.find((s) => item.path.startsWith('/' + s.rootPath + '/'))?.id;

          nodes.push({
            id: `node-${nodes.length + 1}`,
            type,
            name: componentName,
            path: item.path,
            serviceId,
            documentation: [],
          });

          break; // Only match first pattern
        }
      }
    }

    logger.info(`[RepositoryIndexer] Created ${nodes.length} component nodes`);
    return nodes;
  }

  /**
   * Calculate service metrics
   */
  calculateServiceMetrics(
    service: ServiceBoundary,
    fileTree: FileTreeNode[],
    nodes: ComponentNode[]
  ): void {
    // Azure DevOps file paths start with '/', so we need to add it to the search prefix
    const searchPrefix = '/' + service.rootPath + '/';
    const serviceFiles = fileTree.filter((f) => !f.isDirectory && f.path.startsWith(searchPrefix));
    const serviceNodes = nodes.filter((n) => n.serviceId === service.id);

    logger.info(
      `[RepositoryIndexer] Service "${service.name}" (rootPath="${service.rootPath}"): searching for files starting with "${searchPrefix}" - found ${serviceFiles.length} files, ${serviceNodes.length} components`
    );

    if (serviceFiles.length === 0 && fileTree.length > 0) {
      // Show some file paths to debug why they don't match
      const nearbyFiles = fileTree
        .filter((f) => !f.isDirectory && f.path.includes(service.name))
        .slice(0, 3);
      if (nearbyFiles.length > 0) {
        logger.info(
          `[RepositoryIndexer] Sample files containing service name: ${nearbyFiles.map((f) => `"${f.path}"`).join(', ')}`
        );
      }
    }

    service.metrics = {
      fileCount: serviceFiles.length,
      modelCount: serviceNodes.filter((n) => n.type === 'Model').length,
      eventCount: serviceNodes.filter((n) => n.type === 'Event').length,
      apiCount: serviceNodes.filter((n) => n.type === 'Controller').length,
    };
  }
}

/**
 * Perform deep analysis of repository
 *
 * This is the main entry point for repository analysis.
 */
export async function analyzeRepository(
  config: RepositoryConfiguration,
  accessToken: string
): Promise<{
  fileTree: FileTreeNode[];
  graph: RepositoryGraph;
  services: ServiceBoundary[];
  commitSHA: string;
  timing: {
    fileTree: number;
    serviceBoundaries: number;
    componentNodes: number;
    commitSHA: number;
    total: number;
  };
}> {
  const overallStart = Date.now();
  const timing = { fileTree: 0, serviceBoundaries: 0, componentNodes: 0, commitSHA: 0, total: 0 };

  const indexer = new RepositoryIndexer(
    accessToken,
    config.organization,
    config.project,
    config.repository
  );

  // Step 1: Fetch file tree
  const fileTreeStart = Date.now();
  const fileTree = await indexer.fetchFileTree(config.defaultBranch);
  timing.fileTree = Date.now() - fileTreeStart;

  // Step 2: Get latest commit SHA
  const commitStart = Date.now();
  const commitSHA = await indexer.getLatestCommitSHA(config.defaultBranch);
  timing.commitSHA = Date.now() - commitStart;

  // Step 3: Detect service boundaries
  const servicesStart = Date.now();
  const services = await indexer.detectServiceBoundaries(fileTree);
  timing.serviceBoundaries = Date.now() - servicesStart;

  // Step 4: Build component nodes
  const nodesStart = Date.now();
  const nodes = indexer.buildComponentNodes(fileTree, services);
  timing.componentNodes = Date.now() - nodesStart;

  // Step 5: Calculate metrics for each service
  for (const service of services) {
    indexer.calculateServiceMetrics(service, fileTree, nodes);
  }

  // Build repository graph (edges will be empty until deep parsing is implemented)
  const graph: RepositoryGraph = {
    nodes,
    edges: [],
    documentationLinks: [],
    stats: {
      totalNodes: nodes.length,
      totalEdges: 0,
      crossBoundaryEdges: 0,
      servicesCount: services.length,
    },
  };

  timing.total = Date.now() - overallStart;

  logger.info(
    `[RepositoryService] Analysis complete: ${fileTree.length} files, ${services.length} services, ${nodes.length} components in ${timing.total}ms`
  );

  return {
    fileTree,
    graph,
    services,
    commitSHA,
    timing,
  };
}
