/**
 * Payment-code route.
 *
 * Stateless endpoint that encodes a payout amount (in cents) into an
 * HMAC-signed, human-readable code.  Nothing is stored in the database —
 * the code is self-contained and can be verified offline with the secret.
 *
 * Code format: 10 base-30 characters (XXXXX-XXXXX)
 *   - bytes 0-1: amount in cents (uint16 big-endian)
 *   - bytes 2-5: first 4 bytes of HMAC-SHA256(secret, amount_bytes)
 */

import { Router } from 'express'
import crypto from 'crypto'

export const paymentCodeRouter = Router()

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 30 chars, no ambiguous 0/O/1/I
const BASE = BigInt(CHARS.length)
const CODE_LENGTH = 10

function getSecret(): string {
  const s = process.env.COMPLETION_CODE_SECRET
  if (!s) throw new Error('COMPLETION_CODE_SECRET is not set')
  return s
}

function encode(amountCents: number, secret: string): string {
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(amountCents)

  const hmac = crypto.createHmac('sha256', secret).update(buf).digest()
  const payload = Buffer.concat([buf, hmac.subarray(0, 4)]) // 6 bytes

  let num = BigInt('0x' + payload.toString('hex'))
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code = CHARS[Number(num % BASE)] + code
    num = num / BASE
  }

  return code.slice(0, 5) + '-' + code.slice(5)
}

function decode(code: string, secret: string): { valid: boolean; amountCents?: number } {
  const raw = code.replace(/-/g, '').toUpperCase()
  if (raw.length !== CODE_LENGTH) return { valid: false }

  // Base-30 string → bigint
  let num = BigInt(0)
  for (let i = 0; i < raw.length; i++) {
    const idx = CHARS.indexOf(raw[i])
    if (idx < 0) return { valid: false }
    num = num * BASE + BigInt(idx)
  }

  // bigint → 6-byte buffer (2 amount + 4 HMAC tag)
  let hex = num.toString(16)
  while (hex.length < 12) hex = '0' + hex
  const payload = Buffer.from(hex, 'hex')

  const amountBytes = payload.subarray(0, 2)
  const tag = payload.subarray(2, 6)

  // Recompute HMAC and compare
  const expectedTag = crypto.createHmac('sha256', secret).update(amountBytes).digest().subarray(0, 4)
  if (!crypto.timingSafeEqual(tag, expectedTag)) return { valid: false }

  return { valid: true, amountCents: amountBytes.readUInt16BE() }
}

/** POST / — generate a signed payment code for a given amount */
paymentCodeRouter.post('/', (req, res) => {
  try {
    const { amountCents } = req.body
    if (typeof amountCents !== 'number' || amountCents < 0 || amountCents > 65535 || !Number.isInteger(amountCents)) {
      res.status(400).json({ error: 'amountCents must be an integer 0–65535' })
      return
    }
    const code = encode(amountCents, getSecret())
    res.json({ code })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

/** GET /verify?code=XXXXX-XXXXX — decode and verify a payment code */
paymentCodeRouter.get('/verify', (req, res) => {
  try {
    const code = req.query.code
    if (typeof code !== 'string' || code.replace(/-/g, '').length !== CODE_LENGTH) {
      res.status(400).json({ error: 'code query param required (format: XXXXX-XXXXX)' })
      return
    }
    const result = decode(code, getSecret())
    if (!result.valid || result.amountCents === undefined) {
      res.json({ valid: false })
      return
    }
    const euros = (result.amountCents / 100).toFixed(2)
    res.json({ valid: true, amountCents: result.amountCents, amountEuro: `€${euros}` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
