# FLEET test plan

**Status:** Phase 1 — the test plan is written; only the **harness** tests
(T-S-001…T-S-007) are implemented. Every product test is `PLANNED`. A planned
test is not evidence and cannot support a claim.
**Date:** 2026-11-03 UTC. Phase 1 target was 2026-10-31; the slip is disclosed in
`research/BUILD_STATUS.md`.
**Rule:** a `VERIFIED` row in `CLAIMS.md` must name a test that ran or a public
testnet transaction hash. A flaky or skipped test is not evidence.

---

## 1. Layers

| Layer | Tool | What it proves | When it runs |
| --- | --- | --- | --- |
| Unit | `cargo test` | State machine, permission checks, audit hashing, tag logic | Every change |
| Property/fuzz | `proptest` / `cargo-fuzz` (planned) | Invariants hold over generated sequences | CI nightly + before freeze |
| Integration | `near-workspaces` sandbox | Real receipts, access keys, gas, callbacks | Every PR once available |
| Testnet E2E | CLI/SDK + public testnet RPC | The deployed contract and real keys behave as claimed | Before each release candidate |
| Refusal | integration + unit | Every rejection has a **positive control** that succeeds | With the feature |
| Gas profiling | receipt outcomes | Gas/storage cost and allowance budget | Before feature freeze |
| Latency | repeated testnet runs | Freeze p95 wall/block target | Before demo recording |
| Fresh clone | shell | A clean agent can reproduce the repo and claims | Before every release candidate |
| Claims/screener | Node + shell | No unsupported claim, no key, no mainnet | Before every commit/tag |

---

## 2. Invariants and the test that proves each

| ID | Invariant (precise) | Primary tests | Status |
| --- | --- | --- | --- |
| I-01 | `admin_pk` and `admin_account` are never both set; exactly one mode is active after init. | T-U-01, T-I-01 | PLANNED |
| I-02 | No lifecycle method calls `AddKey` for a key that may already exist; activation performs no `AddKey`. | T-U-03, T-U-04, T-I-02 | PLANNED |
| I-03 | No method adds `FullAccess`; every added key is `FunctionCall` with `receiver = current account` and an allowlisted method set. | T-U-02, T-P-05, T-I-01 | PLANNED |
| I-04 | `paused = true` blocks every `execute`; `unfreeze` restores the positive control. | T-U-05, T-I-05, T-R-02 | PLANNED |
| I-05 | Only the active admin (Mode A) or `admin_account` (Mode B) can freeze/unfreeze or change lifecycle state; the pending key can only accept. | T-U-06, T-U-12, T-R-01, T-R-05, T-R-06 | PLANNED |
| I-06 | A recovery key can propose a fresh admin, but cannot freeze, grant, revoke, or execute; the pending key must accept. | T-U-11, T-I-07 | PLANNED |
| I-07 | `revoke_tag(tag)` removes exactly the operators with that tag and returns exactly that list; other tags remain and can execute after. | T-U-07, T-P-03, T-I-08, T-R-04 | PLANNED |
| I-08 | An unauthorized or malformed call reverts; no state, audit entry, or native key changes. | T-U-08, T-R-01…T-R-07 | PLANNED |
| I-09 | Audit `seq` is monotonic and gapless; every mutation appends one entry with block height/time and a valid `prev_hash` chain. | T-U-09, T-P-02, T-I-10 | PLANNED |
| I-10 | An audit export verifies only if every hash and the head match; any edit is detected. | T-I-10, T-I-11, T-SC-02 | PLANNED |
| I-11 | The controller never deploys code, transfers balance, accepts a deposit, or grants full access. | T-U-02, T-P-05, T-D-04 | PLANNED |
| I-12 | A failed add/delete receipt is never counted as success; the controller reports failure or leaves a verifiable pending state. | T-U-03, T-U-04, T-I-02, T-I-03 | PLANNED |

---

## 3. Unit tests

| ID | Test | Expected | Status |
| --- | --- | --- | --- |
| T-U-01 | Init with both `admin_pk` and `admin_account`, or neither | Reverts; no state written | PLANNED |
| T-U-02 | Grant/rotate/init key permission | Only `FunctionCall` to current account; `FullAccess` rejected | PLANNED |
| T-U-03 | `accept_admin` path | No `AddKey` action; pending flips active; old admin inactive | PLANNED |
| T-U-04 | Duplicate/fresh key checks | Existing key rejected before any `AddKey`; fresh key accepted | PLANNED |
| T-U-05 | Freeze then `execute` | `execute` reverts while paused; succeeds after unfreeze | PLANNED |
| T-U-06 | Wrong signer calls freeze/grant/revoke | Reverts; state + audit unchanged | PLANNED |
| T-U-07 | `revoke_tag("C")` with A/B/C keys | Only C removed; return list exactly C; A/B remain | PLANNED |
| T-U-08 | Unauthorized call with positive control | Negative reverts, positive succeeds, no partial state | PLANNED |
| T-U-09 | Audit seq/hash after N mutations | Seq 0..N-1, each hash recomputes, head matches | PLANNED |
| T-U-10 | Mode A allowance refresh by rotation | New fresh key has configured allowance; old key inactive; no top-up call | PLANNED |
| T-U-11 | Recovery proposal + accept | Active admin unchanged until accept; recovery cannot execute | PLANNED |
| T-U-12 | Pending key calls freeze/grant | Reverts; only `accept_admin` succeeds | PLANNED |

**Harness unit tests already passing:** Rust scaffold test (1), TypeScript SDK
(2), CLI (3), API (3). They prove the scaffold builds and refuses to fake product
behavior. They do **not** prove any FLEET capability.

---

## 4. Property and fuzz tests

| ID | Property | Generator | Status |
| --- | --- | --- | --- |
| T-P-01 | Any sequence of legal transitions preserves I-01, I-05, I-06 | Random action sequences with valid/invalid actors | PLANNED |
| T-P-02 | Audit hash chain verifies after arbitrary successful mutations, and fails after any single-cell edit | Random mutation sequences + mutation fuzzer | PLANNED |
| T-P-03 | Tag revocation is a partition: removed ∪ retained = original, removed ∩ retained = ∅ | Random key/tag sets | PLANNED |
| T-P-04 | Key uniqueness: no active key equals a pending/recovery/operator key | Random key sets with duplicates | PLANNED |
| T-P-05 | No generated action adds full access or a non-allowlisted receiver | Random grant/rotate/init inputs | PLANNED |

Property tests must print the failing seed and shrink the case. A property test
that only checks the happy path is not sufficient.

---

## 5. Integration tests (`near-workspaces`)

**Tool gap:** `near-workspaces@4.0.0` was selected (Node ≥14; pulls
`near-sandbox@0.1.1`), but installation fails on this Linux arm64 host:
`near-sandbox` reports `Unsupported platform: Linux arm64`. The latest
`near-sandbox@0.3.4` requires Node ≥22.22.2; this host has Node 22.22.1. The
integration tests are therefore written for CI/x64 and are **not run locally** in
Phase 1. This is recorded, not hidden. See `docs/SKILLS_AND_TOOLS.md`.

| ID | Test | Expected | Status |
| --- | --- | --- | --- |
| T-I-01 | Provision 3 accounts, each with controller, admin/operator/gas keys, zero full access | 3 accounts; key lists match inventory; no `FullAccess` | PLANNED |
| T-I-02 | Two-step admin rotation with a fresh key | No `AddKeyAlreadyExists`; old admin inactive; new admin active | PLANNED |
| T-I-03 | Allowance refresh by rotation | New key has allowance; old key cannot call; no in-place top-up | PLANNED |
| T-I-04 | Isolation negative + positive | Key for A fails on B, succeeds on A | PLANNED |
| T-I-05 | Freeze/unfreeze | Frozen execute fails; unfrozen execute succeeds; audit has both | PLANNED |
| T-I-06 | Mode B 2-of-2 | One confirmation does nothing; two freeze; direct bypass denied | PLANNED |
| T-I-07 | Recovery | Recovery proposes; pending accepts; fresh admin freezes/unfreezes | PLANNED |
| T-I-08 | Tag revoke | 3 C keys revoked in one tx; B keys remain and execute after | PLANNED |
| T-I-09 | Inventory vs native keys | `get_inventory` matches `view_access_key_list` for every role | PLANNED |
| T-I-10 | Audit export | Export verifies against head; tx hashes/block heights present | PLANNED |
| T-I-11 | Tamper detection | Edit one audit field → verifier fails; original passes | PLANNED |
| T-I-12 | Gas profile | Per-method gas/storage recorded; allowance budget calculated | PLANNED |

The integration harness must create its own throwaway testnet accounts (or a
sandbox) and must not depend on a human-held key. It must clean up or label the
accounts it leaves behind.

---

## 6. Refusal tests (each with a positive control)

| ID | Refusal | Positive control | Status |
| --- | --- | --- | --- |
| T-R-01 | Operator key calls `freeze`/`grant`/`revoke` | Admin key calls the same method successfully | PLANNED |
| T-R-02 | `execute` while frozen | `execute` after `unfreeze` | PLANNED |
| T-R-03 | Key for agent A calls agent B's controller | Same key calls agent A | PLANNED |
| T-R-04 | `revoke_tag("missing")` | `revoke_tag("C")` removes C only | PLANNED |
| T-R-05 | Pending admin calls `freeze` | Pending admin calls `accept_admin` | PLANNED |
| T-R-06 | Unauthorized account proposes admin | Active admin proposes | PLANNED |
| T-R-07 | One Mode B confirmation | Second confirmation executes | PLANNED |
| T-R-08 | Mainnet RPC configured | Testnet RPC check succeeds | **PASS** (T-S-005) |
| T-R-09 | Expired pre-signed freeze | Fresh pre-signed freeze lands | PLANNED |
| T-R-10 | Grant a key that already exists | Grant a fresh key | PLANNED |

A refusal test without a positive control is not accepted: it could pass because
the whole path is broken.

---

## 7. Gas profiling

| ID | Measurement | Output | Status |
| --- | --- | --- | --- |
| T-G-01 | Gas per method (`init`, `grant`, `rotate`, `revoke`, `revoke_tag`, `freeze`, `accept_admin`, `recover`) | Table with min/median/max, receipt count | PLANNED |
| T-G-02 | Admin allowance budget | Calls per 0.1/0.5/1 NEAR; recommended default | PLANNED |
| T-G-03 | Storage growth per audit entry/operator | Bytes/entry; max operators before storage pressure | PLANNED |

The 0.1 NEAR default in `docs/SPEC_v0.3.md` is `INFERRED` from v0.2 research, not
reproduced here. It becomes `VERIFIED` only after T-G-02.

---

## 8. Freeze latency

| ID | Test | Target | Status |
| --- | --- | --- | --- |
| T-L-01 | 20 independent pre-signed Mode A freezes on testnet | p95 wall submit-to-effect ≤5 s; p95 ≤2 blocks | PLANNED |
| T-L-02 | Freeze during an in-flight execute | Report whether the receipt landed; do not claim cancellation | PLANNED |
| T-L-03 | Nonce-lane reservation and stale-hash refresh | Pre-signed tx accepted on first try; stale tx discarded | PLANNED |

Report the raw samples, p50/p95, block heights, and the RPC endpoint. If the
target is missed, report the measured value and remove the ≤5 s claim. Mode B
two-confirmation latency is reported separately and is not the Mode A result.

---

## 9. Deterministic end-to-end script

| ID | Test | Expected | Status |
| --- | --- | --- | --- |
| T-E-01 | Provision 3 agents from a clean testnet state | 3 accounts, 3 controllers, zero full access | PLANNED |
| T-E-02 | 12 concurrent calls across 3 agents × 4 lanes | 12/12 succeed; block distribution recorded | PLANNED |
| T-E-03 | Freeze mid-flight, measure effect | `paused=true`; next execute fails; latency samples saved | PLANNED |
| T-E-04 | Admin recovery | Fresh admin installs; freeze/unfreeze works | PLANNED |
| T-E-05 | Allowance refresh | Fresh admin key works; old key inactive | PLANNED |
| T-E-06 | Audit export + verify | Export verifies; tamper test fails | PLANNED |
| T-E-07 | Replay the 90-second demo script | Every step matches a tested capability; no untested claim | PLANNED |

The script must be deterministic in ordering, use documented throwaway accounts,
print every tx hash, and save machine-readable output under `evidence/`.

---

## 10. Screener and fresh-clone tests

| ID | Test | Expected | Status |
| --- | --- | --- | --- |
| T-SC-01 | Fresh clone, `make setup`, `make verify` | PASS, no prior context | **PASS** 2026-11-03, `FLEET_REQUIRE_RPC=1` |
| T-SC-02 | Claims checker rejects malformed/unsupported claims | Nonzero exit + clear error | **PASS** (T-S-003) |
| T-SC-03 | README “do X, see Y” matches reality | Commands work; no product claim without a row | **PASS for Phase 1**; product replay pending |
| T-SC-04 | No key/credential in clone or history | Secret scan clean | **PASS** working tree + history scan |
| T-SC-05 | Every `VERIFIED` claim reproduces against testnet | Each row re-run; tx hashes resolve | **N/A** — 0 product claims |

The exact fresh-clone test is `scripts/fresh-clone-test.sh`. It must be green
before every release candidate, including the submission tag.

---

## 11. Harness tests implemented at Phase 1

| ID | Test | Evidence | Status |
| --- | --- | --- | --- |
| T-S-001 | `make setup` on a clean clone | `scripts/fresh-clone-test.sh` run log | **PASS** |
| T-S-002 | `make verify` prints PASS | `make verify` output | **PASS** |
| T-S-003 | Malformed `VERIFIED` row rejected | Fresh-clone negative control | **PASS** |
| T-S-004 | Secret scan finds no key material | `./scripts/secret-scan.sh` | **PASS** |
| T-S-005 | Mainnet RPC refused; testnet accepted | `node scripts/rpc-check.mjs` + negative control | **PASS** |
| T-S-006 | Web placeholder has no script/key field/network call | `make verify` web check | **PASS** |
| T-S-007 | Claim-surface references exist in `CLAIMS.md` | `node scripts/check-claims.mjs` | **PASS** |

These prove the harness, not the product. `CLAIMS.md` remains empty of product
claims.

---

## 12. Exit criteria

| Checkpoint | Criteria |
| --- | --- |
| Core contract (replanned Nov 5) | All invariant unit/property tests green; no `AddKey` on existing keys; audit chain verifies |
| SDK/CLI/E2E (replanned Nov 7) | Fresh-clone test green; 3-agent E2E runs; every claim has a test |
| Feature freeze (Nov 10) | No new features; only fixes; gas/latency tables complete |
| Demo (Nov 12) | Every demo step replayed from the script; no untested claim |
| README final (Nov 13) | Fresh-clone test on a clean session; claims checker green; diff link ready |
| Submission (Nov 14 12:00 UTC) | Human review; repo public; license; X post; submission JSON; tag `hackathon-submission` |

A checkpoint that slips is recorded with the reason and the scope cut. It is not
silently moved.
