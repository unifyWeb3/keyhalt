# Provenance and baseline plan

**Status:** historical baseline document. It describes the `pre-hackathon` tag,
which intentionally contained no product code. v0.3 product code was added after
that tag; see `README.md` and `CLAIMS.md`. This page is not rewritten to pretend
the baseline included the product.
**Repository:** `keyhalt`. Private remote configured
(`https://github.com/unifyWeb3/keyhalt.git`); commits have been pushed to
that private remote, and **nothing has been made public**. No public
repository, no published tag, no X post, no submission.
**Created:** 2026-11-03 UTC (Phase 1 was planned for 2026-10-30/31 and slipped; see `research/BUILD_STATUS.md` in the separate research workspace).
**License:** MIT (`LICENSE`).

## 1. What this repository is

This is a **new, clean submission repository** for Keyhalt. It is not the research
workspace and it does not contain QFO, VESSEL, or SCAN code. At the
`pre-hackathon` tag it contains only:

- repository scaffold (Rust workspace, TypeScript workspace, web placeholder);
- CI and the reproducibility harness;
- specifications, threat model, test plan, demo script, and the day-by-day plan;
- an empty claims table.

There is **no controller implementation, no multisig implementation, no SDK
implementation, and no dashboard implementation** at the baseline tag.

**v0.3 note (2026-11-04):** after the baseline tag, this tree gained the
controller (`contracts/fleet-controller`), SDK/CLI (`packages/sdk`,
`packages/cli`), testnet evidence (`evidence/`), the claim table, and a pinned,
source-built reuse of `near/core-contracts/multisig2` for Mode B. The console is
still absent. The baseline section above remains accurate for tag
`pre-hackathon`.

**v0.3 console note (2026-11-07):** the console has since been built
(`packages/console` + `web/`), read-only and testnet-only. `web/` is no
longer a placeholder. Recording, publication, and any public use still
require written human approval.

## 2. Pre-existing material (not copied into this repository)

| Material | Created | Where it lives | In this repo? |
| --- | --- | --- | --- |
| Keyhalt v0.2 controller research source (`fleet-controller-v2/0.2.0`) | 2026-10-28 | Separate research workspace: `research/evidence/fallback/spikes/keyhalt-v2/contract/` | **No** |
| Keyhalt v0.1/v0.2 multisig prototype (`keyhalt-multisig-v2/0.1.0`) | 2026-10-28 | Separate research workspace: `research/evidence/fallback/spikes/keyhalt-v2/multisig/` | **No** |
| S1-S8 testnet evidence, gas table, transaction receipts | 2026-10-29 | Separate research workspace: `research/evidence/fallback/spikes/keyhalt-v2/` | **No** |
| Rules, demand, edge, architecture, spike records | 2026-10-26 - 2026-10-30 | Separate research workspace (`research/*.md`) | **No** |
| Research git baseline | 2026-10-28 | Research workspace commit `4ede3f6`, tag `research-baseline-2026-10-28` | **No** |

The research workspace is **evidence**, not submission code. It is not a git
remote and has no public URL. The v0.2 controller and multisig are unaudited
research prototypes; their failures (S2 rotation, S6 top-up) are inputs to the
v0.3 specification, not product code.

**Q-003 position:** if any research code is later reused, it will be listed in
`README.md` as pre-existing baseline, with the exact source, date, and license.
The default plan is to write the product code fresh under `contracts/` in this
repository after the baseline tag; reuse of the v0.2 code is not assumed.

## 3. Baseline tag plan

| Ref | Purpose | When | State |
| --- | --- | --- | --- |
| `pre-hackathon` | The Phase 1 scaffold + documents + harness. No product code. | Created at the end of Phase 1, before any product implementation. **Actual creation is 2026-11-03**, after the planned 2026-10-31 cut-off; the slip is disclosed, not backdated. | **Exists.** Annotated tag on commit `5a26e22` |
| `hackathon-submission` | The exact submitted revision. | At submission, after the final clean-session fresh-clone test. | **Planned, not created.** Creating it requires the human's approval |

The baseline tag is annotated. It is intended to let a reader diff
`pre-hackathon..hackathon-submission` and see the product work. Because the
Phase 1 target slipped, the tag name is retained for the event's Q-003
convention, but its real creation date is recorded here and in the git tag
message. It is not a claim that the repository existed on 2026-10-31.

### 3.1 The `hackathon-submission` tag plan

The tag is a **plan**, not an action. Nothing below is executed without the
human's explicit approval, in this order:

1. **Precondition: all local gates pass on the final tree:**
   `make verify`, `make claims`, `make repro`, and
   `./scripts/fresh-clone-clean-session.sh`. The clean-session log is saved as
   `evidence/fresh-clone-v03-clean-session.log` (F-037).
2. **Freeze the commit.** Let `S` be the commit that passes those gates.
3. **Tag `S` locally** as an annotated tag named `hackathon-submission`, with
   a message that records: the commit hash, the date, the wasm sha256
   `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`, the
   testnet chain ids used, and the fact that the tag marks the **testnet
   prototype** submitted to the `security` track.
4. **Push the tag only to the private remote** `origin`
   (`https://github.com/unifyWeb3/keyhalt.git`), if the human approves
   even that. A tag push is a publication action on a remote that the human
   may later make public, so it waits for the same approval as the repository
   publication.
5. **Publish the repository** (the human's decision, before the event's
   development deadline of 2026-11-14T23:59:00Z).
6. **Add the compare link to the README's Q-003 section:**
   `https://github.com/<owner>/<repo>/compare/pre-hackathon...hackathon-submission`.
   The link cannot be written before publication because the remote is private.
7. **Post the X demo** (human-authored and human-posted) and **submit once**
   through `https://nearhackathon.com/api/applications`, only after the human
   confirms the exact payload.

**If the human never publishes:** no tag is created, no tag is pushed, and the
Q-003 answer remains "the `pre-hackathon` tag exists locally and on the
private remote; the submission tag was never created because the repository was
not published." That is recorded rather than papered over.

**What the diff contains.** `pre-hackathon..hackathon-submission` is the whole
v0.3 product: the controller (`contracts/fleet-controller`), the SDK, the CLI,
the read-only API scaffold, the near-workspaces integration suite, the testnet
harness scripts, the `evidence/` tree, `CLAIMS.md` with its 37 verified rows at the time (40 as of 2026-11-08),
and the documentation. The baseline contributes the scaffold, the CI, and the
reproducibility harness. The two multisig2 source files that are copied in for
the Mode B build are attributed in §6 and excluded from the claim that the
product code is original.

## 4. What is intentionally excluded

- No private keys, seed phrases, credential files, or `.env` files.
- No mainnet configuration, mainnet transactions, or payout address.
- No QFO, VESSEL, or SCAN code.
- No copied third-party code without a license and attribution. The one reused
  runtime component is `multisig2`, disclosed in §6.
- No generated evidence that has not been produced by a command in this repo.

## 5. Reuse and AI disclosure

The product is AI-assisted. The README lists the tools and any reused libraries.
The controller, SDK, and CLI are written for this repository. Mode B reuses
`near/core-contracts/multisig2`; §6 records the commit, license, source hashes,
build command, and caveats. Its README explicitly says it is not guaranteed and
no audit statement has been found.

## 6. Third-party reuse: Mode B `multisig2`

| Field | Value |
| --- | --- |
| Repository | `https://github.com/near/core-contracts` |
| Subdirectory | `multisig2` |
| Version | `0.4.0` |
| Commit | `1b0436c96379c63aee7d2429c6d5d24019031ab8` |
| License | `MIT OR Apache-2.0` |
| Source tarball | 1,413,758 bytes, sha256 `7e6595a60e8cd4d7924408147768571af34483b4b8c54cd36e9c94dba28a7b3c` |
| Source build | 293,734 bytes, sha256 `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f` |
| Checked-in prebuilt | 340,613 bytes, sha256 `f3f9ee3e5e29d020dc73f581ff1490c03dff875ed01327dfebbe666724930a76` (not deployed) |
| Deployed code hash | base58 `G3GUfe8ZJ2RLe2XphKiKA7YXB4iyjBjUK8knd6T8X1jC`, matching the source build |

Source hashes pinned in `evidence/modeb-v03/multisig-repro-build.json`:

| File | SHA-256 |
| --- | --- |
| `Cargo.toml` | `e701331328e5a6d4c9945ec261560a73c68723b049205dde58771e4b95be414d` |
| `Cargo.lock` | `e00a5ad4dcf75d055cb1e8d0cbdce051c429194fb23e3fd6b3a677e3619cf90e` |
| `src/lib.rs` | `65bc055731f6c5a9344ba3155b9685f95ebdfafe83d938cf3c5bdd10ad458046` |
| `README.md` | `fc40966324c1ad0b08184d0f43e637537080dff6944db6b5817ce4b848bbfdeb` |
| `res/multisig2.wasm` | `f3f9ee3e5e29d020dc73f581ff1490c03dff875ed01327dfebbe666724930a76` |

Build command (run twice in isolated target directories):

```bash
CARGO_TARGET_DIR=<isolated-dir> CARGO_BUILD_JOBS=2 \
  RUSTFLAGS='-C link-arg=-s' \
  cargo build --locked --target wasm32-unknown-unknown --release
```

Toolchain: `rustc 1.93.0 (254b59607 2026-01-19)`, `cargo 1.93.0
(083ac5135 2025-12-15)`. Both builds were byte-identical, and the deployed code
hash matched. Reproduction is scoped to this commit, lockfile, toolchain, and
release flags; a different toolchain can change the hash.

**Prebuilt vs source build.** The upstream repository checks in
`res/multisig2.wasm` at 340,613 bytes. This project hashed it for provenance but
did not deploy it. The testnet deployment used the 293,734-byte source build.
The two artifacts are not byte-identical.

**Known caveats.** These are disclosed, not fixed:

- The access-key allowlist names `add_and_confirm_request`, while the contract
  method is `add_request_and_confirm`. The recorded run uses **account members**
  rather than access-key members, so this typo is not exercised.
- `SetNumConfirmations` has no bound check against the member count. The run
  never calls it.
- `execute_request` removes the request before the inner promise executes, so a
  failed inner call loses the request. The recorded run verifies the inner call
  succeeded; it does not claim retry safety.
- The multisig can deploy code to itself through the `DeployContract` action.
  That is an owner power, not a controller power.
- No third-party audit was found. The upstream README disclaims guarantees.
- Both owner accounts in the recorded run were operated by the same test
  harness. This proves the 2-of-2 mechanism, not independent custody.

Evidence: `evidence/modeb-v03/multisig-repro-build.{json,md}`,
`evidence/modeb-v03/build.json`, and `evidence/modeb-v03/run.json`. Claims
F-022 and F-025.
