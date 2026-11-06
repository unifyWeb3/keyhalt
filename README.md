# FLEET

**FLEET is a native NEAR account-fleet key-lifecycle control plane.** It is
built for the NEAR HACKATHON: Build Beyond Boundaries, `security` track.
It is **testnet only** and **unaudited**. **Mode A is not non-custodial.**
Mode B reduces admin-key trust with a 2-of-2 multisig but is not independently
custodied in this evidence.

**Status: v0.3 testnet prototype, final backend gates 2026-11-06.** The
controller, TypeScript SDK, and CLI are implemented and have run against NEAR
testnet. **The headline control is the Mode A freeze: one transaction from the
admin key, no second confirmation.** A 20-run measurement on testnet put the
Mode A single-transaction freeze at p50 5,567 ms / p95 13,227 ms submit-to-
optimistic-state and p50 13,251 ms / p95 24,753 ms submit-to-final-state, with
p50 1 / p95 1 block to optimistic effect (F-029). Mode B (2-of-2 multisig) is
implemented and verified on testnet with a pinned, source-built `multisig2`
contract; it takes three transactions per transition (add request plus two
confirmations) and is not the fast path. Both Mode B owner accounts are
operated by the same test harness in this environment, so the evidence proves
the 2-of-2 mechanism, not independent organizational custody. The read-only
console is **drafted, not built**: design system `docs/DESIGN_SYSTEM.md` and
screen draft `docs/CONSOLE_DRAFT.md` are waiting for human approval. Every
capability below maps to a `VERIFIED` row in [`CLAIMS.md`](CLAIMS.md).

## Problem

A team running several NEAR agent accounts tends to give each agent a key and
manage that key by hand. If one agent is compromised, the team needs a fast
freeze and a way to revoke only that agent's key. A full-access key is too much
authority, and a per-agent custody contract moves the assets into a new trust
boundary.

FLEET governs the **native NEAR access-key lifecycle** on accounts the team
already owns: scoped operator keys, a stop switch, tag-based bulk revocation,
governed admin rotation, lost-admin recovery, and an audit export. It is not a
wallet, a TEE custodian, a spending-policy engine, or a key-storage service.

## What works today

| Capability | Evidence |
| --- | --- |
| **Mode A freeze in a single admin transaction** — p50 5,567 ms / p95 13,227 ms to optimistic state over 20 runs | F-029 |
| Provision three native testnet sub-accounts with zero FullAccess keys; six FunctionCall keys and four active operators each | F-001, F-009 |
| Twelve concurrent `execute` calls across three agents and four operator keys per agent (12/12 in 8,633 ms) | F-002 |
| Twelve concurrent `execute` calls through the published SDK (12/12 in 6,486 ms, all first attempt) | F-033 |
| Freeze/unfreeze with a recorded refusal reason (`controller is frozen`) | F-003, F-015 |
| Refuse a non-pinned method, non-pinned receiver, and gas above the 100 Tgas policy cap | F-004 |
| Grant, revoke, and tag revoke native operator keys; refuse duplicate roles | F-005 |
| Propose/accept admin rotation with a fresh key and method ACL; no `AddKey` on accept | F-006 |
| Lost-admin recovery through a separately scoped recovery key | F-007 |
| SHA-256 audit chain, on-chain `verify_audit`, independent JS/SDK recomputation, tamper rejection | F-008, F-016, F-020 |
| TypeScript SDK/CLI with `--json`, local signing, and testnet-only guards | F-014…F-016, F-020 |
| Pre-signed freeze: sign offline to a mode-600 file, broadcast later with `--submit-signed`, same tx hash on chain | F-034 |
| 84 Rust tests, 38 TypeScript tests, 7/7 near-workspaces integration tests | F-013, F-020, F-035 |
| Automated mutation score 248/252 viable mutants (98.41%); 4 equivalent survivors justified in writing | F-036 |
| Clean-session fresh clone: no inherited secret, reproduces the deployed wasm hash | F-037 |
| Measured gas profile and reproducible wasm build | F-012, F-018, F-019 |
| Mode B `admin_account` provisioning with no admin/recovery key and four FunctionCall operators | F-021 |
| Pinned source-built 2-of-2 multisig; zero access keys after bootstrap deletion | F-022, F-025 |
| One confirmation is a no-op; the second freezes; a second 2-of-2 unfreezes | F-023 |
| Direct member bypass and non-member request are refused; audit attributes actions to the multisig | F-024 |
| Measured Mode B 2-of-2 freeze/unfreeze wall time, audit storage growth, and derived allowance bound | F-026, F-027 |
| Cross-agent FunctionCall receiver-ACL isolation with positive controls | F-028 |

The canonical Mode A run is `evidence/testnet-v03/run.json` (63 checks), with a
human-readable [`RUN.md`](evidence/testnet-v03/RUN.md). Key facts:

- Parent: `fleet-v03-5cff9e99.testnet`
- Agents: `agent-1b`, `agent-2`, `agent-3` (plus a retained pilot `agent-1`)
- RPC: `https://rpc.testnet.fastnear.com`
- Wasm: 248,644 bytes, sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`
- Audit: 19 entries, head `cc33b0ea668c9a42d34d5950638e53907009e52c4b197e1328a1f4ce762ee10b`
- agent-1b create/init: `61t1q3SUv9uHWHmbmerh6PYMeJEA6WpgJCqGWSHruheG` /
  `7KtJ56fLf8SpgrhnyWxmaVmZVHha9r13KN8EwAfDfSrC`

The Mode B run is `evidence/modeb-v03/run.json` (52 checks), with a
human-readable [`RUN.md`](evidence/modeb-v03/RUN.md). Key facts:

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

The Mode B row is the same harness signing for both owners, so it measures the
2-of-2 mechanism, not independent custody. Claims F-029…F-032.

## Do X, see Y

Prerequisites: Node.js 22.x, Rust 1.93 with the `wasm32-unknown-unknown` target,
`git`, and a POSIX shell. No NEAR account or key is needed for these steps.

```bash
git clone <repository-url> fleet
cd fleet
make setup          # tools, JS dependencies, TypeScript build, Rust test build
make verify         # fmt, clippy, 84 Rust tests, wasm, 38 TS tests, claims, secret scan, RPC
```

Expected end of `make verify`:

```text
FLEET verification: PASS
CLAIMS 37/37 verified (37 rows)
```

`make verify` takes several minutes because it runs the full Rust and
TypeScript suites and builds the release wasm. The read-only RPC check is
best-effort by default; set `FLEET_REQUIRE_RPC=1` to make a testnet outage
fail the gate.

**One-command test from a clean clone:**

```bash
./scripts/fresh-clone-test.sh          # clone HEAD, setup, verify, negative controls
./scripts/fresh-clone-clean-session.sh # same under env -i with an empty HOME
```

The clean-session variant starts with no `FLEET_*`/`NEAR_*` variable, no
dotfile credential, and an empty `HOME`. It asserts that `make setup` and
`make verify` pass without any inherited secret, that the clone reproduces the
deployed wasm sha256, that a malformed claim is rejected, that a mainnet RPC
is refused, and that the SDK refuses a mainnet client (F-037).

## CLI

The CLI is the write path. Reads are public; writes are signed locally and never
leave the machine. A signer file must be outside any git repository and mode
600.

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

Commands: `inventory`, `verify`, `audit export`, `audit verify`, `freeze`,
`unfreeze`, `grant`, `rotate`, `revoke`, `revoke-tag`, `propose-admin`,
`accept-admin`, `cancel-admin`, `recover`, `execute`. Run `fleet --help` for the
full flag list. `--json` writes one JSON object to stdout; human output goes to
stderr.

Exit codes: `0` success, `2` bad args/unsupported, `3` no signer, `4` mainnet
refused, `5` RPC failure, `6` policy rejection or audit failure, `7` receipt
failure. A refused `execute` still returns the public tx hash and the
`FLEET_REFUSAL:<reason>` message.

Live CLI evidence is in `evidence/cli-v03/`: freeze
`8Ssz4xogDW36JeK6K3XMuf28MXkrnbMmxNsWJBqEB5Vs`, refused execute
`CmQsxdxF48sVbzpX4uHjXrXWJyypT7umkA5hbztfxt8o`, unfreeze
`9x6fx2mFgMiEVFB587Yt13nvkpV5KgG1X9XThsUxYCQ7`.

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

## Reproduce the evidence

```bash
make test            # 84 Rust tests + 38 TypeScript tests
make claims          # CLAIMS.md validator
node scripts/mutation-test.mjs   # 8 hand-written mutants, source restored
node scripts/testnet-sdk-concurrency.mjs  # 12 concurrent SDK calls on testnet
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

## What is not claimed

- No mainnet support, real funds, audit, production readiness, or non-custody.
- Mode B is not independently custodied: both owner accounts are operated by the
  same test harness here, and the multisig contract is unaudited.
- The console is **drafted, not built**; `web/` is a static placeholder, not a
  demo. Design system: `docs/DESIGN_SYSTEM.md`; screen draft:
  `docs/CONSOLE_DRAFT.md`.
- No freeze-latency target. The measured wall time includes transaction
  finalization and state polling, not only contract execution.
- No in-flight receipt cancellation, allowance top-up, or paymaster/gas-key
  claim.
- Cross-agent isolation is tested at the native FunctionCall receiver ACL, not
  against a hostile co-resident contract.
- No external timestamping or independent audit of the audit chain.

## Repository layout

```text
contracts/        Rust controller workspace (model + near-sdk wrapper)
packages/sdk/     TypeScript SDK v0.3.0
packages/cli/     TypeScript CLI v0.3.0
packages/api/     Read-only API scaffold (health route only)
web/              Static placeholder; console design is approval-gated (drafts in docs/)
docs/             Spec, threat model, interfaces, test plan, demo, provenance
scripts/          Setup, verification, E2E, mutation, gas, repro, fresh clone
evidence/         Testnet, CLI, mutation, gas, and reproducibility records
CLAIMS.md         Claim table; every product claim maps to evidence
```

## AI assistance and reused material

- Built with AI assistance: OpenCode (agent harness) and a DeepSeek model.
- Runtime: `near-sdk 5.29.1`, `near-api-js 7.4.0`, Node.js 22, Rust 1.93.
- Reused: `near/core-contracts/multisig2` v0.4.0 at commit
  `1b0436c96379c63aee7d2429c6d5d24019031ab8` for Mode B, licensed
  `MIT OR Apache-2.0` and pinned by commit. It is source-built, not the checked-in
  prebuilt wasm. No audit statement was found; its README disclaims guarantees.
- Previous FLEET v0.2 research and testnet evidence are problem input, not
  copied product code. See `docs/PROVENANCE.md`.

## Baseline and diff (Q-003)

The baseline tag is `pre-hackathon` (commit `5a26e22`). The submission tag will
be `hackathon-submission` if the human approves publication. A remote is
configured, but no push was made from this working session; the compare link
will be added only if the repository is made public.

## License

MIT. See [`LICENSE`](LICENSE).
