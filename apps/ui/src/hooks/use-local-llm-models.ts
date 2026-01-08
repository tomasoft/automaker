import { useState, useEffect } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';

interface LocalLlmModel {
  id: string;
  label: string;
  description: string;
  provider: string;
  contextWindow: number;
}

export function useLocalLlmModels() {
  const [models, setModels] = useState<LocalLlmModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const api = getHttpApiClient();
        const result = await api.localLlm.getModels();

        if (result.success && result.models) {
          setModels(result.models);
        } else {
          setError(result.error || 'Failed to fetch models');
        }
      } catch (err) {
        console.error('[useLocalLlmModels] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch models');
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  return { models, isLoading, error };
}
