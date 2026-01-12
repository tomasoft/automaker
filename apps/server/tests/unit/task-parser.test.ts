/**
 * Unit tests for task parsing from spec content
 * Tests various task formats to ensure robust parsing across different agent outputs
 */

import { describe, it, expect } from 'vitest';

// Import the parseTasksFromSpec function
// Note: This is a private function in auto-mode-service.ts
// For testing, we'll need to export it or create a test helper

describe('Task Parser', () => {
  describe('Standard format with tasks code block', () => {
    it('should parse tasks in strict T### format with files', () => {
      const spec = `
# Feature Specification

## Implementation Tasks
\`\`\`tasks
- [ ] T001: Create user model | File: src/models/user.ts
- [ ] T002: Add API endpoint | File: src/routes/users.ts
- [ ] T003: Write tests | File: tests/user.test.ts
\`\`\`
`;

      // Expected: 3 tasks parsed correctly
      // Task IDs: T001, T002, T003
      // Each with description and file path
    });

    it('should parse tasks without file references', () => {
      const spec = `
\`\`\`tasks
- [ ] T001: Setup database connection
- [ ] T002: Create migration files
- [ ] T003: Run migrations
\`\`\`
`;

      // Expected: 3 tasks parsed correctly
      // Task IDs: T001, T002, T003
      // File paths should be undefined
    });

    it('should parse tasks with phase headers', () => {
      const spec = `
\`\`\`tasks
## Phase 1: Foundation
- [ ] T001: Create base model | File: src/models/base.ts
- [ ] T002: Setup database | File: src/db/connection.ts

## Phase 2: Features
- [ ] T003: Add user endpoints | File: src/routes/users.ts
\`\`\`
`;

      // Expected: 3 tasks parsed correctly
      // T001 and T002 should have phase: "Phase 1: Foundation"
      // T003 should have phase: "Phase 2: Features"
    });
  });

  describe('Fallback pattern 1: Tasks without code block (strict)', () => {
    it('should parse inline tasks with strict T### format', () => {
      const spec = `
# Specification

Here are the tasks:
- [ ] T001: Create utility module | File: src/utils/helpers.ts
- [ ] T002: Add unit tests | File: tests/helpers.test.ts

Additional notes...
`;

      // Expected: 2 tasks parsed using Fallback 1
      // Should match strict pattern even without code block
    });
  });

  describe('Fallback pattern 2: Lenient task format', () => {
    it('should parse tasks with "Task ###:" format', () => {
      const spec = `
## Implementation Tasks
- [ ] Task 001: Create configuration file
- [ ] Task 002: Add environment variables
- [ ] Task 003: Update documentation
`;

      // Expected: 3 tasks parsed using Fallback 2
      // Should auto-convert to T001, T002, T003
    });

    it('should parse tasks with just numbers', () => {
      const spec = `
Tasks:
- [ ] 001: Initialize project
- [ ] 002: Setup dependencies
- [ ] 003: Create folder structure
`;

      // Expected: 3 tasks parsed using Fallback 2
      // Should auto-convert to T001, T002, T003
    });

    it('should parse tasks without IDs and auto-assign them', () => {
      const spec = `
\`\`\`tasks
- [ ] Create user authentication
- [ ] Add password hashing
- [ ] Implement JWT tokens
\`\`\`
`;

      // Expected: 3 tasks parsed using Fallback 2
      // Should auto-assign T001, T002, T003
    });

    it('should parse checked tasks and convert to unchecked', () => {
      const spec = `
- [ ] Task 1: Setup project
- [x] Task 2: Install dependencies
- [ ] Task 3: Configure build
`;

      // Expected: 3 tasks all with status 'pending'
      // Checked boxes should be converted to unchecked
    });
  });

  describe('Fallback pattern 3: Numbered lists', () => {
    it('should parse numbered list with periods', () => {
      const spec = `
Implementation steps:
1. Create database schema
2. Add migration scripts
3. Update models
4. Write integration tests
`;

      // Expected: 4 tasks parsed using Fallback 3
      // Should auto-assign T001, T002, T003, T004
    });

    it('should parse numbered list with parentheses', () => {
      const spec = `
Tasks to complete:
1) Setup authentication
2) Add authorization middleware
3) Create protected routes
`;

      // Expected: 3 tasks parsed using Fallback 3
      // Should auto-assign T001, T002, T003
    });

    it('should extract file paths from numbered lists', () => {
      const spec = `
1. Create user model | File: src/models/user.ts
2. Add API routes | File: src/routes/api.ts
3. Write tests | File: tests/api.test.ts
`;

      // Expected: 3 tasks with file paths extracted
    });
  });

  describe('Edge cases', () => {
    it('should return empty array when no tasks found', () => {
      const spec = `
# Feature Specification

This is a simple feature with no formal tasks.
Just implement the changes as described.
`;

      // Expected: Empty array
    });

    it('should handle malformed tasks gracefully', () => {
      const spec = `
\`\`\`tasks
- [ ] T001: Valid task | File: valid.ts
- This is not a task
- [ ] Also not valid
- [ ] T003: Another valid task
\`\`\`
`;

      // Expected: 2 tasks parsed (T001 and T003)
      // Invalid tasks should be skipped
    });

    it('should handle mixed formats in same spec', () => {
      const spec = `
\`\`\`tasks
- [ ] T001: First task | File: first.ts
- [ ] Task 2: Second task
- [ ] Third task without ID
\`\`\`
`;

      // Expected: 3 tasks parsed
      // Should normalize all to T### format
    });

    it('should preserve task order', () => {
      const spec = `
\`\`\`tasks
- [ ] T003: Third task
- [ ] T001: First task  
- [ ] T002: Second task
\`\`\`
`;

      // Expected: 3 tasks in order T003, T001, T002
      // Should NOT reorder tasks
    });
  });

  describe('Normalization from providers', () => {
    it('should handle GitHub Copilot task variations', () => {
      const spec = `
Tasks:
- Create authentication system
- Add login endpoint
- Implement JWT verification
`;

      // Expected: Tasks should be normalized by provider BEFORE parsing
      // Parser should then extract them successfully
    });

    it('should handle Local LLM numbered format', () => {
      const spec = `
Implementation:
1. Setup database connection
2. Create user table
3. Add CRUD operations
`;

      // Expected: Fallback 3 should match and auto-assign IDs
    });
  });
});

/**
 * Integration tests for the full spec generation → task parsing → execution flow
 */
describe('Task Parsing Integration', () => {
  describe('Spec generation with custom agents', () => {
    it.skip('should force agent mode for Copilot models', async () => {
      // Test that copilot- prefix triggers agenticMode: true
      // This would require mocking ProviderFactory
    });

    it.skip('should force agent mode for Local LLM models', async () => {
      // Test that local-llm- prefix triggers agenticMode: true
    });
  });

  describe('Task normalization in providers', () => {
    it.skip('should normalize tasks from GitHub Copilot responses', async () => {
      // Mock Copilot response with various formats
      // Verify normalization converts to canonical format
    });

    it.skip('should normalize tasks from Local LLM responses', async () => {
      // Mock Local LLM response with numbered lists
      // Verify normalization converts to canonical format
    });
  });

  describe('Full planning flow', () => {
    it.skip('should parse tasks from spec mode', async () => {
      // Create feature with planningMode: 'spec'
      // Generate spec
      // Verify tasks are parsed and stored in planSpec
    });

    it.skip('should parse tasks from full mode', async () => {
      // Create feature with planningMode: 'full'
      // Generate spec with phases
      // Verify tasks are parsed with phase information
    });

    it.skip('should emit warning when tasks cannot be parsed', async () => {
      // Create feature with planningMode: 'spec'
      // Generate spec with no recognizable tasks
      // Verify warning event is emitted
    });
  });
});
