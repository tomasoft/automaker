import { Server, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface LocalLlmStatus {
  installed: boolean;
  authenticated: boolean;
  hasApiKey: boolean;
  method: string;
  error?: string;
}

interface LocalLlmCliStatusProps {
  status: LocalLlmStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function LocalLlmCliStatus({ status, isChecking, onRefresh }: LocalLlmCliStatusProps) {
  const isConnected = status?.installed && status?.authenticated;
  const hasError = status?.error;

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200',
                isConnected
                  ? 'bg-green-500/20 border border-green-500/30'
                  : hasError
                    ? 'bg-red-500/20 border border-red-500/30'
                    : 'bg-gray-500/20 border border-gray-500/30'
              )}
            >
              <Server
                className={cn(
                  'w-6 h-6',
                  isConnected ? 'text-green-500' : hasError ? 'text-red-500' : 'text-gray-500'
                )}
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Local LLM Server</h3>
              <p className="text-sm text-muted-foreground">
                {isConnected
                  ? 'Connected and ready'
                  : hasError
                    ? 'Not connected'
                    : 'Checking connection...'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isChecking}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isChecking && 'animate-spin')} />
            Check Status
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Connection Status */}
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl',
            'border transition-colors duration-200',
            isConnected
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-gray-500/10 border-gray-500/30'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200',
              isConnected
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-gray-500/20 border border-gray-500/30'
            )}
          >
            {isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">
              {isConnected ? 'Server Connected' : 'Server Not Connected'}
            </div>
            <div className="text-xs text-muted-foreground/70">
              {isConnected
                ? 'Local LLM server is running and accessible'
                : 'Start LM Studio server on http://localhost:1234'}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {hasError && (
          <div
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl',
              'border bg-red-500/10 border-red-500/30'
            )}
          >
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm text-foreground">Connection Error</div>
              <div className="text-xs text-red-400/90 mt-1">{status.error}</div>
            </div>
          </div>
        )}

        {/* Endpoint Info */}
        {isConnected && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="text-xs text-blue-400/90">
              <span className="font-medium">Endpoint:</span> http://localhost:1234/v1
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
