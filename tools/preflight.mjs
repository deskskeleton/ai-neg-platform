#!/usr/bin/env node
/**
 * Pre-livetest smoke check.
 *
 * Run 10 minutes before participants arrive to confirm the deployed stack is
 * actually usable end-to-end. Much faster than logging into the admin panel
 * and poking around manually, and catches the specific failures that cut the
 * 2026-04-16 livetest short (admin SQL crash, cold Ollama, missing model).
 *
 * Usage:
 *   node tools/preflight.mjs https://neg-platform.apps.dsri2.unimaas.nl
 *   npm run preflight -- https://neg-platform.apps.dsri2.unimaas.nl
 *
 * Exits 0 on all green, 1 if any check fails.
 */

const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const adminRoute = process.env.VITE_ADMIN_ROUTE || '/admin_umdad'

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const badge = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${badge} ${name}${detail ? '  — ' + detail : ''}`)
}

async function time(fn) {
  const t = Date.now()
  try {
    const r = await fn()
    return { ok: true, ms: Date.now() - t, value: r }
  } catch (err) {
    return { ok: false, ms: Date.now() - t, error: err instanceof Error ? err.message : String(err) }
  }
}

async function check1_health() {
  const r = await time(() => fetch(`${baseUrl}/api/health?deep=1`, { signal: AbortSignal.timeout(8_000) }))
  if (!r.ok) return record('/api/health?deep=1 reachable', false, r.error)
  const res = r.value
  if (!res.ok) return record('/api/health?deep=1 reachable', false, `HTTP ${res.status}`)
  const body = await res.json().catch(() => ({}))
  const ollama = body.ollama
  record('/api/health?deep=1 reachable', true, `${r.ms}ms`)
  if (ollama) {
    record(
      `Ollama status = ${ollama.status}`,
      ollama.status === 'ready',
      `model=${ollama.model} modelsAvailable=${ollama.modelsAvailable}${ollama.message ? ' ' + ollama.message : ''}`,
    )
  } else {
    record('Ollama status in health body', false, 'missing ollama field — server may predate Pass 4')
  }
}

async function check2_adminSessions() {
  const r = await time(() => fetch(`${baseUrl}/api/admin/sessions`, { signal: AbortSignal.timeout(8_000) }))
  if (!r.ok) return record('GET /api/admin/sessions', false, r.error)
  if (r.value.status === 403) return record('GET /api/admin/sessions', false, '403 — server-side ADMIN_SECRET is set, admin panel will appear empty')
  if (r.value.status === 500) {
    const txt = await r.value.text().catch(() => '')
    return record('GET /api/admin/sessions', false, `500 — ${txt.slice(0, 200)}`)
  }
  if (!r.value.ok) return record('GET /api/admin/sessions', false, `HTTP ${r.value.status}`)
  const rows = await r.value.json().catch(() => null)
  record('GET /api/admin/sessions', true, `${Array.isArray(rows) ? rows.length : '?'} session(s), ${r.ms}ms`)
}

async function check3_assistantQuery() {
  // Use clearly-fake UUIDs. The route will log the query against the session
  // and participant, so run this before real participants are onboarded.
  const sessionId = '00000000-0000-0000-0000-000000000001'
  const participantId = '00000000-0000-0000-0000-000000000002'
  const r = await time(() => fetch(`${baseUrl}/api/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, participantId, query: 'preflight ping — respond with the single word OK' }),
    signal: AbortSignal.timeout(75_000), // first cold query can take ~15s on GPU, longer on CPU
  }))
  if (!r.ok) return record('POST /api/assistant/query (cold)', false, r.error)
  if (r.value.status === 503) return record('POST /api/assistant/query (cold)', false, 'warming — Ollama still coming up, retry in ~60s')
  if (!r.value.ok) return record('POST /api/assistant/query (cold)', false, `HTTP ${r.value.status}`)
  const body = await r.value.json().catch(() => ({}))
  const txt = typeof body.response === 'string' ? body.response.slice(0, 60) : ''
  record('POST /api/assistant/query (cold)', true, `${r.ms}ms, reply="${txt}"`)
}

async function check4_adminBundle() {
  const r = await time(() => fetch(`${baseUrl}${adminRoute}`, { method: 'GET', signal: AbortSignal.timeout(8_000) }))
  if (!r.ok) return record(`GET ${adminRoute}`, false, r.error)
  if (!r.value.ok) return record(`GET ${adminRoute}`, false, `HTTP ${r.value.status}`)
  record(`GET ${adminRoute}`, true, `${r.ms}ms (SPA index.html served)`)
}

async function main() {
  console.log(`Preflight for ${baseUrl} (admin at ${adminRoute})\n`)
  await check1_health()
  await check2_adminSessions()
  await check3_assistantQuery()
  await check4_adminBundle()
  const failed = results.filter(r => !r.ok)
  console.log('')
  if (failed.length === 0) {
    console.log(`\x1b[32mAll ${results.length} checks passed.\x1b[0m`)
    process.exit(0)
  }
  console.log(`\x1b[31m${failed.length} of ${results.length} check(s) failed.\x1b[0m`)
  process.exit(1)
}

main().catch(err => {
  console.error('Preflight crashed:', err)
  process.exit(1)
})
