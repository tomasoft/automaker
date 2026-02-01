import type { NavigateOptions } from '@tanstack/react-router';
import { cn, isMac } from '@/lib/utils';
import { AutomakerLogo } from './automaker-logo';
import { BugReportButton } from './bug-report-button';

interface SidebarHeaderProps {
  sidebarOpen: boolean;
  navigate: (opts: NavigateOptions) => void;
}

export function SidebarHeader({ sidebarOpen, navigate }: SidebarHeaderProps) {
  return <></>;
}
