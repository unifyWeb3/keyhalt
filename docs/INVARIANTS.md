# FLEET controller invariants

**Status:** v0.3 invariant-to-test map, final 2026-11-06 UTC.

**Rule:** every invariant names the exact test that proves it. If no test
exists, the row is `OPEN`, not `VERIFIED`. A test that exists but fails makes
the invariant `FAILED` and the release is blocked.

## Interpretation notes

- “Only admin or recovery can freeze or unfreeze” is too broad for this
  controller. Freeze and unfreeze are admin-only. The recovery key exists to
  propose a fresh admin after admin loss; it cannot freeze, grant, or unfreeze.
  A pending admin cannot freeze either.
- Mode B moves the admin to a predecessor account. A direct call by a multisig
  member is not enough.
- “No deploy or upgrade key” refers to keys on the managed contract account and
  to any receipt emitted by the controller lifecycle. NEAR account creation is
  excluded; the managed account is created by the parent with no keys.

## Invariant table

| ID | Invariant | Proof / test | Status |
| --- | --- | --- | --- |
| I-01 | No FullAccess key ever exists on a managed account | `model::tests::grant_and_propose_reject_keys_that_already_have_a_role`; `tests::init_is_mode_exclusive_and_schedules_no_full_access_key`; `tests::grant_and_rotate_add_only_function_call_keys`; `tests::no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access`; `tests::provisioning_callback_promotes_operators`; testnet `evidence/testnet-v03/run.json` checks “zero FullAccess keys”; Mode B `evidence/modeb-v03/run.json` native keys; integration `integrations/js/integrations.test.mjs` “holds no FullAccess key and no key outside the execute allowlist”; F-001, F-009, F-021 | VERIFIED |
| I-02 | Frozen means no execute succeeds | `model::tests::freeze_blocks_operator_and_unfreeze_restores_positive_control`; `model::tests::execute_requires_active_operator_freeze_and_allowlist`; `tests::freeze_and_unfreeze_are_admin_only`; `tests::execute_requires_active_operator_freeze_and_allowlist`; integration “freezes, refuses execute, and unfreezes again”; testnet F-003, F-015, F-023 | VERIFIED |
| I-03 | Only the active admin can freeze or unfreeze; recovery and pending cannot | `model::tests::freeze_and_unfreeze_are_admin_only`; `model::tests::operator_cannot_freeze_but_admin_can`; `model::tests::recovery_cannot_freeze_or_grant`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::mode_b_admin_is_predecessor_only`; `tests::operator_cannot_call_admin_methods`; `tests::unauthorized_admin_call_does_not_change_state`; integration “refuses a freeze from a non-admin predecessor without changing state”; Mode B testnet direct-member refusal F-024 | VERIFIED |
| I-04 | `revoke_tag("x")` removes every and only the operators with tag `x` | `model::tests::revoke_tag_is_an_exact_partition`; `tests::revoke_and_tag_revoke_are_exact`; testnet F-005 | VERIFIED |
| I-05 | An unauthorized lifecycle call never changes state | `tests::unauthorized_admin_call_does_not_change_state`; `model::tests::operator_cannot_freeze_but_admin_can`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::recovery_cannot_freeze_or_grant`; `tests::public_callback_is_private`; `tests::private_callback_refusal_is_logged_with_its_reason`; integration “refuses a freeze from a non-admin predecessor without changing state”; testnet F-010, F-024 | VERIFIED |
| I-06 | Admin rotation never leaves zero active admins | `tests::rotation_never_leaves_zero_active_admins`; `tests::admin_rotation_has_no_add_key_on_accept`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::recovery_proposes_but_cannot_accept_itself`; testnet F-006, F-007 | VERIFIED |
| I-07 | The audit chain is append-only and independently verifiable | `model::tests::audit_chain_verifies_and_tamper_fails`; `model::tests::audit_chain_survives_failed_callbacks`; `model::tests::audit_entry_lookup_and_pagination_are_exact`; `model::tests::random_sequences_preserve_reference_and_audit`; `tests::audit_chain_survives_failed_callbacks`; integration “records a verifiable audit chain after init” and “keeps the audit chain verifiable after freeze and unfreeze”; testnet F-008 | VERIFIED |
| I-08 | The contract account holds no deploy, upgrade, transfer, or FullAccess key after deployment | `tests::grant_and_rotate_add_only_function_call_keys`; `tests::no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access`; `tests::init_is_mode_exclusive_and_schedules_no_full_access_key`; no `upgrade`, `deploy`, or `transfer` method exists in `lib.rs`; README design rule; F-001, F-009, F-021, F-028 | VERIFIED |
| I-09 | A failed AddKey receipt never activates the key and never breaks audit | `tests::failed_grant_is_not_active_and_is_removed`; `tests::failed_rotate_add_receipt_is_removed_and_old_key_stays_active`; `tests::failed_rotate_receipt_keeps_audit_and_active_set_consistent`; `tests::provisioning_failure_leaves_controller_unprovisioned`; `model::tests::audit_chain_survives_failed_callbacks`; F-018 | VERIFIED |
| I-10 | The rotation/provision callback path is private and idempotent on failure | `tests::public_callback_is_private`; `tests::private_callback_refusal_is_logged_with_its_reason`; `tests::failed_rotation_self_callback_clears_inflight_and_allows_retry`; `tests::failed_recovery_callback_leaves_no_inflight_and_allows_retry`; `tests::provisioning_callback_promotes_operators`; `model::tests::grant_failure_removes_pending_operator` | VERIFIED |
| I-11 | Mode A and Mode B are exclusive; Mode B acts only through the predecessor account | `model::tests::init_rejects_both_modes`; `model::tests::init_rejects_both_or_neither_mode`; `model::tests::mode_b_admin_is_predecessor_only`; `tests::mode_b_uses_predecessor_account`; `tests::init_rejects_both_modes`; integration “provisions a Mode B agent with four active FunctionCall operators”; F-021, F-022, F-024 | VERIFIED |
| I-12 | No lifecycle method issues `AddKey` for a key that already has a role; activation performs no `AddKey` | `model::tests::grant_and_propose_reject_keys_that_already_have_a_role`; `model::tests::rotate_is_fresh_key_first_and_keeps_old_until_confirmed`; `tests::admin_rotation_has_no_add_key_on_accept`; `tests::grant_and_rotate_add_only_function_call_keys`; F-006 | VERIFIED |
| I-13 | The differential reference model matches the implementation on shared random sequences | `model::tests::reference_model_matches_a_short_sequence`; `model::tests::random_sequences_preserve_reference_and_audit` — 3 seeds × 5,000 steps = 15,000 comparisons; the reference model is in `contracts/fleet-controller/src/reference_model.rs`, written from `docs/SPEC_v0.3.md` alone | VERIFIED |
| I-14 | Cross-agent keys are rejected by the native FunctionCall receiver ACL on the other agent and accepted on their own | testnet `evidence/modeb-v03/run.json` isolation; F-028 | VERIFIED (native ACL layer; not a hostile co-resident contract test) |

## Backend gates (final v0.3)

These are not controller invariants; they are the evidence gates that make the
invariant table trustworthy. Each one names the exact run that proves it.

| Gate | What it proves | Exact run / artifact | Status |
| --- | --- | --- | --- |
| Differential model | `reference_model.rs` reproduces the implementation after every step of 3 × 5,000 random sequences | `model::tests::random_sequences_preserve_reference_and_audit`; `FLEET_PROPERTY_STEPS`/`FLEET_PROPERTY_SEEDS` defaults 5000/3; CI `ci` workflow | VERIFIED |
| Automated mutation score | 248 of 252 viable mutants caught (98.41%); 4 missed are provably equivalent; 0 timeouts | `docs/MUTATION.md`; GitHub Actions `mutation` run `42172689910` on `81325ed`; artifact `cargo-mutants-report`; F-036 | VERIFIED |
| Integration suite | A real near-sandbox (near-workspaces 5.0.0) provisions a Mode B agent, holds no FullAccess key, runs operator execute, freezes/refuses/unfreezes, and keeps the audit chain verifiable | `integrations/js/integrations.test.mjs` (7 tests); GitHub Actions `integration` run on `81325ed` | VERIFIED |
| Mode A latency | 20 freeze and 20 unfreeze cycles on the single-transaction admin path with p50/p95 submit-to-optimistic and submit-to-final, plus blocks to effect | `evidence/latency-v03/run.json`; F-029, F-030 | VERIFIED |
| Mode B latency | 20 freeze and 20 unfreeze cycles on the 2-of-2 multisig path (three transactions each) with the same statistics | `evidence/latency-v03/run.json`; F-031, F-032 | VERIFIED |
| SDK concurrency | 12 concurrent `createFleetClient().execute()` calls through the published SDK all succeed on testnet | `evidence/sdk-v03/concurrency.json`; F-033 | VERIFIED |
| Pre-signed freeze | CLI signs a freeze without broadcasting it (state and audit length unchanged), then `--submit-signed` broadcasts it, the account freezes, the audit chain verifies, and an unfreeze restores it | `evidence/sdk-v03/presign.json`; F-034 | VERIFIED |
| Claims discipline | Every VERIFIED claim has evidence, and the checker rejects a malformed VERIFIED row | `scripts/check-claims.mjs`; negative control in `scripts/fresh-clone-clean-session.sh` (F-037) | VERIFIED |
| Clean-session clone | A clone with no inherited `FLEET_*`/`NEAR_*` variable and an empty `HOME` passes `make setup` and `make verify` and reproduces the deployed wasm sha256 | `scripts/fresh-clone-clean-session.sh`; F-037 | VERIFIED |

## Test counts for v0.3 (final, 2026-11-06 UTC)

- Rust: **84/84 pass** in `cargo test -p fleet-controller --lib`:
  - 19 `model::tests` — pure state machine, audit chain, and the differential
    reference-model property test;
  - 25 `tests` — near-sdk wrapper, callback, receipt, and policy tests;
  - 40 `mutation_tests` — targeted mutant-killing regression set.
- Property/differential: **3 sequences × 5,000 steps** compared after every
  step, plus audit verification each step. Total **15,000** comparisons.
  The mutation workflow runs the same test at 1 × 20 steps per mutant
  (documented in `docs/MUTATION.md`).
- TypeScript: **41/41 pass** (`npm test`): 18 SDK tests, 20 CLI tests, and
  3 API tests.
- Integration: **7/7 pass** in the GitHub Actions `integration` workflow
  (near-workspaces 5.0.0; not runnable on this arm64 host).
- Mutation: **248/252 = 98.41%** caught, 4 equivalent survivors justified in
  `docs/MUTATION.md`, 0 timeouts.

## Build and test deviations

These deviations are deliberate and each one has a reason. None of them
changes what the deployed controller does.

1. **The release wasm is byte-identical to the deployed artifact.** The
   deployed controller is 248,644 bytes, sha256
   `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`,
   built with `cargo build --locked` on rustc 1.93.0. The wasm data section
   stores the source line numbers of panic locations, so **any** line added,
   removed, or moved before the end of `lib.rs` or `model.rs` changes the
   artifact. Consequences:
   - `#[cfg(test)]` module declarations live at the **end** of `lib.rs` and
     `model.rs`; tests added to an existing `#[cfg(test)]` module (which is
     already after all production code) do not shift production line numbers.
   - Test-only accessors to private helpers (`model::test_hooks`) live at the
     end of `model.rs` and are compiled only under `cfg(test)`.
   - Production visibility, `.detach()` calls, and
     `env::signer_account_pk().to_string()` are kept exactly as they were when
     the artifact was deployed. Restoring them was verified by rebuilding and
     comparing the sha256.
2. **The integration sandbox builds the same source against near-sdk 5.16.0.**
   near-workspaces 5.0.0 pins near-sandbox 0.1.x (nearcore 2.6.2), which
   predates the global-contract and gas-key host imports that near-sdk 5.29.1
   declares unconditionally. `scripts/build-sandbox-wasm.sh` copies the
   manifest, the lock file, and `lib.rs` to a temporary tree, applies three
   semantically neutral edits (near-sdk `=5.16.0`, drop the promise instead of
   `.detach()`, `String::from(&public_key)` instead of `to_string()`), builds,
   and restores the repository files. The sandbox wasm is **not**
   byte-identical to the deployed artifact and is never deployed.
3. **The sandbox wasm is lowered below the bulk-memory proposal.**
   nearcore 2.6.2 does not enable bulk-memory, while current rustc emits
   `memory.copy`/`memory.fill`. `scripts/lower-wasm-bulk-memory.mjs`
   (binaryen 132.0.0) rewrites those instructions to loops; the script asserts
   that no `memory.copy`/`memory.fill` remains and that every import exists in
   nearcore 2.6.2.
4. **Integration results come from x64 CI only.** near-sandbox cannot run on
   this arm64 host, so the local `make verify` skips the integration suite and
   the GitHub Actions `integration` workflow is the record.
5. **The mutation run shortens the property test.** Every mutant re-runs the
   whole suite; the workflow sets 1 seed × 20 steps so one mutant's test cycle
   stays practical. The published differential run is 3 × 5,000. The mutation
   score is unaffected: the property test is not the test that kills the
   mutants in the table (see `docs/MUTATION.md`).
6. **The controller test count grew after the deployed artifact was frozen.**
   Tests were added inside the existing `#[cfg(test)] mod tests`, after all
   production code, so the deployed wasm stayed byte-identical (checked by
   rebuilding and comparing the sha256 after every change).

## Not yet proven at this layer

- Hostile co-resident contract isolation; the native receiver ACL is the
  current guarantee.
- Independent custody of Mode B owners; both owners are operated by the same
  test harness.
- Any latency as a service-level objective. Every latency row in `CLAIMS.md`
  includes transaction submission, finalization, and state polling; it is a
  measurement, not an SLO.
