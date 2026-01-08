import { useState, useEffect, useCallback } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useSetupStore } from '@/store/setup-store';
import type { CopilotStatus } from '@automaker/types';

export function useCopilotStatus() {
  const { copilotStatus: storeStatus, setCopilotStatus } = useSetupStore();
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      const result = await api.setup.getCopilotStatus();

      if (result.success) {
        const status: CopilotStatus = {
          installed: result.installed ?? false,
          authenticated: result.authenticated ?? false,
          hasApiKey: result.hasApiKey ?? false,
          method: result.method || 'sdk',
          error: result.error,
        };
        setCopilotStatus(status);
        console.debug('[useCopilotStatus] GitHub Copilot status loaded:', status);
        return status;
      } else {
        console.error('[useCopilotStatus] Failed to load GitHub Copilot status:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[useCopilotStatus] Error loading GitHub Copilot status:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [setCopilotStatus]);

  // Load on mount if not already loaded
  useEffect(() => {
    if (!storeStatus) {
      loadData();
    }
  }, [storeStatus, loadData]);

  return {
    status: storeStatus,
    isLoading,
    loadData,
  };
}
