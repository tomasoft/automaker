import { createFileRoute } from '@tanstack/react-router';
import { SettingsView } from '@/components/views/settings-view';

type SettingsSearch = {
  tab?: string;
};

export const Route = createFileRoute('/settings')({
  component: SettingsView,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    return {
      tab: typeof search.tab === 'string' ? search.tab : undefined,
    };
  },
});
