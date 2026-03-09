import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import type { Message, ParticipantRole } from '@/types/database.types'

// ============================================
// Types
// ============================================

interface ChatInterfaceProps {
  messages: Message[]
  currentParticipantId: string
  currentRole: ParticipantRole
  onSendMessage: (content: string) => Promise<void>
  isLoading?: boolean
  disabled?: boolean
}

interface DisplayMessage extends Message {
  isOwnMessage: boolean
  senderRole: ParticipantRole
}

// ============================================
// Component
// ============================================

/**
 * ChatInterface Component
 * 
 * Real-time chat interface for negotiation sessions.
 * Features:
 * - Auto-scroll to latest message
 * - Different styling for own vs opponent messages
 * - Enter to send, Shift+Enter for new line
 * - Timestamps and role indicators
 */
export function ChatInterface({
  messages,
  currentParticipantId,
  currentRole,
  onSendMessage,
  isLoading = false,
  disabled = false
}: ChatInterfaceProps) {
  // State
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ============================================
  // Auto-scroll to bottom
  // ============================================
  
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Scroll when new messages arrive
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // ============================================
  // Message Processing
  // ============================================

  // Determine the opponent's role
  const opponentRole: ParticipantRole = currentRole === 'pm' ? 'developer' : 'pm'

  // Process messages to add display properties
  const displayMessages: DisplayMessage[] = messages.map(msg => ({
    ...msg,
    isOwnMessage: msg.participant_id === currentParticipantId,
    // If it's own message, use current role, otherwise opponent role
    senderRole: msg.participant_id === currentParticipantId ? currentRole : opponentRole
  }))

  // ============================================
  // Send Message Handler
  // ============================================

  async function handleSend() {
    const content = inputValue.trim()
    if (!content || isSending || disabled) return

    setIsSending(true)
    try {
      await onSendMessage(content)
      setInputValue('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Keep the message in input so user can retry
    } finally {
      setIsSending(false)
    }
  }

  // Handle keyboard shortcuts
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Shift+Enter adds new line (default behavior)
  }

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value)
    
    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {displayMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-neutral-200 p-4 bg-neutral-50">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? "Chat is disabled" : "Type your message... (Enter to send, Shift+Enter for new line)"}
              disabled={disabled || isSending}
              rows={1}
              className="w-full px-4 py-3 rounded-lg border border-neutral-300 
                         focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 
                         resize-none disabled:bg-neutral-100 disabled:cursor-not-allowed
                         placeholder:text-neutral-400"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending || disabled}
            className="flex-shrink-0 p-3 rounded-lg bg-primary-600 text-white 
                       hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

// ============================================
// Message Bubble Component
// ============================================

interface MessageBubbleProps {
  message: DisplayMessage
}

function MessageBubble({ message }: MessageBubbleProps) {
  const { isOwnMessage, senderRole, content, timestamp, message_type } = message

  // Format timestamp
  const time = new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })

  // Role display names
  const roleLabel = senderRole === 'pm' ? 'Project Manager' : 'Developer'

  // Special styling for offers
  const isOffer = message_type === 'offer'
  const isAcceptance = message_type === 'acceptance'
  const isRejection = message_type === 'rejection'
  const isSystem = message_type === 'system'

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="px-4 py-2 bg-neutral-100 rounded-full text-sm text-neutral-600 italic">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {/* Sender info */}
        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
          <span className={`text-xs font-medium ${
            senderRole === 'pm' ? 'text-blue-600' : 'text-green-600'
          }`}>
            {isOwnMessage ? 'You' : roleLabel}
          </span>
          <span className="text-xs text-neutral-400">{time}</span>
        </div>

        {/* Message bubble */}
        <div className={`
          rounded-2xl px-4 py-3
          ${isOwnMessage 
            ? 'bg-primary-600 text-white rounded-br-md' 
            : 'bg-neutral-100 text-neutral-900 rounded-bl-md'
          }
          ${isOffer ? 'border-2 border-amber-400 bg-amber-50 text-neutral-900' : ''}
          ${isAcceptance ? 'border-2 border-green-400 bg-green-50 text-neutral-900' : ''}
          ${isRejection ? 'border-2 border-red-400 bg-red-50 text-neutral-900' : ''}
        `}>
          {/* Offer/acceptance/rejection label */}
          {(isOffer || isAcceptance || isRejection) && (
            <div className={`text-xs font-semibold mb-1 ${
              isOffer ? 'text-amber-600' : isAcceptance ? 'text-green-600' : 'text-red-600'
            }`}>
              {isOffer ? '📋 OFFER' : isAcceptance ? '✅ ACCEPTED' : '❌ REJECTED'}
            </div>
          )}
          
          {/* Message content */}
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>
    </div>
  )
}

export default ChatInterface
