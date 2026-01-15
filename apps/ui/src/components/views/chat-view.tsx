/**
 * Chat View Component - Interactive AI chat with feature creation
 */

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageCircle,
  Send,
  Plus,
  Trash2,
  DollarSign,
  Zap,
  Loader2,
  History,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession, ChatMessage, ChatType } from '@automaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

const CHAT_TYPES: { value: ChatType; label: string; description: string }[] = [
  {
    value: 'general',
    label: 'General Chat',
    description: 'Ask questions and get help',
  },
  {
    value: 'feature-creation',
    label: 'Feature Creation',
    description: 'Discuss and create new features',
  },
  {
    value: 'feature-enhancement',
    label: 'Feature Enhancement',
    description: 'Improve existing features',
  },
  {
    value: 'code-review',
    label: 'Code Review',
    description: 'Review and discuss code',
  },
  {
    value: 'debugging',
    label: 'Debugging',
    description: 'Debug and fix issues',
  },
  {
    value: 'refactoring',
    label: 'Refactoring',
    description: 'Improve code structure',
  },
  {
    value: 'architecture',
    label: 'Architecture',
    description: 'Discuss system design',
  },
  {
    value: 'documentation',
    label: 'Documentation',
    description: 'Write better docs',
  },
];

export function ChatView() {
  const { currentProject } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [chatType, setChatType] = useState<ChatType>('general');
  const [model, setModel] = useState<string>('claude-sonnet-4-20250514');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sessions on mount
  useEffect(() => {
    if (currentProject) {
      loadSessions();
    }
  }, [currentProject]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getHttpApiClient();
      const response = await api.chat.getSessions();

      if (response.success && response.sessions) {
        setSessions(response.sessions);
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
      toast.error('Failed to load chat sessions');
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = async () => {
    if (!currentProject) return;

    try {
      const api = getHttpApiClient();
      const response = await api.chat.createSession({
        type: chatType,
        model,
      });

      if (response.success && response.session) {
        setSessions([response.session, ...sessions]);
        setCurrentSession(response.session);
        toast.success('Chat session created');
      }
    } catch (error) {
      console.error('Failed to create chat session:', error);
      toast.error('Failed to create chat session');
    }
  };

  const sendMessage = async () => {
    if (!currentSession || !message.trim() || !currentProject || isSending) return;

    const userMessage = message;
    setMessage('');
    setIsSending(true);

    // Add user message to UI immediately
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    setCurrentSession({
      ...currentSession,
      messages: [...currentSession.messages, tempUserMessage],
    });

    try {
      const api = getHttpApiClient();

      // Use EventSource for SSE streaming
      const eventSource = new EventSource(
        `/api/chat/send?sessionId=${currentSession.id}&content=${encodeURIComponent(userMessage)}&projectPath=${encodeURIComponent(currentProject.path)}`
      );

      let assistantMessage = '';

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'message' && data.content) {
          assistantMessage += data.content;

          // Update UI with streaming content
          setCurrentSession((prev) => {
            if (!prev) return null;
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];

            if (lastMessage && lastMessage.role === 'assistant') {
              // Update existing assistant message
              lastMessage.content = assistantMessage;
            } else {
              // Add new assistant message
              messages.push({
                id: `temp-assistant-${Date.now()}`,
                role: 'assistant',
                content: assistantMessage,
                timestamp: new Date().toISOString(),
              });
            }

            return { ...prev, messages };
          });
        } else if (data.type === 'done') {
          // Update with final session data
          if (data.session) {
            setCurrentSession(data.session);
          }
          eventSource.close();
          setIsSending(false);
        } else if (data.type === 'error') {
          toast.error(data.error || 'Failed to send message');
          eventSource.close();
          setIsSending(false);
        }
      };

      eventSource.onerror = () => {
        toast.error('Connection error');
        eventSource.close();
        setIsSending(false);
      };
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      setIsSending(false);
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
      toast.success('Chat session deleted');
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session');
    }
  };

  const formatCost = (cost: number, currency: string) => {
    // Always use GBP to match budget settings, regardless of stored currency
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 4,
    }).format(cost);
  };

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString();
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Project Selected</CardTitle>
            <CardDescription>Please select or create a project first</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="w-6 h-6" />
              AI Chat
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Interactive conversations with AI models
            </p>
          </div>

          {/* New Session Controls */}
          <div className="flex items-center gap-3">
            <Select value={chatType} onValueChange={(v) => setChatType(v as ChatType)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col items-start">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-opus-4-5-20251101">Claude Opus 4.5</SelectItem>
                <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={createSession} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-64 border-r bg-muted/10 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <History className="w-4 h-4" />
              Recent Chats
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No chat sessions yet</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <Card
                    key={session.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-accent/50',
                      currentSession?.id === session.id && 'bg-accent border-primary'
                    )}
                    onClick={() => setCurrentSession(session)}
                  >
                    <CardHeader className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm truncate">{session.title}</CardTitle>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {CHAT_TYPES.find((t) => t.value === session.type)?.label}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {formatTokens(session.totalTokens)}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {formatCost(session.totalCost, session.currency)}
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {currentSession ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {currentSession.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[70%] rounded-lg p-4',
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      <div className="flex items-center gap-3 mt-2 text-xs opacity-70">
                        <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                        {msg.tokens && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {formatTokens(msg.tokens.total)}
                          </span>
                        )}
                        {msg.cost && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {formatCost(msg.cost.amount, msg.cost.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type your message... (Shift+Enter for new line)"
                    className="resize-none"
                    rows={3}
                    disabled={isSending}
                  />
                  <Button onClick={sendMessage} disabled={!message.trim() || isSending} size="lg">
                    {isSending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Send
                      </>
                    )}
                  </Button>
                </div>

                {/* Session Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4" />
                    {currentSession.messages.length} messages
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-4 h-4" />
                    {formatTokens(currentSession.totalTokens)} tokens
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {formatCost(currentSession.totalCost, currentSession.currency)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <Card className="w-96">
                <CardHeader className="text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>Start a Conversation</CardTitle>
                  <CardDescription>
                    Select a chat type and model, then create a new chat to begin
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
