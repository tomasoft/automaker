import { useEffect, useRef } from 'react';
import { useSetupStore } from '@/store/setup-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook to initialize GitHub Copilot status on app startup.
 * This ensures the copilotStatus is available in the setup store
 * before the user opens feature dialogs.
 */
export function useCopilotStatusInit() {
  const { setCopilotStatus, copilotStatus } = useSetupStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once per session
    if (initialized.current || copilotStatus !== null) {
      return;
    }
    initialized.current = true;

    const initCopilotStatus = async () => {
      try {
        const api = getHttpApiClient();
        const statusResult = await api.setup.getCopilotStatus();

        if (statusResult.success) {
          setCopilotStatus({
            installed: statusResult.installed ?? false,
            authenticated: statusResult.authenticated ?? false,
            hasApiKey: statusResult.hasApiKey ?? false,
            method: statusResult.method ?? 'none',
          });
        }
      } catch (error) {
        // Silently fail - copilot is optional
        console.debug('[CopilotStatusInit] Failed to check copilot status:', error);
      }
    };

    initCopilotStatus();
  }, [setCopilotStatus, copilotStatus]);
}
