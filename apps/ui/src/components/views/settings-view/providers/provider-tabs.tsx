import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Terminal, Github, Server } from 'lucide-react';
import { CursorSettingsTab } from './cursor-settings-tab';
import { ClaudeSettingsTab } from './claude-settings-tab';
import { CopilotSettingsTab } from './copilot-settings-tab';
import { LocalLlmSettingsTab } from './local-llm-settings-tab';

interface ProviderTabsProps {
  defaultTab?: 'claude' | 'cursor' | 'copilot' | 'local-llm';
}

export function ProviderTabs({ defaultTab = 'claude' }: ProviderTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-6">
        <TabsTrigger value="claude" className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Claude
        </TabsTrigger>
        <TabsTrigger value="cursor" className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Cursor
        </TabsTrigger>
        <TabsTrigger value="copilot" className="flex items-center gap-2">
          <Github className="w-4 h-4" />
          Copilot
        </TabsTrigger>
        <TabsTrigger value="local-llm" className="flex items-center gap-2">
          <Server className="w-4 h-4" />
          Local LLM
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude">
        <ClaudeSettingsTab />
      </TabsContent>

      <TabsContent value="cursor">
        <CursorSettingsTab />
      </TabsContent>

      <TabsContent value="copilot">
        <CopilotSettingsTab />
      </TabsContent>

      <TabsContent value="local-llm">
        <LocalLlmSettingsTab />
      </TabsContent>
    </Tabs>
  );
}

export default ProviderTabs;
