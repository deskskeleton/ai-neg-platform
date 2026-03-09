/**
 * Simple authentication middleware for the lab experiment.
 *
 * In the BEElab environment, participants are identified by a participant ID
 * passed in the X-Participant-Id header or as a query parameter. There is no
 * full user authentication (no passwords, no JWTs) because access is controlled
 * physically -- only lab computers on the UM network can reach the app.
 *
 * Admin routes can optionally check an ADMIN_SECRET env var if needed.
 */

import type { Request, Response, NextFunction } from 'express'

/**
 * Extracts participantId from the request.
 * Checks X-Participant-Id header first, then query param ?participantId=.
 * Does NOT reject requests without it -- some endpoints are public.
 */
export function extractParticipantId(req: Request, _res: Response, next: NextFunction): void {
  const fromHeader = req.headers['x-participant-id'] as string | undefined
  const fromQuery = req.query.participantId as string | undefined
  // Attach to request for downstream handlers
  ;(req as unknown as Record<string, unknown>).participantId = fromHeader ?? fromQuery ?? null
  next()
}

/**
 * Middleware that requires a valid participantId on the request.
 * Use on routes that must be participant-scoped.
 */
export function requireParticipant(req: Request, res: Response, next: NextFunction): void {
  const pid = (req as unknown as Record<string, unknown>).participantId
  if (!pid) {
    res.status(401).json({ error: 'Missing participant ID (X-Participant-Id header or ?participantId=)' })
    return
  }
  next()
}

/**
 * Optional admin-secret guard.
 * If ADMIN_SECRET is set in env, require it in the Authorization header.
 * If ADMIN_SECRET is not set, allow all (lab-only network assumed).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    // No secret configured -- trust the network
    next()
    return
  }
  const auth = req.headers.authorization
  if (auth !== `Bearer ${secret}`) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
