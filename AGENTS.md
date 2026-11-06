# AGENTS.md

Instructions for an AI agent (or a new human contributor) working in this
repository. Read this before changing anything.

## What this repository is

FLEET v0.3 — a native NEAR account-fleet key-lifecycle control plane. Rust
controller contract, TypeScript SDK and CLI, a read-only API scaffold, and the
testnet evidence that backs every public claim.

The repository is in the **NEAR HACKATHON `security` track**. The
`security` track is the reason the security posture below is strict.

## Hard limits

These are not style preferences. Breaking one invalidates the evidence.

1. **Testnet only.** Never target mainnet. Never use real funds. The SDK and
   CLI refuse a mainnet-looking RPC URL and check `chain_id` before a read or
   write; keep those guards intact.
2. **Never print, log, commit, or transmit a secret key or seed phrase.** Keys
   live outside this repository (e.g. `/root/.near-fallback-keys/`), mode `600`
   in mode-`700` directories. `make secret-scan` and the pre-commit hook check
   the tree.
3. **The release wasm is frozen.** It must stay byte-identical to the deployed
   artifact: **248,644 bytes**, sha256
   `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`.
   Production lines in `contracts/fleet-controller/src/lib.rs` and `model.rs`
   must not move — the wasm embeds panic-location line numbers, so shifting a
   line changes the deployed bytes and invalidates F-012 and F-019. If a
   production change is genuinely required, expect to re-deploy and re-measure;
   do not "just move the line".
4. **Tests only inside trailing `#[cfg(test)]` modules** in the contract crate.
   Do not add tests above production code in a file.
5. **Every claim maps to evidence.** A new capability needs a row in
   `CLAIMS.md` with a test path or a public testnet transaction hash, and a
   matching entry in the README. `make claims` must pass.
6. **Nothing public without explicit human approval.** No push beyond the
   configured private remote, no public repository, no X post, no hackathon
   submission, no registration of a name or handle, no publishing a tag. Stop
   and wait.

## Wording rules

These strings are prohibited in the README, demo script, design files, and any
submission text. They are not stylistic bans; each one would be a false
claim.

- "non-custodial" without the **Mode A** qualifier. Mode A is **not**
  non-custodial. Mode B is not non-custodial either — it reduces admin-key
  trust and is **not independently custodied** here.
- "production-ready", "audited", "mainnet-ready", "trustless".
- "20 parallel calls", "16 parallel calls". The measured scenario is **12**
  concurrent calls across **3 agents x 4 operator keys**.
- "top-up works", "two-step rotation works".
- "freeze cancels in-flight receipts". A freeze blocks **new** `execute` calls;
  it does not cancel a receipt already in flight.
- Never use "seconds" for Mode B latency. Quote the millisecond figures and
  the block counts from `CLAIMS.md` F-029…F-032 exactly.

## Build and test

Use `PATH="$HOME/.cargo/bin:$PATH"`. The system `cargo` (1.93.1) produces a
different wasm hash than the pinned toolchain (**rustc 1.93.0**); the repo's
`Makefile` already prepends `$HOME/.cargo/bin` to `PATH`, but a direct
`cargo` call may not.

```bash
make setup     # toolchain check, JS deps, TypeScript build, Rust test build
make test      # 84 Rust tests + 41 TypeScript tests
make verify    # fmt, clippy -D warnings, Rust tests, TS tests, wasm hash,
               # CLAIMS.md validator, secret scan, read-only testnet RPC
make claims    # CLAIMS.md validator alone
make secret-scan
make repro     # two isolated clean --locked builds, compares wasm hashes
```

`make verify` is the gate that must pass before any commit. It takes several
minutes because it builds the release wasm.

**arm64 host caveat.** The `cargo-mutants` score and the `near-workspaces`
integration suite run on x64 GitHub Actions only. Locally, use
`node scripts/mutation-test.mjs` (the 8 hand-written mutants) instead of
`cargo-mutants`.

## Repository map

| Path | What lives there |
| --- | --- |
| `contracts/fleet-controller/src/model.rs` | pure state machine + its trailing test module |
| `contracts/fleet-controller/src/lib.rs` | near-sdk wrapper + its trailing test module |
| `packages/sdk/` | `@fleet/sdk` — reads, audit verification, pre-sign path |
| `packages/cli/` | `@fleet/cli` — the write path, `--json`, stable exit codes |
| `packages/api/` | read-only HTTP scaffold (health route only) |
| `integrations/js/` | `near-workspaces` integration suite (x64 CI) |
| `scripts/` | setup, verify, testnet harness, mutation, gas, repro, fresh clone |
| `evidence/` | the recorded testnet and CI results — append, never rewrite a result |
| `CLAIMS.md` | the claim table; every public statement must be here |
| `docs/` | spec, threat model, interfaces, test plan, demo script, provenance |
| `design/` | console mock-up and screenshots — **approval-gated, do not edit without the human** |

## Conventions

- Rust: `cargo fmt` and `cargo clippy -- -D warnings` must both be clean.
- TypeScript: `npm run build` emits `dist/`; the CLI test suite runs the built
  binary, so rebuild before running `npm test` after changing `src/`.
- CLI output: one JSON object on stdout with `--json`; human output on stderr.
  Exit codes are documented in `docs/INTERFACES.md` and must match the SDK's
  `fleetExitCode` map.
- Evidence files are append-only history. If a new run contradicts an old one,
  save the new run as a new file, state the cause, and correct the claim — do
  not delete the earlier evidence.
- Comments explain *why*, especially where a comparison looks redundant. The
  four surviving mutation mutants in `model.rs` are deliberate: they are
  provably equivalent and documented in `docs/TEST_PLAN.md` §10.1.

## Working on the console design

`design/index.html`, `design/REVIEW.md`, `docs/CONSOLE_DRAFT.md`, and
`docs/DESIGN_SYSTEM.md` are **awaiting human approval**. Do not extend the
UI, do not record screens, do not produce Figma output, and do not change the
mock-up's numbers without asking first.

## Reporting

When you finish, say what you ran, what passed, what failed, and what you did
not do. One status line per task item. If a task is blocked, say what blocks
it and what you need from the human. Do not soften a failed result into a
partial pass.
