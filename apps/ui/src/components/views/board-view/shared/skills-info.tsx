/**
 * Skills Information Component
 *
 * Displays information about skill auto-selection in feature dialogs
 */

import { Info, BookOpen, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/app-store';
import { useNavigate } from '@tanstack/react-router';

interface MatchedSkill {
  id: string;
  name: string;
  description: string;
  score: number;
  scope: 'global' | 'project';
  tags?: string[];
}

interface SkillsInfoProps {
  /** Whether skills auto-load is enabled in settings */
  enabled?: boolean;
  /** Number of available global skills */
  globalSkillsCount?: number;
  /** Number of available project skills */
  projectSkillsCount?: number;
  /** Matched skills from preview */
  matchedSkills?: MatchedSkill[];
  /** Whether preview is loading */
  isLoadingPreview?: boolean;
}

export function SkillsInfo({
  enabled = true,
  globalSkillsCount = 0,
  projectSkillsCount = 0,
  matchedSkills,
  isLoadingPreview = false,
}: SkillsInfoProps) {
  const navigate = useNavigate();
  const totalSkills = globalSkillsCount + projectSkillsCount;
  const [expanded, setExpanded] = useState(false);

  const handleManageClick = () => {
    navigate({ to: '/settings', search: { tab: 'skills' } });
  };

  if (!enabled || totalSkills === 0) {
    return null;
  }

  const hasMatches = matchedSkills && matchedSkills.length > 0;

  return (
    <Alert
      className={
        hasMatches ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30'
      }
    >
      {hasMatches ? (
        <Sparkles className="h-4 w-4 text-green-500" />
      ) : (
        <BookOpen className="h-4 w-4 text-blue-500" />
      )}
      <AlertDescription className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {hasMatches ? (
              <>
                <strong className="text-foreground">
                  {matchedSkills.length} skill{matchedSkills.length !== 1 ? 's' : ''}
                </strong>{' '}
                matched from {totalSkills} available ({globalSkillsCount} global,{' '}
                {projectSkillsCount} project)
              </>
            ) : (
              <>
                <strong className="text-foreground">
                  {totalSkills} skill{totalSkills !== 1 ? 's' : ''}
                </strong>{' '}
                available ({globalSkillsCount} global, {projectSkillsCount} project).
                {isLoadingPreview ? ' Analyzing...' : ' Will auto-select based on description.'}
              </>
            )}
          </span>
          <div className="flex gap-1">
            {hasMatches && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleManageClick}>
              Manage
            </Button>
          </div>
        </div>

        {hasMatches && expanded && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            {matchedSkills.map((skill) => (
              <div key={skill.id} className="flex items-start gap-2 text-xs">
                <Badge
                  variant={skill.scope === 'global' ? 'default' : 'secondary'}
                  className="mt-0.5"
                >
                  {skill.scope}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">{skill.name}</div>
                  <div className="text-muted-foreground truncate">{skill.description}</div>
                  {skill.tags && skill.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {Math.round(skill.score * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
