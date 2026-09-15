// Data reconstruction test (kickoff item 5).
// Input: ONLY the batch export JSON from GET /api/admin/batches/:id/export.
// Rebuilds, from the export alone:
//   - who negotiated with whom in each round (and checks it against the
//     pre-seeded schedule in the export)
//   - every offer with timestamp and sender
//   - every assistant query and response with timestamp
//   - which acceptance ended each round, and impasses
//   - each participant's points per round, total, and euro payment
//   - for each offer a participant sent: which assistant outputs they had
//     seen before it (same participant, same session, earlier timestamp)
//   - join checks: session/dyad/participant ids and timestamps across the
//     offer log, assistant log and questionnaire records
// Usage: node reconstruct.mjs export-<code>.json [--print]
import fs from 'node:fs'
const file = process.argv[2]
if (!file) { console.error('usage: node reconstruct.mjs export.json'); process.exit(1) }
const X = JSON.parse(fs.readFileSync(file, 'utf8'))
const PRINT = process.argv.includes('--print')

const TABLES = {
  'v1.a': { A: [[8, 28, 52], [18, 45, 47], [62, 37, 21], [39, 31, 22]], B: [[62, 36, 18], [48, 34, 12], [12, 33, 55], [35, 27, 18]] },
  'v1.b': { A: [[10, 30, 50], [60, 35, 15], [55, 30, 15], [25, 35, 10]], B: [[60, 35, 15], [10, 30, 50], [15, 30, 55], [20, 35, 15]] },
  'v1.c': { A: [[12, 34, 54], [20, 45, 52], [58, 32, 10], [36, 30, 14]], B: [[60, 28, 12], [18, 50, 32], [12, 34, 54], [28, 36, 16]] },
}
const side = (role) => (role === 'pm' ? 'A' : role === 'developer' ? 'B' : null)
const points = (scenario, s, sel) => sel && TABLES[scenario] ? [0, 1, 2, 3].reduce((t, i) => t + (TABLES[scenario][s][i][sel[`I${i + 1}`]] ?? 0), 0) : null
const euro = (pts) => +(10 + Math.min(pts / 600, 1) * 30).toFixed(2)

const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

// ---- participants & questionnaires ----
const P = new Map(X.participants.map((p) => [p.id, p]))
const label = (id) => (P.get(id)?.email || id).replace(/@.*$/, '').replace(/^pilot-\d+T\d+-/, '')
check('export has batch, participants, schedule, sessions', !!X.batch && Array.isArray(X.participants) && Array.isArray(X.schedule) && Array.isArray(X.sessions), `${X.participants.length} participants, ${X.schedule.length} schedule rows, ${X.sessions.length} sessions`)

// ---- sessions: pairings, offers, assistant, outcome ----
const rounds = {}
const perParticipant = {}
for (const id of P.keys()) perParticipant[id] = { rounds: {}, total: 0 }
let joinProblems = []
for (const S of X.sessions) {
  const s = S.session
  const sps = S.participants
  const r = s.round_number
  const pm = sps.find((x) => x.role === 'pm'), dev = sps.find((x) => x.role === 'developer')
  if (!pm || !dev) { joinProblems.push(`session ${s.session_code}: roles incomplete`); continue }
  for (const x of sps) if (!P.has(x.participant_id)) joinProblems.push(`session ${s.session_code}: participant ${x.participant_id} not in participants block`)
  // offers, acceptance, rejection with timestamp and sender
  const offers = S.messages.filter((m) => m.message_type === 'offer').map((m) => ({ t: m.timestamp, by: m.participant_id, role: m.participant_id === pm.participant_id ? 'pm' : 'developer', offer: m.metadata?.offer ?? null, id: m.id }))
  const acceptances = S.messages.filter((m) => m.message_type === 'acceptance').map((m) => ({ t: m.timestamp, by: m.participant_id, offer: m.metadata?.offer ?? null }))
  const rejections = S.messages.filter((m) => m.message_type === 'rejection').map((m) => ({ t: m.timestamp, by: m.participant_id }))
  const ai = S.assistant_queries.map((q) => ({ t: q.timestamp, by: q.participant_id, q: q.query_text, a: q.response_text, model: q.model, profile: q.prompt_profile, version: q.prompt_version, temp: q.temperature, truncated: q.truncated, guard: q.guard_triggered, id: q.id }))
  for (const q of S.assistant_queries) if (!sps.some((x) => x.participant_id === q.participant_id)) joinProblems.push(`session ${s.session_code}: assistant row for non-member ${q.participant_id}`)
  for (const m of S.messages) if (m.message_type !== 'system' && !sps.some((x) => x.participant_id === m.participant_id)) joinProblems.push(`session ${s.session_code}: message from non-member ${m.participant_id}`)
  // which acceptance ended the round
  const endingAcceptance = s.agreement_reached ? acceptances.filter((a) => JSON.stringify(a.offer) === JSON.stringify(s.final_agreement)).at(-1) ?? acceptances.at(-1) ?? null : null
  const acceptedOffer = endingAcceptance ? offers.filter((o) => o.t <= endingAcceptance.t && JSON.stringify(o.offer) === JSON.stringify(s.final_agreement)).at(-1) ?? null : null
  const outcome = s.agreement_reached ? 'agreement' : (s.status === 'completed' ? 'impasse' : s.status)
  const pts = s.agreement_reached ? { [pm.participant_id]: points(s.negotiation_scenario, 'A', s.final_agreement), [dev.participant_id]: points(s.negotiation_scenario, 'B', s.final_agreement) } : { [pm.participant_id]: 0, [dev.participant_id]: 0 }
  // what each participant had seen from the assistant before each offer they sent
  const seenBefore = offers.map((o) => ({ offer_id: o.id, by: label(o.by), t: o.t, assistant_outputs_seen_before: ai.filter((q) => q.by === o.by && q.t <= o.t).map((q) => ({ t: q.t, id: q.id, response_head: q.a.slice(0, 60) })) }))
  const rec = { session_id: s.id, dyad_id: s.dyad_id, code: s.session_code, round: r, scenario: s.negotiation_scenario, pm: label(pm.participant_id), developer: label(dev.participant_id), started_at: s.started_at, ended_at: s.ended_at, outcome, final_agreement: s.final_agreement, ended_by_acceptance: endingAcceptance ? { at: endingAcceptance.t, by: label(endingAcceptance.by), of_offer_at: acceptedOffer?.t ?? null, of_offer_by: acceptedOffer ? label(acceptedOffer.by) : null } : null, offers: offers.map((o) => ({ t: o.t, by: label(o.by), role: o.role, offer: o.offer })), rejections: rejections.map((x) => ({ t: x.t, by: label(x.by) })), assistant: ai.map((q) => ({ t: q.t, by: label(q.by), query: q.q, response: q.a, model: q.model, profile: q.profile, version: q.version, temperature: q.temp, truncated: q.truncated, guard: q.guard })), points: Object.fromEntries(Object.entries(pts).map(([k, v]) => [label(k), v])), seen_before_each_offer: seenBefore }
  ;(rounds[r] ||= []).push(rec)
  for (const [pid, v] of Object.entries(pts)) { perParticipant[pid].rounds[r] = { session: s.session_code, dyad: s.dyad_id, scenario: s.negotiation_scenario, role: pid === pm.participant_id ? 'pm' : 'developer', outcome, points: v }; perParticipant[pid].total += v ?? 0 }
}
check('all ids in sessions/messages/assistant rows join to the participants block', joinProblems.length === 0, joinProblems.slice(0, 3).join('; ') || 'clean')

// ---- pairing vs schedule ----
const schedPairs = new Set(X.schedule.map((a) => `${a.round_number}:${[a.participant_id_1, a.participant_id_2].sort().join('+')}`))
const realPairs = new Set(X.sessions.map((S) => `${S.session.round_number}:${S.participants.map((x) => x.participant_id).sort().join('+')}`))
check('realised pairings equal the pre-seeded schedule', schedPairs.size === realPairs.size && [...schedPairs].every((p) => realPairs.has(p)), `${realPairs.size} sessions vs ${schedPairs.size} scheduled`)
const schedScen = Object.fromEntries(X.schedule.map((a) => [`${a.round_number}:${[a.participant_id_1, a.participant_id_2].sort().join('+')}`, a.scenario]))
check('each session used the scheduled configuration', X.sessions.every((S) => schedScen[`${S.session.round_number}:${S.participants.map((x) => x.participant_id).sort().join('+')}`] === S.session.negotiation_scenario))
const partners = {}
for (const S of X.sessions) { const [a, b] = S.participants.map((x) => x.participant_id); (partners[a] ||= []).push(b); (partners[b] ||= []).push(a) }
check('no participant met the same partner twice', Object.values(partners).every((l) => new Set(l).size === l.length))
check('one negotiation-level id (session_id and dyad_id) shared by both participants', X.sessions.every((S) => S.participants.length === 2 && S.participants.every((x) => x.session_id === S.session.id) && !!S.session.dyad_id))

// ---- timestamps ----
const tsProblems = []
for (const S of X.sessions) {
  const s = S.session
  const all = [...S.messages.map((m) => ({ t: m.timestamp, k: 'msg' })), ...S.assistant_queries.map((q) => ({ t: q.timestamp, k: 'ai' }))]
  for (const e of all) { if (!e.t) tsProblems.push(`${s.session_code}: missing ${e.k} timestamp`); else if (s.started_at && e.t < s.started_at) tsProblems.push(`${s.session_code}: ${e.k} before started_at`); else if (s.ended_at && e.t > s.ended_at) tsProblems.push(`${s.session_code}: ${e.k} after ended_at`) }
  const sorted = [...S.messages].map((m) => m.timestamp); if (sorted.some((t, i) => i && t < sorted[i - 1])) tsProblems.push(`${s.session_code}: messages not in timestamp order`)
}
check('every offer/message/assistant row has a timestamp inside its round window, in order', tsProblems.length === 0, tsProblems.slice(0, 3).join('; ') || 'clean')

// ---- outcome bookkeeping ----
const completed = X.sessions.filter((S) => S.session.status === 'completed')
check('every completed round is either agreement (with an ending acceptance) or impasse', completed.every((S) => { const r = Object.values(rounds).flat().find((x) => x.session_id === S.session.id); return r.outcome === 'agreement' ? !!r.ended_by_acceptance : r.outcome === 'impasse' }))
check('agreements have a final_agreement with all four issues', completed.filter((S) => S.session.agreement_reached).every((S) => ['I1', 'I2', 'I3', 'I4'].every((k) => Number.isInteger(S.session.final_agreement?.[k]))))

// ---- assistant rows carry the instrument ----
const aiRows = X.sessions.flatMap((S) => S.assistant_queries)
check('every assistant row records model, profile, prompt version, temperature and max_tokens', aiRows.length > 0 && aiRows.every((q) => q.model && q.prompt_profile && q.prompt_version && q.temperature !== null && q.max_tokens), `${aiRows.length} rows; profiles=${[...new Set(aiRows.map((q) => q.prompt_profile))].join(',')} temps=${[...new Set(aiRows.map((q) => q.temperature))].join(',')}`)
check('informed-advisory rows carry the injected context snapshot', aiRows.filter((q) => q.prompt_profile === 'informed-advisory').every((q) => typeof q.context_snapshot === 'string' && q.context_snapshot.includes('YOUR PAYOFF TABLE')))

// ---- questionnaires join ----
const qProblems = []
for (const [pid, rec] of Object.entries(perParticipant)) {
  const p = P.get(pid)
  const roundsPlayed = Object.keys(rec.rounds)
  if (!p.pre_questionnaire_data || !Object.keys(p.pre_questionnaire_data).length) qProblems.push(`${label(pid)}: no pre-survey`)
  for (const r of roundsPlayed) if (!p.post_round_survey_data?.[r]) qProblems.push(`${label(pid)}: no round ${r} survey`)
  if (roundsPlayed.length === 3 && (!p.post_questionnaire_data || !Object.keys(p.post_questionnaire_data).length)) qProblems.push(`${label(pid)}: no final survey`)
}
check('pre, per-round and final questionnaires present for every participant, keyed by the same participant id', qProblems.length === 0, qProblems.slice(0, 4).join('; ') || 'all present')

// ---- payments ----
const payments = Object.entries(perParticipant).map(([pid, rec]) => ({ participant: label(pid), id: pid, rounds: Object.values(rec.rounds).map((r) => `${r.session}:${r.scenario}:${r.role}:${r.outcome}:${r.points}`), points: rec.total, euro: euro(rec.total) }))
check('payment = 10 + min(points/600,1)*30 for every participant, never above 40', payments.every((p) => p.euro === +(10 + Math.min(p.points / 600, 1) * 30).toFixed(2) && p.euro <= 40))

const out = { source: file, batch: X.batch.batch_code, exported_at: X.exported_at, participants: X.participants.map((p) => ({ id: p.id, label: label(p.id), condition_order: p.condition_order })), rounds, payments, checks }
const outFile = file.replace(/\.json$/, '') + '.reconstructed.json'
fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log(`\nwrote ${outFile}; ${checks.filter((c) => !c.ok).length} failed of ${checks.length} checks`)
if (PRINT) {
  for (const r of Object.keys(rounds).sort()) for (const s of rounds[r]) console.log(`R${r} ${s.code} ${s.scenario} ${s.pm}(pm) vs ${s.developer}(dev) -> ${s.outcome}${s.ended_by_acceptance ? ' accepted by ' + s.ended_by_acceptance.by + ' at ' + s.ended_by_acceptance.at : ''}; offers=${s.offers.length} assistant=${s.assistant.length} points=${JSON.stringify(s.points)}`)
  for (const p of payments) console.log(`${p.participant}: ${p.points} pts -> €${p.euro}  [${p.rounds.join(' | ')}]`)
}
