import { useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import type { CursorModelId } from '@automaker/types';
import {
  CursorCliStatus,
  CursorCliStatusSkeleton,
  CursorPermissionsSkeleton,
  ModelConfigSkeleton,
} from '../cli-status/cursor-cli-status';
import { useCursorStatus } from '../hooks/use-cursor-status';
import { useCursorPermissions } from '../hooks/use-cursor-permissions';
import { CursorPermissionsSection } from './cursor-permissions-section';
import { CursorModelConfiguration } from './cursor-model-configuration';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function CursorSettingsTab() {
  // Global settings from store
  const {
    enabledCursorModels,
    cursorDefaultModel,
    setCursorDefaultModel,
    toggleCursorModel,
    currentProject,
    isCursorEnabled,
    setCursorEnabled,
  } = useAppStore();

  // Custom hooks for data fetching
  const { status, isLoading, loadData } = useCursorStatus();
  const {
    permissions,
    isLoadingPermissions,
    isSavingPermissions,
    copiedConfig,
    loadPermissions,
    applyProfile,
    copyConfig,
  } = useCursorPermissions(currentProject?.path);

  // Local state for model configuration saving
  const [isSaving, setIsSaving] = useState(false);

  const handleDefaultModelChange = (model: CursorModelId) => {
    setIsSaving(true);
    try {
      setCursorDefaultModel(model);
      toast.success('Default model updated');
    } catch (error) {
      toast.error('Failed to update default model');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelToggle = (model: CursorModelId, enabled: boolean) => {
    setIsSaving(true);
    try {
      toggleCursorModel(model, enabled);
    } catch (error) {
      toast.error('Failed to update models');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/50">
        <Label htmlFor="cursor-enabled" className="text-base font-medium">
          Provider Enabled
        </Label>
        <Switch id="cursor-enabled" checked={isCursorEnabled} onCheckedChange={setCursorEnabled} />
      </div>

      {isCursorEnabled && (
        <>
          {/* CLI Status */}
          <CursorCliStatus status={status} isChecking={isLoading} onRefresh={loadData} />

          {/* CLI Permissions Section */}
          <CursorPermissionsSection
            status={status}
            permissions={permissions}
            isLoadingPermissions={isLoadingPermissions}
            isSavingPermissions={isSavingPermissions}
            copiedConfig={copiedConfig}
            currentProject={currentProject}
            onApplyProfile={applyProfile}
            onCopyConfig={copyConfig}
            onLoadPermissions={loadPermissions}
          />

          {/* Model Configuration - Always show (global settings) */}
          {status?.installed && (
            <CursorModelConfiguration
              enabledCursorModels={enabledCursorModels}
              cursorDefaultModel={cursorDefaultModel}
              isSaving={isSaving}
              onDefaultModelChange={handleDefaultModelChange}
              onModelToggle={handleModelToggle}
            />
          )}
        </>
      )}
    </div>
  );
}

export default CursorSettingsTab;
