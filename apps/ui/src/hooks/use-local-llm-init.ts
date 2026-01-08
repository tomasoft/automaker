import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useLocalLlmModels } from './use-local-llm-models';

/**
 * Initialize Local LLM models on first load
 * This runs once globally to auto-enable models when the app first starts
 */
export function useLocalLlmInit() {
  const {
    enabledLocalLlmModels,
    seenLocalLlmModels,
    setEnabledLocalLlmModels,
    updateSeenLocalLlmModels,
  } = useAppStore();
  const { models, isLoading } = useLocalLlmModels();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (hasInitialized.current || isLoading || models.length === 0) {
      return;
    }

    const modelIds = models.map((m) => m.id);

    // If this is the first time seeing any Local LLM models, auto-enable them all
    if (enabledLocalLlmModels.length === 0 && seenLocalLlmModels.length === 0) {
      setEnabledLocalLlmModels(modelIds);
      updateSeenLocalLlmModels(modelIds);
      hasInitialized.current = true;
    } else {
      // Just update seen models if we already have some enabled
      if (modelIds.length > 0 && seenLocalLlmModels.length === 0) {
        updateSeenLocalLlmModels(modelIds);
      }
      hasInitialized.current = true;
    }
  }, [models, isLoading, enabledLocalLlmModels.length, seenLocalLlmModels.length]);
}
