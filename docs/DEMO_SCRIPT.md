# FLEET 90-second demo script

**Status:** v0.3 — **planned, not recorded**. The commands below work against
the canonical testnet evidence, but no video exists and `T-E-07` is still
planned. Do not present this script as a recording.
**Date:** 2026-11-03 UTC.
**Rule:** every step maps to a `VERIFIED` row in `CLAIMS.md`. If a step is not
green during rehearsal, cut it rather than softening the claim.

---

## 1. Format

- One continuous terminal recording, 1920×1080, 90 seconds, no cuts that hide a
  command result.
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

### 0:08–0:22 — Inventory: scoped keys, no FullAccess

```bash
$FLEET inventory "$DEMO_ACCOUNT"
```

Show:

- `mode: A`
- `operators: 4 (4 active)`
- `native keys: 6 (0 FullAccess)`
- audit length/head

Claim: F-001, F-009. Test: `evidence/testnet-v03/run.json`.

### 0:22–0:34 — Operator execution

```bash
$FLEET execute "$DEMO_ACCOUNT" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
```

Show `ok: true`, `txHash`, `blockHeight`. Open the tx on NearBlocks only if the
recording includes the browser; otherwise leave the hash on screen.

Claim: F-002, F-014. Test: canonical concurrency + SDK/CLI tests.

### 0:34–0:50 — Freeze stops execution; unfreeze restores it

```bash
$FLEET freeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_ADMIN" --json
$FLEET execute "$DEMO_ACCOUNT" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
$FLEET unfreeze "$DEMO_ACCOUNT" --signer-key-file "$DEMO_ADMIN" --json
```

Show the middle command failing with:

```json
"code": "FLEET_E_REJECTED",
"message": "controller is frozen",
"txHash": "..."
```

Then show the unfreeze succeeding. Do not claim that freeze cancels an in-flight
receipt.

Claim: F-003, F-015. Test: `evidence/cli-v03/refused-execute.json`.

### 0:50–1:06 — Admin rotation: new key, old key loses access

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

### 1:06–1:20 — Audit export and tamper rejection

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

### 1:20–1:30 — Claims discipline and limits

```bash
node scripts/check-claims.mjs
```

Show `CLAIMS 20/20 verified`. End on the README status line or say:

> Testnet only. Unaudited. Mode A is not non-custodial. Mode B is not
> implemented. Freeze does not cancel an in-flight receipt.

Do not show a console, wallet, hosted service, or a mainnet transaction.

---

## 4. Claim map

| Time | Step | Claims | Evidence |
| --- | --- | --- | --- |
| 0:08 | Inventory | F-001, F-009 | `evidence/testnet-v03/run.json` |
| 0:22 | Execute | F-002, F-014 | `run.json`; `evidence/cli-v03/verify.json` |
| 0:34 | Freeze refusal | F-003, F-015 | `evidence/cli-v03/refused-execute.json` |
| 0:50 | Admin rotation | F-006, F-010 | `run.json` lifecycle |
| 1:06 | Audit + tamper | F-008, F-016 | `evidence/cli-v03/*` |
| 1:20 | Claims | F-013, F-017…F-020 | `evidence/local-tests.txt`, `CLAIMS.md` |

Every step also depends on the testnet-only guard (F-014) and the 35-test /
21-test suites (F-013, F-020).

---

## 5. Cut rules

- If the freeze refusal does not show `controller is frozen`, stop and re-record.
- If the tampered audit does not exit 6, stop and re-record.
- If a public RPC is degraded, wait and retry; do not edit the result.
- If admin rotation fails because the new key already exists, generate a fresh
  key before the take.
- If any step needs a console, cut it. The console is not part of v0.3.
- Never add a claim to the narration that is not in `CLAIMS.md`.

---

## 6. After recording

- Save the file outside the repository; do not commit a video.
- Write the public tx hashes and the recording date into the submission notes.
- Ask the human to review the narration against `CLAIMS.md`.
- The human posts; the agent does not.
