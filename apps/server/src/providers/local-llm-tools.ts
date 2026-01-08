/**
 * Tool definitions for Local LLM agentic capabilities
 *
 * These tools enable the model to interact with the filesystem,
 * execute commands, and perform git operations.
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

/**
 * File operation tools
 */
export const FILE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_file',
      description:
        'Create a new file or overwrite an existing file with the provided content. Use this to create new code files, configuration files, or any other text files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file (e.g., "src/components/Button.tsx")',
          },
          content: {
            type: 'string',
            description: 'The complete content of the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the content of an existing file. Use this to inspect existing code before making changes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_file',
      description:
        'Update an existing file by replacing specific content. Use this for making targeted changes to existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file',
          },
          old_content: {
            type: 'string',
            description: 'The exact content to replace (must match exactly)',
          },
          new_content: {
            type: 'string',
            description: 'The new content to insert',
          },
        },
        required: ['path', 'old_content', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. Use this to remove unnecessary files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to delete',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description:
        'List files and directories in a specific path. Use this to explore the project structure.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the directory to list (use "." for project root)',
          },
        },
        required: ['path'],
      },
    },
  },
];

/**
 * Command execution tools
 */
export const COMMAND_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description:
        'Execute a shell command in the project directory. Use this for running build commands, installing packages, running tests, etc. The command will be executed in a safe, sandboxed environment.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute (e.g., "npm install", "npm run build")',
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of why this command is needed',
          },
        },
        required: ['command', 'reason'],
      },
    },
  },
];

/**
 * Git operation tools
 */
export const GIT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get the current git status showing modified, added, and deleted files.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Get the git diff for a specific file or all changes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to get diff for (optional, omit for all changes)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for commit.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths to stage (or ["."] to stage all)',
          },
        },
        required: ['paths'],
      },
    },
  },
];

/**
 * Information/query tools
 */
export const INFO_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description:
        'Search for text patterns in the codebase using grep. Useful for finding where functions, classes, or imports are used.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The text pattern or regex to search for',
          },
          path: {
            type: 'string',
            description: 'Optional: specific directory or file to search in',
          },
          file_type: {
            type: 'string',
            description: 'Optional: file type to filter (e.g., "ts", "tsx", "js")',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_structure',
      description:
        'Get a tree view of the project structure to understand the codebase organization.',
      parameters: {
        type: 'object',
        properties: {
          max_depth: {
            type: 'number',
            description: 'Maximum depth to traverse (default: 3)',
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Task completion tools
 */
export const COMPLETION_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description:
        'Mark the task as complete with a summary of what was accomplished. Use this when you have finished implementing the requested feature.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A brief summary of what was implemented',
          },
          files_created: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of files created',
          },
          files_modified: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of files modified',
          },
        },
        required: ['summary'],
      },
    },
  },
];

/**
 * All available tools
 */
export const ALL_TOOLS: ToolDefinition[] = [
  ...FILE_TOOLS,
  ...COMMAND_TOOLS,
  ...GIT_TOOLS,
  ...INFO_TOOLS,
  ...COMPLETION_TOOLS,
];

/**
 * Get tools by category
 */
export function getToolsByCategory(
  categories: ('file' | 'command' | 'git' | 'info' | 'completion')[]
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  if (categories.includes('file')) tools.push(...FILE_TOOLS);
  if (categories.includes('command')) tools.push(...COMMAND_TOOLS);
  if (categories.includes('git')) tools.push(...GIT_TOOLS);
  if (categories.includes('info')) tools.push(...INFO_TOOLS);
  if (categories.includes('completion')) tools.push(...COMPLETION_TOOLS);

  return tools;
}
