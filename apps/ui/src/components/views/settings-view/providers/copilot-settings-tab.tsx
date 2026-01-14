import { useState, useEffect } from 'react';
import { ExternalLink, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useCopilotStatus } from '../hooks/use-copilot-status';
import { CopilotCliStatus, CopilotCliStatusSkeleton } from '../cli-status/copilot-cli-status';
import { CopilotModelConfiguration } from './copilot-model-configuration';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from '@tanstack/react-router';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

export function CopilotSettingsTab() {
  const { status, isLoading, loadData } = useCopilotStatus();
  const navigate = useNavigate();
  const { enabledCopilotModels, toggleCopilotModel, isCopilotEnabled, setCopilotEnabled } =
    useAppStore();
  const [planInfo, setPlanInfo] = useState<{
    plan: 'free' | 'pro' | 'pro+' | 'business' | 'enterprise';
    organization?: string;
  } | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleRunSetup = () => {
    navigate({ to: '/setup', search: { step: 'copilot' } });
  };

  // Load plan info when authenticated
  useEffect(() => {
    const loadPlanInfo = async () => {
      if (status?.authenticated || status?.hasApiKey) {
        console.log('[CopilotSettings] Loading plan info...');
        setIsLoadingPlan(true);
        try {
          const api = getHttpApiClient();
          const result = await api.setup.getCopilotPlan();
          console.log('[CopilotSettings] Plan API result:', result);
          if (result.success && result.plan) {
            console.log('[CopilotSettings] Setting plan info:', result.plan);
            setPlanInfo({
              plan: result.plan,
              organization: result.organization,
            });
          } else {
            console.warn('[CopilotSettings] No plan found or error:', result.error);
          }
        } catch (error) {
          console.error('[CopilotSettings] Failed to load plan info:', error);
        } finally {
          setIsLoadingPlan(false);
        }
      } else {
        console.log('[CopilotSettings] Not authenticated, clearing plan info');
        setPlanInfo(null);
      }
    };

    loadPlanInfo();
  }, [status?.authenticated, status?.hasApiKey]);

  const handleModelToggle = (modelId: string, enabled: boolean) => {
    setIsSaving(true);
    try {
      toggleCopilotModel(modelId, enabled);
      toast.success(enabled ? 'Model enabled' : 'Model disabled');
    } catch (error) {
      toast.error('Failed to update model');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !status) {
    return (
      <div className="space-y-6">
        <CopilotCliStatusSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
        <Label htmlFor="copilot-enabled" className="text-base font-medium">
          Provider Enabled
        </Label>
        <Switch
          id="copilot-enabled"
          checked={isCopilotEnabled}
          onCheckedChange={setCopilotEnabled}
        />
      </div>

      {/* Account Type Badge */}
      {isCopilotEnabled && (status?.authenticated || status?.hasApiKey) && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/20">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">
                {planInfo?.organization ? 'Business Account' : 'Individual Account'}
              </span>
            </div>
            {planInfo?.organization && (
              <div className="text-sm text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
                {planInfo.organization}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleRunSetup} variant="outline" size="sm">
              Re-authenticate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open('https://github.com/settings/copilot', '_blank', 'noopener')
              }
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Manage Subscription
            </Button>
          </div>
        </div>
      )}

      {isCopilotEnabled && (
        <>
          <CopilotCliStatus
            status={status}
            isChecking={isLoading}
            onRefresh={loadData}
            enabledModels={enabledCopilotModels}
          />

          {/* Setup Instructions */}
          {!status?.authenticated && !status?.hasApiKey && (
            <div className="rounded-2xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-xl">
              <div className="p-6 border-b border-border/50">
                <h3 className="text-lg font-semibold text-foreground tracking-tight mb-1">
                  Get Started
                </h3>
                <p className="text-sm text-muted-foreground/80">
                  Authenticate with your GitHub account to use Copilot models
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex flex-col gap-3">
                  <Button onClick={handleRunSetup} className="w-full" size="lg">
                    Run Setup Wizard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      window.open('https://github.com/features/copilot', '_blank', 'noopener')
                    }
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Learn About GitHub Copilot
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground/70 space-y-2">
                  <p className="font-medium">Requirements:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Active GitHub account</li>
                    <li>GitHub Copilot subscription (individual, business, or enterprise)</li>
                    <li>Internet connection for authentication</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Model Configuration */}
          {(status?.authenticated || status?.hasApiKey) && (
            <CopilotModelConfiguration
              enabledModels={enabledCopilotModels}
              onModelToggle={handleModelToggle}
              isSaving={isSaving}
            />
          )}
        </>
      )}
    </div>
  );
}

export default CopilotSettingsTab;
