/**
 * App Server entry point.
 *
 * Express REST API + Socket.io WebSocket server + static frontend serving.
 * Self-hosted Express + Socket.io backend for DSRI deployment.
 */

import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

import { setupRealtime } from './realtime.js'
import { extractParticipantId } from './middleware/auth.js'

// Route imports
import { participantsRouter } from './routes/participants.js'
import { sessionsRouter } from './routes/sessions.js'
import { messagesRouter } from './routes/messages.js'
import { eventsRouter } from './routes/events.js'
import { assistantRouter } from './routes/assistant.js'
import { tokensRouter } from './routes/tokens.js'
import { surveysRouter } from './routes/surveys.js'
import { batchesRouter } from './routes/batches.js'
import { adminRouter } from './routes/admin.js'
import { paymentCodeRouter } from './routes/payment-code.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const http = createServer(app)
const io = new SocketServer(http, {
  cors: { origin: '*' },
})

// Global middleware
app.use(cors())
app.use(express.json())
app.use(extractParticipantId)

// REST API routes
app.use('/api/participants', participantsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/events', eventsRouter)
app.use('/api/assistant', assistantRouter)
app.use('/api/tokens', tokensRouter)
app.use('/api/surveys', surveysRouter)
app.use('/api/batches', batchesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/payment-code', paymentCodeRouter)

// Server time endpoint (for client clock-sync)
app.get('/api/time', (_req, res) => {
  res.json({ serverTime: new Date().toISOString() })
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve built React frontend as static files
const publicDir = path.join(__dirname, '../public')
app.use(express.static(publicDir))
// SPA fallback -- all non-API routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10)

async function start(): Promise<void> {
  // Wire up realtime (PG LISTEN/NOTIFY -> Socket.io rooms)
  await setupRealtime(io)

  http.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error('[server] Failed to start:', err)
  process.exit(1)
})
