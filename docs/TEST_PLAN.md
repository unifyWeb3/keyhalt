# FLEET test plan (v0.3)

**Status:** v0.3 controller, SDK, CLI, canonical testnet run, mutation test, gas
profile, and reproducibility build are complete. Tests below are marked with the
result that actually ran. `PARTIAL` means a narrower test exists but the full
property is not covered. `PLANNED` and `NOT IMPLEMENTED` are not evidence.
**Date:** 2026-11-03 UTC.
**Rule:** a `VERIFIED` row in `CLAIMS.md` must name a test that ran or a public
testnet transaction hash. A flaky, skipped, or unrun test is not evidence.

---

## 1. Layers actually run

| Layer | Tool | What it proves | Result |
| --- | --- | --- | --- |
| Unit | `cargo test --workspace` | state machine, permission checks, audit hashing, callbacks | **35/35 pass** (170.98 s) |
| Property-style | deterministic xorshift sequences | 5,000-step state/reference equivalence + audit verification | **pass** (`random_sequences_preserve_reference_and_audit`) |
| Differential | `Reference` model | state matches an independent simple model after each step | **pass** (short + 5,000-step) |
| Mutation | `scripts/mutation-test.mjs` | targeted tests constrain eight critical branches | **8/8 killed** |
| Testnet E2E | `scripts/testnet-e2e.mjs` | deployed wasm, real keys, receipts, gas, callbacks | **63/63 checks**, 2026-11-03 |
| SDK/CLI | `npm test` | read paths, audit verify/tamper, exit codes, signer rules | **21/21 pass** |
| Gas | `scripts/gas-profile.mjs` | per-operation cost from canonical evidence | **29 groups**, 3 provision rows |
| Repro | `scripts/repro-build.sh` | two clean `--locked` builds | **byte-identical** |
| Fresh clone | `scripts/fresh-clone-test.sh` | clean clone can reproduce | **PASS** 2026-11-03 (`evidence/fresh-clone-v03.log`) |
| Claims/screener | `node scripts/check-claims.mjs` | no unsupported row | **20/20 verified** |

**Sandbox gap:** `near-workspaces` is not installed on this Linux arm64 host.
`near-workspaces@4.0.0` selects `near-sandbox@0.1.1`, which reports
`Unsupported platform: Linux arm64`; `near-sandbox@0.3.4` requires Node
≥22.22.2 while the host has 22.22.1. Testnet E2E is the integration path here;
sandbox tests remain a CI x64 item.

---

## 2. Invariants and status

| ID | Invariant | Primary tests | Status |
| --- | --- | --- | --- |
| I-01 | `admin_pk` and `admin_account` are never both set; exactly one mode is active after init. | `init_rejects_both_or_neither_mode`, `init_rejects_both_modes`, `init_is_mode_exclusive_and_schedules_no_full_access_key` | **VERIFIED** |
| I-02 | No lifecycle method calls `AddKey` for a key that may already exist; activation performs no `AddKey`. | `admin_rotation_has_no_add_key_on_accept`, `pending_admin_cannot_freeze_and_accept_performs_no_add`, `grant_and_propose_reject_keys_that_already_have_a_role` | **VERIFIED** |
| I-03 | No method adds `FullAccess`; every added key is `FunctionCall` with `receiver = current account` and an allowlisted method set. | `init_is_mode_exclusive_and_schedules_no_full_access_key`, `grant_schedules_function_call_key_and_callback_confirms`; testnet key list | **VERIFIED** for scheduled paths |
| I-04 | `paused = true` blocks every `execute`; `unfreeze` restores the positive control. | `freeze_blocks_operator_and_unfreeze_restores_positive_control`, `execute_requires_active_operator_freeze_and_allowlist`, testnet F-003 | **VERIFIED** |
| I-05 | Only the active admin (Mode A) or `admin_account` (Mode B) can freeze/unfreeze or change lifecycle state; the pending key can only accept. | `operator_cannot_freeze_but_admin_can`, `freeze_and_unfreeze_are_admin_only`, `operator_cannot_call_admin_methods`, `pending_admin_cannot_freeze_and_accept_performs_no_add`, `mode_b_admin_is_predecessor_only` | **VERIFIED** for Mode A; Mode B check is wrapper-only |
| I-06 | A recovery key can propose a fresh admin, but cannot freeze, grant, revoke, or execute; the pending key must accept. | `recovery_cannot_freeze_or_grant`, `recovery_proposes_but_cannot_accept_itself`, `recovery_proposes_and_pending_key_accepts`, testnet F-007 | **VERIFIED** |
| I-07 | `revoke_tag(tag)` removes exactly the operators with that tag; other tags remain and can execute after. | `revoke_tag_is_an_exact_partition`, `revoke_and_tag_revoke_are_exact`, testnet F-005 | **VERIFIED** (deterministic set) |
| I-08 | An unauthorized or malformed call reverts; no state, audit entry, or native key changes. | `invalid_inputs_revert_before_state_change`, `missing_tag_reverts_without_audit`, `grant_failure_removes_pending_operator`, testnet refusals | **VERIFIED** for covered paths |
| I-09 | Audit `seq` is monotonic and gapless; every mutation appends one entry with block height/time and a valid `prev_hash` chain. | `audit_chain_verifies_and_tamper_fails`, `audit_entry_lookup_and_pagination_are_exact`, `random_sequences_preserve_reference_and_audit`, testnet F-008 | **VERIFIED** |
| I-10 | An audit export verifies only if every hash and the head match; any edit is detected. | `audit_chain_verifies_and_tamper_fails`, SDK/CLI tamper tests, `evidence/cli-v03/tamper-verify.json` | **VERIFIED** |
| I-11 | The controller never deploys code, transfers balance, accepts a deposit, or grants full access. | `execute_rejects_wrong_receiver_and_deposit`, `init_is_mode_exclusive_and_schedules_no_full_access_key`; testnet deposit rejection | **VERIFIED** for exposed paths; no deploy/transfer method exists |
| I-12 | A failed add/delete receipt is never counted as success; the controller reports failure or leaves a verifiable pending state. | `failed_grant_is_not_active_and_is_removed`, `audit_chain_survives_failed_callbacks`, `grant_failure_removes_pending_operator` | **VERIFIED** |

---

## 3. Rust unit tests (35)

### 3.1 Pure state machine (`model.rs`, 19 tests)

| Test | What it pins |
| --- | --- |
| `init_rejects_both_or_neither_mode` | mode exclusivity |
| `init_rejects_duplicate_and_colliding_keys` | no duplicate role keys at init |
| `freeze_blocks_operator_and_unfreeze_restores_positive_control` | freeze + positive control |
| `operator_cannot_freeze_but_admin_can` | admin-only freeze |
| `recovery_cannot_freeze_or_grant` | recovery scope |
| `revoke_tag_is_an_exact_partition` | tag partition, others survive |
| `missing_tag_reverts_without_audit` | no-op refusal is not audited |
| `pending_admin_cannot_freeze_and_accept_performs_no_add` | pending key scope; accept flips only |
| `recovery_proposes_but_cannot_accept_itself` | proposer ≠ accepter |
| `grant_and_propose_reject_keys_that_already_have_a_role` | admin/recovery/operator collisions |
| `cancel_admin_is_allowed_for_admin_or_recovery_and_clears_pending` | cancel authorization |
| `rotate_is_fresh_key_first_and_keeps_old_until_confirmed` | old key stays until confirm; other operators survive |
| `grant_failure_removes_pending_operator` | failed callback cleanup |
| `audit_chain_verifies_and_tamper_fails` | hash chain; field, height, and prev-hash tamper |
| `mode_b_admin_is_predecessor_only` | Mode B predecessor check (not a multisig implementation) |
| `invalid_inputs_revert_before_state_change` | malformed input leaves state intact |
| `audit_entry_lookup_and_pagination_are_exact` | seq lookup and page bounds |
| `reference_model_matches_a_short_sequence` | differential model |
| `random_sequences_preserve_reference_and_audit` | 5,000 deterministic steps vs reference; audit verified every step |

### 3.2 near-sdk wrapper (`lib.rs`, 16 tests)

| Test | What it pins |
| --- | --- |
| `init_is_mode_exclusive_and_schedules_no_full_access_key` | init receipts, FunctionCall only |
| `init_rejects_both_modes` | wrapper mode guard |
| `provisioning_callback_promotes_operators` | callback success path |
| `provisioning_failure_leaves_controller_unprovisioned` | callback failure path |
| `freeze_and_unfreeze_are_admin_only` | wrapper ACL |
| `operator_cannot_call_admin_methods` | operator scope |
| `grant_schedules_function_call_key_and_callback_confirms` | AddKey ACL + callback |
| `failed_grant_is_not_active_and_is_removed` | failed AddKey rollback |
| `public_callback_is_private` | callback can only be called by self |
| `execute_requires_active_operator_freeze_and_allowlist` | policy checks |
| `execute_rejects_wrong_receiver_and_deposit` | receiver + deposit |
| `revoke_and_tag_revoke_are_exact` | DeleteKey receipt shape |
| `admin_rotation_has_no_add_key_on_accept` | no AddKey on accept |
| `recovery_proposes_and_pending_key_accepts` | recovery flow |
| `mode_b_uses_predecessor_account` | Mode B actor derivation |
| `audit_chain_survives_failed_callbacks` | audit integrity after failure |

Run log: `evidence/local-tests.txt`. Clippy `--all-targets -D warnings` and
`cargo fmt --check` are clean.

---

## 4. Property and fuzz status

| ID | Property | Status | Note |
| --- | --- | --- | --- |
| T-P-01 | Legal transition sequences preserve mode/admin/recovery/operator invariants | **PARTIAL** | 5,000-step sequence covers freeze/unfreeze, grant success/failure, revoke, missing tag; not rotate/admin/recovery |
| T-P-02 | Audit chain verifies after arbitrary successful mutations; fails after any single-cell edit | **VERIFIED** | verify after every random step; field/height/prev-hash tamper tests |
| T-P-03 | Tag revocation is a partition for random key/tag sets | **PARTIAL** | deterministic partition test only |
| T-P-04 | Key uniqueness across active/pending/recovery/admin for random sets | **PARTIAL** | deterministic collision test only |
| T-P-05 | No generated action adds FullAccess or a non-allowlisted receiver | **PARTIAL** | structural (no FullAccess field) + wrapper tests; not a random generator |

No external `proptest`/`cargo-fuzz` dependency was added. The generator is a
fixed-seed xorshift; a failure would print the step and audit heads. This is
weaker than a shrinking property framework and is disclosed.

---

## 5. Canonical testnet E2E

Evidence: `evidence/testnet-v03/run.json` (63 checks), `RUN.md`,
`audit-agent-1.json`.

| ID | Test | Result |
| --- | --- | --- |
| T-E-01 | Provision 3 agents, each with 6 FunctionCall keys, 0 FullAccess, 4 operators | **PASS** |
| T-E-02 | 12 concurrent executes (3 agents × 4 operator keys) | **PASS** 12/12 in 8,633 ms |
| T-E-03 | Freeze blocks the next execute; unfreeze restores it | **PASS**; no latency claim |
| T-E-04 | Admin recovery through the recovery key | **PASS** |
| T-E-05 | Admin rotation: propose, accept, old admin rejected | **PASS** |
| T-E-06 | Audit export + independent JS recompute + tamper rejection | **PASS** |
| T-E-07 | Replay the 90-second demo script | **PLANNED** — no recording |
| T-I-01 | 3 native accounts, zero FullAccess | **PASS** |
| T-I-02 | Admin rotation with a fresh key; accept adds no key | **PASS** |
| T-I-03 | Allowance refresh by rotation | **PLANNED** — no explicit measurement |
| T-I-04 | Cross-agent isolation (A key on B fails, on A succeeds) | **PLANNED** |
| T-I-05 | Freeze/unfreeze with audit entries | **PASS** |
| T-I-06 | Mode B 2-of-2 multisig | **NOT IMPLEMENTED** |
| T-I-07 | Recovery propose/accept | **PASS** |
| T-I-08 | Tag revoke removes exactly the tag; other tag remains | **PASS** |
| T-I-09 | `get_inventory` matches `view_access_key_list` | **PASS** |
| T-I-10 | Audit export verifies against head | **PASS** |
| T-I-11 | Tamper detection | **PASS** (SDK + CLI) |
| T-I-12 | Per-method gas | **PASS** (`gas-profile.md`) |

Canonical facts: parent `fleet-v03-5cff9e99.testnet`; agents `agent-1b`,
`agent-2`, `agent-3`; wasm 248,644 bytes
`cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`; audit 19
entries, head `cc33b0ea668c9a42d34d5950638e53907009e52c4b197e1328a1f4ce762ee10b`.

---

## 6. Refusal tests

| ID | Refusal | Positive control | Status |
| --- | --- | --- | --- |
| T-R-01 | Operator key calls `freeze`/admin method | Admin key succeeds | **PASS** (unit + testnet protocol ACL) |
| T-R-02 | `execute` while frozen | Execute after `unfreeze` | **PASS** (unit + testnet + CLI) |
| T-R-03 | Key for agent A calls agent B's controller | Same key on agent A | **PLANNED** |
| T-R-04 | `revoke_tag("missing")` | `revoke_tag("ops-a")` removes only that tag | **PASS** (unit) |
| T-R-05 | Pending admin calls `freeze` | Pending admin calls `accept_admin` | **PASS** (unit) |
| T-R-06 | Unauthorized account proposes admin | Active admin proposes | **PARTIAL** (Mode B predecessor test only) |
| T-R-07 | One Mode B confirmation | Second confirmation executes | **NOT IMPLEMENTED** |
| T-R-08 | Mainnet RPC configured | Testnet RPC succeeds | **PASS** (CLI/SDK/RPC script) |
| T-R-09 | Expired pre-signed freeze | Fresh freeze lands | **PLANNED**; no pre-signed path |
| T-R-10 | Grant a key that already has a role | Grant a fresh key | **PASS** (unit + testnet) |

Testnet refusal reasons are captured from `FLEET_REFUSAL:` receipt logs:
`controller is frozen`, `method not allowed`, `receiver not allowed`,
`gas above policy cap`, `key already has a role`, and pending-rotation refusal.

---

## 7. Gas profile

Source: `evidence/testnet-v03/gas-profile.md`.

| Measurement | Result |
| --- | --- |
| Provisioning per agent | 43.04 Tgas (36.65 create/deploy + 6.39 init/AddKey) |
| Concurrent `execute` (n=12) | mean 3.964 Tgas, max 3.965 Tgas |
| `rotate_operator` | 6.652 Tgas |
| `recover_admin` | 6.419 Tgas |
| `propose_admin` | 6.065 Tgas |
| `grant_operator` | 5.663 Tgas |
| `revoke_tag` | 3.917 Tgas |
| `revoke_operator` | 3.173 Tgas |
| `freeze` / `unfreeze` | 2.312 / 2.348 Tgas |
| Protocol-rejected tx (key ACL/deposit) | 0 Tgas; rejected before execution |

| ID | Measurement | Status |
| --- | --- | --- |
| T-G-01 | Per-method gas, min/mean/median/max | **PASS** for sampled methods |
| T-G-02 | Admin allowance budget (calls per 0.1/0.5/1 NEAR) | **PLANNED** |
| T-G-03 | Storage growth per audit entry/operator | **PLANNED** |

The 0.1 NEAR default allowance remains `INFERRED`, not verified as a call
budget.

---

## 8. Latency and limits

| ID | Test | Status |
| --- | --- | --- |
| T-L-01 | 20 independent pre-signed Mode A freezes; p95 wall/block | **PLANNED** |
| T-L-02 | Freeze during an in-flight execute | **PARTIAL** — no cancellation is claimed |
| T-L-03 | Nonce-lane reservation / stale-hash refresh | **PLANNED**; per-operator keys used for concurrency |

The 12-way concurrency result is a throughput observation (8,633 ms for 12
submitted calls), not a latency percentile.

---

## 9. SDK/CLI tests (21)

`npm test` builds all packages and runs:

| Area | Tests |
| --- | --- |
| SDK version and mainnet refusal | 2 |
| SDK missing-signer refusal | 1 |
| big-u64 JSON preservation | 1 |
| 19-entry canonical audit verification | 1 |
| tampered entry + broken prev-hash rejection | 2 |
| raw and `fleet-audit-v1` export verification | 1 |
| CLI version/help | 3 |
| CLI unknown command, mainnet, no signer, bad key mode | 4 |
| CLI canonical audit verify, alias, tamper exit 6 | 3 |
| API scaffold tests | 3 |

Live CLI evidence: `evidence/cli-v03/` (freeze, refusal, unfreeze, inventory,
verify, export, tamper).

---

## 10. Mutation, fresh clone, screener

| ID | Test | Status |
| --- | --- | --- |
| T-M-01 | 8 semantic mutants each killed by a targeted test | **PASS** 8/8; `evidence/mutation/mutation-report.md` |
| T-SC-01 | Fresh clone + `make setup` + `make verify` | **PASS** v0.3 2026-11-03; `evidence/fresh-clone-v03.log` |
| T-SC-02 | Claims checker rejects malformed/unsupported rows | **PASS** (fresh-clone negative control) |
| T-SC-03 | README “do X, see Y” matches reality | **PASS** in the fresh-clone run |
| T-SC-04 | No key/credential in clone or history | **PASS** working tree + history scan |
| T-SC-05 | Every `VERIFIED` claim reproduces against testnet | **PARTIAL** — 20 rows, tx hashes public; not one re-run script |
| T-S-001…T-S-007 | Setup, verify, claims, secret scan, mainnet refusal, static web check | **PASS** (v0.3 verify + fresh clone) |

---

## 11. Claim-to-test map

| Claim | Primary evidence |
| --- | --- |
| F-001 | `run.json` agents/checks; create/init tx |
| F-002 | `run.json` concurrency |
| F-003, F-015 | `run.json` lifecycle; `evidence/cli-v03/*` |
| F-004 | `run.json` lifecycle refusals |
| F-005 | `run.json` lifecycle |
| F-006 | `run.json` admin rotation |
| F-007 | `run.json` recovery |
| F-008 | `run.json` audit; `audit-agent-1.json` |
| F-009 | `run.json` final_keys |
| F-010, F-011 | `run.json` protocol_rejected entries |
| F-012 | `local-tests.txt`; `run.json` wasm fields |
| F-013 | `local-tests.txt` |
| F-014, F-016 | `evidence/cli-v03/*` |
| F-017 | `evidence/mutation/mutation-report.md` |
| F-018 | `evidence/testnet-v03/gas-profile.md` |
| F-019 | `evidence/repro-build/report.md` |
| F-020 | `local-tests.txt`; SDK/CLI tests |

---

## 12. Gaps and exit criteria

Open gaps, in priority order:

1. Mode B 2-of-2 multisig is not implemented.
2. Console design and build are approval-gated; `web/` is a placeholder.
3. No demo recording or replay (`T-E-07`).
4. No freeze-latency measurement or pre-signed path.
5. No cross-agent isolation test (`T-R-03`).
6. No allowance-budget or storage-growth measurement (`T-G-02`, `T-G-03`).
7. Property tests are deterministic and cover a subset of transitions.
8. No near-workspaces sandbox run on this arm64 host.
9. Docs/evidence changed after the fresh-clone commit; re-run the clone test before the submission tag.

| Checkpoint | Criteria | Status |
| --- | --- | --- |
| Core contract | invariant/unit/property green; no AddKey on existing keys; audit verifies | **MET 2026-11-03** |
| SDK/CLI/E2E | 3-agent E2E; SDK/CLI tests; every claim has evidence | **MET 2026-11-03** including fresh clone |
| Feature freeze (Nov 10) | no new features; gas/latency tables complete | Gas done; latency not done |
| Demo (Nov 12) | every step replayed; no untested claim | **PENDING** |
| README final (Nov 13) | fresh clone green; claims checker green; diff link | **PENDING** |
| Submission (Nov 14 12:00 UTC) | human review; repo public; license; X post; JSON; tag | **PENDING HUMAN** |

A checkpoint that slips is recorded with the reason and scope cut; it is not
silently moved.
