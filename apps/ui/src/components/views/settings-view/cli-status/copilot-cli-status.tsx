import { Button } from '@/components/ui/button';
import { Github, CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CopilotStatus } from '@automaker/types';

interface CopilotCliStatusProps {
  status: CopilotStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
  enabledModels?: string[];
  disabled?: boolean;
}

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted/50 rounded', className)} />;
}

export function CopilotCliStatusSkeleton() {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-9 h-9 rounded-xl" />
            <SkeletonPulse className="h-6 w-28" />
          </div>
          <SkeletonPulse className="w-9 h-9 rounded-lg" />
        </div>
        <div className="ml-12">
          <SkeletonPulse className="h-4 w-72" />
        </div>
      </div>
      <div className="p-6 space-y-4">
        {/* Installation status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-36" />
            <SkeletonPulse className="h-3 w-28" />
          </div>
        </div>
        {/* Auth status skeleton */}
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-muted/10">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-28" />
            <SkeletonPulse className="h-3 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CopilotCliStatus({
  status,
  isChecking,
  onRefresh,
  enabledModels = [],
  disabled,
}: CopilotCliStatusProps) {
  const isAuthenticated = status?.authenticated || status?.hasApiKey;

  // Format model names for display with provider prefix
  const formatModelName = (modelId: string) => {
    let provider = '';
    let name = modelId;

    // Determine provider and format name
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.includes('raptor')) {
      provider = 'OpenAI';
      name = modelId.replace(/^gpt-/i, '');
    } else if (modelId.startsWith('claude-')) {
      provider = 'Anthropic';
      name = modelId.replace(/^claude-/i, '');
    } else if (modelId.startsWith('gemini-')) {
      provider = 'Google';
      name = modelId.replace(/^gemini-/i, '');
    } else if (modelId.startsWith('grok-')) {
      provider = 'xAI';
      name = modelId.replace(/^grok-/i, '');
    } else {
      // Fallback for unknown models
      provider = 'Unknown';
    }

    // Capitalize and format the model name
    const formattedName = name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `${provider} ${formattedName}`;
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-500/20 to-slate-600/10 flex items-center justify-center border border-slate-500/20">
              <Github className="w-5 h-5 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">GitHub Copilot</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isChecking}
            className="h-9 w-9 p-0"
          >
            <RefreshCw className={cn('w-4 h-4', isChecking && 'animate-spin')} />
          </Button>
        </div>
        <p className="ml-12 text-sm text-muted-foreground/80">
          Access GitHub Copilot models (GPT-4o, Claude 3.5 Sonnet, o1-preview, and more)
        </p>
      </div>

      {/* Status Grid */}
      <div className="p-6 space-y-4">
        {/* Installation Status */}
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl',
            'border transition-colors duration-200',
            status?.installed
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-muted/10 border-border/30'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200',
              status?.installed
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-muted/50 border border-border/30'
            )}
          >
            {status?.installed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">
              {status?.installed ? 'Installed' : 'Not Installed'}
            </div>
            <div className="text-xs text-muted-foreground/70">
              {status?.method === 'sdk' ? 'Using copilot-api SDK' : 'Direct GitHub API'}
            </div>
          </div>
        </div>

        {/* Authentication Status */}
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl',
            'border transition-colors duration-200',
            isAuthenticated
              ? 'bg-green-500/10 border-green-500/30'
              : status?.error
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-muted/10 border-border/30'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200',
              isAuthenticated
                ? 'bg-green-500/20 border border-green-500/30'
                : status?.error
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-muted/50 border border-border/30'
            )}
          >
            {isAuthenticated ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : status?.error ? (
              <AlertCircle className="w-5 h-5 text-red-500" />
            ) : (
              <XCircle className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">
              {isAuthenticated ? 'Authenticated' : status?.error ? 'Error' : 'Not Authenticated'}
            </div>
            <div className="text-xs text-muted-foreground/70">
              {status?.error || (isAuthenticated ? 'Ready to use' : 'Run setup to authenticate')}
            </div>
          </div>
        </div>

        {/* Selected Models - Show when authenticated */}
        {isAuthenticated && enabledModels.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
            <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
              Selected Models ({enabledModels.length}):
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {enabledModels.slice(0, 8).map((modelId) => (
                <div key={modelId} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
                  {formatModelName(modelId)}
                </div>
              ))}
            </div>
            {enabledModels.length > 8 && (
              <div className="text-xs text-muted-foreground/70 mt-2">
                + {enabledModels.length - 8} more
              </div>
            )}
          </div>
        )}
        {isAuthenticated && enabledModels.length === 0 && (
          <div className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">
              No Models Selected
            </div>
            <div className="text-xs text-yellow-600/70 dark:text-yellow-400/70">
              Enable models in the configuration below
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CopilotCliStatus;
