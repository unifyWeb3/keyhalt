# Skills and tools

**Status:** Phase 0 inventory, updated after the v0.3 testnet run on 2026-11-03
UTC, and extended with the **2026-11-06 final-work session report** in §7.
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

**Harness skills:** the OpenCode `opencode` skill is available for OpenCode
questions; it was not needed for Keyhalt product work. The harness `report`
skill (for filing an OpenCode issue) was also not needed: no OpenCode defect
was found during this work.

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
| cargo-near | **not installed** | VERIFIED missing | `cargo near --version` fails; an install attempt was cancelled by a server restart. Not required for v0.3. |
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
  `22.22.1`. `near-sandbox@0.3.0`-`0.3.3` have the same engine requirement.
- Therefore the sandbox integration tests are **not run locally** in v0.3.
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
8. a console smoke check (read-only boot, same-origin CSP, no RPC from the
   browser, empty-state render)
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
| Browser automation via the local Playwright tool | Pixel/UX verification was reachable | The console is now covered at 1280×900 and 390×844; keep `console-smoke` in verify |
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

---

## 7. Final-work session report: 2026-11-06

### 7.1 The `unslop` skill: **not installed, not reviewed, not pinned**

This is the direct answer to the question asked, and it is a negative result.

| Question | Answer |
| --- | --- |
| Does an `unslop` skill exist on this host? | **No.** |
| Does one exist in `/root/arc-skills`? | **No.** |
| Was it reviewed? | **No: there was nothing to review.** |
| Was it pinned? | **No: nothing was pinned, because no such skill exists.** |
| Is there a commit hash for it? | **No. There is no commit hash, because the skill is not installed.** |

**How that was verified** (read-only, 2026-11-06 UTC):

- `find` for any path matching `*unslop*` under `/root/arc-skills`,
  `/root/.local/share/opencode`, `/root/.config/opencode`, `/root/.agents`,
  `/root/.claude`, `/usr/local/share`, and `/opt`: **zero matches**.
- Every installed skill manifest (`SKILL.md`) was located and grepped for
  `unslop`: **zero matches**. The full set of installed manifests is listed in
  §7.3.
- A content grep across `/root/arc-skills`: **zero matches**.
- The only occurrences of the string anywhere on the host are inside this
  project's own OpenCode session log and database, because the question
  itself was asked there. They are this conversation, not a skill.

The six installed skills are listed in §7.3. **There is no `unslop` among
them**, and the pinned set below is the complete set.

### 7.2 Which skills were used in this final work session

**No skill file was loaded during the 2026-11-06 final-work session.** The
working instructions for that session were the repository's own documents:
`AGENTS.md`, `CLAIMS.md`, `docs/TEST_PLAN.md`, `docs/PROVENANCE.md`: plus the
harness tools (`read`, `edit`, `write`, `shell`, `webfetch`, `websearch`,
`grep`, `glob`, and the `execute` code-mode runtime for parallel calls).

The skills in §1 were read earlier in the project, during Phase 1 planning
and the v0.3 build, and they shaped the working method that this session
continued: the evidence-per-claim discipline from `hackathon-build`, the
restart-reconciliation approach from `project-recovery`, and the
truthfulness rules from `frontend-audit` that the console mock-up review
applied. They were not re-read for this session, and no new skill was
installed.

### 7.3 The pinned skill set

The skill backup repository is at `/root/arc-skills`, with git **HEAD**
`3b13ce7597fc37de72132e70694a990d7d25bd97` ("Back up Codex and OpenCode
skills with verified restore workflow"). The working tree is clean, so that
commit is the authoritative pin for the whole collection.

| Skill | `SKILL.md` sha256 | Bytes |
| --- | --- | ---: |
| `find-skills` | `1e85f6f9686e145aca4a124e3b704b9bbea9aa87e08515c1e352eee70f6e6e7a` | 5,446 |
| `frontend-audit` | `7a9dba8f1a2da56a4cf64b4c21f974bc47169569a4209c6243c5edefdbe442c8` | 12,224 |
| `frontend-build` | `1376f8ccaad442aa7b8b0f28640a0f41fe5ecb86a9bb736af50964f45b112e75` | 5,393 |
| `hackathon-build` | `eb8feb51b3a12d1adb6ac08defc4eaf7029c8dace4d99de9df241a385a937f89` | 6,454 |
| `hackathon-discovery` | `b75004988b10dc610ed2c259660e14b3969347ba47a336b40768110a30f34ac4` | 13,114 |
| `project-recovery` | `d83aa87615d30b823ba7985feed47788305d208b1f495cd8adf213bad362733b` | 13,773 |

`/root/arc-skills/inventory.json` additionally pins **1,148 individual files**
by path, byte size, and sha256, and records the scope: *"Global skill folders
in Linux and Windows plus user-specified cskill folder. Project-local skills
outside these paths were not searched."* That scope limit is worth stating:
a skill living inside some other project directory would not appear in this
inventory. The searches in §7.1 were run outside that scope as well, across
the OpenCode and agent configuration directories, and still found nothing.

### 7.4 Other tools used in this session

| Tool | Version / path | Used for |
| --- | --- | --- |
| Node.js | 22.22.1 | The SDK/CLI test suite, the concurrency harness, the read-only name and account probes |
| `curl` | system | Read-only public API calls: GitHub, crates.io, NEAR explorer, the live `HACKATHON.md` |
| `python3` | system | JSON parsing of those read-only responses |
| `playwright-core` | 1.64.1 (`/root/browser-tool/node_modules`) | Headless Chromium for the four screenshot recaptures |
| Chromium | 1248 arm64 (`/root/.cache/ms-playwright/chromium-1248`) | The screenshot capture browser |
| `cargo` / `rustc` | 1.93.0 via rustup | `make repro`, `make verify` |

No paid tool, no hosted service, and no credentialed API was used.

### 7.5 Gaps that remain open

| Gap | Impact | Mitigation |
| --- | --- | --- |
| No Rust/NEAR-specific skill | More manual source reading | Read `near-sdk`/`multisig2` source; pin commits; test on testnet |
| The `unslop` skill is not installed | Its guidance was not applied to the writing in this session | The repo's own `AGENTS.md` wording rules carry the same intent for the Keyhalt documents; if the human wants that skill's checks applied, it has to be installed and pinned first |
| No video tool verified | Demo recording uncertain | Human records/posts; `docs/DEMO_SCRIPT.md` is the script |
| Server restarts observed | Lost work/time | Commit often; detached runs with a log; re-run if a log ends mid-suite |
