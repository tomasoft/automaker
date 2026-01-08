import { useState, useEffect } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';

interface LocalLlmStatus {
  installed: boolean;
  authenticated: boolean;
  hasApiKey: boolean;
  method: string;
  error?: string;
}

export function useLocalLlmStatus() {
  const [status, setStatus] = useState<LocalLlmStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      const result = await api.localLlm.getStatus();

      if (result.success) {
        setStatus({
          installed: result.installed,
          authenticated: result.authenticated,
          hasApiKey: result.hasApiKey,
          method: result.method,
          error: result.error,
        });
      } else {
        setStatus({
          installed: false,
          authenticated: false,
          hasApiKey: false,
          method: 'local',
          error: result.error || 'Failed to check status',
        });
      }
    } catch (error) {
      console.error('[useLocalLlmStatus] Error:', error);
      setStatus({
        installed: false,
        authenticated: false,
        hasApiKey: false,
        method: 'local',
        error: error instanceof Error ? error.message : 'Failed to check status',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return { status, isLoading, loadData };
}
