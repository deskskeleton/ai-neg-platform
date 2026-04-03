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
