/**
 * Skills Loader Service
 *
 * Discovers SKILL.md files from global and project directories,
 * parses YAML frontmatter, scores relevance using TF-IDF,
 * and resolves wiki placeholders.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { createLogger } from '@automaker/utils';
import { getAllowedRootDirectory } from '@automaker/platform';
import type { SkillDefinition, GlobalSettings, ProjectSettings } from '@automaker/types';
import type { WikiService } from './wiki-service.js';

const logger = createLogger('SkillsLoader');

/**
 * Loaded skill with resolved content
 */
export interface LoadedSkill extends SkillDefinition {
  /** Relevance score (0.0-1.0) */
  score: number;
  /** Resolved content (after wiki placeholders) */
  resolvedContent: string;
}

/**
 * Skills loading result
 */
interface SkillsLoadResult {
  /** Auto-selected skills */
  skills: LoadedSkill[];
  /** Wiki pages used */
  wikiPagesUsed: Array<{ path: string; title: string; isCached: boolean; isStale: boolean }>;
  /** Warnings during loading */
  warnings: string[];
}

/**
 * SKILL.md frontmatter
 */
interface SkillFrontmatter {
  name: string;
  description: string;
  tags?: string[];
  license?: string;
}

/**
 * Skills Loader Service
 */
export class SkillsLoaderService {
  private readonly GLOBAL_SKILLS_DIR: string;

  constructor(
    private globalSettings: GlobalSettings,
    private projectSettings: ProjectSettings | undefined,
    private projectPath: string,
    private dataDir: string,
    private wikiService: WikiService | undefined
  ) {
    // Global skills directory: Use ALLOWED_ROOT_DIRECTORY (base projects dir) if set,
    // otherwise fall back to dataDir (userData)
    const baseDir = getAllowedRootDirectory() || this.dataDir;
    this.GLOBAL_SKILLS_DIR = path.join(baseDir, 'skills');

    logger.debug(`Global skills directory: ${this.GLOBAL_SKILLS_DIR}`);
  }

  /**
   * Load and auto-select skills based on user message
   */
  async loadSkills(
    userMessage: string,
    options: {
      maxSkills: number;
      similarityThreshold: number;
      disabledSkills?: string[];
    }
  ): Promise<SkillsLoadResult> {
    const warnings: string[] = [];

    try {
      // Discover all available skills
      const allSkills = await this.discoverSkills();

      if (allSkills.length === 0) {
        logger.debug('No skills found');
        return { skills: [], wikiPagesUsed: [], warnings: [] };
      }

      // Filter out disabled skills
      const enabledSkills = allSkills.filter(
        (skill) => !options.disabledSkills?.includes(skill.id)
      );

      // Score skills by relevance to user message
      const scoredSkills = this.scoreSkills(enabledSkills, userMessage);

      // Filter by similarity threshold and take top N
      const selectedSkills = scoredSkills
        .filter((skill) => skill.score >= options.similarityThreshold)
        .slice(0, options.maxSkills);

      if (selectedSkills.length === 0) {
        logger.debug('No skills matched similarity threshold');
        return { skills: [], wikiPagesUsed: [], warnings: [] };
      }

      // Resolve wiki placeholders in parallel
      const wikiPagesUsed: Array<{
        path: string;
        title: string;
        isCached: boolean;
        isStale: boolean;
      }> = [];
      const loadedSkills = await Promise.all(
        selectedSkills.map(async (skill) => {
          if (!this.wikiService) {
            return { ...skill, resolvedContent: skill.content };
          }

          const {
            resolvedContent,
            wikiPagesUsed: pages,
            hasErrors,
          } = await this.wikiService.resolvePlaceholders(skill.content);

          if (hasErrors) {
            warnings.push(`Errors resolving wiki placeholders in skill: ${skill.name}`);
          }

          // Collect wiki pages used
          wikiPagesUsed.push(
            ...pages.map((p) => ({
              path: p.reference,
              title: p.reference.split('/').pop() || p.reference, // Use last path segment as title
              isCached: p.isCached,
              isStale: p.isStale,
            }))
          );

          return {
            ...skill,
            resolvedContent,
          };
        })
      );

      logger.info(
        `Loaded ${loadedSkills.length} skills (top scores: ${loadedSkills.map((s) => s.score.toFixed(2)).join(', ')})`
      );

      return {
        skills: loadedSkills,
        wikiPagesUsed,
        warnings,
      };
    } catch (error) {
      logger.error('Failed to load skills', error);
      return {
        skills: [],
        wikiPagesUsed: [],
        warnings: [
          `Failed to load skills: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Discover all SKILL.md files from global and project directories
   */
  private async discoverSkills(): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    // Load global skills (from base directory)
    const globalSkills = await this.loadSkillsFromDirectory(this.GLOBAL_SKILLS_DIR, 'global');
    skills.push(...globalSkills);

    // Load project skills (skills/, .automaker/skills/, and .github/skills/)
    if (this.projectPath) {
      const projectSkillsDirs = [
        path.join(this.projectPath, 'skills'), // Top-level skills directory
        path.join(this.projectPath, '.automaker', 'skills'), // Hidden in .automaker
        path.join(this.projectPath, '.github', 'skills'), // GitHub Copilot compatible
      ];

      for (const dir of projectSkillsDirs) {
        const projectSkills = await this.loadSkillsFromDirectory(dir, 'project');

        // Project skills override global skills with the same ID
        for (const projectSkill of projectSkills) {
          const globalIndex = skills.findIndex((s) => s.id === projectSkill.id);
          if (globalIndex >= 0) {
            skills[globalIndex] = projectSkill; // Override
            logger.debug(`Project skill overrides global: ${projectSkill.id}`);
          } else {
            skills.push(projectSkill);
          }
        }
      }
    }

    return skills;
  }

  /**
   * Load skills from a directory
   */
  private async loadSkillsFromDirectory(
    dir: string,
    scope: 'global' | 'project'
  ): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    try {
      if (!fs.existsSync(dir)) {
        return skills;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = path.join(dir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        try {
          const skill = await this.loadSkillFile(skillPath, entry.name, scope);
          skills.push(skill);
        } catch (error) {
          logger.warn(`Failed to load skill: ${skillPath}`, error);
        }
      }

      logger.debug(`Loaded ${skills.length} ${scope} skills from ${dir}`);
    } catch (error) {
      logger.warn(`Failed to read skills directory: ${dir}`, error);
    }

    return skills;
  }

  /**
   * Load and parse a SKILL.md file
   */
  private async loadSkillFile(
    filePath: string,
    skillId: string,
    scope: 'global' | 'project'
  ): Promise<SkillDefinition> {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md format: missing YAML frontmatter');
    }

    const frontmatterYaml = frontmatterMatch[1];
    const markdownContent = frontmatterMatch[2].trim();

    const frontmatter = yaml.load(frontmatterYaml) as SkillFrontmatter;

    if (!frontmatter.name || !frontmatter.description) {
      throw new Error('Invalid SKILL.md: missing required fields (name, description)');
    }

    return {
      id: skillId,
      name: frontmatter.name,
      description: frontmatter.description,
      scope,
      tags: frontmatter.tags || [],
      license: frontmatter.license,
      content: markdownContent,
      filePath,
      enabled: true,
    };
  }

  /**
   * Score skills by relevance using simple TF-IDF
   */
  private scoreSkills(skills: SkillDefinition[], query: string): LoadedSkill[] {
    const queryWords = this.tokenize(query);

    return skills
      .map((skill) => {
        const skillText = `${skill.description} ${skill.tags?.join(' ') || ''}`;
        const score = this.calculateSimilarity(queryWords, this.tokenize(skillText));

        return {
          ...skill,
          score,
          resolvedContent: skill.content, // Will be updated later
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate cosine similarity using simple word overlap
   */
  private calculateSimilarity(queryWords: string[], skillWords: string[]): number {
    if (queryWords.length === 0 || skillWords.length === 0) {
      return 0;
    }

    // Count common words
    const querySet = new Set(queryWords);
    const skillSet = new Set(skillWords);
    const intersection = new Set([...querySet].filter((w) => skillSet.has(w)));

    // Jaccard similarity (simple but effective)
    const union = new Set([...querySet, ...skillSet]);
    return intersection.size / union.size;
  }

  /**
   * Tokenize text into lowercase words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter((word) => word.length > 2); // Filter out short words
  }

  /**
   * Format skills for system prompt injection
   */
  formatSkillsForPrompt(skills: LoadedSkill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const formattedSkills = skills
      .map((skill) => {
        return `## Skill: ${skill.name}\n\n${skill.resolvedContent}\n`;
      })
      .join('\n---\n\n');

    return `# Available Skills\n\nThe following skills are relevant to your current task:\n\n${formattedSkills}`;
  }
}
