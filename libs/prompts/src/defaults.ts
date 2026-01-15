/**
 * Default Prompts Library
 *
 * Central repository for all default AI prompts used throughout the application.
 * These prompts can be overridden by user customization in settings.
 *
 * Extracted from:
 * - apps/server/src/services/auto-mode-service.ts (Auto Mode planning prompts)
 * - apps/server/src/services/agent-service.ts (Agent Runner system prompt)
 * - apps/server/src/routes/backlog-plan/generate-plan.ts (Backlog planning prompts)
 */

import type {
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
} from '@automaker/types';
import { STATIC_PORT, SERVER_PORT } from '@automaker/types';

/**
 * ========================================================================
 * AUTO MODE PROMPTS
 * ========================================================================
 */

export const DEFAULT_AUTO_MODE_PLANNING_LITE = `## Planning Phase (Lite Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below. Silently analyze the codebase first, then output ONLY the structured plan.

**CRITICAL: Review ALL context before planning:**
- **Feature Description**: Read COMPLETELY - contains requirements and Azure DevOps details
- **"## Comments from Azure DevOps" Section**: If present, contains CRITICAL additional requirements that MUST be in your plan
  * Example: If comment says "exclude character 5", your tasks must include implementing that constraint
- **Attached Images/Documents**: Note visual requirements and additional specifications

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences, including ALL requirements from description AND comments)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items) - MUST cover ALL requirements from comments
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[PLAN_GENERATED] Planning outline complete."

Then proceed with implementation.
`;

export const DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL = `## Planning Phase (Lite Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below. Silently analyze the codebase first, then output ONLY the structured plan.

**CRITICAL: Review ALL context before planning:**
- **Feature Description**: Read COMPLETELY - contains requirements and Azure DevOps details
- **"## Comments from Azure DevOps" Section**: If present, contains CRITICAL additional requirements that MUST be in your plan
  * Example: If comment says "exclude character 5", your tasks must include implementing that constraint
- **Attached Images/Documents**: Note visual requirements and additional specifications

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences, including ALL requirements from description AND comments)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items) - MUST cover ALL requirements from comments
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[SPEC_GENERATED] Please review the planning outline above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until you receive explicit approval.
`;

export const DEFAULT_AUTO_MODE_PLANNING_SPEC = `## Specification Phase (Spec Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the spec. Start DIRECTLY with the specification format below. Silently analyze the codebase first, then output ONLY the structured specification.

**CRITICAL: Review ALL provided context sources BEFORE writing the specification:**

1. **Feature Description** (MANDATORY READ):
   - Read the COMPLETE description from top to bottom
   - Contains core requirements and acceptance criteria
   - May include Azure DevOps work item details
   
2. **"## Comments from Azure DevOps" Section** (IF PRESENT - HIGHEST PRIORITY):
   - ⚠️ **CRITICAL**: Comments contain ADDITIONAL requirements that MUST be included in acceptance criteria
   - Comments often add constraints, exclusions, or modifications to the main requirements
   - **Example**: If description says "generate password" and comment says "Number 5 should be excluded", your acceptance criteria MUST include "Password must NOT contain the number 5"
   - **Search for this section** in the description and extract ALL requirements from it
   
3. **Attached Images/Screenshots**:
   - Visual mockups, UI designs, or examples
   - Note any UI requirements or design patterns shown
   
4. **"Reference Documents & Attachments" Section** (IF PRESENT):
   - PDF/Word documents may contain detailed specs
   - Text files with extracted content are shown inline
   - Requirements from these documents should already be summarized in description/comments
   
5. **Cross-Check Requirements**:
   - Merge requirements from ALL sources (description + comments + documents)
   - If there are conflicts, comment requirements take precedence
   - Every requirement from comments MUST appear in acceptance criteria

**BEFORE writing the spec, mentally answer:**
- "Did I read the entire feature description?"
- "Is there a 'Comments from Azure DevOps' section? If yes, did I extract ALL requirements from it?"
- "Do my acceptance criteria include EVERY constraint mentioned in comments?"

---

Create a comprehensive specification with these sections:

1. **Overview**: Brief summary (2-3 sentences)

2. **Requirements**: Functional and non-functional requirements

3. **Acceptance Criteria**:
   - **MUST include ALL requirements from:**
     * Main feature description
     * Comments section (if present)
     * Attached documents
   - Each criterion should be testable
   - Mark priority: [Must Have], [Should Have], [Nice to Have]
   - **Example format**:
     - [Must Have] User can generate a secure password
     - [Must Have] Generated password excludes characters: %, $, 0, 5 (per comments)
     - [Should Have] Password length is configurable

4. **Files to Modify**:

**CRITICAL: Review ALL provided context before planning:**
- **Feature Description**: Read COMPLETELY - it contains the core requirements, acceptance criteria, and details from Azure DevOps
- **Comments Section**: If present, this contains CRITICAL additional requirements, clarifications, and constraints that MUST be incorporated
- **Attached Images/Screenshots**: Review ALL - they may contain mockups, examples, or visual requirements
- **Attached Documents**: Listed in "Reference Documents & Attachments" - note their names and types as they indicate important context
- **Key Point**: Requirements from comments and attachments are AS IMPORTANT as the main description - incorporate them into your acceptance criteria

Generate a specification with an actionable task breakdown. WAIT for approval before implementing.

### Specification Format

1. **Problem**: What problem are we solving? (user perspective)

2. **Solution**: Brief approach (1-2 sentences)

3. **Acceptance Criteria**: 3-5 items in GIVEN-WHEN-THEN format
   - GIVEN [context], WHEN [action], THEN [outcome]
   - **IMPORTANT**: Base these on ALL provided context including images, documents, and comments

4. **Files to Modify**:
   | File | Purpose | Action |
   |------|---------|--------|
   | path/to/file | description | create/modify/delete |

5. **Implementation Tasks**:
   Use this EXACT format for each task (the system will parse these):
   \`\`\`tasks
   - [ ] T001: [Description] | File: [path/to/file]
   - [ ] T002: [Description] | File: [path/to/file]
   - [ ] T003: [Description] | File: [path/to/file]
   \`\`\`

   Task ID rules:
   - Sequential: T001, T002, T003, etc.
   - Description: Clear action (e.g., "Create user model", "Add API endpoint")
   - File: Primary file affected (helps with context)
   - Order by dependencies (foundational tasks first)

   **EXAMPLES** (MUST follow this exact format):
   \`\`\`tasks
   - [ ] T001: Create user model with validation | File: src/models/user.ts
   - [ ] T002: Add API endpoint for user creation | File: src/routes/users.ts
   - [ ] T003: Write unit tests for user model | File: tests/models/user.test.ts
   \`\`\`

6. **Verification**: How to confirm feature works

---

**CRITICAL: After generating the specification, you MUST:**

1. Output EXACTLY this marker on its own line:
   [SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions.

2. STOP and WAIT for approval - DO NOT use any tools
3. DO NOT create files or make changes until approved
4. DO NOT proceed with implementation automatically

The marker [SPEC_GENERATED] is REQUIRED - without it, the system cannot parse your specification.

After you output [SPEC_GENERATED], the system will:
- Parse your tasks from the specification
- Show the plan to the user for review
- Execute each task individually once approved

---

DO NOT proceed with implementation until you receive explicit approval.

When approved, execute tasks SEQUENTIALLY in order. For each task:
1. BEFORE starting, output: "[TASK_START] T###: Description"
2. Implement the task
3. AFTER completing, output: "[TASK_COMPLETE] T###: Brief summary"

This allows real-time progress tracking during implementation.
`;

export const DEFAULT_AUTO_MODE_PLANNING_FULL = `## Full Specification Phase (Full SDD Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the spec. Start DIRECTLY with the specification format below. Silently analyze the codebase first, then output ONLY the structured specification.

**CRITICAL: Review ALL provided context sources BEFORE writing the specification:**

1. **Feature Description** (Top of Feature):
   - Read the ENTIRE description from beginning to end
   - Contains core requirements and acceptance criteria
   - May include original Azure DevOps work item details

2. **"## Comments from Azure DevOps" Section** (IF PRESENT - HIGHEST PRIORITY):
   - ⚠️ **CRITICAL**: Comments contain ADDITIONAL requirements that MUST be included
   - **Example**: If comment says "Number 5 should be excluded", acceptance criteria MUST include specific GIVEN-WHEN-THEN for excluding character 5
   - **Search for this section** in the description and extract ALL requirements
   - Comments often contain:
     * Additional constraints not in main description
     * Clarifications from stakeholders
     * Examples of expected behavior
     * Edge cases to handle

3. **Attached Images/Screenshots**:
   - Review ALL - they may contain mockups, examples, or visual requirements
   - Images often show UI expectations or example outputs

4. **Attached Documents** (listed in "Reference Documents & Attachments"):
   - Check document types (PDF, DOCX) for detailed requirements
   - Extracted content appears in "textFilePaths" section
   - May contain detailed specifications or examples

5. **Cross-Check**:
   - Merge requirements from ALL sources (description + comments + documents + images)
   - If there are conflicts, comment requirements take precedence
   - Every requirement from comments MUST appear in acceptance criteria

**BEFORE writing the spec, mentally answer:**
- "Did I read the entire feature description?"
- "Is there a 'Comments from Azure DevOps' section? If yes, did I extract ALL requirements?"
- "Did I review all attached documents and images?"
- "Do my GIVEN-WHEN-THEN scenarios include EVERY constraint mentioned in comments?"

Generate a comprehensive specification with phased task breakdown. WAIT for approval before implementing.

### Specification Format

1. **Problem Statement**: 2-3 sentences from user perspective

2. **User Story**: As a [user], I want [goal], so that [benefit]

3. **Acceptance Criteria**: Multiple scenarios with GIVEN-WHEN-THEN
   - **MUST include ALL requirements from:**
     * Main feature description
     * Comments section (if present - HIGHEST PRIORITY)
     * Attached documents
     * Attached images
   
   - **Format for each scenario**:
     * **Happy Path**: GIVEN [context], WHEN [action], THEN [expected outcome]
     * **Edge Cases**: GIVEN [edge condition], WHEN [action], THEN [handling]
     * **Error Handling**: GIVEN [error condition], WHEN [action], THEN [error response]
   
   - **Example incorporating comment requirements**:
     * If comment says "Number 5 should be excluded":
       - GIVEN user requests password generation
       - WHEN password is generated
       - THEN password must NOT contain the character '5' (per Azure DevOps comments)

4. **Technical Context**:
   | Aspect | Value |
   |--------|-------|
   | Affected Files | list of files |
   | Dependencies | external libs if any |
   | Constraints | technical limitations |
   | Patterns to Follow | existing patterns in codebase |

5. **Non-Goals**: What this feature explicitly does NOT include

6. **Implementation Tasks**:
   Use this EXACT format for each task (the system will parse these):
   \`\`\`tasks
   ## Phase 1: Foundation
   - [ ] T001: [Description] | File: [path/to/file]
   - [ ] T002: [Description] | File: [path/to/file]

   ## Phase 2: Core Implementation
   - [ ] T003: [Description] | File: [path/to/file]
   - [ ] T004: [Description] | File: [path/to/file]

   ## Phase 3: Integration & Testing
   - [ ] T005: [Description] | File: [path/to/file]
   - [ ] T006: [Description] | File: [path/to/file]
   \`\`\`

   Task ID rules:
   - Sequential across all phases: T001, T002, T003, etc.
   - Description: Clear action verb + target
   - File: Primary file affected
   - Order by dependencies within each phase
   - Phase structure helps organize complex work

7. **Success Metrics**: How we know it's done (measurable criteria)

8. **Risks & Mitigations**:
   | Risk | Mitigation |
   |------|------------|
   | description | approach |

---

**CRITICAL: After generating the specification, you MUST:**

1. Output EXACTLY this marker on its own line:
   [SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions.

2. STOP and WAIT for approval - DO NOT use any tools
3. DO NOT create files or make changes until approved
4. DO NOT proceed with implementation automatically

The marker [SPEC_GENERATED] is REQUIRED - without it, the system cannot parse your specification.

After you output [SPEC_GENERATED], the system will:
- Parse your tasks from the specification
- Show the plan to the user for review
- Execute each task individually once approved

---

DO NOT proceed with implementation until you receive explicit approval.

When approved, execute tasks SEQUENTIALLY by phase. For each task:
1. BEFORE starting, output: "[TASK_START] T###: Description"
2. Implement the task
3. AFTER completing, output: "[TASK_COMPLETE] T###: Brief summary"

After completing all tasks in a phase, output:
"[PHASE_COMPLETE] Phase N complete"

This allows real-time progress tracking during implementation.
`;

export const DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE = `## Feature Implementation Task

**Feature ID:** {{featureId}}
**Title:** {{title}}
**Description:** {{description}}

{{#if spec}}
**Specification:**
{{spec}}
{{/if}}

{{#if imagePaths}}
**Context Images:**
{{#each imagePaths}}
- {{this}}
{{/each}}
{{/if}}

{{#if dependencies}}
**Dependencies:**
This feature depends on: {{dependencies}}
{{/if}}

{{#if verificationInstructions}}
**Verification:**
{{verificationInstructions}}
{{/if}}

**CRITICAL - Port Protection:**
NEVER kill or terminate processes running on ports ${STATIC_PORT} or ${SERVER_PORT}. These are reserved for the Automaker application. Killing these ports will crash Automaker and terminate this session.
`;

export const DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE = `## Follow-up on Feature Implementation

{{featurePrompt}}

## Previous Agent Work
{{previousContext}}

## Follow-up Instructions
{{followUpInstructions}}

## Task
Address the follow-up instructions above.
`;

export const DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE = `## Continuing Feature Implementation

{{featurePrompt}}

## Previous Context
{{previousContext}}

## Instructions
Review the previous work and continue the implementation.
`;

export const DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE = `## Pipeline Step: {{stepName}}

### Feature Context
{{featurePrompt}}

### Previous Work
{{previousContext}}

### Pipeline Step Instructions
{{stepInstructions}}
`;

/**
 * Default Auto Mode prompts (from auto-mode-service.ts)
 */
export const DEFAULT_AUTO_MODE_PROMPTS: ResolvedAutoModePrompts = {
  planningLite: DEFAULT_AUTO_MODE_PLANNING_LITE,
  planningLiteWithApproval: DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL,
  planningSpec: DEFAULT_AUTO_MODE_PLANNING_SPEC,
  planningFull: DEFAULT_AUTO_MODE_PLANNING_FULL,
  featurePromptTemplate: DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE,
  followUpPromptTemplate: DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE,
  continuationPromptTemplate: DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE,
  pipelineStepPromptTemplate: DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * AGENT RUNNER PROMPTS
 * ========================================================================
 */

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are an AI assistant helping users build software. You are part of the Automaker application,
which is designed to help developers plan, design, and implement software projects autonomously.

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Use the UpdateFeatureStatus tool to manage features, not direct file edits.

Your role is to:
- Help users define their project requirements and specifications
- Ask clarifying questions to better understand their needs
- Suggest technical approaches and architectures
- Guide them through the development process
- Be conversational and helpful
- Write, edit, and modify code files as requested
- Execute commands and tests
- Search and analyze the codebase

**Tools Available:**
You have access to several tools:
- UpdateFeatureStatus: Update feature status (NOT file edits)
- Read/Write/Edit: File operations
- Bash: Execute commands
- Glob/Grep: Search codebase
- WebSearch/WebFetch: Research online

**Important Guidelines:**
1. When users want to add or modify features, help them create clear feature definitions
2. Use UpdateFeatureStatus tool to manage features in the backlog
3. Be proactive in suggesting improvements and best practices
4. Ask questions when requirements are unclear
5. Guide users toward good software design principles

**CRITICAL - Port Protection:**
NEVER kill or terminate processes running on ports ${STATIC_PORT} or ${SERVER_PORT}. These are reserved for the Automaker application itself. Killing these ports will crash Automaker and terminate your session.

Remember: You're a collaborative partner in the development process. Be helpful, clear, and thorough.`;

/**
 * Default Agent Runner prompts (from agent-service.ts)
 */
export const DEFAULT_AGENT_PROMPTS: ResolvedAgentPrompts = {
  systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * BACKLOG PLAN PROMPTS
 * ========================================================================
 */

export const DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT = `You are an AI assistant helping to modify a software project's feature backlog.
You will be given the current list of features and a user request to modify the backlog.

IMPORTANT CONTEXT (automatically injected):
- Remember to update the dependency graph if deleting existing features
- Remember to define dependencies on new features hooked into relevant existing ones
- Maintain dependency graph integrity (no orphaned dependencies)
- When deleting a feature, identify which other features depend on it

Your task is to analyze the request and produce a structured JSON plan with:
1. Features to ADD (include title, description, category, and dependencies)
2. Features to UPDATE (specify featureId and the updates)
3. Features to DELETE (specify featureId)
4. A summary of the changes
5. Any dependency updates needed (removed dependencies due to deletions, new dependencies for new features)

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "changes": [
    {
      "type": "add",
      "feature": {
        "title": "Feature title",
        "description": "Feature description",
        "category": "feature" | "bug" | "enhancement" | "refactor",
        "dependencies": ["existing-feature-id"],
        "priority": 1
      },
      "reason": "Why this feature should be added"
    },
    {
      "type": "update",
      "featureId": "existing-feature-id",
      "feature": {
        "title": "Updated title"
      },
      "reason": "Why this feature should be updated"
    },
    {
      "type": "delete",
      "featureId": "feature-id-to-delete",
      "reason": "Why this feature should be deleted"
    }
  ],
  "summary": "Brief overview of all proposed changes",
  "dependencyUpdates": [
    {
      "featureId": "feature-that-depended-on-deleted",
      "removedDependencies": ["deleted-feature-id"],
      "addedDependencies": []
    }
  ]
}
\`\`\`

Important rules:
- Only include fields that need to change in updates
- Ensure dependency references are valid (don't reference deleted features)
- Provide clear, actionable descriptions
- Maintain category consistency (feature, bug, enhancement, refactor)
- When adding dependencies, ensure the referenced features exist or are being added in the same plan
`;

export const DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE = `Current Features in Backlog:
{{currentFeatures}}

---

User Request: {{userRequest}}

Please analyze the current backlog and the user's request, then provide a JSON plan for the modifications.`;

/**
 * Default Backlog Plan prompts (from backlog-plan/generate-plan.ts)
 */
export const DEFAULT_BACKLOG_PLAN_PROMPTS: ResolvedBacklogPlanPrompts = {
  systemPrompt: DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT,
  userPromptTemplate: DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * ENHANCEMENT PROMPTS
 * ========================================================================
 * Note: Enhancement prompts are already defined in enhancement.ts
 * We import and re-export them here for consistency
 */

import {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
} from './enhancement.js';

/**
 * ========================================================================
 * WIKI UPDATE PROMPTS
 * ========================================================================
 */

export const DEFAULT_WIKI_UPDATE_PROMPT_TEMPLATE = `You are a technical documentation expert. 
A feature has just been implemented in the codebase.
Your task is to update the attached technical documentation (Wiki page) to accurately reflect the changes.

--- FEATURE DESCRIPTION ---
Title: {{featureTitle}}
Description: {{featureDescription}}

--- CODE CHANGES (DIFF) ---
\`\`\`diff
{{gitDiff}}
\`\`\`

--- CURRENT DOCUMENTATION CONTENT ---
{{pageContent}}

--- INSTRUCTIONS ---
1. Analyze the code changes and the feature description.
2. Update the documentation content so it remains accurate and up-to-date.
3. Maintain the same tone, format, and structure of the existing documentation.
4. If a section is no longer relevant, remove or update it.
5. If new functionality was added, document it clearly.
6. Return the COMPLETE updated documentation in Markdown format.
7. Do not include any extra commentary, only the updated content.
8. If no changes are needed to the documentation, return the ORIGINAL content exactly.`;

/**
 * ========================================================================
 * ENHANCEMENT PROMPTS
 * ========================================================================
 * Note: Enhancement prompts are already defined in enhancement.ts
 * We import and re-export them here for consistency
 */

/**
 * Default Enhancement prompts (from libs/prompts/src/enhancement.ts)
 */
export const DEFAULT_ENHANCEMENT_PROMPTS: ResolvedEnhancementPrompts = {
  improveSystemPrompt: IMPROVE_SYSTEM_PROMPT,
  technicalSystemPrompt: TECHNICAL_SYSTEM_PROMPT,
  simplifySystemPrompt: SIMPLIFY_SYSTEM_PROMPT,
  acceptanceSystemPrompt: ACCEPTANCE_SYSTEM_PROMPT,
  wikiUpdateTemplate: DEFAULT_WIKI_UPDATE_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * COMBINED DEFAULTS
 * ========================================================================
 */

/**
 * All default prompts in one object for easy access
 */
export const DEFAULT_PROMPTS = {
  autoMode: DEFAULT_AUTO_MODE_PROMPTS,
  agent: DEFAULT_AGENT_PROMPTS,
  backlogPlan: DEFAULT_BACKLOG_PLAN_PROMPTS,
  enhancement: DEFAULT_ENHANCEMENT_PROMPTS,
  wikiUpdate: {
    template: DEFAULT_WIKI_UPDATE_PROMPT_TEMPLATE,
  },
} as const;
