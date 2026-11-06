# FLEET 90-second demo script

**Status:** v0.3 — **planned, not recorded**. The Mode A commands below work
against the canonical testnet evidence, but no video exists and `T-E-07` is
still planned. Do not present this script as a recording.
**Date:** 2026-11-06 UTC (canonical runs executed 2026-11-03; latency runs
2026-11-05).
**Rule:** every step maps to a `VERIFIED` row in `CLAIMS.md`. If a step is not
green during rehearsal, cut it rather than softening the claim.

---

## 1. Format

- One continuous terminal recording, 1920×1080, 90 seconds, no cuts that hide a
  command result.
- **The headline is the Mode A freeze: one transaction from the admin key.**
  Say “one transaction” out loud; do not let the 2-of-2 path blur it.
- Testnet only. Every transaction hash is visible.
- No private key, seed phrase, credential file, or key-file path is shown. Use
  environment variables for key-file paths.
- The human records and posts. The agent does not post, upload, or submit.
- The console is **not shown**: it is not built. Terminal only.
- Rehearse on a dedicated demo agent, then reset it before the real take.

---

## 2. Pre-recording setup (not in the 90 seconds)

Use a dedicated demo agent, e.g. `agent-demo.fleet-v03-5cff9e99.testnet`,
provisioned by the controller with six FunctionCall keys and zero FullAccess.
Keep signer files outside the repository, mode 600.

```bash
export DEMO_ACCOUNT=agent-demo.fleet-v03-5cff9e99.testnet
export DEMO_ADMIN=/secure/fleet-demo/admin.json
export DEMO_OPERATOR=/secure/fleet-demo/operator.json
export DEMO_NEW_ADMIN=/secure/fleet-demo/new-admin.json
export FLEET=./node_modules/.bin/fleet
```

Checklist:

- [ ] Dedicated agent is unfrozen and has four active operators.
- [ ] `$DEMO_ADMIN` can `freeze`; `$DEMO_OPERATOR` can `execute`.
- [ ] `$DEMO_NEW_ADMIN` is a fresh key not currently on the account.
- [ ] Audit export has at least one entry.
- [ ] Terminal font is readable; scrollback is cleared; notifications are off.
- [ ] `$FLEET --version` prints `fleet 0.3.0`.
- [ ] A dry run completed without an unexpected error.

---

## 3. The 90 seconds

### 0:00–0:08 — Title

On screen, type:

```bash
clear
echo "FLEET — native NEAR account-fleet key lifecycle"
echo "testnet only | unaudited | Mode A is not non-custodial"
```

Claim: none; framing only.

### 0:08–0:18 — Before: one account, scoped keys, no FullAccess

```bash
$FLEET inventory "$DEMO_ACCOUNT"
```

Show `mode: A`, `operators: 4 (4 active)`, `native keys: 6 (0 FullAccess)`,
and `paused: false`.

Claim: F-001, F-009. Test: `evidence/testnet-v03/run.json`.

### 0:18–0:32 — The headline: freeze in one transaction

```bash
$FLEET freeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_ADMIN" --json
```

Show `ok: true`, `txHash`, `blockHeight`. Say:

> One transaction from the admin key. No second confirmation.

Then, if the terminal is fast enough:

```bash
$FLEET inventory "$DEMO_ACCOUNT"
```

Show `paused: true`.

Say: “In the 20-run measurement this path reached optimistic state at p50
5,567 ms, p95 13,227 ms, and final state at p50 13,251 ms, p95 24,753 ms; the
effect was visible in one block optimistically. That is a measurement from
`evidence/latency-v03/run.json`, not a service-level promise.”

Claim: F-029. Do not say “seconds”; give the measured numbers with their
condition (submit-to-state, polling included).

### 0:32–0:44 — Frozen means the operator cannot execute

```bash
$FLEET execute "$DEMO_ACCOUNT" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
```

Show the refusal:

```json
"code": "FLEET_E_REJECTED",
"message": "controller is frozen",
"txHash": "..."
```

Do not claim that freeze cancels an in-flight receipt. It blocks new
executions; it does not cancel receipts already in flight.

Claim: F-003, F-015. Test: `evidence/cli-v03/refused-execute.json`.

### 0:44–0:58 — Unfreeze in one transaction; execution returns

```bash
$FLEET unfreeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_ADMIN" --json
$FLEET execute "$DEMO_ACCOUNT" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
```

Show the unfreeze `txHash`, then `ok: true` from the operator execute.

Say: “Unfreeze is also one transaction. The measured unfreeze path reached
optimistic state at p50 5,087 ms, p95 7,309 ms and final state at p50
12,389 ms, p95 19,795 ms over 20 runs” (F-030).

### 0:58–1:12 — Admin rotation: new key, old key loses access

```bash
$FLEET propose-admin "$DEMO_ACCOUNT" --new-admin "<new-admin-public-key>" \
  --signer-key-file "$DEMO_ADMIN" --json
$FLEET accept-admin "$DEMO_ACCOUNT" --signer-key-file "$DEMO_NEW_ADMIN" --json
$FLEET freeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_ADMIN" --json
$FLEET freeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_NEW_ADMIN" --json
$FLEET unfreeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_NEW_ADMIN" --json
```

Expected: propose and accept succeed; the old admin freeze is rejected by the
native key ACL (the key was deleted); the new admin freeze/unfreeze succeeds.
The new public key is public; it may be shown.

Claim: F-006, F-010. Test: `run.json` admin rotation + old-admin rejection.

### 1:12–1:24 — Audit export and tamper rejection

```bash
$FLEET audit export "$DEMO_ACCOUNT" --out /tmp/fleet-demo-audit.json --json
$FLEET verify-audit /tmp/fleet-demo-audit.json --json

cp /tmp/fleet-demo-audit.json /tmp/fleet-demo-tampered.json
python3 - <<'PY'
import json
p = "/tmp/fleet-demo-tampered.json"
d = json.load(open(p))
d["entries"][0]["subject"] = "tampered"
json.dump(d, open(p, "w"), indent=2)
PY
$FLEET verify-audit /tmp/fleet-demo-tampered.json --json
```

Show the first verify passing with an entry count and head, then the tampered
verify failing with `entry_hash mismatch` and exit code 6.

Claim: F-008, F-016. Test: `evidence/cli-v03/tamper-verify.json`.

### 1:24–1:30 — Claims discipline and limits

```bash
node scripts/check-claims.mjs
```

Show `CLAIMS 37/37 verified`. End on the README status line or say:

> Testnet only. Unaudited. Mode A is not non-custodial. Mode B reduces
> single-admin-key trust with a 2-of-2 multisig, but it is not independently
> custodied in this evidence. Freeze does not cancel an in-flight receipt.

Do not show a console, wallet, hosted service, or a mainnet transaction.

---

## 4. Claim map

| Time | Step | Claims | Evidence |
| --- | --- | --- | --- |
| 0:08 | Inventory | F-001, F-009 | `evidence/testnet-v03/run.json` |
| 0:18 | **Freeze, one tx** | **F-029** | `evidence/latency-v03/run.json` |
| 0:32 | Frozen refusal | F-003, F-015 | `evidence/cli-v03/refused-execute.json` |
| 0:44 | Unfreeze, one tx | F-030 | `evidence/latency-v03/run.json` |
| 0:58 | Admin rotation | F-006, F-010 | `run.json` lifecycle |
| 1:12 | Audit + tamper | F-008, F-016 | `evidence/cli-v03/*` |
| 1:24 | Claims | F-013, F-017, F-020, F-035, F-036, F-037 | `evidence/local-tests.txt`, `CLAIMS.md` |

Every step also depends on the testnet-only guard (F-014) and the test suites
(84 Rust tests, 38 TypeScript tests; F-013, F-020).

Mode B is deliberately outside the 90-second Mode A take. If the submission
needs it, point to `evidence/modeb-v03/RUN.md`, the latency table in the README,
and claims F-021…F-028, F-031, F-032 rather than adding unrecorded steps. Mode B
is three transactions per transition, and its numbers must not be described as
“seconds”.

## 5. Optional addendum (not part of the 90 seconds)

The pre-signed freeze path is filmed separately only if it adds value: sign
offline, show that state did not change, then broadcast the same payload and
show the same tx hash on chain (F-034,
`evidence/sdk-v03/presign.json`).

## 6. Cut rules

- If the freeze refusal does not show `controller is frozen`, stop and re-record.
- If the tampered audit does not exit 6, stop and re-record.
- If a public RPC is degraded, wait and retry; do not edit the result.
- If admin rotation fails because the new key already exists, generate a fresh
  key before the take.
- If any step needs a console, cut it. The console is not part of v0.3.
- Never add a claim to the narration that is not in `CLAIMS.md`.
- Never call the measured wall times an SLO, and never say “seconds” for the
  Mode B path.

---

## 7. After recording

- Save the file outside the repository; do not commit a video.
- Write the public tx hashes and the recording date into the submission notes.
- Ask the human to review the narration against `CLAIMS.md`.
- The human posts; the agent does not.
