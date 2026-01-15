/**
 * Chat Modal Dialog
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Settings, Send, Loader2, Plus, Trash2, Eraser, Save } from 'lucide-react';
import { getHttpApiClient, getSessionToken, getApiKey } from '@/lib/http-api-client';
import type { ChatSession, ChatSessionListItem, ChatMessage, ChatType } from '@automaker/types';
import { toast } from 'sonner';
import { ModelSelector } from '@/components/views/board-view/shared/model-selector';
import { useAppStore } from '@/store/app-store';
import { Markdown } from '@/components/ui/markdown';

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHAT_TYPES: Array<{ value: ChatType; label: string; description: string }> = [
  { value: 'general', label: 'General', description: 'General conversation and questions' },
  {
    value: 'feature-creation',
    label: 'Feature Creation',
    description: 'Create new features interactively',
  },
  { value: 'debugging', label: 'Debugging', description: 'Debug issues and errors' },
  { value: 'code-review', label: 'Code Review', description: 'Review and improve code' },
  { value: 'architecture', label: 'Architecture', description: 'Discuss system architecture' },
  {
    value: 'documentation',
    label: 'Documentation',
    description: 'Create or improve documentation',
  },
  { value: 'refactoring', label: 'Refactoring', description: 'Refactor and optimize code' },
];

export function ChatModal({ isOpen, onClose }: ChatModalProps) {
  const {
    isClaudeEnabled,
    isCursorEnabled,
    isCopilotEnabled,
    isLocalLlmEnabled,
    cursorDefaultModel,
    enabledCopilotModels,
    enabledLocalLlmModels,
    localLlmDefaultModel,
    currentProject,
    features,
    pendingFeatureIdToLoad,
    resetPendingFeatureId,
    updateFeature,
  } = useAppStore();

  // Get initial position - centered or from localStorage
  const getInitialPosition = (): Position => {
    try {
      const stored = localStorage.getItem('chatModalPosition');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load chat position:', error);
    }

    // Default to center
    return {
      x: (window.innerWidth - 420) / 2,
      y: (window.innerHeight - 580) / 2,
    };
  };

  const getInitialSize = (): Size => {
    try {
      const stored = localStorage.getItem('chatModalSize');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load chat size:', error);
    }

    // Default size
    return { width: 420, height: 580 };
  };

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [size, setSize] = useState<Size>(getInitialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection>(null);
  const [resizeStart, setResizeStart] = useState<{ pos: Position; size: Size } | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [showSessions, setShowSessions] = useState(true);

  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [chatType, setChatType] = useState<ChatType>('general');
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [linkedFeatureId, setLinkedFeatureId] = useState<string | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isUpdatingSpec, setIsUpdatingSpec] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize model based on enabled providers
  useEffect(() => {
    if (!model) {
      // Determine default model based on enabled providers
      if (isClaudeEnabled) {
        setModel('sonnet');
      } else if (isCursorEnabled) {
        setModel(`cursor-${cursorDefaultModel || 'auto'}`);
      } else if (isCopilotEnabled && enabledCopilotModels.length > 0) {
        setModel(`copilot-${enabledCopilotModels[0]}`);
      } else if (isLocalLlmEnabled && enabledLocalLlmModels.length > 0) {
        setModel(`local-${localLlmDefaultModel || enabledLocalLlmModels[0]}`);
      } else {
        // Fallback to sonnet even if not enabled (will show warning)
        setModel('sonnet');
      }
    }
  }, [
    model,
    isClaudeEnabled,
    isCursorEnabled,
    isCopilotEnabled,
    isLocalLlmEnabled,
    cursorDefaultModel,
    enabledCopilotModels,
    enabledLocalLlmModels,
    localLlmDefaultModel,
  ]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, streamingMessage]);

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Load sessions for current project when modal opens
  useEffect(() => {
    const loadProjectSessions = async () => {
      if (!isOpen || !currentProject?.path) return;

      setIsLoadingSessions(true);
      setSessionsLoaded(false);
      try {
        const api = getHttpApiClient();
        const response = await api.chat.listSessions(currentProject.path);

        if (response.success && response.sessions) {
          setSessions(response.sessions);
          setSessionsLoaded(true);

          // Always load a session when modal opens
          if (response.sessions.length > 0) {
            // Close settings and collapse sessions when existing sessions are loaded
            setShowSettings(false);
            setShowSessions(false);

            // If current session is in the list, reload it to get latest data
            // Otherwise, load the most recent session
            const sessionToLoad =
              currentSession && response.sessions.find((s) => s.id === currentSession.id)
                ? currentSession.id
                : response.sessions[0].id;

            const sessionResponse = await api.chat.getSession(sessionToLoad);
            if (sessionResponse.success && sessionResponse.session) {
              setCurrentSession(sessionResponse.session);
            }
          } else {
            // No sessions exist, clear current session and show settings
            setCurrentSession(null);
            setShowSettings(true);
          }
        } else {
          toast.error('Failed to load chat sessions');
        }
      } catch (error) {
        console.error('Failed to load sessions:', error);
        toast.error('Failed to load chat sessions. Please try again.');
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadProjectSessions();
  }, [isOpen, currentProject?.path]);

  // Handle pending feature load
  useEffect(() => {
    if (
      isOpen &&
      pendingFeatureIdToLoad &&
      sessionsLoaded &&
      !isLoadingSessions &&
      model &&
      currentProject?.path
    ) {
      handlePendingFeatureLoad();
    }
  }, [
    isOpen,
    pendingFeatureIdToLoad,
    sessionsLoaded,
    isLoadingSessions,
    model,
    currentProject?.path,
  ]);

  const handlePendingFeatureLoad = async () => {
    if (!pendingFeatureIdToLoad || !currentProject?.path) return;

    // Check if current session already has this feature linked
    // @ts-ignore - ChatSession type update might not be picked up yet
    if (currentSession?.linkedFeatureId === pendingFeatureIdToLoad) {
      resetPendingFeatureId();
      return;
    }

    // Create new session for this feature interaction
    // We create a new one to avoid polluting existing general chats, or we could check if there's an existing chat for this feature
    // For now, let's create a NEW session specifically for this feature context
    // Unless the current session is empty (newly created)

    let sessionIdToUse = currentSession?.id;
    let createNew = true;

    if (currentSession && currentSession.messages.length === 0) {
      // Reuse empty session
      createNew = false;
    }

    if (createNew) {
      const api = getHttpApiClient();
      const response = await api.chat.createSession({
        type: 'feature-enhancement',
        model,
        projectPath: currentProject.path,
      });

      if (response.success && response.session) {
        sessionIdToUse = response.session.id;
        // Update local state to reflect new session
        const newSession = {
          ...response.session,
          messages: response.session.messages || [],
        };
        const sessionListItem: ChatSessionListItem = {
          id: newSession.id,
          title: newSession.title,
          type: newSession.type,
          model: newSession.model,
          provider: newSession.provider,
          createdAt: newSession.createdAt,
          updatedAt: newSession.updatedAt,
          messageCount: 0,
          totalTokens: 0,
          totalCost: 0,
          currency: 'GBP',
        };
        setSessions((prev) => [sessionListItem, ...prev]);
        setCurrentSession(newSession);
      }
    }

    if (sessionIdToUse) {
      setIsLoadingContext(true);
      try {
        const api = getHttpApiClient();
        const response = await api.chat.loadFeatureContext(
          sessionIdToUse,
          pendingFeatureIdToLoad,
          currentProject.path
        );

        if (response.success && response.session) {
          setCurrentSession(response.session);
          setLinkedFeatureId(pendingFeatureIdToLoad);
          toast.success('Feature context loaded');
        } else {
          toast.error('Failed to load feature context');
        }
      } catch (error) {
        console.error('Failed to load feature context:', error);
        toast.error('Failed to load feature context');
      } finally {
        setIsLoadingContext(false);
        resetPendingFeatureId();
        // Hide sessions list and settings to focus on chat
        setShowSessions(false);
        setShowSettings(false);
      }
    }
  };

  // Auto-create a session when modal opens if none exist (only after successful load with 0 sessions)
  useEffect(() => {
    if (
      isOpen &&
      sessionsLoaded &&
      !isLoadingSessions &&
      sessions.length === 0 &&
      !currentSession &&
      model &&
      currentProject?.path &&
      !pendingFeatureIdToLoad
    ) {
      createSession();
    }
  }, [
    isOpen,
    sessionsLoaded,
    isLoadingSessions,
    sessions.length,
    currentSession,
    model,
    currentProject?.path,
    pendingFeatureIdToLoad,
  ]);

  const createSession = async () => {
    // Prevent creating if model is not set yet
    if (!model) {
      toast.error('Please wait for model to be initialized');
      return;
    }

    if (!currentProject?.path) {
      toast.error('No project selected');
      return;
    }

    try {
      const api = getHttpApiClient();
      const response = await api.chat.createSession({
        type: chatType,
        model,
        projectPath: currentProject.path,
      });

      if (response.success && response.session) {
        const newSession = {
          ...response.session,
          messages: response.session.messages || [],
        };
        // Add to sessions list as ChatSessionListItem
        const sessionListItem: ChatSessionListItem = {
          id: newSession.id,
          title: newSession.title,
          type: newSession.type,
          model: newSession.model,
          provider: newSession.provider,
          createdAt: newSession.createdAt,
          updatedAt: newSession.updatedAt,
          messageCount: newSession.messages.length,
          totalTokens: newSession.totalTokens || 0,
          totalCost: newSession.totalCost || 0,
          currency: newSession.currency || 'GBP',
        };
        setSessions([sessionListItem, ...sessions]);
        setCurrentSession(newSession);
        // Close settings panel after creating session
        setShowSettings(false);
      }
    } catch (error) {
      console.error('Failed to create chat session:', error);
      toast.error('Failed to create chat session');
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const api = getHttpApiClient();
      await api.chat.deleteSession(sessionId);

      setSessions(sessions.filter((s) => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
      }
      toast.success('Session deleted');
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session');
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const api = getHttpApiClient();
      const response = await api.chat.getSession(sessionId);

      if (response.success && response.session) {
        setCurrentSession(response.session);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load session');
    }
  };

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast.error('Title cannot be empty');
      return;
    }

    try {
      const api = getHttpApiClient();
      const response = await api.chat.updateSessionTitle(sessionId, newTitle);

      if (response.success && response.session) {
        // Update sessions list
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
        );
        // Update current session if it's the one being edited - use the full session from backend
        if (currentSession?.id === sessionId) {
          setCurrentSession(response.session);
        }
        setEditingSessionId(null);
        setEditingTitle('');
        toast.success('Session renamed');
      }
    } catch (error) {
      console.error('Failed to update session title:', error);
      toast.error('Failed to rename session');
    }
  };

  const handleFeatureSelect = async (featureId: string | null) => {
    if (!currentSession || !currentProject?.path) return;

    try {
      const api = getHttpApiClient();

      if (!featureId) {
        // Unlink feature
        await api.chat.unlinkFeature(currentSession.id);
        setLinkedFeatureId(null);
        toast.success('Feature unlinked');
        return;
      }

      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      // Link feature
      await api.chat.linkFeature(currentSession.id, featureId, feature.title || feature.id);
      setLinkedFeatureId(featureId);
      toast.success(`Linked to feature: ${feature.title || feature.id}`);
    } catch (error) {
      console.error('Failed to link/unlink feature:', error);
      toast.error('Failed to update feature link');
    }
  };

  const loadFeatureContext = async () => {
    if (!currentSession || !linkedFeatureId || !currentProject?.path) return;

    setIsLoadingContext(true);
    try {
      const api = getHttpApiClient();
      const response = await api.chat.loadFeatureContext(
        currentSession.id,
        linkedFeatureId,
        currentProject.path
      );

      if (response.success && response.session) {
        setCurrentSession(response.session);
        toast.success('Feature context loaded');
      } else {
        toast.error('Failed to load feature context');
      }
    } catch (error) {
      console.error('Failed to load feature context:', error);
      toast.error('Failed to load feature context');
    } finally {
      setIsLoadingContext(false);
    }
  };

  const updateFeatureSpec = async () => {
    if (!currentSession || !linkedFeatureId || !currentProject?.path) return;

    // Get the last assistant message as the new spec
    const lastAssistantMessage = [...currentSession.messages]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (!lastAssistantMessage) {
      toast.error('No AI response to use as spec');
      return;
    }

    setIsUpdatingSpec(true);
    try {
      const api = getHttpApiClient();
      const response = await api.chat.updateFeatureSpec(
        currentSession.id,
        linkedFeatureId,
        lastAssistantMessage.content,
        currentProject.path
      );

      if (response.success) {
        toast.success('Feature spec updated successfully');
      } else {
        toast.error('Failed to update feature spec');
      }
    } catch (error) {
      console.error('Failed to update feature spec:', error);
      toast.error('Failed to update feature spec');
    } finally {
      setIsUpdatingSpec(false);
    }
  };

  const clearChat = () => {
    if (!currentSession) return;

    if (currentSession.messages.length === 0) {
      toast.info('Chat is already empty');
      return;
    }

    // Keep only the last user message and assistant response (last 2 messages)
    const lastMessages = currentSession.messages.slice(-2);

    // Only keep if we have both user and assistant messages
    const messagesToKeep =
      lastMessages.length === 2 &&
      lastMessages[0].role === 'user' &&
      lastMessages[1].role === 'assistant'
        ? lastMessages
        : [];

    setCurrentSession({
      ...currentSession,
      messages: messagesToKeep,
    });

    if (messagesToKeep.length > 0) {
      toast.success('Chat cleared (kept last exchange)');
    } else {
      toast.success('Chat cleared');
    }
  };

  const streamAiResponse = async (
    sessionId: string,
    sessionToken?: string,
    apiKey?: string,
    messageToSend?: string
  ) => {
    setIsStreaming(true);
    setStreamingMessage('');

    try {
      // Use SSE for streaming response
      const api = getHttpApiClient();
      const serverUrl = (api as any).serverUrl || 'http://localhost:3001';

      // Build URL
      let url = `${serverUrl}/api/chat/sessions/${sessionId}/stream`;

      const queryParams = [];
      if (messageToSend) {
        queryParams.push(`message=${encodeURIComponent(messageToSend)}`);
      }

      if (apiKey) {
        queryParams.push(`apiKey=${encodeURIComponent(apiKey)}`);
      } else if (sessionToken) {
        queryParams.push(`sessionToken=${encodeURIComponent(sessionToken)}`);
      }

      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      eventSourceRef.current = new EventSource(url);

      eventSourceRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'message') {
          setStreamingMessage((prev) => prev + data.content);
        } else if (data.type === 'done') {
          // Backend sends the updated session with the message already added
          if (data.session) {
            setCurrentSession(data.session);
            // Update the session in the sessions list as well
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.session.id
                  ? {
                      ...s,
                      updatedAt: data.session.updatedAt,
                      messageCount: data.session.messages.length,
                      totalTokens: data.session.totalTokens || s.totalTokens,
                      totalCost: data.session.totalCost || s.totalCost,
                    }
                  : s
              )
            );
          }

          setStreamingMessage('');
          setIsStreaming(false);

          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        } else if (data.type === 'error') {
          toast.error(data.error || 'Failed to send message');
          setIsStreaming(false);
          setStreamingMessage('');

          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        }
      };

      eventSourceRef.current.onerror = (error) => {
        console.error('EventSource error:', error);

        // Check if it's an auth error by checking if the connection closed immediately
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          toast.error('Authentication failed. Please refresh the page and try again.');
        } else {
          toast.error('Connection error');
        }

        setIsStreaming(false);
        setStreamingMessage('');

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      setIsStreaming(false);
      setStreamingMessage('');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSession || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    // Add user message to session
    const updatedSession = {
      ...currentSession,
      messages: [...currentSession.messages, userMessage],
    };
    setCurrentSession(updatedSession);
    const messageToSend = input;
    setInput('');

    await streamAiResponse(
      currentSession.id,
      getSessionToken() || undefined,
      getApiKey() || undefined,
      messageToSend
    );
  };

  const handleUpdateSpec = async () => {
    if (!currentSession?.linkedFeatureId || !currentSession.id || !currentProject?.path) return;

    // Get the last assistant message to use as the new spec
    // We assume the user has asked AI to generate the spec and is now clicking "Save"
    const lastAssistantMessage = [...currentSession.messages]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (!lastAssistantMessage) {
      toast.error('No AI response found to use as spec');
      return;
    }

    try {
      setIsUpdatingSpec(true);
      await getHttpApiClient().chat.updateFeatureSpec(
        currentSession.id,
        currentSession.linkedFeatureId,
        lastAssistantMessage.content,
        currentProject.path
      );
      toast.success('Feature spec updated successfully');
    } catch (error) {
      console.error('Failed to update feature spec:', error);
      toast.error('Failed to update feature spec');
    } finally {
      setIsUpdatingSpec(false);
    }
  };

  const updateFeatureFromMessage = async (content: string) => {
    if (!currentSession?.linkedFeatureId || !currentSession.id || !currentProject?.path) return;

    let title: string | undefined;
    let description: string = content;

    // First, check for explicit XML tags <feature_spec>
    const specMatch = content.match(/<feature_spec>([\s\S]*?)<\/feature_spec>/);

    if (specMatch) {
      const specContent = specMatch[1].trim();

      // Parse @title: directive if present
      const lines = specContent.split('\n');
      const titleLineIndex = lines.findIndex((line) =>
        line.trim().toLowerCase().startsWith('@title:')
      );

      if (titleLineIndex !== -1) {
        title = lines[titleLineIndex].substring(7).trim(); // Remove @title:
        // Remove the title line from description
        lines.splice(titleLineIndex, 1);
        description = lines.join('\n').trim();
      } else {
        description = specContent;
      }
    } else {
      // Fallback heuristics for older responses
      const lines = content.split('\n');
      const firstLine = lines[0].trim();

      if (firstLine.startsWith('# ')) {
        title = firstLine.substring(2).trim();
        description = lines.slice(1).join('\n').trim();
      } else if (firstLine.toLowerCase().startsWith('title: ')) {
        title = firstLine.substring(7).trim();
        description = lines.slice(1).join('\n').trim();
      } else if (firstLine.startsWith('**Title:**')) {
        title = firstLine.substring(10).trim();
        description = lines.slice(1).join('\n').trim();
      }
    }

    try {
      setIsUpdatingSpec(true);
      const response = await getHttpApiClient().chat.updateFeatureSpec(
        currentSession.id,
        currentSession.linkedFeatureId,
        undefined,
        currentProject.path,
        { title, description }
      );

      if (response.success && response.feature) {
        // Update local store to reflect changes immediately
        updateFeature(response.feature.id, response.feature);
        toast.success('Feature updated successfully');
      } else {
        toast.error('Failed to receive updated feature data');
      }
    } catch (error) {
      console.error('Failed to update feature:', error);
      toast.error('Failed to update feature');
    } finally {
      setIsUpdatingSpec(false);
    }
  };

  // Dragging functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep modal within viewport
      const maxX = window.innerWidth - 420;
      const maxY = window.innerHeight - 100;

      const newPosition = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      };

      setPosition(newPosition);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        // Save position to localStorage when drag ends
        try {
          localStorage.setItem('chatModalPosition', JSON.stringify(position));
        } catch (error) {
          console.error('Failed to save chat position:', error);
        }
      }
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Resizing functionality
  const handleResizeStart = (direction: ResizeDirection) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      pos: { x: e.clientX, y: e.clientY },
      size: { ...size },
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeStart || !resizeDirection) return;

      const deltaX = e.clientX - resizeStart.pos.x;
      const deltaY = e.clientY - resizeStart.pos.y;
      const minWidth = 320;
      const minHeight = 400;

      let newWidth = resizeStart.size.width;
      let newHeight = resizeStart.size.height;
      let newX = position.x;
      let newY = position.y;

      // Handle horizontal resizing
      if (resizeDirection.includes('e')) {
        newWidth = Math.max(minWidth, resizeStart.size.width + deltaX);
      } else if (resizeDirection.includes('w')) {
        const potentialWidth = resizeStart.size.width - deltaX;
        if (potentialWidth >= minWidth) {
          newWidth = potentialWidth;
          newX = resizeStart.pos.x + deltaX - (resizeStart.pos.x - position.x);
        }
      }

      // Handle vertical resizing
      if (resizeDirection.includes('s')) {
        newHeight = Math.max(minHeight, resizeStart.size.height + deltaY);
      } else if (resizeDirection.includes('n')) {
        const potentialHeight = resizeStart.size.height - deltaY;
        if (potentialHeight >= minHeight) {
          newHeight = potentialHeight;
          newY = resizeStart.pos.y + deltaY - (resizeStart.pos.y - position.y);
        }
      }

      setSize({ width: newWidth, height: newHeight });
      if (newX !== position.x || newY !== position.y) {
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        // Save size and position to localStorage
        try {
          localStorage.setItem('chatModalSize', JSON.stringify(size));
          localStorage.setItem('chatModalPosition', JSON.stringify(position));
        } catch (error) {
          console.error('Failed to save chat size:', error);
        }
      }
      setIsResizing(false);
      setResizeDirection(null);
      setResizeStart(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizeDirection, position, size]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="absolute bg-background border border-border rounded-lg shadow-2xl pointer-events-auto flex flex-col"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          cursor: isDragging ? 'grabbing' : isResizing ? 'default' : 'default',
        }}
      >
        {/* Resize Handles */}
        <div
          className="absolute top-0 left-0 w-full h-1 cursor-n-resize hover:bg-primary/20"
          onMouseDown={handleResizeStart('n')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-1 cursor-s-resize hover:bg-primary/20"
          onMouseDown={handleResizeStart('s')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-w-resize hover:bg-primary/20"
          onMouseDown={handleResizeStart('w')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-e-resize hover:bg-primary/20"
          onMouseDown={handleResizeStart('e')}
          style={{ pointerEvents: 'auto' }}
        />
        {/* Corner Handles */}
        <div
          className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize hover:bg-primary/30"
          onMouseDown={handleResizeStart('nw')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize hover:bg-primary/30"
          onMouseDown={handleResizeStart('ne')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize hover:bg-primary/30"
          onMouseDown={handleResizeStart('sw')}
          style={{ pointerEvents: 'auto' }}
        />
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize hover:bg-primary/30"
          onMouseDown={handleResizeStart('se')}
          style={{ pointerEvents: 'auto' }}
        />
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">AI Chat</h3>
            {currentSession ? (
              <select
                value={currentSession.type}
                onChange={(e) => {
                  const newType = e.target.value as ChatType;
                  setCurrentSession({ ...currentSession, type: newType });
                }}
                className="text-xs px-1.5 py-0.5 bg-muted border border-border rounded cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                {CHAT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={chatType}
                onChange={(e) => setChatType(e.target.value as ChatType)}
                className="text-xs px-1.5 py-0.5 bg-muted border border-border rounded cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                {CHAT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            )}
            {!showSettings && (
              <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                {model.includes('-') ? model.split('-').pop() : model}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 no-drag">
            <button
              onClick={createSession}
              className="p-1.5 hover:bg-accent rounded-md transition-colors flex items-center gap-1"
              title="New Session"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={clearChat}
              className="p-1.5 hover:bg-accent rounded-md transition-colors"
              title="Clear chat"
              disabled={!currentSession || currentSession.messages.length === 0}
            >
              <Eraser className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 hover:bg-accent rounded-md transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-accent rounded-md transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-3 border-b border-border bg-muted/30 no-drag">
            <div>
              <label className="text-xs font-medium mb-1.5 block">AI Model</label>
              <div className="scale-90 origin-top-left">
                <ModelSelector
                  selectedModel={model}
                  onModelSelect={setModel}
                  testIdPrefix="chat-model"
                />
              </div>
            </div>
          </div>
        )}

        {/* Sessions List - Collapsible for easy access */}
        {sessions.length > 0 && (
          <div className="border-b border-border bg-muted/20 no-drag">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium hover:bg-accent transition-colors"
            >
              <span>Sessions ({sessions.length})</span>
              <span className="text-muted-foreground">{showSessions ? '▼' : '▶'}</span>
            </button>
            {showSessions && (
              <div className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between p-1.5 rounded text-xs hover:bg-accent cursor-pointer transition-colors ${
                      currentSession?.id === session.id
                        ? 'bg-accent border border-primary/50'
                        : 'border border-transparent'
                    }`}
                    onClick={() => editingSessionId !== session.id && loadSession(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      {editingSessionId === session.id ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => {
                            if (editingTitle.trim()) {
                              updateSessionTitle(session.id, editingTitle);
                            } else {
                              setEditingSessionId(null);
                              setEditingTitle('');
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingTitle.trim()) {
                                updateSessionTitle(session.id, editingTitle);
                              }
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                              setEditingTitle('');
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          className="w-full px-1 py-0.5 text-xs bg-background border border-primary rounded"
                        />
                      ) : (
                        <div
                          className="truncate font-medium"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(session.id);
                            setEditingTitle(session.title || 'Untitled');
                          }}
                        >
                          {session.title || 'Untitled'}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        {session.messageCount} messages
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      className="p-1 hover:bg-destructive/20 rounded ml-2"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-drag">
          {!currentSession ? (
            <div className="flex items-center justify-center h-full text-center">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">No active session</p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Create a session to start
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentSession.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs ${
                      msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <Markdown
                      className={`
                      [&_p]:my-0 [&_p]:text-xs [&_code]:text-xs [&_pre]:text-xs
                      ${msg.role === 'user' ? '[&_*]:text-white [&_p]:text-white [&_code]:text-white [&_strong]:text-white [&_li]:text-white' : ''}
                    `}
                    >
                      {msg.content}
                    </Markdown>
                    {msg.role === 'assistant' && currentSession.linkedFeatureId && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
                        <button
                          onClick={() => updateFeatureFromMessage(msg.content)}
                          disabled={isUpdatingSpec}
                          className="text-[10px] flex items-center gap-1 bg-background/50 hover:bg-background/80 px-2 py-1 rounded transition-colors border border-border/50"
                          title="Update feature title and description from this response"
                        >
                          <Save className="w-3 h-3" />
                          Update Feature
                        </button>
                      </div>
                    )}
                    {msg.tokens && (
                      <div className="text-[10px] opacity-70 mt-1">
                        {msg.tokens.input + msg.tokens.output} tokens
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming message */}
              {isStreaming && streamingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs bg-muted">
                    <Markdown className="[&_p]:my-0 [&_p]:text-xs [&_code]:text-xs [&_pre]:text-xs">
                      {streamingMessage}
                    </Markdown>
                    <div className="flex items-center gap-1 text-[10px] opacity-70 mt-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Streaming...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {currentSession && (
          <div className="p-2 border-t border-border no-drag">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a message..."
                disabled={isStreaming}
                className="flex-1 px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                className="px-2 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
