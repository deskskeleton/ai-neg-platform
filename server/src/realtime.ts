/**
 * Realtime module: PostgreSQL LISTEN/NOTIFY -> Socket.io broadcast.
 *
 * Realtime event broadcasting. The server keeps a dedicated pg connection that
 * LISTENs on four channels. When a PostgreSQL trigger fires pg_notify(), the
 * payload (containing session_id + the full row) is broadcast to the Socket.io
 * room for that session.
 *
 * Channels (matching the PG trigger names in 023_notify_triggers.sql):
 *   messages_insert             -> new chat message in a session
 *   sessions_update             -> session status/field changed
 *   session_participants_insert -> a participant joined a session
 *   session_participants_update -> a participant record was updated (e.g. survey complete)
 *
 * Client-side contract:
 *   1. Connect to Socket.io
 *   2. Emit 'join-session' with { sessionId } to join a room
 *   3. Listen for the four event names above
 *   4. Emit 'leave-session' with { sessionId } to leave
 */

import type { Server as SocketServer } from 'socket.io'
import { pool } from './db.js'

// The four PG notification channels we listen on
const CHANNELS = [
  'messages_insert',
  'sessions_update',
  'session_participants_insert',
  'session_participants_update',
] as const

/**
 * Set up the LISTEN connection and wire Socket.io room broadcasting.
 */
export async function setupRealtime(io: SocketServer): Promise<void> {
  // Dedicated connection for LISTEN (must stay open, not returned to pool)
  const client = await pool.connect()

  for (const channel of CHANNELS) {
    await client.query(`LISTEN ${channel}`)
  }
  console.log('[realtime] Listening on PG channels:', CHANNELS.join(', '))

  // When PostgreSQL sends a notification, broadcast to the correct Socket.io room
  client.on('notification', (msg) => {
    if (!msg.payload) return
    try {
      const payload = JSON.parse(msg.payload) as { session_id: string; row: unknown }
      const room = `session:${payload.session_id}`
      io.to(room).emit(msg.channel, payload.row)
    } catch (err) {
      console.error('[realtime] Failed to parse notification payload:', err)
    }
  })

  // Handle Socket.io connections: let clients join/leave session rooms
  io.on('connection', (socket) => {
    socket.on('join-session', (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        socket.join(`session:${sessionId}`)
      }
    })

    socket.on('leave-session', (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        socket.leave(`session:${sessionId}`)
      }
    })
  })

  // If the LISTEN connection drops, try to reconnect
  client.on('error', async (err) => {
    console.error('[realtime] LISTEN connection error, attempting reconnect:', err.message)
    try {
      const newClient = await pool.connect()
      for (const channel of CHANNELS) {
        await newClient.query(`LISTEN ${channel}`)
      }
      console.log('[realtime] Reconnected LISTEN connection')
    } catch (reconnectErr) {
      console.error('[realtime] Reconnect failed:', reconnectErr)
    }
  })
}
