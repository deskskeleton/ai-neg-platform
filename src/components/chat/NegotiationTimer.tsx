import { useState, useEffect, useCallback } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'

// ============================================
// Types
// ============================================

interface NegotiationTimerProps {
  /** Total duration in minutes */
  durationMinutes: number
  /** When the session started (ISO string) */
  startedAt: string | null
  /** Callback when timer expires - called ONCE when time hits 0 */
  onTimeUp?: () => void
  /** Whether the session is active */
  isActive: boolean
  /** Server time offset in milliseconds (positive = server ahead of client) */
  serverTimeOffset?: number
}

// ============================================
// Component
// ============================================

/**
 * NegotiationTimer Component
 * 
 * Countdown timer for negotiation sessions.
 * Features:
 * - Counts down from session start time
 * - Visual warning when time is running low
 * - Triggers callback when time expires
 */
export function NegotiationTimer({
  durationMinutes,
  startedAt,
  onTimeUp,
  isActive,
  serverTimeOffset = 0
}: NegotiationTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationMinutes * 60)
  const [hasTriggeredTimeUp, setHasTriggeredTimeUp] = useState(false)

  // Calculate remaining time based on start time (using server-adjusted time)
  const calculateRemaining = useCallback(() => {
    if (!startedAt || !isActive) {
      return durationMinutes * 60
    }

    const startTime = new Date(startedAt).getTime()
    const endTime = startTime + (durationMinutes * 60 * 1000)
    // Apply server time offset: if server is ahead, add offset to client time
    const serverAdjustedNow = Date.now() + serverTimeOffset
    const remaining = Math.max(0, Math.floor((endTime - serverAdjustedNow) / 1000))
    
    return remaining
  }, [startedAt, durationMinutes, isActive, serverTimeOffset])

  // Update timer every second
  useEffect(() => {
    if (!isActive || !startedAt) {
      setRemainingSeconds(durationMinutes * 60)
      return
    }

    // Initial calculation
    setRemainingSeconds(calculateRemaining())

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateRemaining()
      setRemainingSeconds(remaining)

      // Trigger time up callback once
      if (remaining === 0 && !hasTriggeredTimeUp && onTimeUp) {
        setHasTriggeredTimeUp(true)
        onTimeUp()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive, startedAt, calculateRemaining, onTimeUp, hasTriggeredTimeUp])

  // Format time as MM:SS
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  // Determine warning state
  const isWarning = remainingSeconds <= 300 && remainingSeconds > 60 // Last 5 minutes
  const isCritical = remainingSeconds <= 60 // Last minute
  const isExpired = remainingSeconds === 0

  // Determine colors
  let colorClasses = 'bg-neutral-100 text-neutral-700'
  if (isWarning) colorClasses = 'bg-amber-100 text-amber-700'
  if (isCritical) colorClasses = 'bg-red-100 text-red-700 animate-pulse'
  if (isExpired) colorClasses = 'bg-red-200 text-red-800'

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono ${colorClasses}`}>
      {isCritical || isExpired ? (
        <AlertTriangle className="w-5 h-5" />
      ) : (
        <Clock className="w-5 h-5" />
      )}
      <span className="text-lg font-bold">
        {isExpired ? 'Time Up!' : formattedTime}
      </span>
      {!isActive && (
        <span className="text-xs font-normal ml-2">(Not started)</span>
      )}
    </div>
  )
}

export default NegotiationTimer
