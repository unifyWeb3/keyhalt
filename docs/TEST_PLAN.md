# FLEET test plan (v0.3 final)

**Status:** v0.3 controller, SDK, CLI, canonical Mode A testnet run, Mode B
2-of-2 testnet run, automated mutation score, integration suite, latency,
SDK concurrency, pre-signed freeze, and clean-session clone are complete.
Tests below are marked with the result that actually ran. `PARTIAL` means a
narrower test exists but the full property is not covered. `PLANNED` and
`NOT IMPLEMENTED` are not evidence.
**Date:** 2026-11-06 UTC (canonical runs executed 2026-11-03; latency run
2026-11-05; mutation/integration CI 2026-11-06).
**Rule:** a `VERIFIED` row in `CLAIMS.md` must name a test that ran or a public
testnet transaction hash. A flaky, skipped, or unrun test is not evidence.
**Canonical invariant map:** `docs/INVARIANTS.md` maps I-01…I-14 to the exact
proving test. This document is the test-plan overview; where the two overlap,
`docs/INVARIANTS.md` wins.

---

## 1. Layers actually run

| Layer | Tool | What it proves | Result |
| --- | --- | --- | --- |
| Unit | `cargo test --workspace` | state machine, permission checks, audit hashing, callbacks | **84/84 pass** (707.12 s local) |
| Property/differential | deterministic xorshift sequences vs `reference_model.rs` | state/reference equivalence after every step + audit verification | **pass** — 3 seeds × 5,000 steps = 15,000 comparisons |
| Mutation (automated) | `cargo-mutants` on x64 CI | every proposed mutation is killed or provably equivalent | **248/252 viable = 98.41%**; 0 timeouts; F-036 |
| Mutation (hand-written) | `scripts/mutation-test.mjs` | targeted regression set for eight critical branches | **8/8 killed**; F-017 |
| Testnet E2E (Mode A) | `scripts/testnet-e2e.mjs` | deployed wasm, real keys, receipts, gas, callbacks | **63/63 checks**, 2026-11-03 |
| Testnet E2E (Mode B) | `scripts/testnet-modeb.mjs` | pinned multisig, 2-of-2 confirmation, refusals, audit, storage, isolation | **52/52 checks**, 2026-11-03 |
| Integration | `near-workspaces` on x64 CI | sandbox provisioning, no FullAccess key, execute, freeze/unfreeze, audit | **7/7 pass**; F-035 |
| SDK/CLI | `npm test` | read paths, audit verify/tamper, exit codes, signer rules, pre-signed format, `--json` and documented exit code on every CLI command | **41/41 pass** |
| Latency | `scripts/testnet-latency-agent.mjs` | p50/p95 submit-to-optimistic/final + blocks, 20 runs per transition | **Mode A and Mode B complete**; F-029…F-032 |
| SDK concurrency | `scripts/testnet-sdk-concurrency.mjs` | 12 concurrent SDK `execute` calls | one run 11/12 (`fetch failed`), saved run 12/12 first attempt, 6,486 ms; F-033 |
| SDK concurrency, 50-round replay | `scripts/testnet-concurrency-50x.mjs` | the same 12-call, 3-agent scenario replayed 50 times (600 calls), paced against the public RPC rate limit | **572/600 = 95.33%** completed; every failure recorded with its cause; F-033 |
| Pre-signed freeze | `scripts/testnet-presign-freeze.mjs` | sign without broadcast; same hash on submit | **pass**; F-034 |
| Gas | `scripts/gas-profile.mjs` | per-operation cost from canonical evidence | **29 groups**, 3 provision rows |
| Repro | `scripts/repro-build.sh` + multisig source build | two clean `--locked` builds per wasm | **byte-identical** |
| Fresh clone | `scripts/fresh-clone-test.sh`, `scripts/fresh-clone-clean-session.sh` | a clean clone can reproduce the deployed artifact with no inherited secret | **PASS** 2026-11-06; F-037 |
| Claims/screener | `node scripts/check-claims.mjs` | no unsupported row | **41/41 verified** |

**Sandbox note:** `near-workspaces` cannot run on the arm64 development host
(`Unsupported platform: Linux arm64`; the newer sandbox needs Node ≥22.22.2
while the host has 22.22.1), so the integration suite runs in the GitHub
Actions `integration` workflow on x64. near-workspaces pins a nearcore that
predates the near-sdk 5.29 host imports, so the suite builds the same source
against near-sdk 5.16 in a temporary tree and lowers bulk-memory with binaryen;
the release artifact is untouched (see `evidence/integration-v03/README.md`
and `docs/INVARIANTS.md` "Build and test deviations").

---

## 2. Invariants and status

The canonical invariant table is `docs/INVARIANTS.md`: **I-01…I-14, no `OPEN`
rows**. Each row names the exact test (Rust unit test, property test,
integration test, or testnet transaction) that proves it. The backend gates
(differential model, mutation score, integration, latency, SDK concurrency,
pre-signed freeze, claims discipline, clean-session clone) are listed there
too, each with its exact run or artifact.

---

## 3. Rust tests (84)

Run log: `evidence/local-tests.txt` (2026-11-06 re-verification section).
`cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` are clean.

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
| `reference_model_matches_a_short_sequence` | differential model, short sequence |
| `random_sequences_preserve_reference_and_audit` | 3 seeds × 5,000 steps vs `reference_model.rs`; audit verified every step |

### 3.2 near-sdk wrapper (`lib.rs`, 25 tests)

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
| `failed_rotate_add_receipt_is_removed_and_old_key_stays_active` | failed rotate add receipt |
| `failed_rotate_receipt_keeps_audit_and_active_set_consistent` | audit/active-set consistency |
| `failed_rotation_self_callback_clears_inflight_and_allows_retry` | rotation retry after failure |
| `failed_recovery_callback_leaves_no_inflight_and_allows_retry` | recovery retry after failure |
| `public_callback_is_private` | callback can only be called by self |
| `private_callback_refusal_is_logged_with_its_reason` | body-level `assert_private` logs `FLEET_REFUSAL` |
| `execute_requires_active_operator_freeze_and_allowlist` | policy checks |
| `execute_rejects_wrong_receiver_and_deposit` | receiver + deposit |
| `revoke_and_tag_revoke_are_exact` | DeleteKey receipt shape |
| `admin_rotation_has_no_add_key_on_accept` | no AddKey on accept |
| `rotation_never_leaves_zero_active_admins` | rotation safety |
| `recovery_proposes_and_pending_key_accepts` | recovery flow |
| `mode_b_uses_predecessor_account` | Mode B actor derivation |
| `audit_chain_survives_failed_callbacks` | audit integrity after failure |
| `unauthorized_admin_call_does_not_change_state` | unauthorized no-op |
| `grant_and_rotate_add_only_function_call_keys` | every added key is FunctionCall |
| `no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access` | no privileged receipt actions |

### 3.3 Targeted mutation regression (`lib.rs` `mutation_tests`, 40 tests)

Forty `mt_*` tests constrain the exact branches that cargo-mutants exercises
(account/key/tag/method boundaries, promise truth table, audit views and
pagination, callback paths, error messages, allowance parsing, event/log
shape). They are the reason the automated score below is 98.41%; the
hand-written 8-mutant set (F-017) is a separate, smaller regression set.

---

## 4. Property and fuzz status

| ID | Property | Status | Note |
| --- | --- | --- | --- |
| T-P-01 | Legal transition sequences preserve mode/admin/recovery/operator invariants | **PARTIAL** | the random sequence covers freeze/unfreeze, grant success/failure, revoke, missing tag, and is compared to `reference_model.rs` every step; it does not generate rotate/admin/recovery |
| T-P-02 | Audit chain verifies after arbitrary successful mutations; fails after any single-cell edit | **VERIFIED** | verify after every random step; field/height/prev-hash tamper tests |
| T-P-03 | Tag revocation is a partition for random key/tag sets | **PARTIAL** | deterministic partition test only |
| T-P-04 | Key uniqueness across active/pending/recovery/admin for random sets | **PARTIAL** | deterministic collision test only |
| T-P-05 | No generated action adds FullAccess or a non-allowlisted receiver | **PARTIAL** | structural (no FullAccess field) + wrapper tests; not a random generator |
| T-P-06 | The differential reference model matches the implementation on shared random sequences | **VERIFIED** | 3 seeds × 5,000 steps = 15,000 comparisons; reference written from `docs/SPEC_v0.3.md` alone |

No external `proptest`/`cargo-fuzz` dependency was added. The generator is a
fixed-seed xorshift; a failure would print the step and audit heads. This is
weaker than a shrinking property framework and is disclosed. The default is
`FLEET_PROPERTY_SEEDS=3` × `FLEET_PROPERTY_STEPS=5000`; the mutation workflow
runs the same test at 1 × 20 per mutant (documented deviation in
`docs/MUTATION.md`).

---

## 5. Canonical testnet E2E

Evidence: `evidence/testnet-v03/run.json` (63 checks), `RUN.md`,
`audit-agent-1.json`.

| ID | Test | Result |
| --- | --- | --- |
| T-E-01 | Provision 3 agents, each with 6 FunctionCall keys, 0 FullAccess, 4 operators | **PASS** |
| T-E-02 | 12 concurrent executes (3 agents × 4 operator keys) | **PASS** 12/12 in 8,633 ms |
| T-E-03 | Freeze blocks the next execute; unfreeze restores it | **PASS**; latency claim in F-029/F-030 |
| T-E-04 | Admin recovery through the recovery key | **PASS** |
| T-E-05 | Admin rotation: propose, accept, old admin rejected | **PASS** |
| T-E-06 | Audit export + independent JS recompute + tamper rejection | **PASS** |
| T-E-07 | Replay the 90-second demo script | **PLANNED** — no recording |
| T-I-01 | 3 native accounts, zero FullAccess | **PASS** |
| T-I-02 | Admin rotation with a fresh key; accept adds no key | **PASS** |
| T-I-03 | Allowance refresh by rotation | **PLANNED** — no explicit measurement |
| T-I-04 | Cross-agent isolation (A key on B fails, on A succeeds) | **PASS** both directions; `modeb-v03/run.json` isolation |
| T-I-05 | Freeze/unfreeze with audit entries | **PASS** |
| T-I-06 | Mode B 2-of-2 multisig | **PASS**; `modeb-v03/run.json`, 52 checks |
| T-I-07 | Recovery propose/accept | **PASS** |
| T-I-08 | Tag revoke removes exactly the tag; other tag remains | **PASS** |
| T-I-09 | `get_inventory` matches `view_access_key_list` | **PASS** |
| T-I-10 | Audit export verifies against head | **PASS** |
| T-I-11 | Tamper detection | **PASS** (SDK + CLI) |
| T-I-12 | Per-method gas | **PASS** (`gas-profile.md`) |

Canonical Mode A facts: parent `fleet-v03-5cff9e99.testnet`; agents `agent-1b`,
`agent-2`, `agent-3`; wasm 248,644 bytes
`cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`; audit 19
entries, head `cc33b0ea668c9a42d34d5950638e53907009e52c4b197e1328a1f4ce762ee10b`.

Mode B facts: parent/multisig `fleet-modeb-748d4372.testnet`; agent
`agent-b1.fleet-modeb-748d4372.testnet`; two account members
`fleet-v03-5cff9e99.testnet` and `fleet-v03-fund2-8b91351d.testnet`; multisig wasm
293,734 bytes
`df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`; audit 3
entries, head `82d6e41d73dbbc53144af462bf09340e35dac76e11e8da21a4f2b5bb8796d39b`.
Both owner accounts were operated by the same test harness; this does not prove
independent custody.

---

## 6. Refusal tests

| ID | Refusal | Positive control | Status |
| --- | --- | --- | --- |
| T-R-01 | Operator key calls `freeze`/admin method | Admin key succeeds | **PASS** (unit + testnet protocol ACL) |
| T-R-02 | `execute` while frozen | Execute after `unfreeze` | **PASS** (unit + testnet + CLI) |
| T-R-03 | Key for agent A calls agent B's controller | Same key on agent A | **PASS** both directions; native receiver ACL |
| T-R-04 | `revoke_tag("missing")` | `revoke_tag("ops-a")` removes only that tag | **PASS** (unit) |
| T-R-05 | Pending admin calls `freeze` | Pending admin calls `accept_admin` | **PASS** (unit) |
| T-R-06 | Unauthorized account proposes admin | Active admin proposes | **PARTIAL** (Mode B non-member request refusal only) |
| T-R-07 | One Mode B confirmation | Second confirmation executes | **PASS**; freeze/unfreeze both confirmed by two account members |
| T-R-08 | Mainnet RPC configured | Testnet RPC succeeds | **PASS** (CLI/SDK/RPC script) |
| T-R-09 | Stale or replayed pre-signed freeze | Fresh pre-signed freeze lands | **PARTIAL** — the fresh pre-signed path, mode-600 file, format/method/account/key-material refusals, and hash equality are tested (F-034); a consumed-nonce replay is not recorded |
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
| T-G-02 | Admin allowance budget (calls per 0.1/0.5/1 NEAR) | **PARTIAL** — derived from the measured mean tokens burnt; not an exhaustion test |
| T-G-03 | Storage growth per audit entry/operator | **PASS** — 1,713 bytes for 6 added entries (285.5 bytes/entry including vector growth) |

The measured Mode A admin allowance was 0.0986856 NEAR after the latency run;
at the measured mean of `217287439890900000000` yocto burnt per freeze, the
derived upper bound is 454 freeze calls. This is an arithmetic bound, not a live
exhaustion test.

---

## 8. Latency and limits

20 runs per transition, dedicated agents, 2026-11-05. Source:
`evidence/latency-v03/run.json`. Percentiles are submit-to-state and include
transaction submission, finalization, and state polling. They are
measurements, not an SLA.

| Path | Transition | Txs | Optimistic p50 / p95 | Final p50 / p95 | Blocks opt. p50 / p95 | Blocks final p50 / p95 | Claim |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Mode A | freeze | 1 | 5,567 / 13,227 ms | 13,251 / 24,753 ms | 1 / 1 | 15 / 33 | F-029 |
| Mode A | unfreeze | 1 | 5,087 / 7,309 ms | 12,389 / 19,795 ms | 1 / 1 | 16 / 25 | F-030 |
| Mode B | freeze | 3 | 10,038 / 17,105 ms | 13,682 / 32,946 ms | 13 / 19 | 18 / 47 | F-031 |
| Mode B | unfreeze | 3 | 11,864 / 21,581 ms | 15,840 / 42,479 ms | 14 / 19 | 21 / 66 | F-032 |

| ID | Test | Status |
| --- | --- | --- |
| T-L-01 | 20 independent Mode A freezes (and 20 unfreezes); p50/p95 wall/block | **PASS** — F-029, F-030 |
| T-L-02 | Freeze during an in-flight execute | **PARTIAL** — no cancellation is claimed |
| T-L-03 | Nonce-lane reservation / stale-hash refresh | **PARTIAL** — per-operator keys used for concurrency; the pre-sign path tests one signed payload, not a refresh race |
| T-L-04 | Three historical Mode A cycles; submit → observed state | **PASS** (historical) — mean 22,716 ms / 21,997 ms on `rpc.testnet.near.org`; superseded by T-L-01 |
| T-L-05 | Mode B 2-of-2 freeze/unfreeze wall time | **PASS** (historical) — 20,884 ms / 27,064 ms; superseded by F-031/F-032 |
| T-L-06 | 12 concurrent SDK `execute` calls | **PASS** — one run 11/12 (`fetch failed`), saved run 12/12 first attempt, 6,486 ms; F-033 |
| T-L-06b | The same 12-call, 3-agent scenario replayed 50 times (600 calls) | **PASS** — 572/600 = 95.33% completed; 28 failures, all public-RPC rate-limit/network errors; F-033 |
| T-L-07 | Pre-signed freeze hash equals the submitted/on-chain hash | **PASS** — F-034 |

The 12-way concurrency result is a throughput observation, not a latency
percentile. Mode B is three transactions per transition and both owners were
operated by the same harness; its numbers describe the mechanism, not
independent custody.

### 8.1 The 50-round concurrency replay (T-L-06b)

`scripts/testnet-concurrency-50x.mjs` replays the 12-call, 3-agent scenario
(3 agents x 4 operator keys = 12 concurrent `createFleetClient().execute()`
calls per round) 50 times. Every attempt of every call is written to the
evidence file, including the error text, so the success rate and every
failure cause can be checked afterwards. Three runs are saved:

| Run | Evidence file | Pacing | Completed | Failures and cause |
| --- | --- | --- | --- | --- |
| 1 | `evidence/sdk-v03/concurrency-50x-attempt1-unpaced.json` | none | 331/600 | HTTP 429 `Rate limits exceeded` from `rpc.testnet.fastnear.com` |
| 2 | `evidence/sdk-v03/concurrency-50x-attempt2-paced-unfunded.json` | 12 s between rounds, 60 s every 10 rounds | 447/600 | HTTP 429, plus `agent-2` and `agent-3` dropping below the testnet storage-stake balance floor (`lacks balance … yoctoNear for state`) |
| 3 | `evidence/sdk-v03/concurrency-50x.json` | same pacing, after a 2.4 NEAR top-up to each of `agent-2` and `agent-3` | **572/600 = 95.33%** | 83 HTTP 429 responses and one transient `fetch failed`; no balance failure and no FLEET policy rejection |

Run 3 is the measured run quoted in F-033: 560 calls succeeded on the first
attempt, 12 succeeded after one retry, and 28 failed after three attempts.
The failures occurred in rounds 29, 30, 32, 35, 36, and 38, where the public
endpoint's rate-limit window closed. The top-up transactions are
`CnL1LtP87EGrYxJZq4B1e1RHmbtju6UzUMmX5S1238TT` and
`2maJG5FPChKvzXVAf8kMYHRuJZEJDuP8fdMeZLR3YZf5`.

`agent-1b.fleet-v03-5cff9e99.testnet` is not part of this scenario: the
canonical lifecycle run revoked two of its four operators, so it no longer
carries four active operator keys.

### 8.2 Alternative public RPC endpoints

The alternatives documented by NEAR were also tried, read-only, for the same
scenario: `rpc.testnet.near.org` returns a deprecation warning with HTTP 429
under load (9/12 in one round), `near-testnet.drpc.org` throttled to 7/12 in
one round (216,195 ms), `rpc.ankr.com/near_testnet` returned HTTP 403
(`API key is not allowed to access blockchain`), and `rpc.testnet.lava.build`,
`1rpc.io/near/testnet`, and `neartestnet.api.onfinality.io/public` did not
answer the `status` call. Pacing `rpc.testnet.fastnear.com` was therefore the
measurement path.

---

## 9. SDK/CLI tests (41)

`npm test` builds all packages and runs 41 tests: **18 SDK + 20 CLI + 3 API**.

| Area | Tests |
| --- | --- |
| SDK version and mainnet refusal | 2 |
| SDK missing-signer refusal (write and pre-sign paths) | 2 |
| big-u64 JSON preservation | 1 |
| Pre-signed transaction format: accept, six payload refusals, foreign-account refusal | 8 |
| SDK transaction hash covers the unsigned transaction | 1 |
| Audit: canonical verify, tamper, broken link, export forms | 4 |
| CLI version/help/pre-signed help | 4 |
| CLI refusals: unknown command, mainnet, no signer, key mode | 4 |
| CLI canonical audit verify, alias, tamper exit 6 | 3 |
| CLI pre-signed file refusals: no `--out`, format, method, account, key material, unreadable | 6 |
| CLI `--json` and documented exit code on every product command | 1 |
| CLI help documents `--json` for every product command | 1 |
| The documented exit-code table agrees with the SDK mapping | 1 |
| API scaffold tests | 3 |
| **Total** | **41** (18 SDK + 20 CLI + 3 API) |

Live CLI evidence: `evidence/cli-v03/` (freeze, refusal, unfreeze, inventory,
verify, export, tamper). Live SDK evidence: `evidence/sdk-v03/concurrency.json`
and `evidence/sdk-v03/presign.json`.

---

## 10. Mutation, fresh clone, screener

| ID | Test | Status |
| --- | --- | --- |
| T-M-01 | 8 hand-written mutants each killed by a targeted test | **PASS** 8/8; `evidence/mutation/mutation-report.md` |
| T-M-02 | Automated cargo-mutants score on x64 CI | **PASS** 248/252 = 98.41%; 4 provably equivalent survivors justified in `docs/MUTATION.md`; F-036 |
| T-SC-01 | Fresh clone + `make setup` + `make verify` | **PASS** 2026-11-06 on the final tree; `evidence/fresh-clone-v03-clean-session.log` (earlier runs: `evidence/fresh-clone-v03-final.log`, `evidence/fresh-clone-v03-modeb.log`) |
| T-SC-02 | Claims checker rejects malformed/unsupported rows | **PASS** (clean-session negative control) |
| T-SC-03 | README "do X, see Y" matches reality | **PASS** in the fresh-clone run |
| T-SC-04 | No key/credential in clone or history | **PASS** working tree + history scan |
| T-SC-05 | Every `VERIFIED` claim reproduces against testnet | **PARTIAL** — 40 rows, tx hashes public; not one re-run script |
| T-S-001…T-S-007 | Setup, verify, claims, secret scan, mainnet refusal, static web check | **PASS** (v0.3 verify + fresh clone) |

### 10.1 Automated mutation survivors (4 of 252) and their disposition

Run `42172689910` (x64 CI, commit `81325ed`) generated 275 mutants; 248 were
caught, 23 did not compile, and **4 survived**. All four are **provably
equivalent**: for every possible input the mutated function returns exactly
the same value as the original, so no test can distinguish them. They cannot
be killed without editing production code, and production code is frozen
because the deployed wasm embeds panic-location line numbers — any edit
changes the deployed bytes and invalidates the artifact-hash evidence
(F-012/F-019). The disposition is therefore a written justification, per
`docs/MUTATION.md`.

| # | Mutant | Mutation | Why no test can kill it |
| --- | --- | --- | --- |
| 1 | `contracts/fleet-controller/src/model.rs:170:20` in `valid_account` | replace `<` with `==` | The original rejects `len < 2`. The mutant's condition is `len == 2 \|\| len > 64 \|\| !contains('.')`. For lengths 0 and 1, `contains('.')` is false, so the mutant also rejects. For lengths ≥ 3 both forms are false at that clause and fall through to the identical checks. For length 2 both forms reject (mutant at the first clause; original at the next one, since every length-2 string containing `'.'` is `"a."`, `".a"`, or `".."`). Identical for every input. |
| 2 | `contracts/fleet-controller/src/model.rs:170:20` in `valid_account` | replace `<` with `<=` | Differs from the original only at length 2, where the mutant rejects at the first clause. The original also rejects at length 2 whenever the string contains `'.'` (the only way to pass `!contains('.')`), by the starts-with/ends-with/`..` check. At every other length the terms are identical. Identical for every input. |
| 3 | `contracts/fleet-controller/src/model.rs:183:40` in `valid_public_key` | replace `>` with `==` | The mutant differs only at length 80, where it rejects at `len == 80`. The original accepts the first length check at 80 but the final check requires `rest.len() <= 64`; with `curve` `ed25519` (7) or `secp256k1` (9), a length-80 key has `rest.len()` 72 or 70, so the original also rejects. Lengths > 80 are rejected by both. Identical for every input. |
| 4 | `contracts/fleet-controller/src/model.rs:183:40` in `valid_public_key` | replace `>` with `>=` | Differs from the original only at length 80, where the first clause rejects. The original also rejects at length 80 through the `rest.len() <= 64` check (see #3). Identical for every input. |

The redundant comparisons are a defence-in-depth style choice in a validator
already double-guarded by other conditions. Removing them to make the mutants
non-equivalent would change the deployed artifact; that trade is not
acceptable, so the mutants stand as justified equivalents.

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
| F-021…F-024 | `evidence/modeb-v03/run.json`, `RUN.md`, `audit-modeb.json` |
| F-025 | `evidence/modeb-v03/multisig-repro-build.md/json`; `run.json` |
| F-026, F-027 | `evidence/modeb-v03/run.json` latency |
| F-028 | `evidence/modeb-v03/run.json` isolation |
| F-029…F-032 | `evidence/latency-v03/run.json`, `agent.json` |
| F-033 | `evidence/sdk-v03/concurrency.json`, `evidence/sdk-v03/concurrency-50x.json` |
| F-034 | `evidence/sdk-v03/presign.json` |
| F-035 | `evidence/integration-v03/` (x64 CI, 7/7) |
| F-036 | `evidence/mutation-v03/`, `docs/MUTATION.md` (x64 CI, 98.41%) |
| F-037 | `evidence/fresh-clone-v03-clean-session.log` |

---

## 12. Gaps and exit criteria

Open gaps, in priority order:

1. Mode B owner independence is not proven: both owner accounts are operated by
   the same test harness. The 2-of-2 mechanism is verified; independent
   organizational custody is not.
2. The multisig contract is third-party and unaudited; its upstream README
   disclaims guarantees.
3. Console design was approved (the `unslop` direction; pixel draft in
   `design/index.html` is the reference) and the console is built
   read-only (`packages/console` + `web/`); recording and public use remain
   human-approval gates.
4. No demo recording or replay (`T-E-07`).
5. Allowance budget is derived, not exhausted (`T-G-02`).
6. Property tests are deterministic and cover a subset of transitions.
7. The integration suite runs the same contract source, not the exact deployed
   bytes, because the sandbox's nearcore predates the deployed near-sdk host
   imports (documented deviation).
8. Docs/evidence changed after the clean-session commit; re-run the clone test
   before the submission tag if the functional tree changes.

| Checkpoint | Criteria | Status |
| --- | --- | --- |
| Core contract | invariant/unit/property green; no AddKey on existing keys; audit verifies | **MET 2026-11-03** |
| SDK/CLI/E2E | 3-agent E2E; SDK/CLI tests; every claim has evidence | **MET 2026-11-03** including fresh clone |
| Backend hardening | mutation ≥85%; differential model; invariant map; integration in CI; 20-run latency; pre-sign path; clean session | **MET 2026-11-06** — 98.41%, 3×5,000, I-01…I-14, 7/7, F-029…F-034, F-037 |
| Feature freeze (Nov 10) | no new features; gas/latency tables complete | Gas and latency tables done; no new features planned |
| Demo (Nov 12) | every step replayed; no untested claim | **PENDING** |
| README final (Nov 13) | fresh clone green; claims checker green; diff link | **PENDING** |
| Submission (Nov 14 12:00 UTC) | human review; repo public; license; X post; JSON; tag | **PENDING HUMAN** |

A checkpoint that slips is recorded with the reason and scope cut; it is not
silently moved.
