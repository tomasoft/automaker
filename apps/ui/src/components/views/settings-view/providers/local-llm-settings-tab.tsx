import { useState } from 'react';
import { Info, RefreshCw, Server, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { LocalLlmCliStatus } from '../cli-status/local-llm-cli-status';
import { LocalLlmModelConfiguration } from './local-llm-model-configuration';
import { useLocalLlmStatus } from '../hooks/use-local-llm-status';
import { useAppStore } from '@/store/app-store';

export function LocalLlmSettingsTab() {
  const { status, isLoading, loadData } = useLocalLlmStatus();
  const { isLocalLlmEnabled, setLocalLlmEnabled } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      toast.success('Local LLM status refreshed');
    } catch (error) {
      toast.error('Failed to refresh status');
    } finally {
      setIsRefreshing(false);
    }
  };

  const isConnected = status?.installed && status?.authenticated;

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
        <Label htmlFor="local-llm-enabled" className="text-base font-medium">
          Provider Enabled
        </Label>
        <Switch
          id="local-llm-enabled"
          checked={isLocalLlmEnabled}
          onCheckedChange={setLocalLlmEnabled}
        />
      </div>

      {isLocalLlmEnabled && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Local LLM</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Run AI models on your own hardware via LM Studio, Ollama, or vLLM
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
          {/* CLI Status */}
          <LocalLlmCliStatus status={status} isChecking={isLoading} onRefresh={loadData} />

          {/* Info Banner */}
          <div
            className={cn(
              'rounded-2xl overflow-hidden',
              'border border-border/50',
              'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl'
            )}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground flex-1">
                  <span className="font-medium text-foreground">Getting Started:</span>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>
                      Download and install{' '}
                      <a
                        href="https://lmstudio.ai/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        LM Studio
                      </a>
                    </li>
                    <li>Download a coding model (e.g., Qwen2.5-Coder-32B)</li>
                    <li>Start the local server in LM Studio (port 1234)</li>
                    <li>Refresh this page to see available models</li>
                    <li>Enable models you want to use in AutoMaker</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Setup Instructions (when not connected) */}
          {!isConnected && (
            <div
              className={cn(
                'rounded-2xl overflow-hidden',
                'border border-amber-500/20',
                'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent'
              )}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Setup Required</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-amber-500">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Install LM Studio</p>
                      <p>
                        Download from{' '}
                        <a
                          href="https://lmstudio.ai/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          lmstudio.ai
                        </a>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-amber-500">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Download a Model</p>
                      <p>Search for "qwen2.5-coder-32b" or "deepseek-coder" in LM Studio</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-amber-500">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Start Local Server</p>
                      <p>
                        Click the "Local Server" tab in LM Studio and start the server (port 1234)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Model Configuration (when connected) */}
          {isConnected && <LocalLlmModelConfiguration />}
        </>
      )}
    </div>
  );
}

export default LocalLlmSettingsTab;
