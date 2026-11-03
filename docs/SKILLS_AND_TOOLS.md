# Skills and tools

**Status:** Phase 0 inventory, updated at Phase 1 close on 2026-11-03 UTC.
**Rule:** record what is actually installed, not what would be convenient. A
missing tool is a documented gap, not an assumed capability.

---

## 1. Skills read

Skills live under `/root/arc-skills/collection/skills/` (source copies under
`/root/arc-skills/sources/`). No Rust- or NEAR-specific skill is installed.

| Skill | Read? | Used for | Not used for |
| --- | --- | --- | --- |
| `hackathon-build` | Yes | Build target, phase checkpoints, evidence discipline, avoiding scope creep | It does not supply NEAR/Rust code or event rules |
| `hackathon-discovery` | Yes | Context for demand/edge and track fit; preserving the chosen idea | No new ideation in Phase 1 |
| `project-recovery` | Yes | Reconciling state after server restarts; preserving existing research; distinguishing evidence from assumptions | It does not authorize Git repair or implementation |
| `frontend-build` | Yes | Web placeholder structure and future read-only console plan | No product UI was built |
| `frontend-audit` | Yes | Future UI review criteria (usability, truthfulness, accessibility) | No audit performed yet |
| `find-skills` | Yes | Searched for installable Rust/NEAR/testing skills | No new skill installed; none found for this stack |

**Not used:** `imagegen`, `openai-docs`, `review-agent`, `skill-creator`,
`skill-installer`, Windows-only skills. No skill was installed or modified.

**Harness skill:** the OpenCode `opencode` skill is available for OpenCode
questions; it was not needed for FLEET product work.

---

## 2. Tool versions (verified on this host)

| Tool | Version / path | Status | Notes |
| --- | --- | --- | --- |
| OS / arch | Linux `aarch64` | VERIFIED | `uname -m` = `aarch64` |
| rustup | 1.29.2 (d8c92c676 2026-10-21) | VERIFIED | `/root/.cargo/bin/rustup`; not on default PATH |
| rustc (rustup) | 1.93.0 (254b59607 2026-01-19) | VERIFIED | Used by `make` after PATH fix |
| rustc (system) | 1.93.1 (01f6ddf75 2026-02-11) | VERIFIED | `/usr/bin/rustc`; no wasm target |
| cargo (rustup) | 1.93.0 (083ac5135 2025-12-15) | VERIFIED | Used by the workspace |
| wasm32-unknown-unknown | installed | VERIFIED | `rustup target list --installed` |
| rustfmt | installed 2026-11-03 | VERIFIED | Added with `rustup component add rustfmt` |
| clippy | installed 2026-11-03 | VERIFIED | Added with `rustup component add clippy` |
| cargo-near | **not installed** | VERIFIED missing | `cargo near --version` fails; an install attempt was cancelled by a server restart. Not required for Phase 1. |
| near-cli-rs | 0.30.1 | VERIFIED | `/root/.near-fallback-tools/near`; used for v0.2 research, not Phase 1 |
| Node.js | 22.22.1 | VERIFIED | `node --version` |
| npm | 9.2.0 | VERIFIED | `npm --version` |
| git | 2.53.0 | VERIFIED | `git --version` |
| TypeScript | 5.9.3 | VERIFIED | `node_modules/typescript` |
| @types/node | 22.20.5 | VERIFIED | `node_modules/@types/node` |
| near-workspaces | **not installed** | VERIFIED missing | 4.0.0 install failed on arm64; see §3 |
| near-sandbox | **not installed** | VERIFIED missing | 0.1.1 has no Linux arm64 binary; 0.3.4 needs Node ≥22.22.2 |
| Python | 3.x (system) | INFERRED | Used only for ad-hoc JSON checks in research, not the harness |
| ffmpeg / video capture | not checked | UNKNOWN | Demo recording is a later task; the human posts |

**PATH note:** `make` exports `$HOME/.cargo/bin` so the rustup toolchain wins over
the system rustc. Without this, `make setup` fails on the missing wasm target.
This is a harness fix, not a product change.

---

## 3. `near-workspaces` / `near-sandbox` gap

The integration test plan (`docs/TEST_PLAN.md` §5) needs `near-workspaces`.

- `near-workspaces@4.0.0` declares Node ≥14 and depends on
  `near-sandbox@0.1.1`. `npm install` fails on this host:
  `Unsupported platform: Linux arm64`.
- `near-workspaces@5.0.0` depends on the same `near-sandbox@0.1.1`.
- `near-sandbox@0.3.4` (latest) requires Node `>=22.22.2`; this host has
  `22.22.1`. `near-sandbox@0.3.0`–`0.3.3` have the same engine requirement.
- Therefore the sandbox integration tests are **not run locally** in Phase 1.
  They will run on x64 GitHub Actions / a Node 22.22.2+ environment, or the
  testnet E2E path will be used locally.

The package was removed from `package.json` so `make setup` is green. The gap is
recorded here and in `docs/TEST_PLAN.md`; it is not hidden by a skipped test.

---

## 4. What the harness verifies

`make verify` runs:

1. `cargo fmt --all -- --check`
2. `cargo clippy --workspace --all-targets -- -D warnings`
3. `cargo test --workspace`
4. `cargo check --workspace --target wasm32-unknown-unknown`
5. `npm test` (TypeScript build + 8 Node tests)
6. `node scripts/check-claims.mjs`
7. `./scripts/secret-scan.sh`
8. a static web placeholder check (no script, no key field, no network call)
9. a read-only NEAR testnet `status` RPC check (refuses mainnet)

The fresh-clone test adds `make setup`, `make verify`, a malformed-claim negative
control, a mainnet-RPC negative control, and a credential-file check.

---

## 5. Gaps and mitigations

| Gap | Impact | Mitigation |
| --- | --- | --- |
| `cargo-near` missing | No `cargo near` build/deploy helper | Use `cargo build --target wasm32-unknown-unknown`; install `cargo-near` in Phase 2 if needed |
| `near-workspaces`/`near-sandbox` missing locally | No local sandbox integration tests | Run on x64 CI; use testnet E2E locally; record versions when installed |
| No Rust/NEAR-specific skill | More manual source reading | Read `near-sdk`/`multisig2` source; pin commits; test on testnet |
| No browser automation tool verified | UI checks are static/manual | Keep Phase 1 web static; re-check for Phase 2 |
| No video tool verified | Demo recording uncertain | Human records/posts; test capture in Phase 2 |
| Server restarts observed | Lost work/time | Commit often; `research/BUILD_STATUS.md`; short checkpoints |

---

## 6. Skill-to-task map for the build

| Task | Skill / tool |
| --- | --- |
| Phase plan, checkpoints, evidence | `hackathon-build` |
| State reconciliation after restarts | `project-recovery` |
| Read-only console layout and truthfulness | `frontend-build`, `frontend-audit` |
| Contract/SDK/CLI code | No skill; Rust/TypeScript docs + source |
| Testnet deploy/calls | `near-cli-rs` (if used) or SDK; `cargo build` |
| Claims and screener | `scripts/check-claims.mjs`, `docs/TEST_PLAN.md` |
| Demo | `docs/DEMO_SCRIPT.md`; human records/posts |
