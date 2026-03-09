/**
 * AssistantPanel Component
 * 
 * AI assistant interface for negotiation guidance.
 * Uses configurable LLM provider (Anthropic, OpenAI, etc.)
 * 
 * Features:
 * - Query input with Enter to send
 * - Conversation history display
 * - Rate limiting (queries remaining)
 * - Copy response button
 * - Loading states
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bot, 
  Send, 
  X, 
  Loader2, 
  Copy, 
  Check,
  AlertCircle
} from 'lucide-react';
import { 
  queryAssistant, 
  getAssistantQueryCount,
  getAssistantQueries,
  type AssistantQueryResponse 
} from '@/lib/data';
import { LLM_CONFIG } from '@/config/llm';

// ============================================
// TYPES
// ============================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokensUsed?: number;
}

interface AssistantPanelProps {
  sessionId: string;
  participantId: string;
  onClose?: () => void;
  disabled?: boolean;
  /** Override max queries from session config (defaults to LLM_CONFIG.maxQueriesPerParticipant) */
  maxQueriesOverride?: number;
}

// ============================================
// COMPONENT
// ============================================

export function AssistantPanel({
  sessionId,
  participantId,
  onClose,
  disabled = false,
  maxQueriesOverride,
}: AssistantPanelProps) {
  // Config - use override if provided, otherwise use default from LLM_CONFIG
  // 0 means unlimited
  const maxQueries = maxQueriesOverride ?? LLM_CONFIG.maxQueriesPerParticipant;
  const isUnlimited = maxQueries === 0;
  const { ui } = LLM_CONFIG;
  
  // State
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queriesRemaining, setQueriesRemaining] = useState(isUnlimited ? 999 : maxQueries);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  // Load existing queries and count on mount
  useEffect(() => {
    async function loadExistingQueries() {
      try {
        // Get query count (for logging purposes, not rate limiting since unlimited)
        const count = await getAssistantQueryCount(sessionId, participantId);
        // When unlimited (maxQueries=0), keep queriesRemaining at 999
        setQueriesRemaining(isUnlimited ? 999 : Math.max(0, maxQueries - count));
        
        // Load existing conversation
        const queries = await getAssistantQueries(sessionId, participantId);
        
        const loadedMessages: Message[] = [];
        queries.forEach((q) => {
          // User message
          loadedMessages.push({
            id: `${q.id}-user`,
            role: 'user',
            content: q.query_text,
            timestamp: new Date(q.timestamp),
          });
          // Assistant response
          loadedMessages.push({
            id: `${q.id}-assistant`,
            role: 'assistant',
            content: q.response_text,
            timestamp: new Date(q.timestamp),
            tokensUsed: q.tokens_used ?? undefined,
          });
        });
        
        setMessages(loadedMessages);
      } catch (err) {
        console.error('Failed to load assistant queries:', err);
      }
    }
    
    loadExistingQueries();
  }, [sessionId, participantId, maxQueries]);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // ============================================
  // QUERY HANDLING
  // ============================================
  
  const handleSendQuery = useCallback(async () => {
    // Block if empty, loading, disabled, or rate limited (but not if unlimited)
    if (!query.trim() || isLoading || disabled || (!isUnlimited && queriesRemaining <= 0)) return;
    
    const userQuery = query.trim();
    setQuery('');
    setError(null);
    
    // Add user message immediately
    const userMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: userQuery,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);
    
    try {
      // Build conversation history for context
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      
      // Call assistant
      const response: AssistantQueryResponse = await queryAssistant(
        sessionId,
        participantId,
        userQuery,
        history
      );
      
      // Add assistant response
      const assistantMessage: Message = {
        id: `response-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        tokensUsed: response.tokensUsed,
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Update queries remaining
      setQueriesRemaining(response.queriesRemaining);
      
    } catch (err) {
      console.error('Assistant query error:', err);
      
      // Check if rate limited
      if (err instanceof Error && err.message.includes('Rate limit')) {
        setQueriesRemaining(0);
        setError(ui.limitReachedText);
      } else {
        setError('Failed to get response. Please try again.');
      }
      
      // Remove the user message if failed
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [query, isLoading, disabled, isUnlimited, queriesRemaining, messages, sessionId, participantId, ui.limitReachedText]);
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuery();
    }
  };
  
  // Copy response to clipboard
  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // ============================================
  // RENDER
  // ============================================
  
  const isLimitReached = !isUnlimited && queriesRemaining <= 0;
  const canSend = query.trim() && !isLoading && !disabled && !isLimitReached;
  
  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">{ui.panelTitle}</h2>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
            aria-label="Close assistant"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onCopy={handleCopy}
              isCopied={copiedId === msg.id}
            />
          ))
        )}
        
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 pl-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Rate limit warning */}
      {isLimitReached && !error && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-700">{ui.limitReachedText}</span>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Session ended" : ui.inputPlaceholder}
            disabled={disabled || isLoading || isLimitReached}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 
                       focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                       disabled:bg-slate-100 disabled:cursor-not-allowed text-sm
                       placeholder:text-slate-400"
          />
          <button
            onClick={handleSendQuery}
            disabled={!canSend}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium
              transition-colors flex items-center gap-1
              ${canSend
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }
            `}
            aria-label="Send query"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function EmptyState() {
  return (
    <div className="text-center py-8">
      <Bot className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <h3 className="font-medium text-slate-700 mb-1">AI Assistant</h3>
      <p className="text-sm text-slate-500">
        Ask me questions about the negotiation task.
      </p>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  onCopy: (id: string, content: string) => void;
  isCopied: boolean;
}

function MessageBubble({ message, onCopy, isCopied }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] rounded-lg p-3
          ${isUser
            ? 'bg-blue-100 text-blue-900'
            : 'bg-slate-100 text-slate-900'
          }
        `}
      >
        {!isUser && (
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <Bot className="w-3 h-3" />
              <span>Assistant</span>
            </div>
            <button
              onClick={() => onCopy(message.id, message.content)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
              aria-label="Copy response"
            >
              {isCopied ? (
                <Check className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
          <span>
            {message.timestamp.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          {message.tokensUsed && (
            <span className="text-slate-400">
              {message.tokensUsed} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default AssistantPanel;
