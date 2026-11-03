# FLEET interfaces (v0.3)

**Status:** v0.3 — controller, TypeScript SDK, and CLI are implemented and have
run on NEAR testnet. The read-only API is still a **scaffold** (`/health` only).
The console is not built; its design is approval-gated.
**Date:** 2026-11-03 UTC.
**Rule:** a private key never enters a browser, a server, a log, or the
repository. Writes are signed locally by the CLI/SDK; the API has no write route.

---

## 1. Principles

1. **Reads are public and safe.** Inventory and audit views can be served by a
   read-only API or static cache.
2. **Writes are local.** `freeze`, `grant`, `rotate`, `revoke`, `recover`, and
   admin rotation are signed on the user's machine.
3. **No key transport.** The SDK accepts a signer in-process. It never
   serializes a private key, sends one over HTTP, or stores one in a browser.
4. **Public keys only in outputs.** Account IDs, public keys, tags, hashes,
   block heights, timestamps, and tx hashes are safe to display.
5. **Fail closed.** Unknown command, unknown route, malformed args, mainnet RPC,
   or missing evidence → nonzero exit / 4xx, not a fake success.
6. **Testnet only.** The SDK refuses a mainnet-looking URL at construction and
   checks `chain_id === "testnet"` before network work. The CLI also refuses
   `NEAR_MAINNET`.

---

## 2. TypeScript SDK

Package: `@fleet/sdk` (`packages/sdk`), version `0.3.0`, private workspace.

```ts
import { createFleetClient, verifyAuditChain } from "@fleet/sdk";

const fleet = createFleetClient({
  rpcUrl: "https://rpc.testnet.fastnear.com", // default
  accountId: "agent-2.fleet-v03-5cff9e99.testnet",
  // optional: signer: { secretKey: "ed25519:..." }
});
```

### 2.1 Types

```ts
type FleetMode = "A" | "B";

interface OperatorKey {
  publicKey: string;
  tag: string;
  active: boolean;
}

interface AuditHead {
  seq: number;
  entryHash: string;
  blockHeight: number;
  blockTimestampNs: string; // decimal string; u64 exceeds JS Number
}

interface AuditEntry {
  seq: number;
  action: string;
  actorAccount: string;
  signerPublicKey: string;
  subject: string;
  blockHeight: number;
  blockTimestampNs: string;
  prevHash: string;
  entryHash: string;
}

interface FleetState {
  accountId: string;
  contractVersion: string;
  mode: FleetMode;
  paused: boolean;
  adminPublicKey: string | null;
  adminAccount: string | null;
  recoveryPublicKey: string | null;
  pendingAdminPublicKey: string | null;
  pendingOrigin: "admin" | "recovery" | null;
  inflightAdminPublicKey: string | null;
  operators: OperatorKey[];
  receiverId: string;
  methodName: string;
  maxOperators: number;
  provisioned: boolean;
  provisionError: string | null;
  auditHead: AuditHead;
  auditLength: number;
}

interface NativeKey {
  publicKey: string;
  permission: "FullAccess" | "FunctionCall" | "Unknown";
  allowanceNear: string | null;
  receiverId: string | null;
  methodNames: string[];
}

interface FleetTxResult {
  txHash: string;
  blockHeight: number;
  gasBurnt: string;
  logs: string[];
  refusal: string | null;
}
```

### 2.2 Methods

Reads:

| Method | Returns |
| --- | --- |
| `getState()` | `FleetState` |
| `getNativeKeys()` | `NativeKey[]` from `view_access_key_list` |
| `getInventory()` | state + operators + native keys + `fullAccessKeys` count + audit head |
| `getAudit(fromSeq, limit)` | up to 100 `AuditEntry` rows |
| `getAuditAll()` | every entry, paginated at 100 |
| `getAuditHead()` | `AuditHead` |
| `verifyAuditOnChain()` | controller `verify_audit` boolean |

Writes (require a signer):

| Method | Contract call |
| --- | --- |
| `freeze()` / `unfreeze()` | `freeze` / `unfreeze` |
| `grantOperator(pk, tag)` | `grant_operator` |
| `rotateOperator(oldPk, newPk, tag)` | `rotate_operator` |
| `revokeOperator(pk)` | `revoke_operator` |
| `revokeTag(tag)` | `revoke_tag` |
| `proposeAdmin(newPk)` / `acceptAdmin()` / `cancelAdmin()` | `propose_admin` / `accept_admin` / `cancel_admin` |
| `recoverAdmin(newPk)` | `recover_admin` |
| `execute(receiver, method, args?, gasTgas?)` | `execute`; defaults `args="{}"`, `gasTgas=10` |

Utilities:

- `verifyAuditChain(entries)` → `{ok, error, entries, head}`
- `verifyAuditExport(value)` → accepts both `fleet-audit-v1` exports and the
  raw snake_case E2E file
- `buildAuditExport(accountId, state, entries)` → `fleet-audit-v1`
- `parseBigJson(text)` → quotes 16+ digit integers before `JSON.parse`
- `sha256Hex(bytesOrString)`
- `fleetExitCode(code)`

### 2.3 Error codes

| Code | Exit | Meaning |
| --- | --- | --- |
| `FLEET_E_BAD_ARGS` | 2 | malformed or missing input |
| `FLEET_E_UNSUPPORTED` | 2 | unknown command/operation |
| `FLEET_E_NO_SIGNER` | 3 | write attempted without a signer |
| `FLEET_E_MAINNET` | 4 | mainnet URL or non-testnet `chain_id` |
| `FLEET_E_RPC` | 5 | network/RPC failure |
| `FLEET_E_REJECTED` | 6 | transaction-level policy rejection |
| `FLEET_E_RECEIPT` | 7 | failed action receipt |
| `FLEET_E_AUDIT` | 6 | audit chain or export does not verify |

`FleetError` carries `code`, `txHash`, `blockHeight`, and `refusal`; the CLI
prints the same fields under `error`.

### 2.4 Audit export format

```json
{
  "format": "fleet-audit-v1",
  "accountId": "agent-2....testnet",
  "exportedAt": "2026-11-03T19:52:00.000Z",
  "contractVersion": "fleet-controller-v0.3.0",
  "head": { "seq": 4, "entryHash": "6ca1...", "blockHeight": 276092082, "blockTimestampNs": "1793734208281993216" },
  "entries": [],
  "verified": true
}
```

The hash message is
`prev_hash|seq|action|actor_account|signer_pk|subject|block_height|block_timestamp`
hashed with SHA-256. `seq` must start at 0, be gapless, and each `prev_hash`
must equal the previous `entry_hash`; the first `prev_hash` is 64 zeros.

---

## 3. CLI

Binary: `fleet` (`node_modules/.bin/fleet`), version `0.3.0`.

### 3.1 Commands

```text
fleet inventory <account> [--rpc-url URL] [--json]
fleet verify <account> [--rpc-url URL] [--json]
fleet audit export <account> --out <file> [--json]
fleet audit verify <file> [--json]
fleet verify-audit <file> [--json]

fleet freeze <account> --signer-key-file <path> [--json]
fleet unfreeze <account> --signer-key-file <path> [--json]
fleet grant <account> --key <public-key> --tag <tag> --signer-key-file <path> [--json]
fleet rotate <account> --old <public-key> --new <public-key> --tag <tag> --signer-key-file <path> [--json]
fleet revoke <account> --key <public-key> --signer-key-file <path> [--json]
fleet revoke-tag <account> --tag <tag> --signer-key-file <path> [--json]
fleet propose-admin <account> --new-admin <public-key> --signer-key-file <path> [--json]
fleet accept-admin <account> --signer-key-file <path> [--json]
fleet cancel-admin <account> --signer-key-file <path> [--json]
fleet recover <account> --new-admin <public-key> --signer-key-file <path> [--json]
fleet execute <account> --method <name> [--args '<json>'] [--gas <tgas>] [--receiver <account>] --signer-key-file <path> [--json]
```

`--rpc-url` defaults to `https://rpc.testnet.fastnear.com`; `FLEET_RPC_URL` is
also accepted. `--signer-key-file` falls back to `FLEET_SIGNER_KEY_FILE`.

### 3.2 JSON envelopes

Reads:

```json
{ "ok": true, "command": "inventory", "accountId": "...", "state": {}, "operators": [], "nativeKeys": [], "fullAccessKeys": 0, "auditHead": {} }
```

```json
{ "ok": true, "command": "verify", "accountId": "...", "verified": true, "onChain": true, "js": {"ok": true, "entries": 19, "head": "..."}, "inventory": {} }
```

Writes:

```json
{ "ok": true, "command": "freeze", "accountId": "...", "txHash": "...", "blockHeight": 123, "gasBurnt": "2312712629122", "refusal": null }
```

Errors:

```json
{ "ok": false, "command": "execute", "accountId": "...", "error": { "code": "FLEET_E_REJECTED", "message": "controller is frozen", "txHash": "...", "blockHeight": 123, "refusal": "controller is frozen" } }
```

With `--json`, stdout carries exactly one JSON object. Human output goes to
stderr, so a caller can pipe stdout safely.

### 3.3 Signer file rules

The CLI refuses to sign unless all of these hold:

1. The file exists and is a regular file.
2. It has no group or world permission bits (`mode & 0o077 == 0`; use `600`).
3. It lives outside any directory tree containing `.git`.
4. It contains a raw `ed25519:`/`secp256k1:` secret string or a JSON object with
   `secret_key` or `private_key`.

The CLI never prints the secret, the file content, or the file path in `--json`
output.

---

## 4. Read-only API scaffold

Package: `@fleet/api` (`packages/api`), version `0.3.0-phase1`.

`createReadOnlyApi().handle(method, path)`:

| Method | Path | Result |
| --- | --- | --- |
| GET/HEAD | `/health` | 200 `{status, version, readOnly: true}` |
| any other route | — | 501 |
| non-GET/HEAD | any | throws `FLEET API is read-only` |

There is no HTTP server and no write route in v0.3. The SDK/CLI are the product
interfaces until the console design is approved.

---

## 5. Contract view interface

| View | Returns | Used by |
| --- | --- | --- |
| `get_state()` | mode, paused, admin/pending/recovery fields, operators, receiver/method, provisioned/error, audit head/len | SDK, CLI |
| `get_inventory()` | the same `StateView` snapshot | SDK, CLI |
| `get_audit(from_seq, limit)` | `AuditEntry[]` page | SDK, CLI |
| `get_audit_entry(seq)` | one entry or `null` | CLI verifier |
| `get_audit_head()` | seq, hash, block height/time | SDK, CLI |
| `verify_audit()` | `bool` over the full on-chain chain | SDK, CLI |

Views never expose a private key. `signer_pk` is a public key.

---

## 6. Contract events

Every successful mutation logs one NEP-297 event:

```json
{
  "standard": "nep297",
  "version": "1.0.0",
  "event": "fleet_controller",
  "data": {
    "seq": 12,
    "action": "freeze",
    "actor_account": "agent....testnet",
    "signer_pk": "ed25519:...",
    "subject": "agent....testnet",
    "block_height": 123,
    "block_timestamp": "1793734208281993216",
    "entry_hash": "..."
  }
}
```

A refused call logs `FLEET_REFUSAL:<reason>` before trapping, so the reason is
visible in the public receipt logs even though the call fails.
