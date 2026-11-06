# FLEET integration suite (near-workspaces)

**Run:** GitHub Actions `integration` workflow, run `42172673971`, job
`127743904887`, commit `81325ed`, 2026-11-06 06:09–06:10 UTC, x64
`ubuntu-latest`.

**Result: 7/7 pass.** Raw log extract:
[`ci-log-81325ed.txt`](ci-log-81325ed.txt).

## What the suite does

`integrations/js/integrations.test.mjs` runs the controller in a real
near-sandbox through near-workspaces 5.0.0. It provisions a Mode B agent
(predecessor-admin multisig mode), then exercises the wrapper and the
callback path against the deployed contract logic:

| # | Test | Proves |
| --- | --- | --- |
| 1 | provisions a Mode B agent with four active FunctionCall operators | init + provisioning callbacks produce four scoped operator keys |
| 2 | holds no FullAccess key and no key outside the execute allowlist | every native key is a FunctionCall key for `execute` on the agent |
| 3 | records a verifiable audit chain after init | `verify_audit` and the entry list agree |
| 4 | refuses a freeze from a non-admin predecessor without changing state | an unauthorized lifecycle call is a no-op |
| 5 | executes through the operator key and returns pong | the operator key drives the pinned receiver/method and the receiver event fires |
| 6 | freezes, refuses execute, and unfreezes again | the stop switch blocks execute and unfreeze restores it |
| 7 | keeps the audit chain verifiable after freeze and unfreeze | the chain stays valid across transitions |

## Why this is a separate build

The sandbox cannot run the deployed artifact:

- **Host imports.** near-workspaces 5.0.0 pins near-sandbox 0.1.x
  (nearcore 2.6.2). nearcore 2.6.2 has no global-contract or gas-key host
  imports, which near-sdk 5.29.1 declares unconditionally.
  `scripts/build-sandbox-wasm.sh` builds the same contract source against
  near-sdk 5.16.0 (near-sys 0.2.4), whose imports all exist in nearcore 2.6.2.
- **Bulk memory.** nearcore 2.6.2 does not enable the bulk-memory proposal.
  `scripts/lower-wasm-bulk-memory.mjs` (binaryen 132.0.0) rewrites
  `memory.copy`/`memory.fill` to loops and asserts that none remain.

The script applies three semantically neutral source edits to a **temporary
copy** (near-sdk pin, drop instead of `.detach()`, `String::from(&pk)`
instead of `to_string()`), builds, lowers, and restores the repository files.
The committed tree is unchanged after a run, and the release wasm stays
byte-identical to the deployed artifact.

The sandbox wasm is **not** byte-identical to the deployed artifact
(240,057 bytes before lowering, 219,497 bytes after) and is never deployed.
It exercises the same contract logic, not the same bytes.

## Why the score is on CI

near-sandbox cannot run on the arm64 development host. The local
`make verify` therefore skips this suite; the GitHub Actions run above is the
record. See `docs/INVARIANTS.md` "Build and test deviations".
