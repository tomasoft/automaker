import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useCliStatus } from '../hooks/use-cli-status';
import { ClaudeCliStatus } from '../cli-status/claude-cli-status';
import { ClaudeMdSettings } from '../claude/claude-md-settings';
import { ClaudeUsageSection } from '../api-keys/claude-usage-section';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function ClaudeSettingsTab() {
  const {
    apiKeys,
    autoLoadClaudeMd,
    setAutoLoadClaudeMd,
    enableSandboxMode,
    setEnableSandboxMode,
    isClaudeEnabled,
    setClaudeEnabled,
  } = useAppStore();
  const { claudeAuthStatus } = useSetupStore();

  // Use CLI status hook
  const { claudeCliStatus, isCheckingClaudeCli, handleRefreshClaudeCli } = useCliStatus();

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const showUsageTracking = !apiKeys.anthropic && !isWindows;

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
        <Label htmlFor="claude-enabled" className="text-base font-medium">
          Provider Enabled
        </Label>
        <Switch id="claude-enabled" checked={isClaudeEnabled} onCheckedChange={setClaudeEnabled} />
      </div>

      {isClaudeEnabled && (
        <>
          <ClaudeCliStatus
            status={claudeCliStatus}
            authStatus={claudeAuthStatus}
            isChecking={isCheckingClaudeCli}
            onRefresh={handleRefreshClaudeCli}
          />
          <ClaudeMdSettings
            autoLoadClaudeMd={autoLoadClaudeMd}
            onAutoLoadClaudeMdChange={setAutoLoadClaudeMd}
            enableSandboxMode={enableSandboxMode}
            onEnableSandboxModeChange={setEnableSandboxMode}
          />
          {showUsageTracking && <ClaudeUsageSection />}
        </>
      )}
    </div>
  );
}

export default ClaudeSettingsTab;
