# CLAIMS

**Status:** v0.3 controller, SDK/CLI, canonical Mode A testnet run, Mode B
2-of-2 testnet run, mutation test, gas profile, and reproducible wasm builds
recorded 2026-11-03. Claims below are limited to what the saved testnet evidence
and local test logs show.

Every claim in the README, UI, demo, or submission must have one row here and
must map to a test that was actually run or to a public testnet transaction
hash. A claim without evidence is removed, not softened.

## Table

| ID | Claim | Status | Evidence (test path or tx hash) | Last verified (UTC) |
| --- | --- | --- | --- | --- |
| F-001 | The controller provisions three native testnet sub-account agents with zero FullAccess keys; each has six FunctionCall keys and four active operators. | VERIFIED | `evidence/testnet-v03/run.json`; create tx `61t1q3SUv9uHWHmbmerh6PYMeJEA6WpgJCqGWSHruheG`, init tx `7KtJ56fLf8SpgrhnyWxmaVmZVHha9r13KN8EwAfDfSrC` | 2026-11-03 |
| F-002 | Twelve concurrent execute calls across three agents and four operator keys per agent all succeeded in one run. | VERIFIED | `evidence/testnet-v03/run.json` concurrency: 12/12 in 8633 ms | 2026-11-03 |
| F-003 | Freeze blocks operator execute with the recorded reason "controller is frozen"; unfreeze restores execution. | VERIFIED | `evidence/testnet-v03/run.json` lifecycle txs `7tqiVYBosLgGE37C58xEoFCXypw5GFvYcQoowG2JGMeP`, `FnEEzuhSRTKSMPR6ox1MuLJiJqEj1qpsZBNufZzVvyhF`, `5LuCwM3Nv3WX2awA6jV4U5AKY29GVcVKMXj6hBxkQc2m` | 2026-11-03 |
| F-004 | Operator execute refuses a non-pinned method, a non-pinned receiver, and gas above the 100 Tgas policy cap. | VERIFIED | `evidence/testnet-v03/run.json` lifecycle txs `283uKM9bcWhGNVe4tg9NUSXXbjtNjQFGBpF5pARfWiGc`, `4pCwwpqDRWzd9SQmeJHdu3EHNriaZWn8gv3CPKGtREdg`, `FdfWgCnuA6orCJ5sHnmfExbcBwJisPkQfo5rYMBocCzA` | 2026-11-03 |
| F-005 | Grant, revoke, and tag revoke update native operator keys; a duplicate grant is refused with "key already has a role". | VERIFIED | `evidence/testnet-v03/run.json` lifecycle txs `67pfNi13ncxKHcdA4b9wRGYUpyrFoiE2W8jPzfEBZYiY`, `9iChxbGRrftWHNzrjBeQTiYcQqopp37FnxipUqtTNFzL`, `4HWLSVwepLLTxzXjSr56woMwAhzXrydFaSpvPFLUC9Gk`, `9TBMVayqiUnX9iBNs8g6LVYvohabZontDZfkQrqDTGKq` | 2026-11-03 |
| F-006 | Admin rotation proposes a fresh admin key with a method ACL, and accept flips the admin and removes the old admin key. | VERIFIED | `evidence/testnet-v03/run.json` lifecycle txs `3yer6ReHu5R6hGiGWFZv4PsyvbQLMSBV3dzwD41saVcS`, `723UTwSYsQz2EDoLSMtUzBFGqA8NAxhfR6vb4z2BSfSM` | 2026-11-03 |
| F-007 | A recovery key can propose a fresh admin after admin loss, and that key becomes the active admin. | VERIFIED | `evidence/testnet-v03/run.json` lifecycle txs `2PPVzA9emNhXBmRCrxygncniP3rK118GcbL5fYVgy6Rw`, `H1wR2XAc3uc6PmTFVfdQPVoo3gJ8P2N7G1D6PfTTX3Tq` | 2026-11-03 |
| F-008 | The controller audit chain is SHA-256 linked; 19 entries verify on-chain and by independent JavaScript recomputation. | VERIFIED | `evidence/testnet-v03/run.json` audit, `evidence/testnet-v03/audit-agent-1.json` | 2026-11-03 |
| F-009 | After the full lifecycle, the managed agent has four native FunctionCall keys and zero FullAccess keys. | VERIFIED | `evidence/testnet-v03/run.json` final_keys | 2026-11-03 |
| F-010 | Native key ACLs reject an operator key calling freeze, an admin key calling execute, and an unknown key calling freeze. | VERIFIED | `evidence/testnet-v03/run.json` lifecycle protocol_rejected entries | 2026-11-03 |
| F-011 | A FunctionCall access key cannot attach a deposit; the protocol rejects the transaction before contract execution. | VERIFIED | `evidence/testnet-v03/run.json` deposit protocol_rejected entry | 2026-11-03 |
| F-012 | The release controller wasm is 248644 bytes with sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`. | VERIFIED | `evidence/local-tests.txt`; `evidence/testnet-v03/run.json` wasm fields | 2026-11-03 |
| F-013 | The controller source passes 35 Rust tests, formatting, and clippy with warnings denied. | VERIFIED | `evidence/local-tests.txt` | 2026-11-03 |
| F-014 | The TypeScript CLI reads live testnet inventory and recomputes the full audit chain against the on-chain verifier. | VERIFIED | `evidence/cli-v03/verify.json`, `evidence/cli-v03/inventory.json` | 2026-11-03 |
| F-015 | A CLI freeze blocks an operator execute with the reason "controller is frozen"; a CLI unfreeze restores the account. | VERIFIED | `evidence/cli-v03/freeze.json`, `evidence/cli-v03/refused-execute.json`, `evidence/cli-v03/unfreeze.json`; txs `8Ssz4xogDW36JeK6K3XMuf28MXkrnbMmxNsWJBqEB5Vs`, `CmQsxdxF48sVbzpX4uHjXrXWJyypT7umkA5hbztfxt8o`, `9x6fx2mFgMiEVFB587Yt13nvkpV5KgG1X9XThsUxYCQ7` | 2026-11-03 |
| F-016 | `fleet audit export` writes a 5-entry chain that `fleet verify-audit` accepts, and the verifier rejects a one-field tamper. | VERIFIED | `evidence/cli-v03/audit-export.json`, `evidence/cli-v03/audit-verify.json`, `evidence/cli-v03/tamper-verify.json` | 2026-11-03 |
| F-017 | Eight semantic mutations in the controller state machine are each killed by a targeted Rust test, with the source restored byte-identical. | VERIFIED | `evidence/mutation/mutation-report.md`, `evidence/mutation/mutation-report.json` | 2026-11-03 |
| F-018 | The canonical testnet run measured 43.04 Tgas per agent provisioning and 3.964 Tgas mean for 12 concurrent executes; a per-operation gas table is saved. | VERIFIED | `evidence/testnet-v03/gas-profile.md`, `evidence/testnet-v03/gas-profile.json` | 2026-11-03 |
| F-019 | Two isolated clean `--locked` builds produce byte-identical 248644-byte wasm matching the deployed hash. | VERIFIED | `evidence/repro-build/report.md`, `evidence/repro-build/report.json` | 2026-11-03 |
| F-020 | The TypeScript SDK v0.3.0 and CLI v0.3.0 pass 21 local tests, including SDK reads of live inventory and full audit-chain verification. | VERIFIED | `evidence/local-tests.txt`; `packages/sdk/test/sdk.test.mjs`, `packages/cli/test/cli.test.mjs` | 2026-11-03 |
| F-021 | A Mode B agent initialized with `admin_account` set to the multisig parent has four FunctionCall operator keys, zero FullAccess keys, and no admin or recovery key. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.state/native_keys; create tx `FC4TRS6e7FRX9zvb1eS5aP6UYrzYcLzKRkZeY2y43Edh`, init tx `4QHPzixTgcJk2wB1SE3cUpkmMWCe5bXKLvzhsdT2ja5Y` | 2026-11-03 |
| F-022 | The pinned `multisig2` v0.4.0 source build is deployed to a fresh parent, initialized with two account members and two confirmations, and its bootstrap key is deleted, leaving zero access keys. | VERIFIED | `evidence/modeb-v03/run.json` multisig; deploy tx `8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8`, init tx `6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx`, delete tx `CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp` | 2026-11-03 |
| F-023 | One multisig confirmation does not pause the agent; the second confirmation pauses it in 20,884 ms submit-to-observed-state. A frozen execute is refused with "controller is frozen"; a second 2-of-2 unfreeze (27,064 ms) restores execute. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.freeze/unfreeze; freeze add/first/second txs `dEjn26NbgqFtY1GSczDJVHmgmunUkuQUciNG9Rq1YQB`, `E9GSJFVXTX1CexZYS9nRPriJHFQFYr5XaRe4pmP65MDj`, `3GY9rkAWxmrAkqEwf9TBv3rSo5M9iBPWQfmU8coRZtuk`; frozen tx `An7vQH16RQAup3kMVEGJDZyKN9Jpw6Dxa8CkJvF8vS2f`; unfreeze add/first/second txs `BM5Xcw17BBvQe2mV3KsUsShF2NYLfaAXpFXfbV82qFaG`, `EUHXnabokXLGdkFqfCfmHtJRpBFzkSjDpofwF9bwbEMc`, `GFvHeSRbbTGiGH765Ef6BBkWCKYu8inDuV8fd1SDT1bm`; restored tx `GR69FWJU4n2xdn58KPbR7wgjCteLz1g826E5Ja8hnLS7` | 2026-11-03 |
| F-024 | A multisig member calling `freeze` directly is refused with "active admin required"; a non-member cannot add a request and consumes no request id. The audit attributes freeze and unfreeze to the multisig account and records an owner signature. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.direct_bypass/non_member; txs `6pYC2CBPQmH8YA51LR3ArETuzNhBekWWnwcu9btyKvus`, `B1ZBWv9uh6oUTGrzHY9FGiFWBQvdgMc4EqpS9QrKMre5`; `evidence/modeb-v03/audit-modeb.json` | 2026-11-03 |
| F-025 | Two isolated builds of the pinned `multisig2` commit produce byte-identical 293,734-byte wasm with sha256 `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`, and the deployed code hash matches. | VERIFIED | `evidence/modeb-v03/multisig-repro-build.md`, `evidence/modeb-v03/multisig-repro-build.json`, `evidence/modeb-v03/run.json` | 2026-11-03 |
| F-026 | Three Mode A freeze/unfreeze cycles measured mean wall times of 22,716 ms and 21,997 ms from submit to observed state on `rpc.testnet.near.org`; this includes finalization and polling, not a contract-execution SLA. | VERIFIED | `evidence/modeb-v03/run.json` latency.freeze/unfreeze | 2026-11-03 |
| F-027 | Six added audit entries grew storage by 1,713 bytes (about 285.5 bytes per entry including vector growth). The remaining 0.0986856 NEAR admin allowance derives to 454 freeze calls at the measured mean tokens burnt; this is a derived bound, not an exhaustion test. | VERIFIED | `evidence/modeb-v03/run.json` latency.storage/derived_budget | 2026-11-03 |
| F-028 | A FunctionCall operator key for one agent is rejected by the other agent's native receiver ACL and succeeds on its own agent, in both directions. | VERIFIED | `evidence/modeb-v03/run.json` isolation; txs `uSE8JBV9NJa3MUUQNMnE7cCBJDcsHsSK6qW3Xe2sbLZ`, `3YkKFigE2PLq65YZQAbTEY9NiQ7ZsoBigQp2y9uCxTpR` | 2026-11-03 |

**Correction 2026-11-03:** F-013 previously read "33 Rust tests". Two tests
were added (`cancel_admin` authorization and key-role collision) and two
existing tests were strengthened before any commit or public claim; the current
run is 35/35. This note is the audit trail for that change.

## Required format

```text
| F-001 | One-sentence claim, no adjectives that are not tested. | VERIFIED | `test path` or `tx hash` + block height | YYYY-MM-DD |
```

Allowed statuses:

- `VERIFIED` — ran it, with a saved command and real output, or a public testnet
  transaction hash + block height that a read-only script re-checks.
- `INFERRED` — reasoned from a verified observation; not used in the demo as a
  headline.
- `HYPOTHESIS` — planned or expected; not shown as working.
- `UNKNOWN` — not tested; shown as untested if mentioned at all.

## Rules

1. A row with `VERIFIED` must contain a non-empty evidence field that points to a
   file in `evidence/` or a public testnet tx hash.
2. A row with `HYPOTHESIS` or `UNKNOWN` must say so in the claim text; it cannot
   be presented as a demo step.
3. The screener test (`scripts/check-claims.mjs`) fails on a malformed row, a
   missing evidence field for `VERIFIED`, or a duplicate ID.
4. The claim table is append-only per release candidate; corrections keep the old
   row and add a dated note rather than rewriting history.
5. Prohibited wording: “non-custodial” without the Mode A qualifier,
   “production-ready”, “audited”, “mainnet-ready”, “trustless”, “20 parallel
   calls”, “16 parallel calls”, “top-up works”, “two-step rotation works”,
   “freeze cancels in-flight receipts”.
