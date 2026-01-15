/**
 * Chat route component
 */

import { createFileRoute } from '@tanstack/react-router';
import { ChatView } from '@/components/views/chat-view';

export const Route = createFileRoute('/chat')({
  component: ChatView,
});
