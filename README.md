# FLEET

**FLEET is a native NEAR account-fleet key-lifecycle control plane.** A team
runs several NEAR agent accounts; FLEET governs each account's **native access
keys** — scoped operator keys, a one-transaction freeze stop switch, tag-based
bulk revocation, governed admin rotation, lost-admin recovery, and a SHA-256
audit chain.

- **Track:** NEAR HACKATHON — Build Beyond Boundaries, `security` track.
- **Network:** **testnet only.** The SDK and CLI refuse a mainnet RPC URL and
  verify `chain_id` is `testnet` before any read or write.
- **Status:** v0.3 testnet prototype. **Unaudited.** The read-only console is
  **built** (live testnet reads, no signing); recording and public use await
  human approval.
- **Trust:** **Mode A is not non-custodial** (a team-held admin key can still
  freeze, grant, or rotate). Mode B reduces admin-key trust with a 2-of-2
  multisig but is **not independently custodied** in this evidence — both owner
  accounts are operated by the same test harness.

**The problem in one line:** every agent gets a hand-managed access key, and
one of those keys is a single stolen credential from a fleet incident. FLEET
is the stop switch, the scoped lifecycle, and the audit trail for those keys.

**Start here:** `make setup` then `make verify` — toolchain and build, then
every check (Rust tests, TypeScript tests, wasm hash, claims table).
`make console` opens the live read-only console at
http://127.0.0.1:4173 — Fleet, Agent, Timeline backed by live testnet reads.

**Every capability below maps to one `VERIFIED` row in
[`CLAIMS.md`](CLAIMS.md).** Nothing in this README is claimed without a test
that was run or a public testnet transaction hash.

---

## The problem

A team running several NEAR agent accounts tends to give each agent a key and
manage that key by hand. If one agent is compromised, the team needs a fast
freeze and a way to revoke only that agent's key. A full-access key is too much
authority, and a per-agent custody contract moves the assets into a new trust
boundary.

FLEET governs the **native NEAR access-key lifecycle** on accounts the team
already owns. It is not a wallet, a TEE custodian, a spending-policy engine,
or a key-storage service.

---

## Do X, see Y

Prerequisites: Node.js 22.x, Rust 1.93 with the `wasm32-unknown-unknown`
target, `git`, and a POSIX shell. **No NEAR account and no key are needed** for
any step below — every command is read-only or runs against the public
testnet.

### 1. One-command setup

```bash
git clone <repository-url> fleet && cd fleet
make setup
```

`make setup` checks the toolchain, installs the JavaScript dependencies, and
builds the TypeScript and Rust workspaces.

### 2. One-command verification

```bash
make verify
```

`make verify` runs `cargo fmt --check`, `cargo clippy` with warnings denied,
84 Rust tests, 41 TypeScript tests, the release-wasm build and hash check, the
`CLAIMS.md` validator, the secret scan, and a read-only testnet RPC check.
Expected tail:

```text
FLEET verification: PASS
CLAIMS 41/41 verified (41 rows)
```

The RPC check is best-effort by default; set `FLEET_REQUIRE_RPC=1` to make a
testnet outage fail the gate. The whole gate takes several minutes because it
builds the release wasm.

### 3. See the freeze stop switch, end to end

```bash
# a) read an agent's live native-key inventory and its audit chain
node_modules/.bin/fleet inventory agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/fleet verify   agent-2.fleet-v03-5cff9e99.testnet --json

# b) freeze: ONE admin transaction. Mode A, no second confirmation.
node_modules/.bin/fleet freeze agent-2.fleet-v03-5cff9e99.testnet \
  --signer-key-file /secure/admin.json --json
#   -> {"ok":true,"command":"freeze","txHash":"…","blockHeight":…}

# c) an operator call is now refused, and the refusal is recorded
node_modules/.bin/fleet execute agent-2.fleet-v03-5cff9e99.testnet \
  --method ping --args '{}' --gas 10 \
  --signer-key-file /secure/operator.json --json
#   -> {"ok":false,"error":{"code":"FLEET_E_REJECTED","refusal":"controller is frozen"}}
#      exit code 6, and the public tx hash of the refused attempt

# d) unfreeze: ONE admin transaction again
node_modules/.bin/fleet unfreeze agent-2.fleet-v03-5cff9e99.testnet \
  --signer-key-file /secure/admin.json --json

# e) export the audit chain and verify it independently
node_modules/.bin/fleet audit export agent-2.fleet-v03-5cff9e99.testnet \
  --out /tmp/agent-2-audit.json --json
node_modules/.bin/fleet verify-audit /tmp/agent-2-audit.json --json
```

A signer file must live **outside** any git repository with mode `600`. The
CLI never prints, logs, or transmits a secret key.

### 4. See it from the SDK

```ts
import { createFleetClient, verifyAuditChain } from "@fleet/sdk";

const fleet = createFleetClient({
  rpcUrl: "https://rpc.testnet.fastnear.com",
  accountId: "agent-2.fleet-v03-5cff9e99.testnet",
});

console.log(await fleet.getInventory());          // native keys, roles, allowances
console.log(verifyAuditChain(await fleet.getAuditAll()));
console.log(await fleet.verifyAuditOnChain());    // calls the contract's verifier
```

### 5. See the evidence from a clean session

```bash
./scripts/fresh-clone-clean-session.sh
```

This clones HEAD, runs `make setup` and `make verify` under `env -i` with an
empty `HOME` and no `FLEET_*`/`NEAR_*` variable, and asserts that the clone
reproduces the deployed wasm hash, rejects a malformed claim, refuses a
mainnet RPC URL and a mainnet SDK client, and contains no credential-like
file (F-037). The saved run is
[`evidence/fresh-clone-v03-clean-session.log`](evidence/fresh-clone-v03-clean-session.log).

---

## Claim map

Each row is a `VERIFIED` claim in [`CLAIMS.md`](CLAIMS.md), with its evidence
path there.

| Capability | Claim |
| --- | --- |
| **Mode A freeze in a single admin transaction** — p50 5,567 ms / p95 13,227 ms to optimistic state over 20 runs | F-029 |
| Provision three native testnet sub-accounts with zero FullAccess keys; six FunctionCall keys and four active operators each | F-001, F-009 |
| Twelve concurrent `execute` calls across three agents and four operator keys per agent (12/12 in 8,633 ms) | F-002 |
| Twelve concurrent `execute` calls through the published SDK — one run 11/12, saved run 12/12 in 6,486 ms | F-033 |
| The same scenario replayed 50 times (600 calls) completed **572/600 = 95.33%**; every failure was a public-RPC rate-limit or network error | F-033 |
| Freeze/unfreeze with a recorded refusal reason (`controller is frozen`) | F-003, F-015 |
| Refuse a non-pinned method, non-pinned receiver, and gas above the 100 Tgas policy cap | F-004 |
| Grant, revoke, and tag revoke native operator keys; refuse duplicate roles | F-005 |
| Propose/accept admin rotation with a fresh key and method ACL; no `AddKey` on accept | F-006 |
| Lost-admin recovery through a separately scoped recovery key | F-007 |
| SHA-256 audit chain, on-chain `verify_audit`, independent JS/SDK recomputation, tamper rejection | F-008, F-016, F-020 |
| TypeScript SDK/CLI with `--json`, local signing, and testnet-only guards | F-014…F-016, F-020 |
| `--json` and a documented exit code on every CLI command, agreeing with the SDK exit-code map | F-020 |
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
| Measured Mode B 2-of-2 freeze/unfreeze wall time, audit storage growth, and derived allowance bound | F-026, F-027 |
| Cross-agent FunctionCall receiver-ACL isolation with positive controls | F-028 |

### The canonical runs

Mode A: `evidence/testnet-v03/run.json` (63 checks), human-readable
[`RUN.md`](evidence/testnet-v03/RUN.md).

- Parent: `fleet-v03-5cff9e99.testnet`
- Agents: `agent-1b`, `agent-2`, `agent-3` (plus a retained pilot `agent-1`)
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
  (2-of-2 account members)
- Multisig wasm: 293,734 bytes, sha256
  `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`,
  source build from commit `1b0436c96379c63aee7d2429c6d5d24019031ab8`
- Mode B audit: 3 entries, head
  `82d6e41d73dbbc53144af462bf09340e35dac76e11e8da21a4f2b5bb8796d39b`
- Setup txs: deploy `8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8`, init
  `6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx`, bootstrap key delete
  `CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp`

---

## Measured latency (20 runs per path)

`evidence/latency-v03/run.json`, 2026-11-05 UTC, dedicated agents
`agent-lat.fleet-lat-1a1a7db6741.testnet` (Mode A) and
`agent-b1.fleet-modeb-748d4372.testnet` (Mode B). Submit-to-optimistic-state
and submit-to-final-state include transaction submission, finalization, and
state polling. These are measurements, not an execution SLA.

| Path | Transition | Transactions | Optimistic p50 / p95 | Final p50 / p95 | Blocks optimistic p50 / p95 | Blocks final p50 / p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| **Mode A (single admin tx)** | freeze | **1** | **5,567 / 13,227 ms** | **13,251 / 24,753 ms** | **1 / 1** | **15 / 33** |
| Mode A (single admin tx) | unfreeze | 1 | 5,087 / 7,309 ms | 12,389 / 19,795 ms | 1 / 1 | 16 / 25 |
| Mode B (2-of-2 multisig) | freeze | 3 | 10,038 / 17,105 ms | 13,682 / 32,946 ms | 13 / 19 | 18 / 47 |
| Mode B (2-of-2 multisig) | unfreeze | 3 | 11,864 / 21,581 ms | 15,840 / 42,479 ms | 14 / 19 | 21 / 66 |

**Read-only MCP for out-of-process agents:** `@fleet/mcp` serves
`fleet_inventory`, `fleet_audit` and `fleet_verify` over the stdio MCP
transport (docs/INTERFACES.md §8; claim F-041).

The Mode B row is the same harness signing for both owners, so it measures the
2-of-2 mechanism, not independent custody. Claims F-029…F-032.

---

## Concurrency, measured honestly

The 12-call, 3-agent scenario (3 agents x 4 operator keys = 12 concurrent
`createFleetClient().execute()` calls) was replayed **50 times** on testnet:
`scripts/testnet-concurrency-50x.mjs`, evidence
`evidence/sdk-v03/concurrency-50x.json`.

| Run | Pacing | Completed | Cause of the failures |
| --- | --- | ---: | --- |
| 1 — unpaced | none | 331/600 | HTTP 429 `Rate limits exceeded` from the public RPC |
| 2 — paced | 12 s between rounds, 60 s every 10 rounds | 447/600 | HTTP 429, plus `agent-2`/`agent-3` dropping below the testnet storage-stake balance floor |
| 3 — paced, funded | same pacing, after a 2.4 NEAR top-up to each of `agent-2` and `agent-3` | **572/600 = 95.33%** | 83 HTTP 429 responses and one transient `fetch failed` |

In run 3: **560 calls succeeded on the first attempt, 12 succeeded after one
retry, and 28 failed after three attempts.** No failure was a FLEET policy
rejection and no failure was a balance failure. The 28 failures fell in
rounds 29, 30, 32, 35, 36, and 38, where the public endpoint's rate-limit
window closed. The saved single-run evidence
(`evidence/sdk-v03/concurrency.json`) is a 12/12 run in 6,486 ms, each call on
its first attempt; an earlier run of the same scenario completed 11/12, with
call 10 failing on a transient `fetch failed`.

`agent-1b` is not part of this scenario: the canonical lifecycle run revoked
two of its four operators, so it no longer carries four active keys.

---

## CLI

The CLI is the write path. Reads are public; writes are signed locally and
never leave the machine.

```bash
# Reads (no key)
node_modules/.bin/fleet inventory agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/fleet verify agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/fleet audit export agent-2.fleet-v03-5cff9e99.testnet --out /tmp/agent-2-audit.json --json
node_modules/.bin/fleet verify-audit /tmp/agent-2-audit.json --json

# Writes (local signer, mode 600, outside a git repository)
node_modules/.bin/fleet freeze <account> --signer-key-file /secure/admin.json --json
node_modules/.bin/fleet execute <account> --method ping --args '{}' --gas 10 \
  --signer-key-file /secure/operator.json --json
node_modules/.bin/fleet unfreeze <account> --signer-key-file /secure/admin.json --json

# Pre-signed freeze: sign now, broadcast later (same tx hash on chain)
node_modules/.bin/fleet freeze <account> --signer-key-file /secure/admin.json \
  --pre-sign --out /tmp/freeze.json --json
node_modules/.bin/fleet freeze <account> --submit-signed /tmp/freeze.json --json
```

A `--pre-sign` file is mode 600 and holds a signature, not a secret key; it is
a bearer artifact until it is broadcast or its nonce is consumed. The signed
payload's `tx_hash` is the hash the network assigns when it is broadcast
(F-034).

Commands: `inventory`, `verify`, `audit export`, `audit verify`, `verify-audit`
(alias), `freeze`, `unfreeze`, `grant`, `rotate`, `revoke`, `revoke-tag`,
`propose-admin`, `accept-admin`, `cancel-admin`, `recover`, `execute`,
`admin request`, `admin confirm`, `admin status`. Run
`fleet --help` for the full flag list. For Mode B, `admin confirm` refuses
(no broadcast) any request that is not a freeze/unfreeze FunctionCall for the
same agent, and `admin request` refuses Mode A agents (they are governed by
the single-admin commands). One confirmation of a Mode B request records a
confirmation and leaves the agent unchanged; the second executes. This is the
same mechanism as F-023, driven by the product CLI — see F-038…F-040.

**Every command supports `--json`**, which writes one JSON object to stdout
while human output goes to stderr. **Exit codes are stable and documented** in
[`docs/INTERFACES.md`](docs/INTERFACES.md) and asserted by a test against every
product command and against the SDK's own exit-code map:

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
`FLEET_REFUSAL:<reason>` message.

Live CLI evidence is in `evidence/cli-v03/`: freeze
`8Ssz4xogDW36JeK6K3XMuf28MXkrnbMmxNsWJBqEB5Vs`, refused execute
`CmQsxdxF48sVbzpX4uHjXrXWJyypT7umkA5hbztfxt8o`, unfreeze
`9x6fx2mFgMiEVFB587Yt13nvkpV5KgG1X9XThsUxYCQ7`.

---

## The console

Read-only, testnet-only, and safe to run locally. One command:

```bash
make console        # builds, then http://127.0.0.1:4173
```

`web/` is a real interface served by the console server from the same origin —
it never talks to an RPC directly and never sees a key. It renders the three
screens — Fleet, Agent, Timeline — from live finalized chain state read
through the SDK, pinned to one finalized block per refresh. The header ticker
is the live finalized block feed, not a timer.

What it never does: sign, store a key, call a write method (writes stay in the
CLI), or fall back to invented numbers. If every read fails it shows the last
good block with a stale marker until reads recover.

```bash
make console-smoke  # deterministic read-only boot check (no network)
make console-demo   # rehearse freeze -> refusal -> unfreeze (see below)
```

Notes and limits:

- `FLEET_CONSOLE_ACCOUNTS= make console` starts it with an empty fleet.
- Every snapshot pins its reads to the same finalized block; the block feed
  polls `block { finality: "final" }` (free public RPC has no block
  WebSocket).
- The CLI/SDK freeze and unfreeze; the console only displays. Rehearse the
  whole loop with `make console-demo` (needs `FLEET_DEMO_ADMIN_KEY_FILE` and
  `FLEET_DEMO_OPERATOR_KEY_FILE` outside the repository, mode 600). The demo
  refuses to run if the admin key file is inside the repo or not mode 600.
- The Timeline merges controller audit entries with receipts the console
  explicitly watches (`tmp/console-watch.json`, a list of tx hashes). A
  receipt row appears only after an archival RPC returns it.
- Free public RPC rate limits apply. Providers are paced and fail over
  (FastNEAR → dRPC → NEAR Foundation → Intear, archival: FastNEAR →
  NEAR Foundation), with an overall retry cap of 120 s.
- Verification: `make console-smoke` proves the boot is read-only (405 on
  writes, same-origin CSP, empty-state render) without any network.
- Verified claim count in the footer is read live from `CLAIMS.md`.

## SDK

`@fleet/sdk` reads live state, native key permissions, and the audit chain. It
uses raw JSON-RPC `query` plus a big-int-safe parser so `u64` block timestamps
are preserved exactly.

```ts
import { createFleetClient, verifyAuditChain } from "@fleet/sdk";

const fleet = createFleetClient({
  rpcUrl: "https://rpc.testnet.fastnear.com",
  accountId: "agent-2.fleet-v03-5cff9e99.testnet",
});

const inventory = await fleet.getInventory();
console.log(inventory.nativeKeys, inventory.fullAccessKeys);

const entries = await fleet.getAuditAll();
console.log(verifyAuditChain(entries));
console.log(await fleet.verifyAuditOnChain());
```

Writes take a local signer in-process:

```ts
const writer = createFleetClient({
  rpcUrl: "https://rpc.testnet.fastnear.com",
  accountId: "agent-2.fleet-v03-5cff9e99.testnet",
  signer: { secretKey: localSecret }, // never in a browser, log, or HTTP body
});
await writer.freeze();
```

The SDK also has a pre-signed path. `prepareFreeze()` reads the access-key
nonce and latest block hash, signs locally, and returns a
`fleet-signed-tx-v1` payload; it does not broadcast. `submitSigned(payload)`
decodes and broadcasts exactly those bytes. The payload's `tx_hash` is
base58(sha256(borsh(unsigned transaction))), the same identifier the network
reports:

```ts
const payload = await writer.prepareFreeze();
// ... later, possibly from another process ...
await writer.submitSigned(payload);
```

The SDK refuses a mainnet-looking RPC URL at construction and verifies the RPC
`chain_id` is `testnet` before a read or write.

---

## Trust model

| Mode | Admin | What remains trusted | Status |
| --- | --- | --- | --- |
| Mode A | A team-held admin FunctionCall key on the managed account | Admin key, recovery key, finite allowance, operator keys | Implemented on testnet; **not non-custodial** |
| Mode B | A 2-of-2 multisig account as predecessor | Two owner keys, the unaudited multisig contract, operator keys | Implemented and verified on testnet; reduces admin-key trust, **not independently custodied** |

In Mode A the admin and recovery keys are held by the same operator team. The
controller constrains them to lifecycle methods with native FunctionCall ACLs,
and no path adds a FullAccess key, deploys code, or transfers balance after
init. It does not remove the trust in that team: an admin key can still freeze
the account, grant a scoped operator, or rotate itself. That is why Mode A is
not non-custodial.

Mode B replaces that admin key with a 2-of-2 account-member multisig. It reduces
single-admin-key trust, but it is not non-custodial either: the two owner keys
and the third-party multisig contract remain trusted. In this environment both
owner accounts are operated by the same test harness, so the evidence proves the
2-of-2 mechanism, not independent organizational custody. The multisig contract
is unaudited.

A freeze blocks new `execute` calls. It does **not** cancel a receipt already in
flight. The audit chain is tamper-evident on-chain and in export; it is not an
external notarization service.

---

## Controller design

- `contracts/fleet-controller/src/model.rs` — pure state machine: mode
  exclusivity, operator cap, freeze/unfreeze, grant/revoke/tag revoke, operator
  rotation, admin propose/accept/cancel/recover, SHA-256 audit chain, audit
  pagination, reference model and property-style tests.
- `contracts/fleet-controller/src/lib.rs` — thin near-sdk 5.29.1 wrapper:
  provisioning, AddKey receipts with per-role method ACLs and finite allowances,
  callbacks, `execute` policy checks, NEP-297 events, and `FLEET_REFUSAL:` logs
  before a trap.
- Provisioning is one parent transaction per agent:
  `CreateAccount + Transfer + DeployContract + FunctionCall(init)`. The new
  account starts with no key; the controller schedules its own AddKey receipts.
  No FullAccess key is ever added.
- The deployed contract has no upgrade, deploy, or transfer method.
- Mode B uses the predecessor account as the admin actor. The multisig executes a
  `freeze` or `unfreeze` request only after both account members confirm. The
  controller does not embed or duplicate multisig logic; it sees the multisig
  account as predecessor and records the owner key that signed the outer
  transaction in the audit entry.

---

## Reproduce the evidence

```bash
make test            # 84 Rust tests + 41 TypeScript tests
make claims          # CLAIMS.md validator
node scripts/mutation-test.mjs   # 8 hand-written mutants, source restored
node scripts/testnet-sdk-concurrency.mjs  # 12 concurrent SDK calls on testnet
node scripts/testnet-concurrency-50x.mjs  # the 50-round replay (600 calls)
node scripts/testnet-presign-freeze.mjs   # pre-signed freeze on testnet
node scripts/gas-profile.mjs     # reads the canonical run + testnet RPC
./scripts/repro-build.sh         # two isolated clean wasm builds
FLEET_MODEB_FRESH=1 node scripts/testnet-modeb.mjs  # full Mode B testnet run
node scripts/modeb-report.mjs    # render evidence/modeb-v03/RUN.md
make fresh-clone                 # clone HEAD and run setup + verify
./scripts/fresh-clone-clean-session.sh      # clean-session variant (env -i, empty HOME)
```

The automated mutation score is produced on x64 CI, not locally (the local host
is arm64): `gh workflow run mutation.yml --ref main`. Method, score definition,
and the written justification of every surviving mutant are in
[`docs/MUTATION.md`](docs/MUTATION.md). The integration suite runs on x64 CI
only (near-sandbox cannot run on arm64); see
[`evidence/integration-v03/`](evidence/integration-v03/).

The Mode B harness needs the two owner key files under
`/root/.near-fallback-keys/fleet-v03-faucet/`, a funded parent (or faucet
access), and the pinned multisig build at `/tmp/opencode/multisig2-built.wasm`
(or `FLEET_MULTISIG_WASM`). To resume a partially completed run, pass
`FLEET_MODEB_PARENT`; `run.json` records which provisioning transactions came
from this run and which came from an explicit environment override.

Evidence files:

- `evidence/testnet-v03/run.json` — canonical 63-check testnet run
- `evidence/testnet-v03/RUN.md` — same run, human-readable
- `evidence/testnet-v03/gas-profile.md` — per-operation gas table
- `evidence/cli-v03/` — live CLI freeze/refusal/unfreeze and audit tamper test
- `evidence/latency-v03/run.json` — 20-run Mode A and Mode B latency (F-029…F-032)
- `evidence/sdk-v03/concurrency.json` — 12 concurrent SDK calls (F-033)
- `evidence/sdk-v03/concurrency-50x.json` — the 50-round replay, 572/600 (F-033)
- `evidence/sdk-v03/presign.json` — pre-signed freeze path (F-034)
- `evidence/integration-v03/` — x64 near-workspaces CI log, 7/7 (F-035)
- `evidence/mutation-v03/` — x64 cargo-mutants report and score (F-036)
- `evidence/modeb-v03/run.json` — 52-check Mode B 2-of-2 testnet run
- `evidence/modeb-v03/RUN.md` — same run, human-readable
- `evidence/modeb-v03/multisig-repro-build.md` — two-build multisig wasm record
- `evidence/verify-v03-modeb.log` — full local verification after Mode B
- `evidence/fresh-clone-v03-modeb.log` — fresh-clone test on commit `eea0ccb`
- `evidence/fresh-clone-v03-final.log` — fresh-clone test on commit `a88ef57`
- `evidence/fresh-clone-v03-clean-session.log` — clean-session clone (F-037)
- `evidence/mutation/mutation-report.md` — the 8 hand-written mutants (F-017)
- `evidence/repro-build/report.md` — two-build wasm reproducibility
- `evidence/local-tests.txt` — local fmt/clippy/test/npm/wasm log

---

## What is not claimed

- No mainnet support, real funds, audit, production readiness, or non-custody.
- Mode B is not independently custodied: both owner accounts are operated by the
  same test harness here, and the multisig contract is unaudited.
- The console is read-only and built, but it is not a wallet, not a hosting
  target, and not an approval to record or publish anything: every screen
  still awaits human approval for recording and public use. It reads free
  public RPC endpoints that rate-limit; sustained failures surface as the last
  good block plus a stale marker, never as invented numbers. It has no
  account, history, or receipt indexer of its own — the Timeline only merges
  chain reads plus a local watch file of tx hashes.
- No freeze-latency target. The measured wall time includes transaction
  finalization and state polling, not only contract execution.
- No in-flight receipt cancellation, allowance top-up, or paymaster/gas-key
  claim.
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
integrations/js/  near-workspaces integration suite (x64 CI)
web/              Read-only console interface (same-origin; talks only to the console API)
packages/console/ Read-only Node console server (block feed, SSE, block-pinned SDK reads)
docs/             Spec, threat model, interfaces, test plan, demo, provenance
scripts/          Setup, verification, E2E, mutation, gas, repro, fresh clone
evidence/         Testnet, CLI, mutation, gas, and reproducibility records
CLAIMS.md         Claim table; every product claim maps to evidence
```

---

## AI assistance and reused material (Q-005)

**AI assistance.** This project was built with AI assistance: the OpenCode
agent harness driving a Claude-family model through the build, test, and
evidence phases, plus AI-written drafts for the design system and the console
screen mock-up. The AI wrote and edited Rust, TypeScript, shell, and
Markdown. The human made every decision that mattered: scope, the two admin
modes, the testnet-only constraint, what may be claimed, and the approval
gates on UI work, naming, publication, the X post, and submission. Every
claim in `CLAIMS.md` was checked by running the test or reading the
transaction hash, not by trusting the generator.

**Libraries used** (all from the public registries, all pinned in the lockfiles):

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
licensed `MIT OR Apache-2.0` and pinned by commit. It is **source-built** in
this repository, not the checked-in prebuilt wasm; the build is reproduced
byte-for-byte (F-025). No audit statement was found for it; its README
disclaims guarantees. It is a third-party dependency, not FLEET code.

**Not reused.** Previous FLEET v0.2 research and its testnet evidence are
problem input, not copied product code. The research workspace
(`/root/near/research`) is a separate evidence workspace with its own local
git history and is not part of this repository. See
[`docs/PROVENANCE.md`](docs/PROVENANCE.md) for the full provenance table.

---

## Baseline and diff (Q-003)

| Ref | What | Where |
| --- | --- | --- |
| Baseline | tag `pre-hackathon`, commit `5a26e22` — repository scaffold, CI, reproducibility harness, and documents. **No product code.** | this repository |
| Submission | tag `hackathon-submission` — to be created at the final approved commit, only after the human approves publication | this repository |
| Diff | `git diff pre-hackathon..hackathon-submission` — the whole v0.3 product | this repository |

The compare link (`.../compare/pre-hackathon...hackathon-submission`) can only
be linked once the repository is public, because the remote is private and the
human has not approved publication. The tag plan, including what happens if
the human never publishes, is in [`docs/PROVENANCE.md`](docs/PROVENANCE.md)
§3.

---

## License

MIT. See [`LICENSE`](LICENSE).
