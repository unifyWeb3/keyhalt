# FLEET controller invariants

**Status:** v0.3 invariant-to-test map, 2026-11-04 UTC.

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
| I-01 | No FullAccess key ever exists on a managed account | `model::tests::grant_and_propose_reject_keys_that_already_have_a_role`; `tests::init_is_mode_exclusive_and_schedules_no_full_access_key`; `tests::grant_and_rotate_add_only_function_call_keys`; `tests::no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access`; `tests::provisioning_callback_promotes_operators`; testnet `evidence/testnet-v03/run.json` checks “zero FullAccess keys”; Mode B `evidence/modeb-v03/run.json` native keys; F-001, F-009, F-021 | VERIFIED |
| I-02 | Frozen means no execute succeeds | `model::tests::freeze_blocks_operator_and_unfreeze_restores_positive_control`; `model::tests::execute_requires_active_operator_freeze_and_allowlist`; `tests::freeze_and_unfreeze_are_admin_only`; `tests::execute_requires_active_operator_freeze_and_allowlist`; testnet F-003, F-015, F-023 | VERIFIED |
| I-03 | Only the active admin can freeze or unfreeze; recovery and pending cannot | `model::tests::freeze_and_unfreeze_are_admin_only`; `model::tests::operator_cannot_freeze_but_admin_can`; `model::tests::recovery_cannot_freeze_or_grant`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::mode_b_admin_is_predecessor_only`; `tests::operator_cannot_call_admin_methods`; `tests::unauthorized_admin_call_does_not_change_state`; Mode B testnet direct-member refusal F-024 | VERIFIED |
| I-04 | `revoke_tag("x")` removes every and only the operators with tag `x` | `model::tests::revoke_tag_is_an_exact_partition`; `tests::revoke_and_tag_revoke_are_exact`; testnet F-005 | VERIFIED |
| I-05 | An unauthorized lifecycle call never changes state | `tests::unauthorized_admin_call_does_not_change_state`; `model::tests::operator_cannot_freeze_but_admin_can`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::recovery_cannot_freeze_or_grant`; `tests::public_callback_is_private`; testnet F-010, F-024 | VERIFIED |
| I-06 | Admin rotation never leaves zero active admins | `tests::rotation_never_leaves_zero_active_admins`; `tests::admin_rotation_has_no_add_key_on_accept`; `model::tests::pending_admin_cannot_freeze_and_accept_performs_no_add`; `model::tests::recovery_proposes_but_cannot_accept_itself`; testnet F-006, F-007 | VERIFIED |
| I-07 | The audit chain is append-only and independently verifiable | `model::tests::audit_chain_verifies_and_tamper_fails`; `model::tests::audit_chain_survives_failed_callbacks`; `model::tests::audit_entry_lookup_and_pagination_are_exact`; `model::tests::random_sequences_preserve_reference_and_audit`; `tests::audit_chain_survives_failed_callbacks`; testnet F-008 | VERIFIED |
| I-08 | The contract account holds no deploy, upgrade, transfer, or FullAccess key after deployment | `tests::grant_and_rotate_add_only_function_call_keys`; `tests::no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access`; `tests::init_is_mode_exclusive_and_schedules_no_full_access_key`; no `upgrade`, `deploy`, or `transfer` method exists in `lib.rs`; README design rule; F-001, F-009, F-021, F-028 | VERIFIED |
| I-09 | A failed AddKey receipt never activates the key and never breaks audit | `tests::failed_grant_is_not_active_and_is_removed`; `tests::failed_rotate_add_receipt_is_removed_and_old_key_stays_active`; `tests::failed_rotate_receipt_keeps_audit_and_active_set_consistent`; `tests::provisioning_failure_leaves_controller_unprovisioned`; `model::tests::audit_chain_survives_failed_callbacks`; F-018 | VERIFIED |
| I-10 | The rotation/provision callback path is private and idempotent on failure | `tests::public_callback_is_private`; `tests::failed_rotation_self_callback_clears_inflight_and_allows_retry`; `tests::failed_recovery_callback_leaves_no_inflight_and_allows_retry`; `tests::provisioning_callback_promotes_operators`; `model::tests::grant_failure_removes_pending_operator` | VERIFIED |
| I-11 | Mode A and Mode B are exclusive; Mode B acts only through the predecessor account | `model::tests::init_rejects_both_modes`; `model::tests::init_rejects_both_or_neither_mode`; `model::tests::mode_b_admin_is_predecessor_only`; `tests::mode_b_uses_predecessor_account`; `tests::init_rejects_both_modes`; F-021, F-022, F-024 | VERIFIED |
| I-12 | No lifecycle method issues `AddKey` for a key that already has a role; activation performs no `AddKey` | `model::tests::grant_and_propose_reject_keys_that_already_have_a_role`; `model::tests::rotate_is_fresh_key_first_and_keeps_old_until_confirmed`; `tests::admin_rotation_has_no_add_key_on_accept`; `tests::grant_and_rotate_add_only_function_call_keys`; F-006 | VERIFIED |
| I-13 | The differential reference model matches the implementation on shared random sequences | `model::tests::reference_model_matches_a_short_sequence`; `model::tests::random_sequences_preserve_reference_and_audit` — 3 seeds × 5,000 steps = 15,000 comparisons | VERIFIED |
| I-14 | Cross-agent keys are rejected by the native FunctionCall receiver ACL on the other agent and accepted on their own | testnet `evidence/modeb-v03/run.json` isolation; F-028 | VERIFIED (native ACL layer; not a hostile co-resident contract test) |

## Test counts for v0.3 (2026-11-04 UTC)

- Rust: **43/43 pass** (19 pre-existing model + property tests + 24 wrapper and
  model tests after the invariant work).
- Property/differential: **3 sequences × 5,000 steps** compared after every
  step, plus audit verification each step. Total **15,000** comparisons.
- TypeScript: **21/21 pass** (`npm test`).
- Mutation: the 8 hand-written mutants are a targeted regression set; the
  automated x64 `cargo-mutants` score is recorded in `CLAIMS.md`/CI, not here.

## Not yet proven at this layer

- A 20-run latency p50/p95 (see `CLAIMS.md` F-026 and the LM rows once
  measured). Until those claims exist, no user interface may state an SLO.
- Hostile co-resident contract isolation; native receiver ACL is the current
  guarantee.
- Independent custody of Mode B owners; both owners are operated by the same
  test harness.
