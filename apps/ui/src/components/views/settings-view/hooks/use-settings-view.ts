import { useState, useCallback } from 'react';

export type SettingsViewId =
  | 'providers'
  | 'mcp-servers'
  | 'prompts'
  | 'model-defaults'
  | 'appearance'
  | 'terminal'
  | 'keyboard'
  | 'audio'
  | 'defaults'
  | 'wiki-sources'
  | 'branch-analysis'
  | 'skills'
  | 'danger'
  | 'claude'; // Keep for backwards compatibility

interface UseSettingsViewOptions {
  initialView?: SettingsViewId;
}

export function useSettingsView({ initialView = 'providers' }: UseSettingsViewOptions = {}) {
  const [activeView, setActiveView] = useState<SettingsViewId>(initialView);

  const navigateTo = useCallback((viewId: SettingsViewId) => {
    setActiveView(viewId);
  }, []);

  return {
    activeView,
    navigateTo,
  };
}
