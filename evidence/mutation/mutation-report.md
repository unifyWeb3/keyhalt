# FLEET mutation test report

Generated: 2026-11-03T19:47:55.450Z
Source: `contracts/fleet-controller/src/model.rs`
Score: **8/8** mutants killed (100.0%)
Source restored byte-identical: true

| ID | Mutant | Target test | Outcome | Time |
| --- | --- | --- | --- | --- |
| M-01 | frozen-check inversion | `model::tests::freeze_blocks_operator_and_unfreeze_restores_positive_control` | **KILLED** | 8762 ms |
| M-02 | tag-revoke partition inversion | `model::tests::revoke_tag_is_an_exact_partition` | **KILLED** | 8404 ms |
| M-03 | admin check OR -> AND | `model::tests::operator_cannot_freeze_but_admin_can` | **KILLED** | 8820 ms |
| M-04 | key-collision OR -> AND | `model::tests::grant_and_propose_reject_keys_that_already_have_a_role` | **KILLED** | 7329 ms |
| M-05 | accept-signer check inversion | `model::tests::recovery_proposes_but_cannot_accept_itself` | **KILLED** | 8871 ms |
| M-06 | cancel authorization OR -> AND | `model::tests::cancel_admin_is_allowed_for_admin_or_recovery_and_clears_pending` | **KILLED** | 7989 ms |
| M-07 | audit entry-hash check inversion | `model::tests::audit_chain_verifies_and_tamper_fails` | **KILLED** | 7806 ms |
| M-08 | rotate retains only the new key | `model::tests::rotate_is_fresh_key_first_and_keeps_old_until_confirmed` | **KILLED** | 7317 ms |

A mutant is KILLED when the targeted test fails after the mutation. A
SURVIVED mutant would mean the test suite does not constrain that behavior.
