# FLEET controller specification v0.3

**Status:** design target, now implemented as the v0.3 controller. The contract,
SDK, CLI, and Mode B 2-of-2 path exist and ran on testnet on 2026-11-03. The
console is not implemented. Every `HYPOTHESIS` still needs a test before it is
claimed; the current claim status is in `docs/TEST_PLAN.md`. This is not a
security audit.
**Date:** 2026-11-04 UTC (Mode B run executed 2026-11-03 UTC). Phase 1 target
was 2026-10-31; the slip is disclosed in `research/BUILD_STATUS.md`.
**Base evidence:** v0.2 controller `fleet-controller-v2/0.2.0` and multisig
`fleet-multisig-v2/0.1.0`, tested on NEAR testnet 2026-10-29. Evidence lives in
the separate research workspace, not in this repository.

---

## 1. Scope and non-goals

**Scope:** a controller contract on each managed NEAR account that:

- provisions/accepts scoped operator keys;
- freezes and unfreezes execution;
- revokes one operator or every operator with a tag;
- rotates the admin key without the v0.2 `AddKey` failure;
- records an audit entry with block height and timestamp and an export hash chain;
- supports Mode A (team-held admin) and Mode B (2-of-2 multisig admin).

**Non-goals:** wallet, custody of user assets, TEE, policy engine, arbitrary
calls, token transfers, contract upgrades, mainnet deployment, non-custody.
The controller must never add a full-access key, deploy code, transfer the
account balance, or accept a deposit.

---

## 2. Root cause of the v0.2 `AddKey` failures

### 2.1 Protocol behavior

NEAR's `AddKey` action fails with `AddKeyAlreadyExists` when the public key is
already present on the account. It does not replace an existing key's permission
or allowance. A function call's contract state is committed when the function
returns; the `AddKey`/`DeleteKey` actions are scheduled as promise receipts.
Therefore a function can write state, delete a key, and return
`SuccessValue` while a later action receipt fails.

**VERIFIED:** S2 `accept_admin` produced top-level `SuccessValue` and a receipt
failure `AddKeyAlreadyExists`; S6 `top_up_admin` did the same and left the
allowance unchanged. Evidence:
`research/evidence/fallback/spikes/fleet-v2/s2/accept_a_tx.json`,
`.../s2/accept_d_tx.json`, `.../s6/topup_result.json`.

### 2.2 The three v0.2 manifestations

| Method | v0.2 behavior | Why it happened | Required v0.3 property |
| --- | --- | --- | --- |
| `accept_admin` | `propose_admin` added the pending key with accept-only permission; `accept_admin` called `add_key` on the same key with admin permission. Receipt failed; old admin was deleted; pending key stayed accept-only. | `AddKey` on an existing key cannot change permission. | `accept_admin` performs **no AddKey**. It only flips active state and deletes old keys. |
| `top_up_admin` | Called `add_key` on the existing admin key with a larger allowance. Receipt failed; allowance unchanged (minus fee). | `AddKey` on an existing key cannot change allowance. | No in-place top-up. Refresh by installing a **fresh** admin key; Mode B avoids the admin allowance. |
| `recover_admin` | Deleted an already-absent old admin; receipt failed `DeleteKeyDoesNotExist`; new admin install still succeeded. | Delete is not idempotent. | Delete is best-effort and idempotent; the add/activation is the authoritative step and is receipt-checked. |

### 2.3 The fourth manifestation

`grant_operator` re-granting an existing gas key produced three
`AddKeyAlreadyExists` receipts in the failed S5 attempt. The operator list was
already updated before the AddKey action, so the controller and the native key
list disagreed until the clean rerun. v0.3 must verify the **native key
permission** and the controller's operator list after every grant.

---

## 3. Design rule: never add a key that may exist

**Rule 1.** No lifecycle method issues `AddKey` for a public key that is already
present, or may be present, on the account.

**Rule 2.** Key installation and state activation are separate phases. A key is
added first; the active state flips only after the add is confirmed.

**Rule 3.** Activation/finalization performs **no AddKey**. It may only flip
state and issue idempotent `DeleteKey` actions.

**Rule 4.** Every add/delete is checked in `receipts_outcome`; top-level
`SuccessValue` is not success. A controller method that cannot see the receipt
must either use a self-callback or leave the operation in a verifiable pending
state.

**Rule 5.** A fresh key is freshly generated and preflighted with
`view_access_key` before submission. The contract cannot enumerate all native
keys, so this preflight is an SDK/CLI obligation; the contract rejects a key
that equals a known role or pending key.

---

## 4. Mode A state machine

### 4.1 State

```text
admin_pk: Option<PublicKey>          // active admin, Mode A only
recovery_pk: Option<PublicKey>       // recovery, Mode A only
pending_admin_pk: Option<PublicKey>  // proposed but not active
pending_origin: Option<Admin|Recovery>
paused: bool
operators: Vec<{ pk, tag }>
audit: Vec<AuditEntry>
```

States:

- **U** — uninitialized.
- **A** — active admin; `admin_pk = Some`, `pending = None`.
- **P(origin)** — rotation pending; `admin_pk` still active, `pending = Some`,
  `origin ∈ {Admin, Recovery}`.

Mode B has no `admin_pk`, no `recovery_pk`, no pending state; `admin_account` is
immutable after init.

### 4.2 Transitions

| # | Transition | From → To | Who may trigger | Preconditions | Effects |
| --- | --- | --- | --- | --- | --- |
| T1 | `init(admin_pk, recovery_pk, operator_pk, tag, receiver, method, max_operators)` | U → A | deployer in the provisioning transaction | exactly one mode; all keys distinct; receiver/method immutable; `max_operators` bounded | stores state; provisioning tx adds admin/recovery/operator keys; zero full-access |
| T2 | `propose_admin(new_pk)` | A → P(Admin) | active admin signature + direct call | `new_pk` fresh; differs from admin/recovery/operators/pending; no existing pending | adds `new_pk` with `ADMIN_METHODS`; self-callback confirms the add; sets pending only on success |
| T3 | `accept_admin()` | P(any) → A(new) | pending key signature + direct call | signer == `pending_admin_pk` | **no AddKey**; sets `admin_pk = pending`; clears pending; deletes old admin (best effort, idempotent) |
| T4 | `cancel_admin()` | P(any) → A | active admin or recovery key | pending exists | deletes pending key (best effort); clears pending; active admin unchanged |
| T5 | `recover_admin(new_pk)` | A or P → P(Recovery) | recovery key signature + direct call | `new_pk` fresh; differs from all known roles | deletes old pending if present (best effort); adds `new_pk` with `ADMIN_METHODS`; self-callback confirms; sets pending origin Recovery; active admin unchanged |
| T6 | `set_recovery_pk(new_pk)` | A → A | active admin | `new_pk` fresh; differs from admin/operators | adds new recovery key; self-callback confirms; sets `recovery_pk`; deletes old recovery (best effort) |
| T7 | `freeze()` / `unfreeze()` | A or P → same | active admin, or Mode B `admin_account` | Mode A signer == `admin_pk`; Mode B predecessor == `admin_account` | toggles `paused`; audit; no key changes |
| T8 | `grant_operator(pk, tag)` | A/P | active admin / Mode B | pk not already an operator; tag valid; capacity | adds a fresh FunctionCall key; callback confirms; appends operator |
| T9 | `rotate_operator(old, new, tag)` | A/P | active admin / Mode B | old is an operator; new is fresh; new not an operator | adds new key first; callback confirms; replaces list entry; deletes old key (best effort) |
| T10 | `revoke_operator(pk)` | A/P | active admin / Mode B | pk is an operator | removes list entry; deletes key (best effort, idempotent); audit |
| T11 | `revoke_tag(tag)` | A/P | active admin / Mode B | tag exists | removes every operator with tag; deletes each key (best effort); returns the removed keys; audit |
| T12 | Mode B `freeze` / admin methods | A (governed) | `admin_account` only, direct call | 2-of-2 multisig executed the call | same effects; no key-mode admin exists |

**T2/T5 callback.** `propose_admin`/`recover_admin` add the key and attach a
self-callback. The callback checks `promise_result(0)`:

- success → set `pending_admin_pk` and `pending_origin`;
- failure → leave pending unset, emit a failure event, and leave the old admin
  active. An added-but-orphaned key is cleaned by `cancel_admin` or a later
  recovery; it has only `ADMIN_METHODS`, so it cannot execute.

If the callback itself fails, the key may be orphaned and pending unset; the
verifier must report it. This is safer than writing pending state before the add.

**T3 no AddKey.** `accept_admin` is the fix for S2. It cannot hit
`AddKeyAlreadyExists` because it never calls AddKey. The old admin's FCAK may
remain at protocol level if delete fails, but `assert_admin` rejects it because
its signer is no longer `admin_pk`. The verifier must confirm the old key is
inactive at the controller, even if the native key still exists; a later cleanup
can delete it.

**T6 recovery.** Recovery is a **proposal**, not an immediate takeover. The
recovery key proposes a fresh admin key; that key accepts. This preserves the
tested recovery outcome (fresh admin, 0.1 NEAR) while removing the immediate
delete/add race. If the recovery key is lost, there is no key-mode recovery;
that is a documented trust boundary.

### 4.3 Who can do what

- **Active admin:** T2, T4, T6, T7, T8, T9, T10, T11.
- **Pending key:** T3 only. It cannot freeze, grant, revoke, or change recovery.
- **Recovery key:** T5 and T4. It cannot freeze, grant, revoke, or execute.
- **Operator/gas key:** `execute` only.
- **Anyone else:** no state-changing method.
- **Mode B:** only the `admin_account` (multisig) can call admin methods; there is
  no key-mode admin or recovery.

### 4.4 State invariants

1. `admin_pk` and `admin_account` are never both set.
2. At most one `pending_admin_pk`; it differs from `admin_pk`, `recovery_pk`,
   and every operator.
3. `pending_admin_pk` never grants admin authority until T3 flips `admin_pk`.
4. `accept_admin` performs no AddKey.
5. No method adds `FullAccess` or `GasKeyFullAccess`; only `FunctionCall` with
   `receiver = current account` and a method allowlist.
6. `paused=true` blocks `execute`; it does not cancel in-flight receipts.
7. A failed add/delete is visible as a failed action receipt or a controller
   failure event; it is never counted as success.
8. `revoke_tag(tag)` removes only keys with that tag and returns exactly the
   removed list.
9. Audit `seq` is monotonic; every lifecycle mutation appends one entry with
   block height/time.
10. No method deploys/upgrades code, transfers balance, or accepts a deposit.

---

## 5. Admin allowance: options and decision

The admin key is a `FunctionCall` access key with a finite allowance. The
allowance pays gas for admin calls and cannot be topped up in place (S6).

| Option | How it works | Cost/complexity | Trust/liveness | Decision |
| --- | --- | --- | --- | --- |
| **Refresh by rotation to a fresh key** | `propose_admin(new_pk)` installs a fresh key with the configured allowance; `accept_admin` flips; old key deleted. | One fresh key + 2 admin txs; ~0.0005 NEAR. | Admin controls key generation; old key inactive after flip; no relayer. | **Chosen for Mode A.** |
| **NEP-366 meta-transaction / relayer** | User signs a `DelegateAction`; relayer submits and pays gas. NEP-366 validates the sender's key and function-call permission; gas is refunded to the relayer. | Relayer service, extra receipt/block, replay/nonce handling, function-call permission must match. | Relayer can censor/delay; user must verify execution; adds an external dependency and a new trust surface. | **Rejected for v0.3.** Revisit only if a funded relayer is a product requirement. |
| **Multisig-paid calls (Mode B)** | A 2-of-2 multisig is `admin_account`; owners pay gas through the multisig's `FunctionCall` action. | Two confirmations per admin action; multisig contract risk. | Two owner keys + multisig; no admin allowance to exhaust. | **Chosen default for the demo and Mode B.** |
| **Larger allowance with documented refill** | Set a larger finite allowance (e.g. 1 NEAR) and refill by rotation when low. | Simple, but still finite. | Same as Mode A; no unlimited allowance. | **Mitigation, not a fix.** Default 0.1 NEAR; maximum 1 NEAR. |

**Numbers.** S6 measured lifecycle fees of roughly `0.00024–0.00030 NEAR` per
call (research evidence, not yet reproduced in this repo). A 0.1 NEAR admin
allowance is roughly 300–400 admin calls; 1 NEAR is roughly 3,000–4,000. The
exact budget is asserted by a gas test before release.

**Decision:**

- **Mode B is the demo default.** The multisig pays admin calls; there is no
  admin allowance on the agent.
- **Mode A is the simple path.** Its admin key is refreshed by rotation; there is
  no `top_up_admin` and no claim that in-place top-up works.
- **Mode A default allowance:** `0.1 NEAR`; configurable at rotation, hard cap
  `1 NEAR` in v0.3. The cap is a product choice, not a protocol limit.
- **Remaining trust:** the admin key can deny service and grant scoped execute
  keys; the recovery key can propose a takeover; the multisig owners (2-of-2)
  can do the same in Mode B. None of this is trustless.

---

## 6. Audit: block height, timestamp, and hash chain

### 6.1 Entry

```rust
AuditEntry {
    seq: u64,
    action: String,
    actor_account: AccountId,
    signer_pk: String,          // public key only
    subject: String,
    block_height: u64,
    block_timestamp: u64,       // nanoseconds
    prev_hash: String,          // 64 hex chars
    entry_hash: String,         // 64 hex chars
}
```

`block_height = env::block_height()`, `block_timestamp = env::block_timestamp()`
at the mutation. `entry_hash` is:

```text
sha256_hex(
  prev_hash + "|" + seq + "|" + action + "|" + actor_account + "|" +
  signer_pk + "|" + subject + "|" + block_height + "|" + block_timestamp
)
```

The first `prev_hash` is 64 zeros. `get_audit(from_seq, limit)` is paginated;
`get_audit_entry(seq)` returns one entry. `get_audit_head()` returns
`{seq, entry_hash, block_height, block_timestamp}`.

### 6.2 Export

```json
{
  "format": "fleet-audit-v1",
  "account_id": "a.example.testnet",
  "contract_version": "fleet-controller-v0.3.0",
  "exported_at": "2026-11-XXT...Z",
  "entries": [ ... ],
  "head": { "seq": 12, "entry_hash": "..." }
}
```

The verifier recomputes every `entry_hash` from `prev_hash`, checks the chain,
and checks the head. The export is **tamper-evident only if the verifier has a
trusted head hash**. v0.3 does **not** anchor the head on-chain; a malicious
contract upgrade could rewrite history. That is a documented limitation. An
optional admin-only `anchor_audit(head_hash)` that stores the head with block
height/time can be added after the core is green; it is not required for the demo.

### 6.3 Events

Every mutation emits NEP-297 `EVENT_JSON` with `seq`, `action`, `actor_account`,
`signer_pk`, `subject`, `block_height`, `block_timestamp`, and `entry_hash`.
The event is a convenience; the audit view is authoritative.

---

## 7. Mode B: 2-of-2 admin and reuse evaluation

### 7.1 Requirements

| ID | Requirement | Test |
| --- | --- | --- |
| B-1 | Exactly 2 owner keys; threshold 2. | Deploy with 2 members, `get_num_confirmations()==2`. |
| B-2 | One owner cannot execute an admin action. | `add_request` + one `confirm`; controller state unchanged; positive control with second confirm. |
| B-3 | Two owners can execute `freeze`/`unfreeze` on the controller. | Two confirmations; `paused` changes; tx hashes. |
| B-4 | Controller has no key-mode admin or recovery. | Init rejects `admin_pk`/`recovery_pk` with `admin_account`; `get_state` has no admin key. |
| B-5 | Owner keys are scoped to the multisig methods, not full access. | `view_access_key_list`; no `FullAccess`. |
| B-6 | A failed multisig execution is visible; it is not counted as success. | Receipt check; negative test. |

### 7.2 Candidate: `near/core-contracts/multisig2`

**Pinned commit:** `1b0436c96379c63aee7d2429c6d5d24019031ab8` (2026-05-15),
`https://github.com/near/core-contracts/tree/master/multisig2`.

**What it provides (`VERIFIED` by reading the README and source):**

- K-of-N members; members can be access keys or account IDs.
- `add_request` + `confirm`; after K confirmations, it executes a
  `MultiSigRequest` containing `FunctionCall`, `Transfer`, `AddKey`, etc.
- A `FunctionCall` action calls an arbitrary receiver/method with args,
  deposit, and gas. That is enough to call the controller's admin methods as
  `admin_account`.
- 2-of-2 is configurable.

**Known issues:**

1. **No audit statement.** The README says “do your own due diligence … no
   guarantee that this contract doesn't have issues.” This is **not** an audited
   contract, despite being in NEAR's core-contracts repository. Label: `UNKNOWN`
   audit status; `VERIFIED` disclaimer.
2. **Method-name typo.** `MULTISIG_METHOD_NAMES` lists
   `add_and_confirm_request`, but the method is `add_request_and_confirm`.
   Access-key members therefore cannot use the combined method; use
   `add_request` + `confirm`. This is a workaround, not a blocker.
3. **Request removed before execution.** `confirm` removes the request and then
   schedules the `FunctionCall`; if the call fails, the request is gone and the
   owners must start over. The failure is still visible in the receipt. The
   README claims a callback; the source does not attach one. Do not claim
   atomic execution.
4. **No owner recovery.** If one owner key is lost, the 2-of-2 is stuck; there is
   no tested recovery. Document and use a throwaway testnet setup.

**Decision: reuse, do not write a custom multisig.** Functional requirements
B-1–B-6 are met; the audit absence is not fixed by writing another unaudited
contract. The known issues have documented workarounds. Custom code is allowed
only if a stated requirement fails in the Phase 1 testnet reuse gate (e.g. the
deployed contract cannot call the controller with the required gas, or 2-of-2
cannot be configured). The v0.2 custom multisig remains research evidence and is
not the product default.

**Reuse gate (must pass before Mode B is demo-default):**

1. Deploy `multisig2` to a throwaway testnet account from the pinned commit.
2. Add two owner keys; threshold 2; no full access.
3. One owner proposes `freeze` on a controller; one confirmation does nothing;
   the second confirmation sets `paused=true`.
4. Repeat `unfreeze`; verify receipts and state.
5. Record code hash, tx hashes, and the known typo/workaround.

If the gate fails, Mode B falls back to Mode A with the “not non-custodial”
label; it does not silently become a custom multisig claim.

**Gate result (2026-11-03):** **PASS**. The run used two **account members**
rather than access-key members, so the method-name ACL typo was not exercised;
the parent ended with zero access keys, which is stricter than “no FullAccess.”
One confirmation was a no-op; the second froze the agent; a second 2-of-2
unfreeze restored execution; direct member and non-member calls were refused.
Evidence: `evidence/modeb-v03/run.json`, 52/52 checks; claims F-021…F-025.
Both owner accounts were operated by the same test harness, so this proves the
mechanism, not independent custody.

---

## 8. Freeze latency target and measurement

**Target:** p95 **wall-clock submit-to-effect ≤ 5 s** and p95 **≤ 2 blocks**,
measured over 20 independent runs on testnet, for the Mode A pre-signed path.
If the target is missed, report the measured p95 and do not claim ≤5 s.

**Pre-signed path (Mode A only):**

1. At SDK startup, reserve a dedicated admin nonce lane.
2. Build and sign a `freeze` transaction with the reserved nonce and a recent
   block hash; store the serialized signed transaction in memory, never in a
   browser or server.
3. Refresh the block hash every 30 blocks; discard stale signatures.
4. On trigger, `sendRawTransaction` the pre-signed bytes; record `t0`.
5. Poll `get_state`/receipts until `paused=true`; record `t1`.
6. Record block height at t0/t1 and the receipt block; compute wall and block
   deltas.

**Mode B:** a 2-of-2 freeze requires two owner confirmations; it cannot use a
single pre-signed transaction. Report its two-transaction latency separately;
do not present it as the Mode A ≤5 s result.

**In-flight race:** freeze blocks new executes; it does not cancel a receipt
already created. The race test is separate and may be reported as “not run”
without blocking the freeze claim.

---

## 9. Interface changes from v0.2

| v0.2 | v0.3 |
| --- | --- |
| `propose_admin(new_pk)` + `accept_admin()` (AddKey on existing) | `propose_admin(new_pk)` adds a fresh pending admin key via callback; `accept_admin()` only flips state and deletes old keys. |
| `top_up_admin(new_allowance)` (no-op) | **Removed.** `refresh_admin(new_pk, allowance_milli_near)` = propose + accept with a fresh key. |
| `recover_admin(new_pk)` immediate | `recover_admin(new_pk)` proposes via recovery; pending key accepts. |
| `get_audit()` without block/time | `get_audit(from_seq, limit)`, `get_audit_entry(seq)`, `get_audit_head()` with block/time/hash chain. |
| `get_inventory()` | Add `admin_mode`, `pending_admin_pk`, `audit_head`, `contract_version`. |
| `grant_operator` can collide | Preflight + callback; reject existing pk; verify native key permission. |
| `freeze` by CLI only | Pre-signed Mode A path; Mode B two-confirmation path; measured. |

---

## 10. Open questions and gates

| Question | Status | Gate |
| --- | --- | --- |
| Does the self-callback pattern fit NEAR gas/storage limits? | `HYPOTHESIS` | Unit + testnet test; gas profile. |
| Does `multisig2` call the controller with enough gas and correct predecessor? | `HYPOTHESIS` | Reuse gate (Nov 4–5). |
| Is 0.1 NEAR enough for a demo? | `INFERRED` from S6 fees | Gas test; top up by rotation. |
| Can p95 ≤5 s be met with pre-signed Mode A? | `UNKNOWN` | 20-run latency test. |
| Does the audit hash chain verify after a failed action? | `HYPOTHESIS` | Unit + integration test. |
| Is any of this audited? | **No** | Do not claim audit. |
