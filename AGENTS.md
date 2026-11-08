# AGENTS.md

Scope instructions for any agent working in this repository. Read this before
changing anything.

## What this repository is

Keyhalt v0.3 is the Rust controller, TypeScript SDK, TypeScript CLI, a
read-only HTTP scaffold, and a read-only console for NEAR testnet. The project
lives in the NEAR HACKATHON `security` track. The security posture below is
what keeps that track honest; it is not a style preference.

## Hard limits

1. **Testnet only.** Never target mainnet. Never use real funds. The SDK and
   CLI refuse a mainnet RPC URL and check `chain_id` is `testnet` before any
   read or write. Keep those guards.
2. **Never print, log, commit, or transmit a secret key or seed phrase.** Keys
   live outside this repository (`/root/.near-fallback-keys/`), mode 600 in
   mode 700 directories. `make secret-scan` and the pre-commit hook check the
   tree.
3. **The release wasm is frozen.** It must stay byte-identical to the deployed
   artifact: 248,644 bytes, sha256
   `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`.
   Production lines in `contracts/fleet-controller/src/lib.rs` and `model.rs`
   must not move. The wasm embeds panic-location line numbers, so a line
   shift invalidates F-012 and F-019.
4. **Tests only inside trailing `#[cfg(test)]` modules** in the contract
   crate. Do not add tests above production code in a file.
5. **Every claim maps to evidence.** A new capability needs a row in
   `CLAIMS.md` pointing to a test path or a public testnet tx, plus a README
   entry. `make claims` must pass.
6. **Nothing public without explicit human approval.** No push beyond the
   configured private remote, no public repo, no X post, no hackathon
   submission, no name registration, no tag push, no deployment, no Vercel
   work, no page refresh. Stop and wait.

## Wording rules

These strings are prohibited in the README, demo script, design files, and
any submission text. They are not stylistic bans. Each one would be a false
claim.

- "non-custodial" without the Mode A qualifier. Mode A is not non-custodial.
  Mode B is not non-custodial either. It reduces admin-key trust and is **not
  independently custodied** here.
- "production-ready", "audited", "mainnet-ready", "trustless".
- "20 parallel calls", "16 parallel calls". The measured scenario is **12**
  concurrent calls across **3 agents x 4 operator keys**.
- "top-up works", "two-step rotation works".
- "freeze cancels in-flight receipts". A freeze blocks **new** `execute`
  calls. It does not cancel a receipt already in flight.
- Never use "seconds" for Mode B latency. Quote the figures and block counts
  from `CLAIMS.md` F-029 through F-032 exactly.
- No claim without a matching `CLAIMS.md` row.

## Build and test

Use `PATH="$HOME/.cargo/bin:$PATH"`. The system `cargo` (1.93.1) will
produce a different wasm hash than the pinned toolchain (1.93.0); the repo
Makefile already prepends `$HOME/.cargo/bin`, but a direct `cargo` call may
not.

```bash
make setup     # toolchain check, JS deps, TypeScript build, Rust test build
make test      # 84 Rust tests + TypeScript tests
make verify    # fmt, clippy -D warnings, tests, wasm hash, CLAIMS.md,
               # secret scan, read-only testnet RPC
make claims    # CLAIMS.md validator alone
make secret-scan
make console   # read-only console at http://127.0.0.1:4173
make repro     # two clean --locked builds, compare wasm hashes
```

**arm64 host caveat.** The `cargo-mutants` score and the `near-workspaces`
integration suite run on x64 GitHub Actions only. Locally, use
`node scripts/mutation-test.mjs` (the 8 hand-written mutants).

## Repository map

| Path | What lives there |
| --- | --- |
| `contracts/fleet-controller/src/model.rs` | pure state machine + trailing test module |
| `contracts/fleet-controller/src/lib.rs` | near-sdk wrapper + trailing test module |
| `packages/sdk/` | `@keyhalt/sdk`: reads, audit verification, pre-sign path |
| `packages/cli/` | `@keyhalt/cli`: the write path, `--json`, stable exit codes |
| `packages/api/` | read-only HTTP scaffold (health route only) |
| `packages/console/` | read-only console server (block feed, SSE, pinned reads) |
| `packages/mcp/` | read-only MCP server |
| `web/` | the Keyhalt console UI |
| `integrations/js/` | `near-workspaces` integration suite (x64 CI) |
| `scripts/` | setup, verify, testnet harness, mutation, gas, repro, fresh clone |
| `evidence/` | the recorded testnet and CI results |
| `CLAIMS.md` | the claim table |
| `docs/` | spec, threat model, interfaces, test plan, demo, provenance |
| `design/` | console mock-up and screenshots |

## Conventions

- Rust: `cargo fmt` and `cargo clippy -- -D warnings` both clean.
- TypeScript: `npm run build` emits `dist/`; the CLI test suite runs the
  built binary, so rebuild before `npm test` after changing `src/`.
- CLI output: one JSON object on stdout with `--json`; human text on
  stderr. Exit codes are documented in `docs/INTERFACES.md` and must match
  the SDK's `keyhaltExitCode` map.
- Evidence files are append-only history. New runs go in new files, state
  the cause, and correct the claim; do not delete or rewrite old evidence.
- Comments explain why, especially where a comparison looks redundant. The
  four surviving mutation mutants in `model.rs` are provably equivalent and
  documented in `docs/TEST_PLAN.md` §10.1.

## Working on the console design

`design/` is awaiting human approval for any new UI recording or public use.
Do not extend the console beyond its event, or publish anything.
