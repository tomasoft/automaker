/**
 * Skills Loaded Banner Component
 *
 * Displays a collapsible notification when skills are auto-loaded for an agent conversation.
 * Shows which skills were selected, their similarity scores, and cache status.
 *
 * TODO Integration:
 * 1. Listen for 'skills_loaded' events from agent stream in agent-view/components/chat-area.tsx
 * 2. Extract loaded skills metadata from event payload
 * 3. Display this component above the agent's response message
 * 4. Add cache status icons (✓ fresh, ⚠️ cached with age, ⚠️ offline fallback)
 * 5. Link skill names to preview modal showing SKILL.md content
 * 6. Show warning badge if wiki content is stale (>7 days)
 *
 * Event structure:
 * {
 *   type: 'skills_loaded',
 *   skills: LoadedSkill[],
 *   wikiPagesUsed: Array<{path, title, isCached, isStale, lastFetched}>,
 *   warnings: string[]
 * }
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  score: number;
  tags?: string[];
  filePath: string;
}

export interface WikiPageUsed {
  path: string;
  title: string;
  isCached: boolean;
  isStale: boolean;
  lastFetched?: string;
}

export interface SkillsLoadedBannerProps {
  skills: LoadedSkill[];
  wikiPagesUsed: WikiPageUsed[];
  warnings?: string[];
  onSkillClick?: (skill: LoadedSkill) => void;
}

export function SkillsLoadedBanner({
  skills,
  wikiPagesUsed,
  warnings = [],
  onSkillClick,
}: SkillsLoadedBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (skills.length === 0) {
    return null;
  }

  const hasWarnings = warnings.length > 0 || wikiPagesUsed.some((page) => page.isStale);

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Using {skills.length} skill{skills.length > 1 ? 's' : ''}
              </span>
              {hasWarnings && (
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Expanded Content */}
          {isExpanded && (
            <div className="space-y-3">
              {/* Skills List */}
              <div className="space-y-2">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950/40 p-2"
                  >
                    <button className="flex-1 text-left" onClick={() => onSkillClick?.(skill)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {skill.name}
                        </span>
                        {skill.tags && skill.tags.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {skill.tags[0]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        {skill.description}
                      </p>
                    </button>
                    <div className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      {Math.round(skill.score * 100)}% match
                    </div>
                  </div>
                ))}
              </div>

              {/* Wiki Pages Used */}
              {wikiPagesUsed.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                    Wiki pages referenced:
                  </p>
                  <div className="space-y-1">
                    {wikiPagesUsed.map((page, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300"
                      >
                        {page.isStale ? (
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                        ) : page.isCached ? (
                          <Clock className="h-3 w-3 text-blue-600" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        )}
                        <span>{page.title}</span>
                        {page.isStale && page.lastFetched && (
                          <span className="text-amber-600">
                            (cached{' '}
                            {Math.round(
                              (Date.now() - new Date(page.lastFetched).getTime()) /
                                (1000 * 60 * 60 * 24)
                            )}
                            d ago)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-1">
                  {warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
