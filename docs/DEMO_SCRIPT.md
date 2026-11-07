# FLEET 90-second demo script — split screen

**Status:** v0.3 — **planned, not recorded.** Every command below is runnable
against the recorded canonical testnet evidence; no video exists and `T-E-07`
is still planned. Do not present this script as a recording. The console is
now **built and read-only**: the variant in `docs/CONSOLE_SHOT_LIST.md`
(rehearsed 2026-11-07, ~30 s end to end) replaces this script's pre-built
"B — static draft" path entirely.
**Format:** approved split-screen plan (`docs/DESIGN_SYSTEM.md` §5) — terminal
on one side, console on the other, the ticking block as the visible timer.
**Date:** 2026-11-06 UTC (canonical runs 2026-11-03; latency runs 2026-11-05).
**Rule:** every step maps to a `VERIFIED` row in `CLAIMS.md`. If a step is not
green during rehearsal, **cut it** rather than softening the claim.

---

## 1. Format

- **Split screen, 1920×1080.**
  - **Left pane — terminal.** Full width of the left half. Large font. Every
    command and every result visible. No scrollback scrolling during a step.
  - **Right pane — console.** The three approved screens: Fleet, Agent,
    Timeline (`docs/DESIGN_SYSTEM.md` §4, `docs/CONSOLE_DRAFT.md`).
  - **The ticking block is the timer.** The console header shows
    `testnet · block N` and advances with the chain. It is the only clock on
    screen; there is no stopwatch overlay and no timecode burn-in.
- **The headline is the Mode A freeze: one transaction from the admin key.**
  Say "one transaction" out loud. The Mode B segment comes later and must not
  blur it.
- **Order is fixed:** Mode A freeze → the refused call → unfreeze → tag
  revoke → audit export → Mode B as the stronger-admin path.
- Testnet only. Every transaction hash is visible.
- No private key, seed phrase, credential file, or key-file path is shown. Use
  environment variables for key-file paths.
- The human records and posts. The agent does not post, upload, or submit.
- Rehearse on dedicated demo agents, then reset them before the real take.

---

## 2. Console readiness gate (decide before the take)

The console is **drafted, not built** and is awaiting human approval. Decide
one of these **before** the take, and follow it for the whole recording. Do not
mix the two.

| Situation | Left pane | Right pane |
| --- | --- | --- |
| **A — live console approved and built** | terminal, real commands | the live console with real SDK reads |
| **B — only the static pixel draft exists** (the current state) | terminal, real commands | `design/index.html` opened on the right, a static prototype that renders the **recorded** canonical evidence. Every console row shown is a recorded event, not a live one. |

If the take uses **B**, the narration must not imply that the console is
live. Say once, at 0:07:

> "On the right is the console mock-up, rendering the recorded testnet run.
> It is not built yet."

### 2.1 What each pane shows, per step

| Step | Left pane (terminal) | Right pane (console) |
| --- | --- | --- |
| Title | the two `echo` lines | Fleet screen |
| Mode A freeze | `fleet freeze … --json` | Fleet: the target row flips to **Frozen** (live console) / stays as the recorded row (draft) |
| Refused call | `fleet execute … --json` → `FLEET_E_REJECTED` | Timeline: a **refused · controller is frozen** row |
| Unfreeze | `fleet unfreeze … --json`, then `fleet execute … --json` → `ok` | Timeline: **unfreeze · ok**, then **operator execute · pong** |
| Tag revoke | `fleet revoke-tag … --tag ops-b --json`, then `fleet inventory …` | Agent screen for the revoked agent: the `ops-b` rows leave the operator table (live console only — the draft has no revoked-agent screen; see the cut rule in §7) |
| Audit export | `fleet audit export …`, `fleet verify-audit …` | Timeline: the **✓ verified** column, and the **Export verified export** button becomes enabled |
| Mode B | the three-transaction multisig sequence | Agent screen for `agent-b1.fleet-modeb-748d4372.testnet`, admin row **2 of 2 · 2 owners · demo: same operator** |
| Claims | `node scripts/check-claims.mjs` | Footer: **Verified 37/37 → CLAIMS.md** |

---

## 3. Pre-recording setup (not in the 90 seconds)

Use two dedicated demo agents so the Mode A and Mode B segments do not
interfere:

```bash
export DEMO_A=agent-demo.fleet-v03-5cff9e99.testnet      # Mode A agent
export DEMO_B=agent-b1.fleet-modeb-748d4372.testnet      # Mode B agent
export DEMO_ADMIN=/secure/fleet-demo/admin.json
export DEMO_OPERATOR=/secure/fleet-demo/operator.json
export DEMO_OWNER_1=/secure/fleet-demo/owner-1.json
export DEMO_OWNER_2=/secure/fleet-demo/owner-2.json
export FLEET=./node_modules/.bin/fleet
```

Checklist:

- [ ] `DEMO_A` is unfrozen, provisioned, four active operators, zero FullAccess.
- [ ] `DEMO_ADMIN` can `freeze` and `revoke-tag`; `DEMO_OPERATOR` can `execute`.
- [ ] `DEMO_B`'s multisig parent is initialized 2-of-2 with both demo owners.
- [ ] The `ops-b` tag on `DEMO_A` has at least two operator keys, so the tag
      revoke visibly removes more than one key.
- [ ] Audit export has at least one entry.
- [ ] Terminal font readable; scrollback cleared; notifications off; the
      console pane pre-loaded on the right screen.
- [ ] `$FLEET --version` prints `fleet 0.3.0`.
- [ ] A full dry run completed with no unexpected error.
- [ ] A full dry run **timed at 90 seconds** or less.

---

## 4. The 90 seconds

### 0:00–0:07 — Title, both panes

**Left pane:**

```bash
clear
echo "FLEET — native NEAR account-fleet key lifecycle"
echo "testnet only | unaudited | Mode A is not non-custodial"
```

**Right pane:** Fleet screen.

Say:

> "FLEET governs the native access keys on a fleet of NEAR agent accounts. On
> the right is the console mock-up, rendering the recorded testnet run. It is
> not built yet."

Claim: none; framing only.

### 0:07–0:20 — The headline: Mode A freeze, one transaction

**Left pane:**

```bash
$FLEET freeze "$DEMO_A" --signer-key-file "$DEMO_ADMIN" --json
```

Show `ok: true`, `txHash`, `blockHeight`.

Say:

> "One transaction from the admin key. No second confirmation."

Then:

```bash
$FLEET inventory "$DEMO_A" --json
```

Show `paused: true`.

Say:

> "Measured over 20 testnet runs: optimistic state at p50 5,567 ms, p95
> 13,227 ms; final state at p50 13,251 ms, p95 24,753 ms. One block to
> optimistic effect, p95 33 blocks to final. That is submit-to-state with
> polling included — a measurement, not a service-level promise."

Claim: F-029. Give the millisecond figures with their condition. **Do not say
"seconds."**

### 0:20–0:32 — Frozen means the operator cannot execute

**Left pane:**

```bash
$FLEET execute "$DEMO_A" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
```

Show the refusal:

```json
"code": "FLEET_E_REJECTED",
"message": "controller is frozen",
"txHash": "..."
```

Say:

> "The operator call is refused, and the refusal is recorded in the audit
> chain. A freeze blocks new executions. It does not cancel a receipt that is
> already in flight — we do not claim that."

Claim: F-003, F-015.

### 0:32–0:42 — Unfreeze, one transaction; execution returns

**Left pane:**

```bash
$FLEET unfreeze "$DEMO_A" --signer-key-file "$DEMO_ADMIN" --json
$FLEET execute "$DEMO_A" --method ping --args '{}' --gas 10 \
  --signer-key-file "$DEMO_OPERATOR" --json
```

Show the unfreeze `txHash`, then `ok: true` from the operator execute.

Say:

> "Unfreeze is also one transaction. Over 20 runs: optimistic p50 5,087 ms,
> p95 7,309 ms; final p50 12,389 ms, p95 19,795 ms."

Claim: F-030.

### 0:42–0:54 — Tag revoke: offboarding a whole group of keys

**Left pane:**

```bash
$FLEET revoke-tag "$DEMO_A" --tag ops-b --signer-key-file "$DEMO_ADMIN" --json
$FLEET inventory "$DEMO_A" --json
```

Show `ok: true` and the `txHash`, then the inventory with the `ops-b` keys
gone and the remaining `ops-a` operators still active.

Say:

> "One admin transaction revoked every operator key carrying the ops-b tag —
> bulk offboarding without touching the rest of the fleet. The controller has
> no method that adds a FullAccess key, and no path that transfers balance
> after init."

Claim: F-005, F-009.

### 0:54–1:06 — Audit export and independent verification

**Left pane:**

```bash
$FLEET audit export "$DEMO_A" --out /tmp/fleet-demo-audit.json --json
$FLEET verify-audit /tmp/fleet-demo-audit.json --json
```

Show the verify passing with the entry count and the head hash.

Say:

> "The audit chain is SHA-256 linked, stored on-chain, and re-verified here by
> an independent implementation that does not trust the contract. Export it,
> verify it anywhere."

Claim: F-008, F-016.

### 1:06–1:22 — Mode B: the stronger-admin path, with its real cost

**Right pane switches to:** the Agent screen for
`agent-b1.fleet-modeb-748d4372.testnet`, admin row **2 of 2 · 2 owners ·
demo: same operator**.

**Left pane:** the three-transaction multisig sequence for the same freeze
action on the Mode B agent — `add_request`, then `confirm` by owner 1, then
`confirm` by owner 2 — showing each transaction hash, and the Timeline
state moving `0 of 2` → `1 of 2` → `2 of 2`.

Say:

> "Mode B puts a 2-of-2 multisig in front of the admin key, so a single
> compromised owner cannot freeze the fleet. It costs three transactions per
> transition. Measured over 20 runs, Mode B freeze reached optimistic state at
> p50 10,038 ms, p95 17,105 ms and final state at p50 13,682 ms, p95 32,946
> ms; 13 blocks to optimistic effect, 18 to final at p50. Mode B unfreeze:
> optimistic p50 11,864 ms, p95 21,581 ms, final p50 15,840 ms, p95 42,479
> ms.
>
> Here is the honest limit: in this testnet run both multisig owners were
> operated by the same harness. So this proves the 2-of-2 mechanism works. It
> does not prove independent organizational custody, and Mode B is not
> non-custodial either."

Claims: F-031, F-032, F-023, F-024. **Never say "seconds" for Mode B.** Always
say that both owners were the same operator.

### 1:22–1:29 — Claims discipline and limits

**Left pane:**

```bash
node scripts/check-claims.mjs
```

Show `CLAIMS 37/37 verified`. Say:

> "Every claim in this demo maps to a row in CLAIMS.md and to a test or a
> public transaction hash. Testnet only. Unaudited. Mode A is not
> non-custodial. Mode B reduces single-admin-key trust, but it is not
> independently custodied in this evidence. Freeze does not cancel an
> in-flight receipt."

### 1:29–1:30 — End card

Right pane footer: **Verified 37/37 → CLAIMS.md**. Left pane: the account id
and the last transaction hash of the take.

---

## 5. Claim map

| Time | Step | Claims | Evidence |
| --- | --- | --- | --- |
| 0:07 | **Mode A freeze, one tx** | **F-029** | `evidence/latency-v03/run.json` |
| 0:20 | Frozen refusal | F-003, F-015 | `evidence/cli-v03/refused-execute.json` |
| 0:32 | Unfreeze, one tx | F-030 | `evidence/latency-v03/run.json` |
| 0:42 | Tag revoke | F-005, F-009 | `evidence/testnet-v03/run.json` |
| 0:54 | Audit export + verify | F-008, F-016 | `evidence/cli-v03/audit-export.json` |
| 1:06 | Mode B, 2-of-2, honest latency | F-023, F-024, F-031, F-032 | `evidence/modeb-v03/run.json`, `evidence/latency-v03/run.json` |
| 1:22 | Claims | F-013, F-017, F-020, F-035, F-036, F-037 | `evidence/local-tests.txt`, `CLAIMS.md` |

Every step also depends on the testnet-only guard (F-014) and the test suites
(84 Rust tests, 41 TypeScript tests; F-013, F-020).

The Mode B hashes shown in the take are the recorded ones from
`evidence/modeb-v03/RUN.md`; the console mock-up already carries them.

---

## 6. Cut rules

- If the freeze refusal does not show `controller is frozen`, stop and
  re-record.
- If the Mode A freeze does not show `ok: true` with a transaction hash in
  the allotted 13 seconds, **cut the inventory re-read** and keep the freeze.
- If the tag revoke does not remove the `ops-b` keys from the inventory,
  stop and re-record — do not narrate over a failed revoke.
- If the audit verify does not pass, stop and re-record.
- If the Mode B sequence does not fit in 16 seconds, show the **recorded**
  three-transaction sequence and say "recorded run" on screen. Do not
  compress the narration into a claim the evidence does not support.
- If a public RPC is degraded, wait and retry; do not edit the result.
- If any step needs a wallet, a hosted URL, or a mainnet transaction, cut it.
- Never add a narration claim that is not in `CLAIMS.md`.
- Never call the measured wall times an SLO, and never say "seconds" for the
  Mode B path.
- Never say the console is live when the right pane is the static mock-up.

---

## 7. Optional addendum (not part of the 90 seconds)

The pre-signed freeze path is filmed separately only if it adds value: sign
offline, show that state did not change, then broadcast the same payload and
show the same tx hash on chain (F-034, `evidence/sdk-v03/presign.json`).

The 12-call, 3-agent concurrency measurement can be shown as a single extra
clip: 572 of 600 calls completed over 50 rounds, and every failure was a
public-RPC rate-limit or network error, not a policy rejection (F-033,
`evidence/sdk-v03/concurrency-50x.json`).

---

## 8. After recording

- Save the file outside the repository; do not commit a video.
- Write the public transaction hashes and the recording date into the
  submission notes.
- Ask the human to review the narration against `CLAIMS.md`.
- The human posts; the agent does not.
