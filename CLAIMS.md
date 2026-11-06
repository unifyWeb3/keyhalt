# CLAIMS

**Status:** v0.3 controller, SDK/CLI, canonical Mode A testnet run, Mode B
2-of-2 testnet run, automated mutation score, near-workspaces integration run,
Mode A/Mode B latency, SDK concurrency, pre-signed freeze, and clean-session
clone recorded through 2026-11-06. Claims below are limited to what the saved
testnet evidence and local/CI logs show.

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
| F-013 | The controller source passes 84 Rust tests, formatting, and clippy with warnings denied. | VERIFIED | `evidence/local-tests.txt` | 2026-11-06 |
| F-014 | The TypeScript CLI reads live testnet inventory and recomputes the full audit chain against the on-chain verifier. | VERIFIED | `evidence/cli-v03/verify.json`, `evidence/cli-v03/inventory.json` | 2026-11-03 |
| F-015 | A CLI freeze blocks an operator execute with the reason "controller is frozen"; a CLI unfreeze restores the account. | VERIFIED | `evidence/cli-v03/freeze.json`, `evidence/cli-v03/refused-execute.json`, `evidence/cli-v03/unfreeze.json`; txs `8Ssz4xogDW36JeK6K3XMuf28MXkrnbMmxNsWJBqEB5Vs`, `CmQsxdxF48sVbzpX4uHjXrXWJyypT7umkA5hbztfxt8o`, `9x6fx2mFgMiEVFB587Yt13nvkpV5KgG1X9XThsUxYCQ7` | 2026-11-03 |
| F-016 | `fleet audit export` writes a 5-entry chain that `fleet verify-audit` accepts, and the verifier rejects a one-field tamper. | VERIFIED | `evidence/cli-v03/audit-export.json`, `evidence/cli-v03/audit-verify.json`, `evidence/cli-v03/tamper-verify.json` | 2026-11-03 |
| F-017 | Eight hand-written mutants in the controller state machine are each killed by a targeted Rust test, with the source restored byte-identical. | VERIFIED | `evidence/mutation/mutation-report.md`, `evidence/mutation/mutation-report.json` | 2026-11-03 |
| F-018 | The canonical testnet run measured 43.04 Tgas per agent provisioning and 3.964 Tgas mean for 12 concurrent executes; a per-operation gas table is saved. | VERIFIED | `evidence/testnet-v03/gas-profile.md`, `evidence/testnet-v03/gas-profile.json` | 2026-11-03 |
| F-019 | Two isolated clean `--locked` builds produce byte-identical 248644-byte wasm matching the deployed hash. | VERIFIED | `evidence/repro-build/report.md`, `evidence/repro-build/report.json` | 2026-11-03 |
| F-020 | The TypeScript SDK v0.3.0 and CLI v0.3.0 pass 41 local tests, including SDK reads of live inventory, full audit-chain verification, the pre-signed transaction format, `--json` and documented exit codes on every CLI command, and agreement between the SDK exit-code map and `docs/INTERFACES.md`. | VERIFIED | `evidence/local-tests.txt`; `packages/sdk/test/sdk.test.mjs`, `packages/cli/test/cli.test.mjs` | 2026-11-06 |
| F-021 | A Mode B agent initialized with `admin_account` set to the multisig parent has four FunctionCall operator keys, zero FullAccess keys, and no admin or recovery key. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.state/native_keys; create tx `FC4TRS6e7FRX9zvb1eS5aP6UYrzYcLzKRkZeY2y43Edh`, init tx `4QHPzixTgcJk2wB1SE3cUpkmMWCe5bXKLvzhsdT2ja5Y` | 2026-11-03 |
| F-022 | The pinned `multisig2` v0.4.0 source build is deployed to a fresh parent, initialized with two account members and two confirmations, and its bootstrap key is deleted, leaving zero access keys. | VERIFIED | `evidence/modeb-v03/run.json` multisig; deploy tx `8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8`, init tx `6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx`, delete tx `CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp` | 2026-11-03 |
| F-023 | One multisig confirmation does not pause the agent; the second confirmation pauses it in 20,884 ms submit-to-observed-state. A frozen execute is refused with "controller is frozen"; a second 2-of-2 unfreeze (27,064 ms) restores execute. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.freeze/unfreeze; freeze add/first/second txs `dEjn26NbgqFtY1GSczDJVHmgmunUkuQUciNG9Rq1YQB`, `E9GSJFVXTX1CexZYS9nRPriJHFQFYr5XaRe4pmP65MDj`, `3GY9rkAWxmrAkqEwf9TBv3rSo5M9iBPWQfmU8coRZtuk`; frozen tx `An7vQH16RQAup3kMVEGJDZyKN9Jpw6Dxa8CkJvF8vS2f`; unfreeze add/first/second txs `BM5Xcw17BBvQe2mV3KsUsShF2NYLfaAXpFXfbV82qFaG`, `EUHXnabokXLGdkFqfCfmHtJRpBFzkSjDpofwF9bwbEMc`, `GFvHeSRbbTGiGH765Ef6BBkWCKYu8inDuV8fd1SDT1bm`; restored tx `GR69FWJU4n2xdn58KPbR7wgjCteLz1g826E5Ja8hnLS7` | 2026-11-03 |
| F-024 | A multisig member calling `freeze` directly is refused with "active admin required"; a non-member cannot add a request and consumes no request id. The audit attributes freeze and unfreeze to the multisig account and records an owner signature. | VERIFIED | `evidence/modeb-v03/run.json` mode_b.direct_bypass/non_member; txs `6pYC2CBPQmH8YA51LR3ArETuzNhBekWWnwcu9btyKvus`, `B1ZBWv9uh6oUTGrzHY9FGiFWBQvdgMc4EqpS9QrKMre5`; `evidence/modeb-v03/audit-modeb.json` | 2026-11-03 |
| F-025 | Two isolated builds of the pinned `multisig2` commit produce byte-identical 293,734-byte wasm with sha256 `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`, and the deployed code hash matches. | VERIFIED | `evidence/modeb-v03/multisig-repro-build.md`, `evidence/modeb-v03/multisig-repro-build.json`, `evidence/modeb-v03/run.json` | 2026-11-03 |
| F-026 | Three Mode A freeze/unfreeze cycles measured mean wall times of 22,716 ms and 21,997 ms from submit to observed state on `rpc.testnet.near.org`; this includes finalization and polling, not a contract-execution SLA. | VERIFIED | `evidence/modeb-v03/run.json` latency.freeze/unfreeze | 2026-11-03 |
| F-027 | Six added audit entries grew storage by 1,713 bytes (about 285.5 bytes per entry including vector growth). The remaining 0.0986856 NEAR admin allowance derives to 454 freeze calls at the measured mean tokens burnt; this is a derived bound, not an exhaustion test. | VERIFIED | `evidence/modeb-v03/run.json` latency.storage/derived_budget | 2026-11-03 |
| F-028 | A FunctionCall operator key for one agent is rejected by the other agent's native receiver ACL and succeeds on its own agent, in both directions. | VERIFIED | `evidence/modeb-v03/run.json` isolation; txs `uSE8JBV9NJa3MUUQNMnE7cCBJDcsHsSK6qW3Xe2sbLZ`, `3YkKFigE2PLq65YZQAbTEY9NiQ7ZsoBigQp2y9uCxTpR` | 2026-11-03 |
| F-029 | Mode A freeze on `agent-lat.fleet-lat-1a1a7db6741.testnet` (single admin transaction) measured submit-to-optimistic-state p50 5,567 ms / p95 13,227 ms and submit-to-final-state p50 13,251 ms / p95 24,753 ms over 20 runs; blocks to effect p50 1 / p95 1 (optimistic) and p50 15 / p95 33 (final). Polling and finalization are included; this is not an execution SLA. | VERIFIED | `evidence/latency-v03/run.json` mode_a_direct.freeze/freeze_final/freeze_blocks/freeze_blocks_final; agent manifest `evidence/latency-v03/agent.json` | 2026-11-05 |
| F-030 | Mode A unfreeze on `agent-lat.fleet-lat-1a1a7db6741.testnet` (single admin transaction) measured submit-to-optimistic-state p50 5,087 ms / p95 7,309 ms and submit-to-final-state p50 12,389 ms / p95 19,795 ms over 20 runs; blocks to effect p50 1 / p95 1 (optimistic) and p50 16 / p95 25 (final). Polling and finalization are included; this is not an execution SLA. | VERIFIED | `evidence/latency-v03/run.json` mode_a_direct.unfreeze/unfreeze_final/unfreeze_blocks/unfreeze_blocks_final | 2026-11-05 |
| F-031 | Mode B freeze on `agent-b1.fleet-modeb-748d4372.testnet` (2-of-2 multisig: add_request plus two confirmations, three transactions) measured submit-to-optimistic-state p50 10,038 ms / p95 17,105 ms and submit-to-final-state p50 13,682 ms / p95 32,946 ms over 20 runs; blocks to effect p50 13 / p95 19 (optimistic) and p50 18 / p95 47 (final). Polling and finalization are included; this is not an execution SLA. | VERIFIED | `evidence/latency-v03/run.json` mode_b_multisig.freeze/freeze_final/freeze_blocks/freeze_blocks_final; txs per cycle in `freeze_samples` | 2026-11-05 |
| F-032 | Mode B unfreeze on `agent-b1.fleet-modeb-748d4372.testnet` (2-of-2 multisig: add_request plus two confirmations, three transactions) measured submit-to-optimistic-state p50 11,864 ms / p95 21,581 ms and submit-to-final-state p50 15,840 ms / p95 42,479 ms over 20 runs; blocks to effect p50 14 / p95 19 (optimistic) and p50 21 / p95 66 (final). Polling and finalization are included; this is not an execution SLA. | VERIFIED | `evidence/latency-v03/run.json` mode_b_multisig.unfreeze/unfreeze_final/unfreeze_blocks/unfreeze_blocks_final; txs per cycle in `unfreeze_samples` | 2026-11-05 |
| F-033 | The published TypeScript SDK v0.3.0 completed 12 concurrent `execute` calls on NEAR testnet through `createFleetClient().execute()`. An earlier run of the same scenario completed 11/12: call 10 failed with a transient `fetch failed` from the public RPC after three attempts. The saved single-run evidence is a later run with 12/12 in 6,486 ms, each on its first attempt, spread over four operator keys. A 50-round replay of the same scenario (600 calls, 3 agents x 4 operator keys, paced against the public RPC rate limit) completed **572/600 = 95.33%**: 560 succeeded on the first attempt, 12 succeeded after a retry, and 28 failed after three attempts. Every failure was a public-RPC environment error (83 HTTP 429 `Rate limits exceeded` responses and one transient `fetch failed`); none was a FLEET policy rejection. | VERIFIED | `evidence/sdk-v03/concurrency.json` (12 results with tx hashes, `attempts: 1`); `evidence/sdk-v03/concurrency-50x.json` (50 rounds, every attempt recorded); `evidence/sdk-v03/concurrency-50x-attempt1-unpaced.json`; `evidence/sdk-v03/concurrency-50x-attempt2-paced-unfunded.json` | 2026-11-06 |
| F-034 | A CLI `freeze --pre-sign` written to a mode-600 file without broadcasting carried the transaction hash `DTjRvhMnkMnBTMBD1G7nYfkSqq8Fii9p9JkQTircthSP`, left the account unfrozen and the audit length unchanged; `--submit-signed` then broadcast that same payload, which is the on-chain transaction with the same hash at block 276450988, froze the account, appended one audit entry, and kept the chain verifiable; an unfreeze (`CYTyZBVcT4WBLo7QVNyGdekBseExq2oAJ9NLUs8H6mGS`) restored it. | VERIFIED | `evidence/sdk-v03/presign.json`; txs `DTjRvhMnkMnBTMBD1G7nYfkSqq8Fii9p9JkQTircthSP`, `CYTyZBVcT4WBLo7QVNyGdekBseExq2oAJ9NLUs8H6mGS` | 2026-11-06 |
| F-035 | The near-workspaces integration suite passes 7/7 in GitHub Actions on x64: it provisions a Mode B agent with four active FunctionCall operators, holds no FullAccess key, records a verifiable audit chain, refuses a non-admin freeze without changing state, executes through the operator key, freezes and refuses execute, unfreezes, and keeps the audit chain verifiable. | VERIFIED | `evidence/integration-v03/README.md`, `evidence/integration-v03/ci-log-81325ed.txt`; GitHub Actions `integration` run `42172673971`, job `127743904887` | 2026-11-06 |
| F-036 | cargo-mutants 27.1.0 generated 275 mutants for the controller on x64 CI; 248 were caught, 4 survived, 23 were unviable, and 0 timed out, for a score of 248/252 = 98.41%. All 4 survivors are provably equivalent and justified in writing; the production source was not edited to remove them because the deployed wasm embeds panic-location line numbers. | VERIFIED | `evidence/mutation-v03/README.md`, `evidence/mutation-v03/outcomes.json`, `evidence/mutation-v03/caught.txt`, `evidence/mutation-v03/missed.txt`; `docs/MUTATION.md`; GitHub Actions `mutation` run `42172689910` on `81325ed` | 2026-11-06 |
| F-037 | A fresh clone run under `env -i` with an empty `HOME` and no `FLEET_*`/`NEAR_*` variable passes `make setup` and `make verify`, reproduces the deployed controller wasm sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`, rejects a malformed VERIFIED claim, refuses a mainnet RPC URL and a mainnet SDK client, and contains no credential-like file. | VERIFIED | `evidence/fresh-clone-v03-clean-session.log`; `scripts/fresh-clone-clean-session.sh` | 2026-11-06 |

**Correction 2026-11-06:** F-036 adds the automated mutation score from
cargo-mutants. F-017 remains the separate 8-mutant hand-written regression set;
it is not the automated score. F-037 adds the clean-session fresh-clone gate.
F-013 and F-020 now record the final counts (84 Rust, 41 TypeScript); the
2026-11-03 note below is kept as history.

**Correction 2026-11-06 (pre-sign hash):** The first pre-sign run printed
`CXf127Tt…` as the pre-signed identifier for a payload that the network
recorded on-chain as `ERo3CcSS…`, because the SDK hashed the signed transaction
bytes. That is not the NEAR transaction identifier. `fleetTransactionHash()`
now hashes the borsh-serialized **unsigned** `Transaction`, and a regression
test pins it. In the final run the pre-signed hash `DTjRvhMnk…` is exactly the
on-chain transaction id at block 276450988.

**Correction 2026-11-06 (SDK concurrency):** The first SDK concurrency run
completed **11/12** calls in 9,500 ms; call 10 failed with `fetch failed` after
the script's three attempts — a transient public-RPC network error. The saved
`evidence/sdk-v03/concurrency.json` is a second run that completed **12/12**
in 6,486 ms, with every call succeeding on its first attempt. Neither run is
described as a "first attempt" outcome of the scenario; both are runs of the
same scenario.

**Correction 2026-11-06 (50-round concurrency replay):** The 12-call, 3-agent
scenario was replayed 50 times (600 calls) through the published SDK. Three
runs are saved in `evidence/sdk-v03/`:

| Run | File | Pacing | Completed | Cause of the failures |
| --- | --- | --- | --- | --- |
| 1 | `concurrency-50x-attempt1-unpaced.json` | none | 331/600 | HTTP 429 `Rate limits exceeded` from the public RPC |
| 2 | `concurrency-50x-attempt2-paced-unfunded.json` | 12 s between rounds, 60 s every 10 rounds | 447/600 | HTTP 429 plus testnet accounts `agent-2` and `agent-3` falling below the storage-stake balance floor (`lacks balance … yoctoNear for state`) |
| 3 | `concurrency-50x.json` | same pacing, after topping `agent-2` and `agent-3` up with 2.4 NEAR each (txs `CnL1LtP87EGrYxJZq4B1e1RHmbtju6UzUMmX5S1238TT`, `2maJG5FPChKvzXVAf8kMYHRuJZEJDuP8fdMeZLR3YZf5`) | **572/600 = 95.33%** | 83 HTTP 429 `Rate limits exceeded` responses and one transient `fetch failed`; no balance failure, no FLEET policy rejection |

Run 3 is the measured run quoted in F-033. In it, 560 calls succeeded on the
first attempt, 12 succeeded after one retry, and 28 failed after three
attempts. The failures fell in rounds 29, 30, 32, 35, 36, and 38, which is
where the public endpoint's rate-limit window closed. `agent-1b` is not part
of the scenario because the canonical lifecycle run revoked two of its four
operators, so it no longer carries four active keys.

**Correction 2026-11-05:** F-029…F-032 were added from the dedicated latency
run (`evidence/latency-v03/run.json`, 2026-11-05). Mode A is the single
transaction admin path. Mode B is the pinned 2-of-2 multisig path: three
transactions per transition (add_request, confirm owner 1, confirm owner 2),
both owners run by the same harness, so the numbers describe latency only and
say nothing about independent custody. Mode B unfreeze final-time includes one
119,885 ms outlier; the p95 above already contains it.

**Correction 2026-11-04:** F-017 was relabeled "Eight semantic mutations in the
controller state machine" → "Eight hand-written mutants in the controller
state machine" before any new automated score. The hand-written set is a
targeted regression set, not an automated mutation score.

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
