/**
 * Tool executor for Local LLM agent
 *
 * Handles safe execution of tool calls requested by the model
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('LocalLLMToolExecutor');

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  output: string;
  success: boolean;
  error?: string;
}

/**
 * Execute a tool call in the context of a project directory
 */
export class LocalLLMToolExecutor {
  private projectRoot: string;
  private allowedCommands: Set<string>;
  private dangerousPatterns: RegExp[];
  private protectedPaths: string[];

  constructor(projectRoot: string) {
    // Normalize project root to absolute path with resolved symlinks
    this.projectRoot = path.resolve(projectRoot);

    // Whitelist of allowed command prefixes for safety
    this.allowedCommands = new Set([
      'npm',
      'yarn',
      'pnpm',
      'node',
      'git',
      'ls',
      'dir',
      'cat',
      'echo',
      'mkdir',
      'touch',
      'npx',
    ]);

    // Patterns that should NEVER appear in paths
    this.dangerousPatterns = [
      /\.\./, // Directory traversal
      /~\//, // Home directory
      /^\/[^\/]/, // Root directory (absolute paths starting with /)
      /^[A-Z]:\\/, // Windows drive letters (C:\, D:\, etc.)
      /\/etc\//, // System config
      /\/bin\//, // System binaries
      /\/usr\//, // System files
      /\/var\//, // System var
      /\/sys\//, // System
      /\/proc\//, // Process info
      /\\Windows\\/i, // Windows system
      /\\System32\\/i, // Windows system32
      /\\Program Files/i, // Windows program files
    ];

    // Paths within project that should be protected from deletion
    this.protectedPaths = [
      '.git',
      'node_modules',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.env',
      '.env.local',
    ];

    logger.info(`LocalLLMToolExecutor initialized with project root: ${this.projectRoot}`);
  }

  /**
   * Validate and normalize a path to ensure it's safe
   *
   * This is the CRITICAL security function that prevents path traversal attacks
   */
  private async validatePath(
    relPath: string,
    operation: 'read' | 'write' | 'delete'
  ): Promise<string> {
    // 1. Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(relPath)) {
        const error = `SECURITY VIOLATION: Dangerous pattern detected in path: ${relPath}`;
        logger.error(error);
        throw new Error(error);
      }
    }

    // 2. Resolve the full path
    const fullPath = path.resolve(this.projectRoot, relPath);

    // 3. Get the real path (resolves symlinks) - this prevents symlink attacks
    let realPath: string;
    try {
      // For new files that don't exist yet, check parent directory
      realPath = await fs.realpath(fullPath).catch(async () => {
        const parentDir = path.dirname(fullPath);
        const parentReal = await fs.realpath(parentDir);
        return path.join(parentReal, path.basename(fullPath));
      });
    } catch (error) {
      // If realpath fails, at least check the resolved path
      realPath = fullPath;
    }

    // 4. CRITICAL: Ensure the real path is still within project root
    if (!realPath.startsWith(this.projectRoot)) {
      const error = `SECURITY VIOLATION: Path escapes project root!\n  Requested: ${relPath}\n  Resolved: ${realPath}\n  Project Root: ${this.projectRoot}`;
      logger.error(error);
      throw new Error('Access denied: path outside project root');
    }

    // 5. Additional check: Ensure no parent directory components after resolution
    const relativePath = path.relative(this.projectRoot, realPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      const error = `SECURITY VIOLATION: Relative path escapes project root: ${relativePath}`;
      logger.error(error);
      throw new Error('Access denied: path outside project root');
    }

    // 6. For delete operations, check protected paths
    if (operation === 'delete') {
      const normalizedPath = relativePath.replace(/\\/g, '/');
      for (const protectedPath of this.protectedPaths) {
        if (normalizedPath === protectedPath || normalizedPath.startsWith(protectedPath + '/')) {
          const error = `SECURITY VIOLATION: Attempt to delete protected path: ${normalizedPath}`;
          logger.error(error);
          throw new Error(`Cannot delete protected path: ${protectedPath}`);
        }
      }
    }

    logger.debug(`Path validated [${operation}]: ${relPath} -> ${realPath}`);
    return realPath;
  }

  /**
   * Execute a single tool call
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const { id, function: func } = toolCall;
    const { name, arguments: argsStr } = func;

    logger.info(`Executing tool: ${name}`);
    logger.debug(`Arguments: ${argsStr}`);

    try {
      const args = JSON.parse(argsStr);
      let output: string;

      switch (name) {
        // File operations
        case 'create_file':
          output = await this.createFile(args.path, args.content);
          break;

        case 'read_file':
          output = await this.readFile(args.path);
          break;

        case 'update_file':
          output = await this.updateFile(args.path, args.old_content, args.new_content);
          break;

        case 'delete_file':
          output = await this.deleteFile(args.path);
          break;

        case 'list_directory':
          output = await this.listDirectory(args.path || '.');
          break;

        // Command execution
        case 'execute_command':
          output = await this.executeCommand(args.command, args.reason);
          break;

        // Git operations
        case 'git_status':
          output = await this.gitStatus();
          break;

        case 'git_diff':
          output = await this.gitDiff(args.path);
          break;

        case 'git_add':
          output = await this.gitAdd(args.paths);
          break;

        // Info/search operations
        case 'search_codebase':
          output = await this.searchCodebase(args.pattern, args.path, args.file_type);
          break;

        case 'get_project_structure':
          output = await this.getProjectStructure(args.max_depth || 3);
          break;

        // Task completion
        case 'task_complete':
          output = this.taskComplete(args.summary, args.files_created, args.files_modified);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      logger.info(`Tool ${name} executed successfully`);
      return {
        tool_call_id: id,
        output,
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} execution failed:`, error);

      return {
        tool_call_id: id,
        output: errorMsg,
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute multiple tool calls
   */
  async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // Execute tools sequentially to maintain order
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);
      results.push(result);
    }

    return results;
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  private async createFile(relPath: string, content: string): Promise<string> {
    // Validate path with multi-layer security checks
    const fullPath = await this.validatePath(relPath, 'write');

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');

    const stats = await fs.stat(fullPath);
    logger.info(`✅ File created: ${relPath} (${stats.size} bytes)`);
    return `File created: ${relPath} (${stats.size} bytes)`;
  }

  private async readFile(relPath: string): Promise<string> {
    // Validate path with multi-layer security checks
    const fullPath = await this.validatePath(relPath, 'read');

    const content = await fs.readFile(fullPath, 'utf-8');
    logger.debug(`📖 File read: ${relPath} (${content.length} chars)`);
    return content;
  }

  private async updateFile(
    relPath: string,
    oldContent: string,
    newContent: string
  ): Promise<string> {
    // Validate path with multi-layer security checks
    const fullPath = await this.validatePath(relPath, 'write');

    // Read current content
    const currentContent = await fs.readFile(fullPath, 'utf-8');

    // Find and replace
    if (!currentContent.includes(oldContent)) {
      throw new Error('Old content not found in file. The file may have changed.');
    }

    const updatedContent = currentContent.replace(oldContent, newContent);
    await fs.writeFile(fullPath, updatedContent, 'utf-8');

    logger.info(`✏️ File updated: ${relPath}`);
    return `File updated: ${relPath}`;
  }

  private async deleteFile(relPath: string): Promise<string> {
    // Validate path with EXTRA strict security checks for deletion
    const fullPath = await this.validatePath(relPath, 'delete');

    // Extra confirmation log before deletion
    logger.warn(`⚠️  DELETING FILE: ${relPath}`);

    await fs.unlink(fullPath);

    logger.info(`🗑️  File deleted: ${relPath}`);
    return `File deleted: ${relPath}`;
  }

  private async listDirectory(relPath: string): Promise<string> {
    // Validate path with multi-layer security checks
    const fullPath = await this.validatePath(relPath, 'read');

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const list = entries.map((entry) => {
      const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
      return `${type} ${entry.name}`;
    });

    logger.debug(`📂 Listed directory: ${relPath} (${entries.length} entries)`);
    return list.join('\n');
  }

  // ============================================================================
  // Command Execution
  // ============================================================================

  private async executeCommand(command: string, reason: string): Promise<string> {
    logger.info(`Executing command: ${command} (reason: ${reason})`);

    // Security check: validate command is in whitelist
    const commandPrefix = command.split(' ')[0];
    if (!this.allowedCommands.has(commandPrefix)) {
      throw new Error(
        `Command not allowed: ${commandPrefix}. Only whitelisted commands can be executed.`
      );
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      const output = [stdout, stderr].filter(Boolean).join('\n---STDERR---\n');
      return output || 'Command executed successfully (no output)';
    } catch (error: any) {
      // Include both stdout and stderr in error for context
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n---STDERR---\n');
      throw new Error(`Command failed with exit code ${error.code}:\n${output}`);
    }
  }

  // ============================================================================
  // Git Operations
  // ============================================================================

  private async gitStatus(): Promise<string> {
    const { stdout } = await execAsync('git status --short', { cwd: this.projectRoot });
    return stdout || 'No changes';
  }

  private async gitDiff(relPath?: string): Promise<string> {
    const command = relPath ? `git diff ${relPath}` : 'git diff';
    const { stdout } = await execAsync(command, { cwd: this.projectRoot });
    return stdout || 'No diff';
  }

  private async gitAdd(paths: string[]): Promise<string> {
    const pathsStr = paths.map((p) => `"${p}"`).join(' ');
    await execAsync(`git add ${pathsStr}`, { cwd: this.projectRoot });
    return `Staged ${paths.length} file(s)`;
  }

  // ============================================================================
  // Search/Info Operations
  // ============================================================================

  private async searchCodebase(
    pattern: string,
    relPath?: string,
    fileType?: string
  ): Promise<string> {
    let command = `git grep -n "${pattern}"`;

    if (fileType) {
      command += ` -- "*.${fileType}"`;
    }

    if (relPath) {
      command += ` ${relPath}`;
    }

    try {
      const { stdout } = await execAsync(command, { cwd: this.projectRoot });
      return stdout || 'No matches found';
    } catch (error) {
      return 'No matches found';
    }
  }

  private async getProjectStructure(maxDepth: number): Promise<string> {
    // Use a simple recursive directory listing
    const buildTree = async (
      dir: string,
      depth: number,
      prefix: string = ''
    ): Promise<string[]> => {
      if (depth === 0) return [];

      const entries = await fs.readdir(dir, { withFileTypes: true });
      const lines: string[] = [];

      // Filter out common ignore patterns
      const filtered = entries.filter(
        (e) =>
          !e.name.startsWith('.') &&
          e.name !== 'node_modules' &&
          e.name !== 'dist' &&
          e.name !== 'build'
      );

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const marker = isLast ? '└── ' : '├── ';
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');

        lines.push(`${prefix}${marker}${entry.name}`);

        if (entry.isDirectory()) {
          const subDir = path.join(dir, entry.name);
          const subLines = await buildTree(subDir, depth - 1, nextPrefix);
          lines.push(...subLines);
        }
      }

      return lines;
    };

    const tree = await buildTree(this.projectRoot, maxDepth);
    return tree.join('\n');
  }

  // ============================================================================
  // Task Completion
  // ============================================================================

  private taskComplete(summary: string, filesCreated?: string[], filesModified?: string[]): string {
    const parts = [`Task completed: ${summary}`];

    if (filesCreated && filesCreated.length > 0) {
      parts.push(`\nFiles created:\n${filesCreated.map((f) => `  - ${f}`).join('\n')}`);
    }

    if (filesModified && filesModified.length > 0) {
      parts.push(`\nFiles modified:\n${filesModified.map((f) => `  - ${f}`).join('\n')}`);
    }

    return parts.join('\n');
  }
}
