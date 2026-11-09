# Keyhalt

Keyhalt is a control plane for NEAR agent accounts. It governs the native
access keys on accounts you already own: scoped operator keys, a stop switch
that freezes an agent in one admin transaction, tag-based bulk revocation,
governed admin rotation, lost-admin recovery, and a SHA-256 audit chain.
Testnet only, and unaudited.

It is for teams running several NEAR agent accounts who need to answer one
question quickly: which key can do what, and can an operator still move
while we are cleaning up? Keyhalt is not a wallet, a custody service, or a
spending-policy engine.

**First command:** `make verify`. It builds the controller, the SDK, and
the CLI, runs the Rust and TypeScript suites, checks the wasm hash and the
claim table. `make console`, then open `http://127.0.0.1:4173`.

- **Track:** NEAR HACKATHON, `security` track.
- **Network:** testnet only. The SDK and CLI refuse a mainnet-looking RPC URL
  and verify `chain_id` is `testnet` before any read or write.
- **Status:** v0.3 testnet prototype. Unaudited. The read-only console is
  built and shows live testnet state; recording and public use await human
  approval.
- **Trust:** Mode A is not non-custodial. Mode B reduces admin-key trust with
  a 2-of-2 multisig, and it is not independently custodied in this evidence
  (both owner accounts are operated by the same test harness).

Every capability below maps to a row in
[`CLAIMS.md`](CLAIMS.md). A row is VERIFIED only if a test or a public
testnet transaction backs it.

---

## What it does, briefly

Anyone can give an agent a key. What almost never happens is anyone asking,
later, whether that key should still work. Keyhalt treats native access
keys on a NEAR account as the security boundary they already are:

1. Scoped operator keys. A FunctionCall key with a receiver ACL and a method
   ACL is smaller than a full-access key and is the only kind Keyhalt adds.
2. A one-transaction freeze. One admin transaction pauses the account; every
   `execute` call after it is refused with a reason the chain records.
3. Tag-based bulk revocation. One transaction revokes every operator key
   carrying a given tag.
4. Governed admin rotation. Propose, accept, cancel, or recover an admin
   without in-place key swaps.
5. A SHA-256 audit chain, verifiable on-chain via `verify_audit` and
   independently with the SDK.

---

## Do this, then see this

Prerequisites: Node.js 22.x, Rust 1.93 with the `wasm32-unknown-unknown`
target, `git`, and a POSIX shell. No NEAR account and no key are required;
every command below is read-only or runs against public testnet.

### 1. One command to set up

```bash
git clone <repository-url> keyhalt && cd keyhalt
make setup
```

### 2. One command to check

```bash
make verify
```

Runs `cargo fmt`, Clippy with warnings denied, the Rust suite, the
TypeScript suite, the release-wasm build and hash check, the `CLAIMS.md`
validator, and the secret scan. Expected tail:

```text
Keyhalt verification: PASS
CLAIMS 41/41 verified (41 rows)
```

The whole gate takes several minutes; it builds the release wasm.

### 3. Freeze, refused call, unfreeze, audit

```bash
# a) read one agent's live native-key inventory and its audit chain
node_modules/.bin/keyhalt inventory agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/keyhalt verify   agent-2.fleet-v03-5cff9e99.testnet --json

# b) freeze: one admin transaction, Mode A
node_modules/.bin/keyhalt freeze agent-2.fleet-v03-5cff9e99.testnet \
  --signer-key-file /secure/admin.json --json
#   -> {"ok":true,"command":"freeze","txHash":"...","blockHeight":...}

# c) an operator call is refused now, and the refusal is recorded
node_modules/.bin/keyhalt execute agent-2.fleet-v03-5cff9e99.testnet \
  --method ping --args '{}' --gas 10 \
  --signer-key-file /secure/operator.json --json
#   -> {"ok":false,"error":{"code":"KEYHALT_E_REJECTED",
#        "refusal":"controller is frozen"}}
#      exit code 6, and the public tx hash of the refused attempt

# d) unfreeze: one admin transaction again
node_modules/.bin/keyhalt unfreeze agent-2.fleet-v03-5cff9e99.testnet \
  --signer-key-file /secure/admin.json --json

# e) export the audit chain and check it independently
node_modules/.bin/keyhalt audit export agent-2.fleet-v03-5cff9e99.testnet \
  --out /tmp/agent-2-audit.json --json
node_modules/.bin/keyhalt verify-audit /tmp/agent-2-audit.json --json
```

A signer file lives outside any git repository, mode 600. The CLI never
prints, logs, or transmits a secret key.

### 4. From the SDK

```ts
import { createKeyhaltClient, verifyAuditChain } from "@keyhalt/sdk";

const keyhalt = createKeyhaltClient({
  rpcUrl: "https://rpc.testnet.fastnear.com",
  accountId: "agent-2.fleet-v03-5cff9e99.testnet",
});

console.log(await keyhalt.getInventory());          // native keys, roles
console.log(verifyAuditChain(await keyhalt.getAuditAll()));
console.log(await keyhalt.verifyAuditOnChain());    // calls the verifier
```

### 5. With MCP

`@keyhalt/mcp` serves `keyhalt_inventory`, `keyhalt_audit`, and
`keyhalt_verify` over stdio MCP for out-of-process agents. Claim F-041.

---

## Claim map

Each row is one `VERIFIED` claim in [`CLAIMS.md`](CLAIMS.md), with evidence
there.

| Capability | Claim |
| --- | --- |
| Mode A freeze in a single admin transaction, p50 5,567 ms / p95 13,227 ms to optimistic state over 20 runs | F-029 |
| Provision three native testnet sub-accounts with zero FullAccess keys; six FunctionCall keys and four active operators each | F-001, F-009 |
| Twelve concurrent `execute` calls across three agents and four operator keys per agent (12/12 in 8,633 ms) | F-002 |
| Twelve concurrent `execute` calls through the published SDK, one run 11/12, saved run 12/12 in 6,486 ms | F-033 |
| Same scenario replayed 50 times (600 calls) completed **572/600 = 95.33%**; every failure was a public-RPC rate-limit or network error | F-033 |
| Freeze/unfreeze with a recorded refusal reason (`controller is frozen`) | F-003, F-015 |
| Refuse a non-pinned method, non-pinned receiver, and gas above the 100 Tgas policy cap | F-004 |
| Grant, revoke, and tag revoke native operator keys; refuse duplicate roles | F-005 |
| Propose/accept admin rotation with a fresh key and method ACL; no `AddKey` on accept | F-006 |
| Lost-admin recovery through a separately scoped recovery key | F-007 |
| SHA-256 audit chain, on-chain `verify_audit`, independent JS/SDK recomputation, tamper rejection | F-008, F-016, F-020 |
| TypeScript SDK/CLI with `--json`, local signing, and testnet-only guards | F-014…F-016, F-020 |
| `--json` and a documented exit code on every CLI command, matching the SDK map | F-020 |
| Pre-signed freeze: sign offline to a mode-600 file, broadcast later with `--submit-signed`, same tx hash on chain | F-034 |
| 84 Rust tests, 41 TypeScript tests, 7/7 near-workspaces integration tests | F-013, F-020, F-035 |
| Automated mutation score 248/252 viable mutants (98.41%); 4 equivalent survivors justified in writing | F-036 |
| Clean-session fresh clone: no inherited secret, reproduces the deployed wasm hash | F-037 |
| Measured gas profile and reproducible wasm build | F-012, F-018, F-019 |
| Mode B `admin_account` provisioning with no admin/recovery key and four FunctionCall operators | F-021 |
| Pinned source-built 2-of-2 multisig; zero access keys after bootstrap deletion | F-022, F-025 |
| One confirmation is a no-op; the second freezes; a second 2-of-2 unfreezes | F-023 |
| Mode B CLI admin path: request/confirm/status through the product CLI; 2-of-2 freeze and unfreeze executed on testnet; one confirmation does not execute; non-member refused before broadcast | F-038, F-039, F-040 |
| Direct member bypass and non-member request are refused; audit attributes actions to the multisig | F-024 |
| Measured Mode B 2-of-2 wall time, audit storage growth, and derived allowance bound | F-026, F-027 |
| Cross-agent FunctionCall receiver-ACL isolation with positive controls | F-028 |
| Read-only MCP server | F-041 |

---

## The canonical runs

Mode A: `evidence/testnet-v03/run.json` (63 checks), human-readable
[`RUN.md`](evidence/testnet-v03/RUN.md).

- Parent: `fleet-v03-5cff9e99.testnet`
- Agents: `agent-1b`, `agent-2`, `agent-3` (and a retained pilot `agent-1`)
- RPC: `https://rpc.testnet.fastnear.com`
- Wasm: 248,644 bytes, sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`
- Audit: 19 entries, head `cc33b0ea668c9a42d34d5950638e53907009e52c4b197e1328a1f4ce762ee10b`
- agent-1b create/init: `61t1q3SUv9uHWHmbmerh6PYMeJEA6WpgJCqGWSHruheG` /
  `7KtJ56fLf8SpgrhnyWxmaVmZVHha9r13KN8EwAfDfSrC`

Mode B: `evidence/modeb-v03/run.json` (52 checks), human-readable
[`RUN.md`](evidence/modeb-v03/RUN.md).

- Parent / multisig: `fleet-modeb-748d4372.testnet`
- Mode B agent: `agent-b1.fleet-modeb-748d4372.testnet`
- Members: `fleet-v03-5cff9e99.testnet`, `fleet-v03-fund2-8b91351d.testnet`
- Multisig wasm: 293,734 bytes, sha256
  `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`,
  source build from commit `1b0436c96379c63aee7d2429c6d5d24019031ab8`
- Mode B audit: 3 entries, head
  `82d6e41d73dbbc53144af462bf09340e35dac76e11e8da21a4f2b5bb8796d39b`
- Setup txs: deploy `8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8`, init
  `6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx`, bootstrap key delete
  `CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp`

---

## Latency, measured on 2026-11-05

`evidence/latency-v03/run.json`. 20 runs per path, dedicated agents
`agent-lat.fleet-lat-1a1a7db6741.testnet` (Mode A) and
`agent-b1.fleet-modeb-748d4372.testnet` (Mode B). Submit-to-optimistic-state
and submit-to-final-state include transaction submission, finalization, and
state polling. Measurements, not an SLA.

| Path | Transition | Transactions | Optimistic p50 / p95 | Final p50 / p95 | Blocks optimistic p50 / p95 | Blocks final p50 / p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| **Mode A (free admin tx)** | freeze | **1** | **5,567 / 13,227 ms** | **13,251 / 24,753 ms** | **1 / 1** | **15 / 33** |
| Mode A (single admin tx) | unfreeze | 1 | 5,087 / 7,309 ms | 12,389 / 19,795 ms | 1 / 1 | 16 / 25 |
| Mode B (2-of-2 multisig) | freeze | 3 | 10,038 / 17,105 ms | 13,682 / 32,946 ms | 13 / 19 | 18 / 47 |
| Mode B (2-of-2 multisig) | unfreeze | 3 | 11,864 / 21,581 ms | 15,840 / 42,479 ms | 14 / 19 | 21 / 66 |

---

## Concurrency, measured

The 12-call, 3-agent scenario (3 agents x 4 operator keys = 12 concurrent
`createKeyhaltClient().execute()` calls), replayed **50 times** on testnet:
`scripts/testnet-concurrency-50x.mjs`, evidence
`evidence/sdk-v03/concurrency-50x.json`.

| Run | Pacing | Completed | Cause of failures |
| --- | --- | ---: | --- |
| 1: unpaced | none | 331/600 | HTTP 429 `Rate limits exceeded` from the public RPC |
| 2: paced | 12 s between rounds, 60 s every 10 rounds | 447/600 | HTTP 429, plus `agent-2`/`agent-3` dropping below the testnet storage-stake balance floor |
| 3: paced, funded | same pacing, after a 2.4 NEAR top-up to each of `agent-2` and `agent-3` | **572/600 = 95.33%** | 83 HTTP 429 responses and one transient `fetch failed` |

In run 3: **560 calls succeeded on the first attempt, 12 succeeded after a
retry, and 28 failed after three attempts.** No failure was a Keyhalt policy
rejection and no failure was a balance failure. The 28 failures fall in
rounds 29, 30, 32, 35, 36, and 38, where the public endpoint's rate-limit
window closed. The saved single-run evidence
(`evidence/sdk-v03/concurrency.json`) is 12/12 in 6,486 ms, each call on its
first attempt; an earlier run of the same scenario completed 11/12.

`agent-1b` is not part of this scenario: the canonical lifecycle run revoked
two of its four operators, so it no longer carries four active keys.

---

## The CLI

Reads are public; writes are signed locally and never leave the machine.

```bash
# Reads (no key)
node_modules/.bin/keyhalt inventory agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/keyhalt verify agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/keyhalt audit export agent-2.fleet-v03-5cff9e99.testnet --out /tmp/agent-2-audit.json --json
node_modules/.bin/keyhalt verify-audit /tmp/agent-2-audit.json --json

# Writes (local signer, mode 600, outside a git repository)
node_modules/.bin/keyhalt freeze <account> --signer-key-file /secure/admin.json --json
node_modules/.bin/keyhalt execute <account> --method ping --args '{}' --gas 10 \
  --signer-key-file /secure/operator.json --json
node_modules/.bin/keyhalt unfreeze <account> --signer-key-file /secure/admin.json --json

# Pre-signed freeze: sign now, broadcast later (same tx hash on chain)
node_modules/.bin/keyhalt freeze <account> --signer-key-file /secure/admin.json \
  --pre-sign --out /tmp/freeze.json --json
node_modules/.bin/keyhalt freeze <account> --submit-signed /tmp/freeze.json --json
```

Commands: `inventory`, `verify`, `audit export`, `audit verify`,
`verify-audit` (alias), `freeze`, `unfreeze`, `grant`, `rotate`, `revoke`,
`revoke-tag`, `propose-admin`, `accept-admin`, `cancel-admin`, `recover`,
`execute`, `admin request`, `admin confirm`, `admin status`.

Run `keyhalt --help` for the full flag list. For Mode B, `admin confirm`
refuses, before any broadcast, a request that is not a freeze or unfreeze
FunctionCall for the same agent, and `admin request` refuses Mode A agents.
One confirmation of a Mode B request records a confirmation and leaves the
agent unchanged; the second executes. Mode A commands remain on the
single-admin path (see F-038 to F-040).

Every command supports `--json`: exactly one JSON object on stdout,
human-readable text on stderr. Exit codes match the SDK's exit-code map:
`docs/INTERFACES.md` lists them; a test asserts every product command
against the map.

| Exit | Meaning |
| ---: | --- |
| `0` | success |
| `2` | bad arguments or unsupported command |
| `3` | write attempted without a signer |
| `4` | mainnet refused |
| `5` | RPC or network failure |
| `6` | transaction-level policy rejection, or an audit that does not verify |
| `7` | failed action receipt |

A refused `execute` still returns the public tx hash and the
`FLEET_REFUSAL:<reason>` message the controller logged.

---

## The console

Read-only, testnet-only, and you can run it safely locally. One command:

```bash
make console        # builds, then http://127.0.0.1:4173
```

`web/` is a real interface served from the same origin. It never calls an
RPC directly and never sees a key. Three screens: Keyhalt, Agent, Timeline.
The fleet list shows three Mode A agents and the Mode B demo agent
`agent-b1.fleet-modeb-748d4372.testnet`; Mode B rows act through the
`admin request` and `admin confirm` command sheet. Every number comes from
`CLAIMS.md` or from live reads pinned to a finalized block, and the header
ticks the finalized block.

It never signs, never stores a key, never calls a write method, and never
prints a made-up number. If every read fails it shows the last good block
with a stale marker, and waits for recovery.

```bash
make console-smoke  # read-only boot check; no network needed
make console-demo   # rehearsal of freeze, refusal, unfreeze
```

Notes and limits:

- `KEYHALT_CONSOLE_ACCOUNTS= make console` starts it with an empty fleet.
- Snapshots pin reads to a finalized block; the feed polls
  `block { finality: "final" }`.
- The CLI freezes and unfreezes; the console only displays. Rehearse the
  loop with `make console-demo` (needs `KEYHALT_DEMO_ADMIN_KEY_FILE` and
  `KEYHALT_DEMO_OPERATOR_KEY_FILE` outside the repository, mode 600).
- The Timeline merges controller audit entries with watched receipts
  (`tmp/console-watch.json`); a receipt row appears only after an archival
  RPC returns it.
- Free public RPC providers rate-limit. Providers are paced and fail over
  (FastNEAR → dRPC → NEAR Foundation → Intear; archival: FastNEAR →
   NEAR Foundation), overall retry cap 120 s. Claim F-033 covers the measured
  rate.
- The console is read-only: POST or PUT returns 405 and the CSP keeps the
  browser same-origin. `make console-smoke` proves this without a network.

---

## Trust model

| Mode | Admin | What remains trusted | Status |
| --- | --- | --- | --- |
| Mode A | A team-held FunctionCall key on the managed account | Admin key, recovery key, finite allowance, operator keys | Testnet; **not non-custodial** |
| Mode B | A 2-of-2 multisig account as predecessor | Two owner keys, the third-party multisig contract, operator keys | Testnet; **not independently custodied** |

Mode A holds both the admin and the recovery keys in the same operator
team. The controller constrains them to lifecycle methods with native
FunctionCall ACLs, and no path adds a FullAccess key, deploys code, or
moves balance after init. That does not remove the trust in that team: an
admin key can freeze the account, grant an operator, or rotate itself. That
is why Mode A is not non-custodial.

Mode B swaps that admin key for a 2-of-2 account-member multisig. It
reduces single-key trust, but it is not non-custodial either: the two
owner keys and the third-party contract remain trusted. In this evidence
both owner accounts are operated by the same harness, so the evidence proves
the 2-of-2 mechanism, not independent organizational custody. The multisig
is unaudited.

A freeze blocks new `execute` calls. It does not cancel a receipt that is
already running.

---

## Controller design

`contracts/fleet-controller/src/model.rs` is the pure state machine: mode
exclusivity, operator cap, freeze/unfreeze, grant/revoke/tag revoke,
operator rotation, admin propose/accept/cancel/recover, the SHA-256 audit
chain, audit pagination, a reference model, and property-style tests.

`contracts/fleet-controller/src/lib.rs` is a thin near-sdk wrapper:
provisioning, AddKey receipts with per-role method ACLs and finite
allowances, callbacks, `execute` policy checks, NEP-297 events, and
`FLEET_REFUSAL:` logs before trapping.

Provisioning is one parent transaction per agent:
`CreateAccount + Transfer + DeployContract + FunctionCall(init)`. The new
account starts with no key; the controller schedules its own AddKey
receipts. No FullAccess key is ever added.

The deployed contract has no upgrade, deploy, or transfer method.

---

## Reproduce the evidence

```bash
make test            # 84 Rust tests + TypeScript tests
make claims          # CLAIMS.md validator
node scripts/mutation-test.mjs   # 8 hand-written mutants, source restored
node scripts/testnet-sdk-concurrency.mjs  # 12 concurrent SDK calls on testnet
node scripts/testnet-concurrency-50x.mjs  # the 50-round replay (600 calls)
node scripts/testnet-presign-freeze.mjs   # pre-signed freeze on testnet
node scripts/gas-profile.mjs     # reads the canonical run + testnet RPC
./scripts/repro-build.sh         # two isolated clean wasm builds
KEYHALT_MODEB_FRESH=1 node scripts/testnet-modeb.mjs  # full Mode B run
node scripts/modeb-report.mjs    # render evidence/modeb-v03/RUN.md
make fresh-clone                 # clone HEAD and run setup + verify
./scripts/fresh-clone-clean-session.sh      # clean-session variant (env -i, empty HOME)
```

The automated mutation score is produced on x64 CI, not locally (this host is
arm64): `gh workflow run mutation.yml --ref main`. Method, score definition,
and the written justification of every surviving mutant are in
[`docs/MUTATION.md`](docs/MUTATION.md). The integration suite runs on x64 CI
only (near-sandbox cannot run on arm64); see
[`evidence/integration-v03/`](evidence/integration-v03/).

The Mode B harness needs the two owner key files under
`/root/.near-fallback-keys/fleet-v03-faucet/`, a funded parent (or faucet
access), and the pinned multisig build at `/tmp/opencode/multisig2-built.wasm`
(or `KEYHALT_MULTISIG_WASM`). To resume a partially completed run, pass
`KEYHALT_MODEB_FRESH=0` and `KEYHALT_MODEB_PARENT`; `run.json` records which
provisioning transactions came from this run and which came from an override.

Evidence files:

- `evidence/testnet-v03/run.json`: canonical 63-check testnet run
- `evidence/cli-v03/`: live CLI freeze/refusal/unfreeze and audit tamper
- `evidence/latency-v03/run.json`: 20-run Mode A and Mode B latency (F-029…F-032)
- `evidence/sdk-v03/concurrency.json`: 12 concurrent SDK calls (F-033)
- `evidence/sdk-v03/concurrency-50x.json`: the 50-round replay, 572/600 (F-033)
- `evidence/sdk-v03/presign.json`: pre-signed freeze path (F-034)
- `evidence/integration-v03/`: x64 near-workspaces CI log, 7/7 (F-035)
- `evidence/mutation-v03/`: x64 cargo-mutants report and score (F-036)
- `evidence/modeb-v03/run.json`: 52-check Mode B 2-of-2 testnet run
- `evidence/fresh-clone-v03-clean-session.log`: clean-session clone (F-037)
- `evidence/mutation/mutation-report.md`: the 8 hand-written mutants (F-017)
- `evidence/repro-build/report.md`: two-build wasm reproducibility
- `evidence/local-tests.txt`: local fmt/clippy/test/npm/wasm log

---

## What is not claimed

- No mainnet support, real funds, audit, production readiness, or non-custody.
- Mode B is not independently custodied: both owner accounts are operated by
  the same harness here, and the multisig contract is unaudited.
- The console is read-only and built, and it is not an approval to record or
  publish anything: every screen awaits human approval for recording and for
  public use. It reads free public RPC endpoints that rate-limit; sustained
  failures surface as the last good block plus a stale marker, never as
  invented numbers. It has no account, history, or receipt indexer; the
  Timeline only merges chain reads plus a local watch file of tx hashes.
- No freeze-latency target. The measured wall time includes submission and
  finalization, not only contract execution.
- No in-flight receipt cancellation, allowance top-up, or gas-key claim.
- Cross-agent isolation is tested at the native FunctionCall receiver ACL, not
  against a hostile co-resident contract.
- No external timestamping or independent audit of the audit chain.
- The concurrency figure is a measured rate on a throttled public RPC, not a
  throughput guarantee.

---

## Repository layout

```text
contracts/        Rust controller workspace (model + near-sdk wrapper)
packages/sdk/     TypeScript SDK v0.3.0
packages/cli/     TypeScript CLI v0.3.0
packages/api/     Read-only API scaffold (health route only)
packages/console/ Read-only console server and block feed
packages/mcp/     Read-only MCP server
web/              Read-only console interface
integrations/js/  near-workspaces integration suite (x64 CI)
docs/             Spec, threat model, interfaces, test plan, demo
scripts/          Setup, verification, E2E, mutation, gas, fresh clone
evidence/         Testnet, CLI, mutation, gas, and reproducibility records
CLAIMS.md         Claim table; every claim maps to evidence
```

---

## AI assistance and reused material (Q-005)

**AI assistance.** This project was built with AI assistance. The OpenCode
agent harness driving a Claude-family model through the build, test, and
evidence phases, plus AI-written drafts for the design system and the console
mock-up. The AI wrote and edited Rust, TypeScript, shell, and Markdown. The
human made every decision that mattered: scope, the two admin modes, the
testnet-only constraint, what may be claimed, and the approval gates on UI
work, naming, publication, the X post, and submission. Every claim in
`CLAIMS.md` was checked by running the test or reading the transaction hash,
not by trusting the generator.

**Libraries used** (public registries, pinned in the lockfiles):

| Library | Version | Where | License |
| --- | --- | --- | --- |
| `near-sdk` | `=5.29.1` | controller | MIT OR Apache-2.0 |
| `near-sdk-env` | `=0.1.6` | controller | MIT OR Apache-2.0 |
| `borsh` | `1.8.1` | controller | MIT OR Apache-2.0 |
| `serde` | `1` (derive) | controller | MIT OR Apache-2.0 |
| `sha2` | `0.11` | controller | MIT OR Apache-2.0 |
| `near-api-js` | `7.4.0` | SDK, CLI, console, testnet harness | MIT |
| `near-api-js` | `5.1.1` | integration suite | MIT |
| `near-workspaces` | `5.0.0` | integration suite | MIT |
| `typescript` | `5.9.3` | build | Apache-2.0 |
| `@types/node` | `22.20.5` | build | MIT |
| `binaryen` | `^132.0.0` | wasm inspection (dev) | Apache-2.0 |

**Reused material.** `near/core-contracts/multisig2` v0.4.0 at commit
`1b0436c96379c63aee7d2429c6d5d24019031ab8` is the Mode B admin contract,
licensed MIT OR Apache-2.0 and pinned by commit. It is source-built here, not
the checked-in prebuilt wasm; the build reproduces byte-for-byte (F-025). No
audit statement was found for it.

**Not reused.** Previous research and its testnet evidence are problem
input, not copied product code.

---

## Baseline and diff (Q-003)

| Ref | What | Where |
| --- | --- | --- |
| Baseline | tag `pre-hackathon`, commit `5a26e22`: repository scaffold, CI, reproducibility harness, and documents. No product code. | this repository |
| Submission | tag `hackathon-submission`: to be created at the final approved commit, only after the human approves publication | this repository |
| Diff | `git diff pre-hackathon..hackathon-submission`: the whole v0.3 product | this repository |

The compare link exists only once the repository is public, because the
remote is private and the human has not approved publication. The tag plan
and what happens if the human never publishes is in
[`docs/PROVENANCE.md`](docs/PROVENANCE.md) §3.

---

## Kept strings

Keyhalt deploys against contracts and accounts that were created before the
rename. These strings cannot change without redeploying:

- `fleet_controller`: NEP-297 event name and contract reference in the deployed wasm.
- `FLEET_REFUSAL:`: the log prefix the controller writes before the trap.
- `fleet-controller-v0.3.0`: the on-chain contract version string.
- `fleet-v03-5cff9e99.testnet` and `fleet-modeb-748d4372.testnet`: the testnet accounts the evidence references.
- `FLEET_PROPERTY_STEPS` and `FLEET_PROPERTY_SEEDS`: the property-test knobs read by the controller test suite (environment variables).
- `fleet-audit-v1`: the audit export format identifier committed to the evidence.

---

## License

MIT. See [`LICENSE`](LICENSE).
