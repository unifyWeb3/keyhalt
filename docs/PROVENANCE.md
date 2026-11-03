# Provenance and baseline plan

**Status:** historical baseline document. It describes the `pre-hackathon` tag,
which intentionally contained no product code. v0.3 product code was added after
that tag; see `README.md` and `CLAIMS.md`. This page is not rewritten to pretend
the baseline included the product.
**Repository:** `fleet` (local only; no remote, no push, no public visibility).
**Created:** 2026-11-03 UTC (Phase 1 was planned for 2026-10-30/31 and slipped; see `research/BUILD_STATUS.md` in the separate research workspace).
**License:** MIT (`LICENSE`).

## 1. What this repository is

This is a **new, clean submission repository** for FLEET. It is not the research
workspace and it does not contain QFO, VESSEL, or SCAN code. At the
`pre-hackathon` tag it contains only:

- repository scaffold (Rust workspace, TypeScript workspace, web placeholder);
- CI and the reproducibility harness;
- specifications, threat model, test plan, demo script, and the day-by-day plan;
- an empty claims table.

There is **no controller implementation, no multisig implementation, no SDK
implementation, and no dashboard implementation** at the baseline tag.

**v0.3 note (2026-11-03):** after the baseline tag, this tree gained the
controller (`contracts/fleet-controller`), SDK/CLI (`packages/sdk`,
`packages/cli`), testnet evidence (`evidence/`), and the claim table. Mode B and
the console are still absent. The baseline section above remains accurate for
tag `pre-hackathon`.

## 2. Pre-existing material (not copied into this repository)

| Material | Created | Where it lives | In this repo? |
| --- | --- | --- | --- |
| FLEET v0.2 controller research source (`fleet-controller-v2/0.2.0`) | 2026-10-28 | Separate research workspace: `research/evidence/fallback/spikes/fleet-v2/contract/` | **No** |
| FLEET v0.1/v0.2 multisig prototype (`fleet-multisig-v2/0.1.0`) | 2026-10-28 | Separate research workspace: `research/evidence/fallback/spikes/fleet-v2/multisig/` | **No** |
| S1–S8 testnet evidence, gas table, transaction receipts | 2026-10-29 | Separate research workspace: `research/evidence/fallback/spikes/fleet-v2/` | **No** |
| Rules, demand, edge, architecture, spike records | 2026-10-26 – 2026-10-30 | Separate research workspace (`research/*.md`) | **No** |
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

| Ref | Purpose | When |
| --- | --- | --- |
| `pre-hackathon` | The Phase 1 scaffold + documents + harness. No product code. | Created at the end of Phase 1, before any product implementation. **Actual creation is 2026-11-03**, after the planned 2026-10-31 cut-off; the slip is disclosed, not backdated. |
| `hackathon-submission` | The exact submitted revision. | At submission, after the final fresh-clone test. |

The baseline tag is annotated. It is intended to let a reader diff
`pre-hackathon..hackathon-submission` and see the product work. Because the
Phase 1 target slipped, the tag name is retained for the event's Q-003
convention, but its real creation date is recorded here and in the git tag
message. It is not a claim that the repository existed on 2026-10-31.

## 4. What is intentionally excluded

- No private keys, seed phrases, credential files, or `.env` files.
- No mainnet configuration, mainnet transactions, or payout address.
- No QFO, VESSEL, or SCAN code.
- No copied third-party code without a license and attribution.
- No generated evidence that has not been produced by a command in this repo.

## 5. Reuse and AI disclosure

The product is AI-assisted. The README lists the tools and any reused libraries.
The baseline uses no third-party runtime code. If the audited/reference
`near/core-contracts/multisig2` is reused for Mode B, it will be pinned by commit
and disclosed in `README.md`; its README explicitly says it is not guaranteed
and no audit statement has been found. See `docs/SPEC_v0.3.md` §7.
