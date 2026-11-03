# FLEET day-by-day plan (Nov 1–14, 2026)

**Status:** v0.3 update, 2026-11-03. The original plan below is preserved. Phase
1 closed late on 2026-11-03; the controller, SDK, CLI, and canonical testnet run
were then completed the same day. Mode B, latency measurement, the console, the
demo recording, and submission remain. The slip is disclosed in
`research/BUILD_STATUS.md`; it is not backdated.
**Deadline:** submission **2026-11-14 12:00 UTC**; event closes
**2026-11-14 23:59 UTC**. Judging starts 2026-11-16.
**Track:** `security` only. Testnet only. $0. No mainnet.
**Product line:** “FLEET is a native NEAR account-fleet key-lifecycle control
plane.” Not a wallet, TEE custodian, or policy engine. Mode A is not
non-custodial.

---

## 1. Tiers

| Tier | Meaning | Rule |
| --- | --- | --- |
| **MINIMUM WINNING PRODUCT** | The smallest end-to-end result that is real, testable, and demoable: controller, 3 agents, 12 concurrent calls, freeze, tag revoke, recovery, audit export, CLI, tests, 90-second demo, honest README. | If this is not green by **Nov 10**, cut polish, not correctness. |
| **REQUIRED POLISH** | Mode B 2-of-2 default (if reuse gate passes), read-only console, measured freeze latency, gas table, fresh-clone screener test, claims panel, hosted read-only demo. | Do after the minimum is green; still required for the strongest submission. |
| **OPTIONAL** | On-chain audit anchor, multi-RPC comparison, extra dashboard views, custom multisig, video editing. | Only after required polish; first to cut. |

---

## 2. Original plan (written before the slip)

| Date | Plan | Tier | Human action |
| --- | --- | --- | --- |
| Nov 1 | Core contract skeleton, state machine, unit tests | Minimum | Confirm Phase 1 baseline / Q-001 answer if available |
| Nov 2 | Rotation, allowance refresh, audit chain | Minimum | — |
| Nov 3 | **Checkpoint: core contract passing all invariant tests** | Minimum | Review core result |
| Nov 4 | SDK reads/writes, CLI commands | Minimum | — |
| Nov 5 | `near-workspaces` integration tests, Mode B reuse gate | Required | — |
| Nov 6 | 3-agent E2E, 12 concurrent calls, freeze latency | Minimum | — |
| Nov 7 | **Checkpoint: SDK, CLI, E2E passing fresh-clone test** | Minimum | Review E2E |
| Nov 8 | Read-only console, audit export verifier | Required | — |
| Nov 9 | Gas profiling, refusal matrix, claims pass | Required | — |
| Nov 10 | **Feature freeze** | — | Approve feature set |
| Nov 11 | Demo rehearsal, claims panel, screener run | Required | — |
| Nov 12 | **Demo recorded** | Required | Review video; approve public X post |
| Nov 13 | **README final; fresh-clone green on a clean session**; re-fetch `HACKATHON.md` | Required | Confirm repo public / license / diff link |
| Nov 14 | **Human review and submission by 12:00 UTC** | — | Submit, post X video, provide payout address |

---

## 3. Actual status and recovery plan (as of 2026-11-03)

**Actual status (v0.3):** controller, SDK, CLI, canonical testnet run, mutation
test, gas profile, and reproducible wasm are complete. Mode B, latency,
console, and demo recording remain. The earlier Phase 1 note read: no
controller, SDK, CLI, API, or console product code exists. The Nov 3 core
checkpoint is therefore **missed**; the recovery date is **Nov 5**. No gate is
lowered.

| Date | Plan | Tier | Human action |
| --- | --- | --- | --- |
| **Nov 3 (today)** | Finish Phase 1: docs, scaffold, harness; `make verify` green; fresh-clone green; commit baseline; annotated `pre-hackathon` tag; update research status. **No product code.** | Phase 1 | **Approve Phase 2** and the Mode A/B default. Ask organizers about Q-001. |
| Nov 4 | Controller skeleton: init, state, `execute`, freeze, grant/revoke, audit entry; unit tests. Deploy to a throwaway testnet account only after tests pass. Start Mode B reuse gate in parallel if time. | Minimum | — |
| Nov 5 | **Recovery checkpoint: core contract passing all invariant unit/property tests**; rotation and allowance refresh; audit hash chain. | Minimum | Review core evidence. |
| Nov 6 | SDK reads/writes + CLI commands; local signer; no key in API/browser. `near-workspaces` tests on CI/x64; local arm64 fallback documented. | Minimum | — |
| Nov 7 | **Recovery checkpoint: SDK, CLI, 3-agent E2E, fresh-clone test green**; 12 concurrent calls. | Minimum | Review E2E hashes. |
| Nov 8 | Mode B reuse gate: deploy pinned `multisig2`, 2-of-2, one-confirm refusal, two-confirm freeze; record tx hashes. If it fails, Mode A fallback with disclosure. | Required | — |
| Nov 9 | Freeze latency 20-run test; gas table; audit export verifier; refusal matrix with positive controls. | Required | — |
| Nov 10 | **Feature freeze.** No new features. Read-only console only if the API is green. | Required | Approve feature set. |
| Nov 11 | Claims pass: every README/UI/demo line has a `VERIFIED` row or is removed. Screener dry run. Red-team cases 1–20. | Required | — |
| Nov 12 | **Demo recorded** (90 s), every step replayed; hosted read-only demo up. | Required | **Review video and approve the public X post.** |
| Nov 13 | README final; diff link `pre-hackathon..hackathon-submission`; fresh-clone on a clean session; re-fetch `HACKATHON.md`; final secret/mode check. | Required | **Approve repository public + license + diff link.** |
| Nov 14 | Final human review; tag `hackathon-submission`; submission JSON; X post; payout address if required. **Deadline 12:00 UTC.** | — | **Submit, post, provide payout address; no mainnet deployment.** |

If Nov 5 or Nov 7 slips, cut in this order: optional console views → Mode B
(use Mode A with disclosure) → extra concurrency (report the verified number) →
hosted demo (recorded local demo still valid). Do not cut a test, a disclosure,
or the claims check.

---

## 4. Daily timeboxes

| Window | Work | Stop rule |
| --- | --- | --- |
| 09:00–12:00 UTC | Contract or SDK implementation | At 12:00, run the current tests and record status |
| 12:00–12:15 UTC | `research/BUILD_STATUS.md` timestamp + blocker | Never skip the status line |
| 12:15–17:00 UTC | Continue; integration/testnet | At 17:00, run `make verify` and secret scan |
| 17:00–18:00 UTC | Evidence, claims rows, commit | No commit without secret scan and claims check |

If a timebox will slip, stop, write why, cut scope, and report. Do not silently
extend.

---

## 5. Human-only actions

These are never performed by the agent:

1. **2026-11-03/04:** approve Phase 2 and the Mode A/B default; ask the
   organizers about Q-001 (code from 2026-10-19 vs start 2026-11-01).
2. **2026-11-12:** review the recorded demo and approve the public X post.
3. **2026-11-13:** approve making the repository public; confirm the LICENSE and
   the `pre-hackathon..hackathon-submission` diff link.
4. **2026-11-14:** submit the project JSON, post the X video, and provide the
   payout account if required. Deadline 12:00 UTC.
5. Any spend, mainnet transaction, third-party account, or registration. None are
   planned.

The agent may prepare local text, JSON drafts, and the diff link, but may not
publish, push, post, or submit.

---

## 6. Risks and responses

| Risk | Likelihood | Response |
| --- | --- | --- |
| Phase 1 slip compresses build | High (already happened) | Minimum first; Nov 5/7 recovery checkpoints; cut optional then required polish |
| Q-001 goes against pre-existing code | Medium | New repo, fresh code after `pre-hackathon`; baseline only scaffold/docs; disclose the tag date |
| Mode B `multisig2` reuse fails | Medium | Mode A demo with “not non-custodial”; Mode B stays `HYPOTHESIS` |
| Freeze p95 misses 5 s | Medium | Report measured p95; remove the ≤5 s claim |
| 12 concurrent calls fail on testnet | Low/Medium | Report verified count; update claim and demo |
| `near-workspaces` local arm64 gap | High | Run integration tests on x64 CI; document the gap; use testnet E2E locally |
| RPC outage during judging | Medium | Hosted read-only console + recorded video; pre-saved inventory; no write dependency |
| Audit head not anchored | Certain in v0.3 | State “tamper-evident only with a trusted head”; optional anchor after core |
| Key leak | Low | Keys outside tree, 600/700, pre-commit scan, no key on screen |
| Time lost to server restarts | High (observed) | Short checkpoints, commit often, status file, no long uncommitted stretches |

---

## 7. Definition of done (submission)

- [ ] 3 agents provisioned on testnet; zero full-access keys; inventory matches
      native keys.
- [ ] 12 concurrent calls verified; exact number in `CLAIMS.md`.
- [ ] Freeze measured; p95 reported honestly; in-flight limitation stated.
- [ ] Tag revoke exact; other tags still execute.
- [ ] Admin recovery verified; rotation does not hit `AddKeyAlreadyExists`.
- [ ] Audit export verifies; tamper test fails.
- [ ] Mode B 2-of-2 verified **or** Mode A fallback disclosed.
- [ ] `make verify` and `./scripts/fresh-clone-test.sh` green on a clean clone.
- [ ] Every README/UI/demo claim has a `VERIFIED` row with a test or tx hash.
- [ ] No secret in tree/history; key modes 600/700; no mainnet.
- [ ] Demo recorded; human approved and posted on X.
- [ ] Repository public with LICENSE; README diff link; tag
      `hackathon-submission`.
- [ ] Submission JSON submitted by 2026-11-14 12:00 UTC.
