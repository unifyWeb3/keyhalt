# FLEET 90-second demo script (target)

**Status:** Phase 1 — this is a **target script, not a recording**. No product
capability is implemented, so **no step is demo-eligible yet**. Each row names
the test that must pass before the step can be recorded. `PLANNED` means not run.
**Date:** 2026-11-03 UTC.
**Rule:** every step must map to a `VERIFIED` row in `CLAIMS.md` and a green test
in `docs/TEST_PLAN.md`. If a step is not verified, cut it or mark it untested on
screen. Do not record a step that relies on an untested claim.

---

## 1. Format

- One continuous screen recording, 1920×1080, 90 seconds, no cuts that hide a
  command result. A terminal plus the read-only console is enough.
- Testnet only. Every transaction hash is visible or in the description.
- No private key, seed phrase, credential file, or key file path is shown.
- The human posts the video publicly on X; the agent does not post.
- The recording is made only after `T-E-07` (demo replay) passes.
- A hosted read-only console is optional; if hosted, it stays up through
  **2026-11-18** (ideally 2026-11-25) and has no write path.

---

## 2. Timeline

| Time | Step | What the viewer sees | Test that must pass | Claim |
| --- | --- | --- | --- | --- |
| 0–6 s | Title and honesty panel | “FLEET — native NEAR account-fleet key-lifecycle control plane. Testnet. Unaudited. Mode A is not non-custodial.” Claims panel: 0 product claims at Phase 1. | T-SC-03, T-SC-05 | No product claim yet |
| 6–16 s | Provision 3 agents | `fleet provision --agents 3` (planned); 3 account IDs; each key list has zero `FullAccess`; controller + operator + gas keys shown. | T-E-01, T-I-01 | “3 agents provisioned with zero full-access keys” |
| 16–28 s | 12 concurrent calls | `fleet demo concurrency --agents 3 --lanes 4` (planned); 12/12 success, max overlap, two blocks; one denied call with positive control. | T-E-02, T-R-01, T-R-02 | “12 concurrent calls across 3 agents × 4 lanes” |
| 28–40 s | Freeze mid-flight | Pre-signed freeze is submitted while a call is in flight; `paused=true`; next `execute` denied; measured wall/block latency on screen. Do **not** say the in-flight call was cancelled. | T-E-03, T-L-01, T-L-02 | “Freeze took effect in measured p95; new executes blocked” |
| 40–52 s | Tag revoke | `fleet revoke-tag --tag C` (planned); 3 keys removed in one tx; returned list has 3; a B key still executes. | T-E-06, T-I-08, T-R-04 | “A tag revoke removed exactly tag C and B still works” |
| 52–64 s | Admin recovery | Recovery proposes a fresh admin; pending key accepts; new admin freezes/unfreezes. Show old admin inactive. | T-E-04, T-I-07 | “Lost-admin recovery installed a fresh admin key” |
| 64–76 s | Audit export | `fleet audit export` + `fleet verify-audit`; chain verifies; one field edited in a copy; verifier fails. | T-E-06, T-I-10, T-I-11 | “Audit export is hash-chained and tamper-evident” |
| 76–88 s | Claims panel | Three columns: VERIFIED (with test/tx), HYPOTHESIS/UNKNOWN, NOT CLAIMED. Explicitly: unaudited, testnet, Mode A not non-custodial, no in-flight cancellation, no 20 lanes. | T-SC-03, T-SC-05 | No claim without evidence |
| 88–90 s | Close | “FLEET is a native NEAR account-fleet key-lifecycle control plane. Testnet reference implementation.” | — | Product definition only |

The 90-second budget is tight. If a step overruns, cut the optional console view
and keep the terminal result. Do not speed up a transaction or hide a failure.

---

## 3. What is deliberately not shown

- No mainnet account, real funds, payout address, or KYC.
- No private key, seed phrase, `.env`, credential JSON, or `~/.near-credentials`.
- No “20 parallel calls”, “16 lanes”, “top-up works”, “two-step rotation works”,
  “audited”, “production-ready”, “trustless”, or unqualified “non-custodial”.
- No wallet connection, browser signing, or server-side key.
- No claim that a freeze cancels a receipt already accepted by the chain.
- No business/DeFi/agent-swarm claim. Track is `security` only.

---

## 4. Failure fallbacks (decide before recording)

| Failure | Fallback | What must be said |
| --- | --- | --- |
| Mode B 2-of-2 reuse gate fails | Demo Mode A; keep Mode B as `HYPOTHESIS` | “Mode A is not non-custodial; the team holds the admin key.” |
| Freeze p95 misses 5 s | Show the measured p95; cut the ≤5 s sentence | “Measured p95 is X s; the target was not met.” |
| 12 concurrent calls fail | Show the verified count (e.g. 8/12); update the claim | “12 was the target; the verified result is N.” |
| Recovery step fails | Cut the step; mark recovery `UNKNOWN` | “Recovery is not claimed.” |
| Testnet RPC outage | Use a pre-recorded local sandbox run, labelled “sandbox, not testnet” | “This segment is a sandbox replay, not a testnet result.” |
| Audit anchor challenged | Show hash-chain verify; state no on-chain anchor | “Tamper-evident only with a trusted head; no on-chain anchor.” |
| Judge asks “OutLayer does this” | Show the one-sentence edge and the native-key scope | “FLEET controls native access keys on accounts the team already owns; it is not a custody contract.” |

---

## 5. Pre-recording checklist

- [ ] `make verify` green.
- [ ] `./scripts/fresh-clone-test.sh` green on a clean clone.
- [ ] `T-E-07` demo replay green; every step has a `VERIFIED` claim row.
- [ ] Every tx hash in the video resolves on testnet explorer.
- [ ] No key material visible in the terminal scrollback, shell history, or
      browser tabs. Clear the screen and use a clean shell.
- [ ] Claims panel matches `CLAIMS.md`; no unsupported wording.
- [ ] Mode A/B disclosure is on screen.
- [ ] Hosted console (if any) is read-only and will stay up through 2026-11-18.
- [ ] The human has reviewed the video and approved the public X post.

The agent does not post, publish, or submit. Those are human-only actions.
