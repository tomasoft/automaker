import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, modelSupportsThinking } from '@/lib/utils';
import { DialogFooter } from '@/components/ui/dialog';
import { Brain, Bot, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AIProfile,
  ModelAlias,
  ThinkingLevel,
  ModelProvider,
  CursorModelId,
} from '@automaker/types';
import {
  CURSOR_MODEL_MAP,
  cursorModelHasThinking,
  getModelProvider,
  stripProviderPrefix,
} from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { ICON_OPTIONS } from '../constants';
import { ModelSelector, ThinkingLevelSelector } from '../../board-view/shared';

interface ProfileFormProps {
  profile: Partial<AIProfile>;
  onSave: (profile: Omit<AIProfile, 'id'>) => void;
  onCancel: () => void;
  isEditing: boolean;
  hotkeyActive: boolean;
}

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  isEditing,
  hotkeyActive,
}: ProfileFormProps) {
  const { isClaudeEnabled, isCursorEnabled, isCopilotEnabled, isLocalLlmEnabled } = useAppStore();

  const [formData, setFormData] = useState(() => {
    // Determine the initial provider: use the profile's provider if editing,
    // otherwise pick the first enabled provider.
    let initialProvider = profile.provider as ModelProvider;

    if (!initialProvider) {
      if (isClaudeEnabled) initialProvider = 'claude';
      else if (isCursorEnabled) initialProvider = 'cursor';
      else if (isCopilotEnabled) initialProvider = 'github-copilot';
      else if (isLocalLlmEnabled) initialProvider = 'local-llm';
      else initialProvider = 'claude';
    }

    return {
      name: profile.name || '',
      description: profile.description || '',
      provider: initialProvider,
      // Claude-specific
      model: profile.model || ('sonnet' as ModelAlias),
      thinkingLevel: profile.thinkingLevel || ('none' as ThinkingLevel),
      // Cursor-specific
      cursorModel: profile.cursorModel || ('auto' as CursorModelId),
      // Copilot-specific
      copilotModel: profile.copilotModel || 'gpt-4o',
      // Local-LLM specific
      localModel: profile.localModel || '',
      icon: profile.icon || 'Brain',
    };
  });

  const selectedModelString =
    formData.provider === 'claude'
      ? formData.model
      : formData.provider === 'cursor'
        ? `cursor-${formData.cursorModel}`
        : formData.provider === 'github-copilot'
          ? `copilot-${formData.copilotModel}`
          : `local-${formData.localModel}`;

  const handleModelSelect = (fullModelId: string) => {
    const provider = getModelProvider(fullModelId);
    const modelId = stripProviderPrefix(fullModelId);

    setFormData((prev) => ({
      ...prev,
      provider,
      model: provider === 'claude' ? (modelId as ModelAlias) : prev.model,
      cursorModel: provider === 'cursor' ? (modelId as CursorModelId) : prev.cursorModel,
      copilotModel: provider === 'github-copilot' ? modelId : prev.copilotModel,
      localModel: provider === 'local-llm' ? modelId : prev.localModel,
    }));
  };

  const supportsThinking = useMemo(() => {
    if (formData.provider === 'cursor') {
      return cursorModelHasThinking(formData.cursorModel);
    }
    if (formData.provider === 'claude') {
      return modelSupportsThinking(formData.model);
    }
    return false;
  }, [formData.provider, formData.cursorModel, formData.model]);

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    const baseProfile = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      provider: formData.provider,
      isBuiltIn: false,
      icon: formData.icon,
      thinkingLevel: supportsThinking ? formData.thinkingLevel : 'none',
    };

    if (formData.provider === 'cursor') {
      onSave({
        ...baseProfile,
        cursorModel: formData.cursorModel,
      });
    } else if (formData.provider === 'github-copilot') {
      onSave({
        ...baseProfile,
        copilotModel: formData.copilotModel,
      });
    } else if (formData.provider === 'local-llm') {
      onSave({
        ...baseProfile,
        localModel: formData.localModel,
      });
    } else {
      onSave({
        ...baseProfile,
        model: formData.model,
      });
    }
  };

  return (
    <>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-3 -mr-3 pl-1">
        {/* Name */}
        <div className="mt-2 space-y-2">
          <Label htmlFor="profile-name">Profile Name</Label>
          <Input
            id="profile-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Heavy Task, Quick Fix"
            data-testid="profile-name-input"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="profile-description">Description</Label>
          <Textarea
            id="profile-description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe when to use this profile..."
            rows={2}
            data-testid="profile-description-input"
          />
        </div>

        {/* Icon Selection */}
        <div className="space-y-2">
          <Label>Icon</Label>
          <div className="flex gap-2 flex-wrap">
            {ICON_OPTIONS.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => setFormData({ ...formData, icon: name })}
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center border transition-colors',
                  formData.icon === name
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`icon-select-${name}`}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        {/* Model Selection */}
        <ModelSelector
          selectedModel={selectedModelString}
          onModelSelect={handleModelSelect}
          testIdPrefix="profile-model"
        />

        {/* Thinking Level */}
        {supportsThinking && (
          <ThinkingLevelSelector
            selectedLevel={formData.thinkingLevel}
            onLevelSelect={(level) => {
              setFormData({ ...formData, thinkingLevel: level });
              if (level === 'ultrathink' && formData.provider === 'claude') {
                toast.warning('Ultrathink uses extensive reasoning', {
                  description:
                    'Best for complex architecture, migrations, or deep debugging (~$0.48/task).',
                  duration: 4000,
                });
              }
            }}
            testIdPrefix="profile-thinking"
          />
        )}
      </div>

      {/* Actions */}
      <DialogFooter className="pt-4 border-t border-border mt-4 shrink-0">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <HotkeyButton
          onClick={handleSubmit}
          hotkey={{ key: 'Enter', cmdCtrl: true }}
          hotkeyActive={hotkeyActive}
          data-testid="save-profile-button"
        >
          {isEditing ? 'Save Changes' : 'Create Profile'}
        </HotkeyButton>
      </DialogFooter>
    </>
  );
}
