# Keyhalt

Keyhalt is a key-lifecycle control plane for NEAR agent accounts. It is testnet-only, unaudited, and defensive by design.

An account that serves agents usually depends on native NEAR access keys. Whoever controls the keys controls the account. Keyhalt treats those keys as the boundary: operators get scoped FunctionCall keys with receiver and method ACLs, the admin can freeze the agent in one transaction, revoke an entire tier of operator keys by tag, rotate the admin under supervision, or recover from a lost admin. An audit chain trails every state change, verifiable on-chain and reproducible offline.

## What it is

- `contracts/fleet-controller/`: the controller, a single-permission-per-method NEAR contract with a SHA-256 audit chain.
- `packages/sdk/`: TypeScript SDK and structured CLI output.
- `packages/mcp/`: a read-only agent-facing MCP server.
- `web/`: the Keyhalt console. Read-only. Every number is read from testnet or counted from `CLAIMS.md`.
- `CLAIMS.md`: one row per testable claim, mapped to the test, the tx hash, or the file that proves it.

## What it is not

- Not a wallet, not custody, and not a spending-policy engine.
- Not a mainnet product yet. Every artifact here is testnet, and no transaction in evidence targets mainnet.

## Verify the full lifecycle

Prerequisites: Node.js 22.x, Rust 1.93 with the `wasm32-unknown-unknown` target, `git`, and a POSIX shell. Testnet free, no NEAR account required.

```bash
git clone https://github.com/unifyWeb3/keyhalt.git
cd keyhalt
make setup
make verify
```

`make verify` runs `cargo fmt` and clippy with warnings denied, the Rust and TypeScript suites, the release-wasm build and its hash check, a claims-table validation, and a secret-scanning pass. Expect the final line `Keyhalt verification: PASS` and `CLAIMS 41/41 verified`.

Then walk the full lifecycle against testnet:

```bash
# Read the live native-key inventory and audit chain for an agent.
node_modules/.bin/keyhalt inventory agent-2.fleet-v03-5cff9e99.testnet --json
node_modules/.bin/keyhalt verify    agent-2.fleet-v03-5cff9e99.testnet --json

# Freeze the agent in one admin transaction (Mode A).
node_modules/.bin/keyhalt freeze    agent-2.fleet-v03-5cff9e99.testnet --signer-key-file /secure/admin.json --json

# An operator call is now refused on chain, and the refusal is recorded.
node_modules/.bin/keyhalt execute   agent-2.fleet-v03-5cff9e99.testnet --method ping --args '{}' --gas 10 --signer-key-file /secure/operator.json --json

# Unfreeze in one admin transaction and re-verify.
node_modules/.bin/keyhalt unfreeze  agent-2.fleet-v03-5cff9e99.testnet --signer-key-file /secure/admin.json --json

# Export and re-verify the audit chain independently.
node_modules/.bin/keyhalt audit export agent-2.fleet-v03-5cff9e99.testnet --out /tmp/keyhalt-audit.json --json
node_modules/.bin/keyhalt verify-audit /tmp/keyhalt-audit.json --json
```

Keys live outside the repository. The CLI never prints, logs, or transmits a secret key. The `execute` step demonstrates a legitimate freeze: the call is refused with reason `controller is frozen` and the refusal is written on chain.

## What to trust, and what to check

The `CLAIMS.md` table is the source of truth. Every `VERIFIED` row lists either the test that runs or the testnet transaction hash that performed the action. Concurrency claims record the failure mode used to get the number. The release wasm is a fixed artifact: 248,644 bytes, sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`. Two isolated builds match it byte for byte. The controller source is frozen at the panic-location line it shipped with.

## Limitations

Testnet only. The console is read-only; writes go through the CLI with a local signer. The agent-side keys are demo fixtures provisioned during testing. Full custody and full private compliance are not covered by this work.

## Independence and disclosure

This is one of two independent NEAR submissions by the same builder. The other project is `bound`, at `https://github.com/unifyWeb3/near-bound`. No code is shared across the repositories. The two READMEs name each other as the sibling submission.

## License

MIT. See `LICENSE`.
