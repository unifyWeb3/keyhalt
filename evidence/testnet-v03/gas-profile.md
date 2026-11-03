# FLEET gas profile (testnet)

Generated: 2026-11-03T19:50:23.782Z
Source run: `evidence/testnet-v03/run.json` (2026-11-03T19:14:39.529Z — 2026-11-03T19:17:02.823Z)
Wasm: `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`
RPC: https://rpc.testnet.fastnear.com

Gas is the sum of the transaction outcome and all receipt outcomes, in Tgas.
Contract-level policy refusals burn gas and are listed as named lifecycle steps.
Transactions rejected by the protocol before execution (key ACL or deposit policy) report 0 Tgas.

## Provisioning

| Agent | Create (Tgas) | Init + AddKey (Tgas) | Total (Tgas) |
| --- | ---: | ---: | ---: |
| `agent-1b.fleet-v03-5cff9e99.testnet` | 36.651 | 6.392 | 43.043 |
| `agent-2.fleet-v03-5cff9e99.testnet` | 36.651 | 6.384 | 43.035 |
| `agent-3.fleet-v03-5cff9e99.testnet` | 36.651 | 6.385 | 43.036 |

## Operations

| Operation | Source | Samples | Mean (Tgas) | Median (Tgas) | Max (Tgas) | Total (Tgas) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| execute (concurrent) | concurrency | 12 | 3.964 | 3.964 | 3.965 | 47.574 |
| rotate operator | lifecycle | 1 | 6.652 | 6.652 | 6.652 | 6.652 |
| recover admin | lifecycle | 1 | 6.419 | 6.419 | 6.419 | 6.419 |
| propose admin rotation | lifecycle | 1 | 6.065 | 6.065 | 6.065 | 6.065 |
| grant operator | lifecycle | 1 | 5.663 | 5.663 | 5.663 | 5.663 |
| operator execute positive control | lifecycle | 1 | 4.011 | 4.011 | 4.011 | 4.011 |
| revoke tag ops-a | lifecycle | 1 | 3.917 | 3.917 | 3.917 | 3.917 |
| accept recovered admin | lifecycle | 1 | 3.533 | 3.533 | 3.533 | 3.533 |
| accept admin rotation | lifecycle | 1 | 3.357 | 3.357 | 3.357 | 3.357 |
| revoke operator | lifecycle | 1 | 3.173 | 3.173 | 3.173 | 3.173 |
| recovered admin unfreeze | lifecycle | 1 | 2.902 | 2.902 | 2.902 | 2.902 |
| recovered admin freeze | lifecycle | 1 | 2.867 | 2.867 | 2.867 | 2.867 |
| new admin unfreeze | lifecycle | 1 | 2.728 | 2.728 | 2.728 | 2.728 |
| new admin freeze | lifecycle | 1 | 2.694 | 2.694 | 2.694 | 2.694 |
| unfreeze | lifecycle | 1 | 2.348 | 2.348 | 2.348 | 2.348 |
| freeze | lifecycle | 1 | 2.312 | 2.312 | 2.312 | 2.312 |
| second pending rotation refused | lifecycle | 1 | 2.002 | 2.002 | 2.002 | 2.002 |
| duplicate grant refused | lifecycle | 1 | 1.951 | 1.951 | 1.951 | 1.951 |
| execute above gas cap | lifecycle | 1 | 1.925 | 1.925 | 1.925 | 1.925 |
| execute wrong method | lifecycle | 1 | 1.924 | 1.924 | 1.924 | 1.924 |
| execute wrong receiver | lifecycle | 1 | 1.923 | 1.923 | 1.923 | 1.923 |
| execute while frozen | lifecycle | 1 | 1.912 | 1.912 | 1.912 | 1.912 |
| unknown key rejected | lifecycle | 1 | 0.000 | 0.000 | 0.000 | 0.000 |
| admin key rejected for execute | lifecycle | 1 | 0.000 | 0.000 | 0.000 | 0.000 |
| operator key rejected for freeze | lifecycle | 1 | 0.000 | 0.000 | 0.000 | 0.000 |
| old admin key rejected after rotation | lifecycle | 1 | 0.000 | 0.000 | 0.000 | 0.000 |
| execute with deposit rejected by FunctionCall key policy | lifecycle | 1 | 0.000 | 0.000 | 0.000 | 0.000 |
| provision (create + deploy) | provision | 3 | 36.651 | 36.651 | 36.651 | 109.953 |
| provision (init + AddKey receipts) | provision | 3 | 6.387 | 6.385 | 6.392 | 19.162 |

Raw per-call gas is in `gas-profile.json` and in `run.json`.
