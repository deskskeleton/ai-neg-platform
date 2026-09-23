# Session runbook — Ch1 Assistance study

Frozen at tag `ch1-main-study-2026-09-15`. Nothing below changes after that
tag except by a documented hotfix (commit on `main`, new tag, note here).

**Hotfixes since the tag**
- `ch1-main-study-2026-09-15-hotfix1` (2026-09-15): debrief screen only.
  Removed the payment code's Copy button and reworded its caption to "Show
  this to the experimenter when you give your payment details." Reason:
  participants never leave the booth window; the code is read to the
  experimenter, who verifies it in the admin panel. No change to data,
  assistant, or payment amounts.

Everything the assistant is and does is defined in
`server/src/config/assistant.ts` (profile `informed-advisory`, temperature 0,
300 tokens, prompt version `2026-09-15.1`). History and reasoning:
`docs/ASSISTANT_PROFILE_HISTORY.md`. Deploy mechanics: `openshift/DEPLOY.md`.

Session shape: 24 participants in four groups of six, three 15-minute rounds,
about 1.5 hours. Payment €10 + €0.05 per point, capped at 600 points (€40 max).
Groups are always exactly six: fewer than six arrivals cancels the session;
arrivals not a multiple of six means the extras are turned away before they
receive a code. The RA never takes a seat.

Numbers quoted below were measured on 2026-09-15 on the DSRI H100.

---

## The day before

1. **GPU booking.** One continuous block from the day before the first session
   to the day after the last, so no 09:00 boundary falls on a session day.
   Confirm the end date in the reservation email.
2. **Cluster access.** UM VPN on. Console `https://console.dsri.unimaas.nl` →
   avatar → *Copy Login Command* → paste in a terminal:
   ```bash
   oc login --token=<token> --server=https://api.dsri.unimaas.nl:6443
   oc project sbe-dad-aineg
   ```
   Tokens expire; get a fresh one each day. `oc logout` when done.
3. **Is the GPU attached?**
   ```bash
   oc get resourcequota gpu-quota -o jsonpath='{.status.hard.requests\.nvidia\.com/gpu}{"\n"}'
   oc get deployment/ollama -o jsonpath='{.spec.template.spec.containers[0].resources.limits}{"\n"}'
   ```
   Quota must be `1` and the limits must contain `"nvidia.com/gpu":"1"`.
   If the quota is `1` but the GPU is missing from the deployment (it was
   removed at the end of a previous booking), attach it with step 6b of
   `openshift/DEPLOY.md`. **Never `oc apply` the Ollama manifest on a live
   deployment**: it strips the GPU request and the node pin RCS added.
4. **Rotate the payment-code secret** (test codes from before this point stop
   verifying, which is intended):
   ```bash
   NEW=$(openssl rand -hex 32)
   oc patch secret neg-platform-env --type=merge -p "{\"stringData\":{\"COMPLETION_CODE_SECRET\":\"$NEW\"}}"
   oc rollout restart deployment/neg-platform && oc rollout status deployment/neg-platform
   ```
   Put the same value in your local `.env`. Do it once before the first
   session, not between sessions of the same wave.
5. **Wipe test data.** Only before the first real session, never between
   real sessions. This empties every experiment table and keeps the schema:
   ```bash
   POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
   oc exec $POD -- psql -U neg -d negplatform -c "TRUNCATE participants, sessions, experiment_batches CASCADE;"
   oc exec $POD -- psql -U neg -d negplatform -tAc "select (select count(*) from participants) participants, (select count(*) from sessions) sessions, (select count(*) from assistant_queries) assistant_rows"
   ```
   All three counts must read 0. Export anything you still need first.
6. RCS (Laurent Winckers) has the session dates and is on stand-by; email
   them only if dates change.

## Start of a session day (from 07:45; allow 45 minutes)

Timing to plan around: after any Ollama pod restart the model takes about
25 s to load and the first reply through the app arrives after 60–70 s. Once
warm, replies take 2–4 s and the model never unloads (keep-alive is set to
never). A full group asking at the same moment gets every answer inside 4 s.

1. **Pods up.**
   ```bash
   oc get pods
   ```
   Expect `neg-platform`, `neg-postgres`, `ollama` all `1/1 Running`,
   0 restarts since yesterday. If Ollama restarted overnight, check it is on a
   healthy card and sees the GPU:
   ```bash
   OP=$(oc get pods -l app=ollama --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
   oc exec $OP -- nvidia-smi -q | grep "GPU Recovery Action"      # must be: None
   oc logs $OP | grep "inference compute" | tail -1               # must say library=CUDA, not id=cpu
   ```
   If it says `id=cpu` or Recovery Action is `Reset`: `oc delete pod $OP`,
   wait for the new pod, check again. Two H100s sit in the node; one was
   faulted on 2026-09-15 and reset by RCS. If it recurs, email RCS.
2. **Warm and verify** (from the repo directory, VPN on):
   ```bash
   npm run preflight -- https://neg-platform.apps.dsri.unimaas.nl
   ```
   All five checks green. The assistant check is the warm-up: the first run
   after a restart can take up to 70 s and is expected to; run it again and
   it should come back in a few seconds. Then confirm the instrument:
   ```bash
   curl -s https://neg-platform.apps.dsri.unimaas.nl/api/assistant/health
   ```
   Must show `"profile":"informed-advisory"`, `"promptVersion":"2026-09-15.1"`,
   `"model":"llama3.1:8b"`.
3. **Booth machines.** Open the lab browser fullscreen on
   `https://neg-platform.apps.dsri.unimaas.nl` (the join page). Do a real
   request from one booth to confirm the lab network reaches the route. Booth
   clocks do not matter: round timers run on server time.
4. **Admin panel.** On your own machine open
   `https://neg-platform.apps.dsri.unimaas.nl/admin_umdad`, enter the admin
   password. Login persists in that browser.
5. **Group codes and booth links.** In the panel: *New Batch* → **6**, five
   times (four groups plus one spare), whatever the expected headcount.
   Each batch row shows a six-character code and a headcount `0/6`. Assign
   groups by booth, not by card: decide which six booths are group A, B, C,
   D, and open each booth's browser fullscreen on that group's link:
   `https://neg-platform.apps.dsri.unimaas.nl/join/<CODE>`. The page
   validates the code and stops on the consent screen. Nothing is created
   until a participant ticks consent and continues, so an unused booth costs
   nothing. Keep the five links on a sheet for yourself; participants never
   see or type a code and never handle a card.

## During the session

**Joining (first 10 minutes).** Hand each participant a booth number; the
booth is already on its group's consent screen. As people tick and continue,
the *Batches* table headcount climbs to `6/6`; when the sixth joins, that
group's three-round schedule is fixed. Because the group is fixed by the
booth link, nobody can join the wrong group. If a booth's page is lost
(someone pressed back), reopen that group's link on it. If a whole group's
batch misbehaves, open the spare batch's link on those six booths: the group
keeps the same people, only its code changes, and nothing is redistributed.
The message *"This group is full. Please tell the experimenter."* can then
only mean a booth is being reused after its group already has six; move that
person to a booth of a group that is not full.

**Rounds.** The *Round Sessions* table lists each pair with status, a live
timer, the configuration (`v1.a/b/c`), and actions. Pairs form and start by
themselves once both partners finish the briefing; you do not press anything
in the normal case. Between rounds participants sit in a lobby until their
scheduled partner arrives; that wait is normal.

Checks to make every few minutes:
- Every `active` row's timer is counting down. Timers end rounds without
  agreement automatically, recorded as an impasse with zero points.
- No row is `waiting` with `2/2` for more than a couple of minutes after both
  partners have finished the briefing. If one is, press its start action.
- The assistant: the panel's health line (`/api/assistant/health`) or
  `oc get pods` if a participant reports "The assistant is starting up".
  Participants see only that line and keep their question; a failed request
  is logged as an `assistant_error` event, so nothing is silently lost.

Manual actions, only when needed:
- **Add 5 minutes** on a round that was disrupted by something on your side.
- **End session** on a round that is stuck (a participant left, both idle,
  a crash). It is recorded as an impasse with reason `admin_ended` and both
  participants are moved to the post-round survey. Points for that round are
  zero.
- A participant who leaves the fullscreen window: use the booth browser's
  history to return to their last page; their state is all server-side.
  Do not have them re-enter the code (that creates a second participant).

**What not to do during a session:** no `oc apply`, no `oc rollout`, no
`oc scale`, no edits to batches other than the actions above, no database
commands.

## End of the session

1. **Export.** When a batch's three rounds are complete the panel downloads
   `batch_<code>_<timestamp>.json` by itself; the *Export* button on the batch
   row does the same on demand. One file per group of six. Keep them off the
   cluster (encrypted, per the data-management plan). Then verify each file
   reconstructs completely:
   ```bash
   node tools/reconstruct.mjs batch_<code>_<timestamp>.json --print
   ```
   Expect `0 failed of 13 checks`. The output lists every pairing, offer,
   acceptance, assistant exchange, per-round points and euro amount.
2. **Payments.** Each participant's debrief screen shows their points, the
   euro amount and a payment code. *Verify Payment Code* in the panel checks a
   code and shows its amount. The amount is 10 + points × 0.05, capped at €40.
3. **Backup.** After the last session of the day:
   ```bash
   POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
   oc exec $POD -- pg_dump -U neg -d negplatform -F c -f /tmp/backup.dump
   oc cp sbe-dad-aineg/$POD:/tmp/backup.dump ./backup_$(date +%Y%m%d).dump
   ```
4. `oc logout`.

## If something breaks

| Symptom | Do |
|---|---|
| Preflight assistant check fails with `warming` twice in a row | `oc get pods`; if Ollama is `0/1` or restarting, `oc logs` it; check GPU quota (day-before step 3). Card-fault signature: `inference compute id=cpu` → delete the pod. |
| Participant sees "assistant is starting up" repeatedly | Same as above. Rounds continue without the assistant; the failures are logged. |
| A group code shows `6/6` before six booths were used | Someone continued twice or a booth was reused; check the Batches table against the seating sheet. |
| A round is `waiting 2/2` and will not start | Start action on the row. |
| A round is `active` but both participants are gone | End session on the row (impasse, `admin_ended`). |
| Panel shows nothing / red errors | Reload the panel. If `GET /api/admin/sessions` fails, `oc logs deployment/neg-platform`. |
| The route is unreachable from booths | VPN/network issue, not the cluster: check from your own machine; call RCS. |
| Anything requiring a code change | Commit on `main`, deploy per `openshift/DEPLOY.md` (digest-pinned), tag `ch1-main-study-2026-09-15-hotfix<N>`, and add a line at the top of this file saying what changed and why. |
