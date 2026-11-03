# FLEET

**FLEET is a native NEAR account-fleet key-lifecycle control plane.** It is
being built for the NEAR HACKATHON: Build Beyond Boundaries, `security` track.
It is **testnet only**, **unaudited**, and **not non-custodial**.

**Current status: Phase 1 scaffold only (2026-11-03).** There is no controller,
SDK, CLI, or dashboard implementation yet. The commands below verify the
scaffold and the reproducibility harness; they do not demonstrate the product.
The target capabilities are in `docs/SPEC_v0.3.md`; every future claim must be
entered in `CLAIMS.md` with a test or transaction hash.

## Problem

A team running several NEAR agent accounts tends to give each agent a key and
manage that key by hand. If one agent is compromised, the team needs a fast
freeze and a way to revoke only that agent's key. A full-access key is too much
authority, and a per-agent custody contract moves the assets into a new trust
boundary.

FLEET's narrow target is the **native NEAR access-key lifecycle** on accounts
the team already owns: scoped operator keys, a stop switch, tag-based bulk
revocation, governed admin, and an audit export. It is not a wallet, a TEE
custodian, or a policy engine.

## Do X, see Y (Phase 1)

Prerequisites: Node.js 22.x, Rust 1.93 with the `wasm32-unknown-unknown` target,
`git`, and a POSIX shell. No NEAR account or key is needed for these steps.

```bash
git clone <repository-url> fleet
cd fleet
make setup          # checks tools, installs JS dev dependencies, builds the scaffold
make verify         # local tests + claim-table validation + a read-only testnet RPC check
make demo           # prints the 90-second demo script; product demo is not implemented yet
```

Expected Phase 1 result:

```text
FLEET scaffold verification: PASS
CLAIMS 0/0 (no claims recorded yet)
```

The read-only RPC check uses the public testnet endpoint only. It refuses to run
if a mainnet RPC or `NEAR_MAINNET` is configured. No key is read or written.

**One-command test from a clean clone:**

```bash
./scripts/fresh-clone-test.sh
```

It clones this repository into a temporary directory, runs `make setup` and
`make verify`, checks that a malformed claim is rejected, and asserts that the
clone contains no key material.

## What is not claimed

- No product capability is claimed at Phase 1.
- No contract, SDK, CLI, dashboard, or demo is implemented.
- No mainnet support, real funds, audit, production readiness, or non-custody.
- No 12-lane, 20-lane, freeze-latency, rotation, or top-up claim is made by this
  repository yet. Those are targets in `docs/SPEC_v0.3.md` and `docs/TEST_PLAN.md`.

## Trust model (target, not yet implemented)

| Mode | Admin | What remains trusted | Status |
| --- | --- | --- | --- |
| Mode A | A team-held admin FunctionCall key | Admin key, recovery key, finite allowance, operator keys | Target; not non-custodial |
| Mode B (demo default) | A 2-of-2 multisig account | Two owner keys, the multisig contract, operator keys | Target; multisig is unaudited reference code |

In both modes the admin role is intended to grant/revoke/freeze, not to execute,
add full access, deploy, upgrade, or transfer through the controller. That is a
design target; it must be tested before it is claimed. A freeze is intended to
block new executes; it does **not** cancel a receipt already in flight.

## Baseline and diff (Q-003)

This repository is new. The baseline tag is `pre-hackathon`; the submitted
revision will be tagged `hackathon-submission`. The README diff section will be
updated with the exact compare link after the repository is public.

The separate research workspace contains the v0.2 controller, the multisig
prototype, and S1–S8 testnet evidence created 2026-10-28/29. That material is
**not copied into this repository**. See `docs/PROVENANCE.md`.

## AI assistance and reused material

- Built with AI assistance: OpenCode (agent harness) and a DeepSeek model.
- Pre-existing research: the FLEET v0.2 controller and multisig prototype
  (2026-10-28), used as problem evidence and specification input, not as product
  code at the baseline tag.
- Planned reuse: `near/core-contracts/multisig2` at commit
  `1b0436c96379c63aee7d2429c6d5d24019031ab8` for Mode B, if the Phase 1 reuse
  gate passes. No audit statement was found; its README disclaims guarantees.
- Runtime libraries and boilerplate will be listed here with versions and
  licenses before any release candidate.

## Repository layout

```text
contracts/        Rust workspace (no contract implementation yet)
packages/sdk/     TypeScript SDK scaffold
packages/cli/     TypeScript CLI scaffold
packages/api/     TypeScript read-only API scaffold
web/              Read-only console placeholder (no signing keys)
docs/             Provenance, spec, threat model, test plan, demo, plan, interfaces, red team
scripts/          Setup, verification, fresh-clone harness, secret scan
evidence/         Claims JSON and reproduction record (no secrets)
CLAIMS.md         Empty claim table at Phase 1
```

## License

MIT. See `LICENSE`.
