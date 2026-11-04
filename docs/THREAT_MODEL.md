# FLEET threat model

**Status:** v0.3 design document. The controller, SDK, CLI, and Mode B 2-of-2
path are implemented and have run on testnet; the console is not. Mitigations
with a green test in `docs/TEST_PLAN.md` are marked there; the rest remain design
requirements. This is not an audit.
**Date:** 2026-11-04 UTC (Mode B run executed 2026-11-03 UTC; Phase 1 target was
2026-10-31, slip disclosed in `research/BUILD_STATUS.md`).
**Scope:** NEAR testnet only. Mode A (team-held admin key) and Mode B (2-of-2
multisig admin).

---

## 1. Assets

| ID | Asset | Why it matters | Where it lives |
| --- | --- | --- | --- |
| A-1 | Managed NEAR account control | The account's native keys and balance | NEAR testnet |
| A-2 | Operator FunctionCall keys | Can call only the allowlisted receiver/method, but can spend gas and act for one agent | Held by the agent runtime or its operator |
| A-3 | Admin key (Mode A) | Can freeze, grant, rotate, revoke, and propose a new admin | Team-controlled key, outside this repo |
| A-4 | Recovery key (Mode A) | Can propose an admin takeover | Team-controlled key, outside this repo |
| A-5 | Multisig owner keys (Mode B) | Two signatures control the admin account | Team-controlled keys, outside this repo |
| A-6 | Audit history | Evidence of who changed what, when | Controller state + exported JSON |
| A-7 | Claims and evidence | Determines what the submission is allowed to say | `CLAIMS.md`, `evidence/`, test logs |
| A-8 | User/agent availability | A freeze is a denial of service by design; an attacker freeze is harm | Controller `paused` state |

**Not assets in this design:** user funds held by FLEET (it holds none), private
keys inside the repository (none), a mainnet account (none), a hosted server
with signing authority (none).

---

## 2. Actors

| ID | Actor | Capability | Trust |
| --- | --- | --- | --- |
| P-1 | Team operator | Holds recovery/admin keys; provisions agents | Trusted for lifecycle, not for execution |
| P-2 | Agent runtime | Holds one operator key; calls the allowlisted contract/method | Untrusted for admin actions; may be compromised |
| P-3 | Multisig owner | One of two signatures in Mode B | Trusted only with the other owner |
| P-4 | RPC provider | Returns state and accepts transactions | Untrusted for correctness; can censor or serve stale data |
| P-5 | Chain / protocol | Orders receipts, enforces access keys | Trusted as the platform |
| P-6 | Reader / judge / screener | Reads repo, runs tests, checks claims | Untrusted; must be able to reproduce |
| P-7 | Attacker | Can steal one agent key, phish an admin, or spam RPC | Untrusted |
| P-8 | Future maintainer | Can upgrade the controller if an upgrade path exists | Trusted by policy, dangerous by capability |

---

## 3. Trust boundaries

```text
  team machine / CLI                 NEAR testnet                    browser / reader
  -------------------                ------------                    ----------------
  admin or recovery key  --sign-->  controller state  <--read RPC--  read-only console
  operator key           --sign-->  execute path                     (no keys, no writes)
  multisig owner keys    --sign-->  multisig2  --call-->  controller
                                      |
                                      +--> native access-key actions (AddKey/DeleteKey)
```

- **Boundary B-1: key holder to chain.** A private key never leaves the machine
  that signs. The SDK/CLI may read a key from a local file or OS keychain, but it
  must never log it, send it to the API, or put it in a browser.
- **Boundary B-2: controller to native key list.** The controller can schedule
  `AddKey`/`DeleteKey`, but it cannot atomically read the native key list. A
  top-level `SuccessValue` does not prove the action receipt succeeded.
- **Boundary B-3: Mode B multisig to controller.** The controller trusts the
  configured `admin_account` as `predecessor_account_id`. It does not verify the
  multisig's internal threshold; that is the multisig's job.
- **Boundary B-4: read model to chain.** The API trusts one RPC response unless
  it checks finality, block height, and (optionally) multiple providers. Stale
  reads are possible.
- **Boundary B-5: repository to runtime.** Testnet accounts and keys are created
  by scripts outside the tracked tree; a clone contains no credential.

---

## 4. What FLEET is designed to defend against

| Threat | Design response | Residual risk |
| --- | --- | --- |
| A compromised agent key calls an unapproved receiver/method | Operator keys are FunctionCall keys with a fixed receiver and method allowlist; the controller rejects anything else | The allowlisted method can still be abused within its own logic |
| A compromised agent tries to administer the account | Operator keys cannot call admin methods; `assert_admin` checks the active key or admin account | A controller bug could misclassify a caller |
| One agent key acts for another agent | Each account has its own controller and key set; account ID is part of the signature domain | A copy of the same key on two accounts would work on both; provisioning must not reuse keys |
| A team needs a fast stop | Mode A pre-signed freeze; Mode B two-owner freeze; target p95 ≤5 s wall and ≤2 blocks | A freeze does not cancel an in-flight receipt |
| A tag of keys must be removed quickly | `revoke_tag(tag)` removes exactly the matching operators and returns the removed list | Native `DeleteKey` is best-effort; the controller state is authoritative |
| Admin rotation corrupts the key set | Fresh-key-first flow, activation with no `AddKey`, receipt-checked callbacks | An orphaned pending key can remain at protocol level; it has only admin methods and is inactive |
| Audit history is silently edited | Hash chain over `prev_hash`, seq, action, actor, subject, block height/time; verifier recomputes | A malicious upgrade can rewrite history; the head is not anchored on-chain in v0.3 |
| A key is committed to the repo | `.gitignore`, pre-commit secret scan, key paths outside the tree, mode checks | A human can still paste a key into a tracked file; the scan is pattern-based |
| Mainnet is touched by accident | Testnet-only RPC guard; no mainnet config; no payout address in the repo | A human can override the guard |

---

## 5. What FLEET does **not** defend against

State this plainly in the README and demo:

1. **A stolen admin or recovery key.** The attacker can freeze, grant scoped
   keys, or propose a takeover. Mode B reduces this to two stolen owner keys, but
   does not eliminate it.
2. **A malicious controller upgrade.** If the account can upgrade the
   controller, the upgrade can rewrite state and audit history. v0.3 has no
   on-chain audit anchor and no timelock. The design must either make the
   controller immutable or list the upgrade authority as a trusted party.
3. **A compromised RPC.** A stale or lying RPC can show a false inventory or a
   false freeze state. The verifier mitigates by checking block height/finality
   and by reading the native key list; it cannot prove the RPC is honest.
4. **An in-flight execution.** A freeze blocks new `execute` calls; a receipt
   already accepted by the chain can still land. The demo must not claim
   “freeze cancels in-flight receipts.”
5. **A malicious allowlisted contract.** FLEET restricts *which* contract/method
   an operator may call, not what that contract does. A malicious or buggy
   receiver is outside the boundary.
6. **Loss of both Mode B owner keys.** There is no tested recovery in
   `multisig2`. The 2-of-2 is stuck. Use throwaway testnet accounts.
7. **A compromised build or dependency.** A malicious `near-sdk`, npm package,
   or CI runner can change what is deployed. Pin versions, review lockfiles, and
   disclose that no supply-chain audit was performed.
8. **Privacy.** Account IDs, public keys, tags, and audit entries are public
   on-chain data. Do not put secrets in tags or subjects.
9. **Economic finality / mainnet safety.** No mainnet deployment, no real funds,
   no production key management, no KYC, no insurance.
10. **Non-custody.** Mode A is **not non-custodial**: the team holds the admin
    and recovery keys. Mode B is **not trustless**: two owners and an unaudited
    multisig contract are trusted.

---

## 6. Threat cases

The covering test IDs refer to `docs/TEST_PLAN.md`. `PLANNED` means the test is
specified but not implemented in v0.3.

| ID | Threat | Impact | Mitigation / design response | Residual | Covering test |
| --- | --- | --- | --- | --- | --- |
| TH-01 | Admin key loss (Mode A) | Cannot freeze/rotate/grant; recovery may still work | Recovery key proposes a fresh admin; pending key accepts; documented recovery drill | If recovery is also lost, no key-mode recovery | T-I-07, T-E-04 |
| TH-02 | Admin key leak (Mode A) | Attacker can freeze, grant scoped keys, propose takeover | Freeze is visible; recovery can propose a new admin; rotate operator keys; audit shows actor | Attacker may front-run recovery; no on-chain revocation of a leaked key without a tx | T-R-06, T-I-06 |
| TH-03 | Malicious/compromised agent | Agent uses its allowed method for harm, or tries admin calls | Fixed receiver/method allowlist; no admin permission; per-agent isolation; freeze/revoke | Allowlisted method abuse; gas/key theft within allowance | T-I-04, T-R-01, T-R-02 |
| TH-04 | RPC outage or stale read | UI/report shows wrong state; operator acts on stale inventory | Read block height/finality; retry/backoff; verifier reads native keys; no write is based only on cached state | Cannot prove RPC honesty; API may be unavailable | T-S-03, T-I-09 |
| TH-05 | Relayer failure | Admin action delayed or censored | **v0.3 does not use a relayer**; NEP-366 was evaluated and rejected | If a relayer is added later, it becomes a new trust/liveness dependency | T-D-03 (design), no runtime |
| TH-06 | Malicious contract upgrade path | Attacker rewrites controller state/audit | Make controller immutable, or document upgrade authority as trusted; optional on-chain audit anchor | v0.3 has no anchor/timelock; an upgrade can rewrite history | T-D-04, T-I-11 |
| TH-07 | `AddKey` collision (`AddKeyAlreadyExists`) | State says active while key permission is wrong | Never `AddKey` on an existing key; fresh-key-first; activation does no `AddKey`; receipt-checked callbacks | Orphaned key at protocol level if cleanup fails | T-U-03, T-U-04, T-I-02 |
| TH-08 | Admin allowance exhaustion | Admin cannot freeze/rotate | Mode B has no admin allowance; Mode A rotates to a fresh key with a configured allowance; hard cap | Rotation needs a working admin key; no in-place top-up | T-G-02, T-E-05 |
| TH-09 | Freeze race / in-flight receipt | Freeze appears not to stop an execution | Measure submit-to-effect separately from receipt finality; state that in-flight receipts are not cancelled | The chain may land an already-created receipt | T-L-01, T-L-02 |
| TH-10 | Audit tampering / rollback | False history, repudiation | Hash chain, verifier, head hash; append-only table in repo | No on-chain anchor; malicious upgrade can rewrite | T-I-10, T-I-11 |
| TH-11 | Mode B owner loss or compromise | Stuck multisig or unauthorized admin | 2-of-2; no single owner can act; use throwaway accounts; document no recovery | One lost key = stuck; two compromised keys = takeover | T-I-06, T-R-07 |
| TH-12 | Tag revocation overreach | Revokes keys outside the intended tag | Exact tag match; returns removed list; negative control keeps other tags and executes after | A wrong tag string still revokes that tag by design | T-I-08, T-R-04 |
| TH-13 | Cross-account key replay | Key for agent A acts for agent B | Per-account controller; provisioned keys are unique; isolation negative + positive control | Same key reused by mistake across accounts would work | T-I-04, T-R-03 |
| TH-14 | Nonce-lane collision | Pre-signed freeze is invalid or stuck | Dedicated admin nonce lane; reserve and monitor; refresh block hash; discard stale signatures | NEAR nonce lanes are an implementation detail; testnet behavior must be measured | T-L-01, T-L-03 |
| TH-15 | Browser/server key exfiltration | Full admin compromise | No key input in browser; read-only API; writes only from local CLI/SDK signer; no key in logs | A user can still paste a key into a fake site | T-S-06, T-U-06 |
| TH-16 | Storage/gas exhaustion | Controller cannot write audit or rotate | Bounded operators, bounded audit growth, storage deposit policy, gas profiling | A spammy admin can fill storage; admin is trusted for availability | T-G-01, T-G-03 |
| TH-17 | Dependency/build compromise | Malicious deployed wasm or signed tx | Pin tool and dependency versions; lockfile; review; disclose no supply-chain audit | No reproducible-build attestation in v0.3 | T-S-05, T-D-05 |
| TH-18 | Testnet-only misuse | Someone treats demo as production | README, UI, demo, and claims say testnet/unaudited; RPC guard; no mainnet config | A fork can remove warnings | T-S-07 |

---

## 7. Security assumptions

1. The NEAR protocol enforces access-key permissions and transaction nonces.
2. The team's signing machine is not compromised at the moment of signing.
3. Mode B's `multisig2` contract behaves as its source says; it is **unaudited**
   and its README disclaims guarantees.
4. The RPC used for writes returns a transaction hash; the verifier independently
   checks the receipt and state at a later block.
5. Testnet can be reset or unavailable; the demo must have a recorded fallback
   and a local sandbox path where possible.
6. The judge/screener can run the fresh-clone test with network access to the
   public testnet RPC.

---

## 8. Out of scope

- Mainnet, real funds, production incident response, insurance, KYC, payout.
- Custody of user assets, token transfers, DeFi strategies, account recovery of
  third parties.
- TEEs, secure enclaves, hardware wallets (they may hold keys, but FLEET does not
  integrate one in v0.3).
- Policy engines, intent solvers, AI-agent orchestration, swarms.
- Auditing `near-sdk`, `multisig2`, npm, or GitHub Actions.

---

## 9. Open questions and gates

| Question | Status | Gate |
| --- | --- | --- |
| Is the controller immutable after deploy, or who can upgrade it? | `UNKNOWN` | Decide before contract freeze; document in README |
| Can the audit head be anchored without a new trust assumption? | `HYPOTHESIS` | Optional after core; not required for demo |
| Does a pre-signed freeze meet p95 ≤5 s / ≤2 blocks? | `UNKNOWN` | 20-run testnet measurement |
| Does `multisig2` 2-of-2 call the controller with enough gas? | **PASS** 2026-11-03 | Mode B run: 2-of-2 freeze/unfreeze executed; `evidence/modeb-v03/run.json` |
| Can the read API detect a stale RPC? | `HYPOTHESIS` | Block-height/finality test + multi-provider comparison |
| Is any component audited? | **No** | Do not claim audit |
