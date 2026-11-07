# FLEET interfaces (v0.3)

**Status:** v0.3 — controller, TypeScript SDK, and CLI are implemented and have
run on NEAR testnet. Mode B 2-of-2 administration is implemented and verified on
testnet both by the harness and through the product CLI
(`fleet admin request freeze|unfreeze` / `fleet admin confirm` /
`fleet admin status`; claim rows F-038…F-040). The read-only
API is still a **scaffold** (`/health` only). The console is **built and
read-only** (`@fleet/console`): design system `docs/DESIGN_SYSTEM.md`, screen
draft `docs/CONSOLE_DRAFT.md`; recording and public use remain approval-gated.
**Date:** 2026-11-04 UTC (Mode B run executed 2026-11-03 UTC).
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

# Mode B multisig (agent admin is the deployed 2-of-2 multisig2 contract):
fleet admin request freeze <agent> --signer-key-file <member.json> [--rpc-url URL] [--json]
fleet admin request unfreeze <agent> --signer-key-file <member.json> [--rpc-url URL] [--json]
fleet admin confirm <agent> <request-id> --signer-key-file <member.json> [--rpc-url URL] [--json]
fleet admin status <agent> [--rpc-url URL] [--json]
```

`admin request` reads the agent's state, requires Mode B and a multisig
admin account, verifies the signer's membership (a non-member is refused,
exit 6, before broadcast), and proposes a freeze/unfreeze FunctionCall on the
agent controller through the admin multisig. `admin confirm` fetches the
pending request, refuses (no broadcast) any request that is not a
freeze/unfreeze FunctionCall targeting the same agent, verifies member
signer identity when the key file carries `account_id`, and confirms.
Reaching the multisig's required confirmations executes the action; below it,
the confirmation is recorded and the agent is unchanged. `admin status`
reports the members, required confirmations, request nonce, and pending
requests. The Mode B product path is verified on testnet (F-038…F-040).
Membership enforcement is enforced locally **and** by the multisig itself
(the pinned contract's predecessor check).

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

## 4. Read-only services

### 4.1 Read-only API scaffold

Package: `@fleet/api` (`packages/api`), version `0.3.0-phase1`.

`createReadOnlyApi().handle(method, path)`:

| Method | Path | Result |
| --- | --- | --- |
| GET/HEAD | `/health` | 200 `{status, version, readOnly: true}` |
| any other route | — | 501 |
| non-GET/HEAD | any | throws `FLEET API is read-only` |

There is no HTTP server in this package and no write route in v0.3. The
SDK/CLI are the write interfaces. The console (below) is the built read-only
surface.

### 4.2 Read-only console server

Package: `@fleet/console` (`packages/console`), version `0.3.0`.

The console serves the built interface in `web/` from the same origin and a
small JSON/SSE API. It is **read-only and testnet-only**. The browser never
calls an RPC and has no key; all reads go through the SDK, pinned to one
finalized block per refresh (`blockId` in `FleetClientOptions`).

| Method | Path | Result |
| --- | --- | --- |
| GET/HEAD | `/api/health` | 200 aggregate: `headBlock`, `pinnedBlock`, `lastGoodBlock`, `stale`, retry cap, configured agents, claims count, provider stats, receipt watch |
| GET/HEAD | `/api/fleet` | 200 Fleet snapshot: rows (state, operator keys, tags, full-access keys, audit length, last event), totals, providers, `CLAIMS.md` count |
| GET/HEAD | `/api/agent?account=<id>` | 200 Agent snapshot: pinned state + SDK audit verification + on-chain `verify_audit`, operators, native keys (`null` while the key read is in flight), admin, recent events, commands |
| GET/HEAD | `/api/timeline?limit=1..500&account=<id>?` | 200 merged audit + watched-receipt events, `counts { events, refused, blocks }` |
| GET/HEAD | `/api/audit-export?account=<id>` | 200 `fleet-audit-v1` export (download) |
| GET | `/api/stream` | SSE: `retry: 3000`, events `init`, `block`, `snapshot`, `timeline` |
| GET/HEAD | `/` `/app.js` `/styles.css` `/favicon.svg` `/fonts/*` `/claims.md` `/threat-model.md` | static, same-origin, `Content-Security-Policy: default-src 'self'; script-src 'self'…` |
| any other write method | any route | 405 `FLEET_CONSOLE_READ_ONLY`, `Allow: GET, HEAD` |

Rules:

- `readOnly: true` and `noSigner: true` on every payload; unknown accounts
  return 404 `FLEET_CONSOLE_UNKNOWN_AGENT`, never a guess.
- One block per refresh. The header ticker is the live finalized block feed
  (poll `block { finality: "final" }`; free public RPC ships no block
  WebSocket). When reads fail, the console shows the last good block plus a
  stale marker.
- Every snapshot pins to one finalized block (`block_id`); a pinned key read
  uses raw `query` `view_access_key_list`. `getNativeKeys()` in the SDK uses
  the same pinned path.
- Provider failover with pacing and per-provider cooldown: FastNEAR → dRPC →
  NEAR Foundation → Intear; archival (for watched receipts): FastNEAR archival
  → NEAR Foundation archival. Overall retry cap 120 s; calls that cannot
  succeed in the window fail with a pacing/cooldown error rather than spin.
- The Timeline merges audit entries (chain-verified in the SDK) with receipts
  the console explicitly watches (`tmp/console-watch.json` by default). The
  watch file holds only transaction hashes; every displayed receipt field is
  parsed from an archival RPC response, never from the file. A refusal row is
  sourced from the real receipt and is never synthesised.
- The console never signs, stores a key, or calls a write method. Writes are
  CLI/SDK only.

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

## 6. Mode B 2-of-2 administration

Mode B replaces the Mode A admin key with a 2-of-2 multisig account. The
controller still enforces the same state machine; only the predecessor identity
changes.

### 6.1 Shape

- A fresh parent account becomes the multisig account. The pinned `multisig2`
  contract is deployed to it and initialized with two **account members** and
  `num_confirmations = 2`.
- The managed agent is a sub-account of that parent and is initialized with
  `admin_account = <parent>`, `admin_public_key = null`, and
  `recovery_public_key = null`.
- The parent's bootstrap FullAccess key is deleted after multisig init. The
  recorded run leaves zero access keys on the parent.
- The agent has four FunctionCall operator keys and zero FullAccess keys.

### 6.2 Flow

A lifecycle change is two outer transactions plus one confirmation:

1. Owner 1 submits `add_request` to the multisig account with a `FunctionCall`
   action whose receiver is the agent and method is `freeze` or `unfreeze`.
   This creates a request and returns its id; the agent is unchanged.
2. Owner 1 (or owner 2) submits `confirm({request_id})`. One confirmation is
   recorded but does not execute while the threshold is 2.
3. The other member submits `confirm({request_id})`. The multisig executes the
   inner call with the parent as predecessor, and the controller requires that
   predecessor to equal `admin_account`.

The harness submits these calls; the v0.3 SDK and CLI do not yet expose
multisig `add_request`/`confirm` write commands. SDK/CLI reads (`inventory`,
`verify`, `audit`) work against a Mode B agent. A direct `freeze` sent to the
agent with an owner key is refused because the predecessor is not the parent.

### 6.3 Recorded result

`evidence/modeb-v03/run.json` (52/52 checks, 2026-11-03) records:

- parent/multisig `fleet-modeb-748d4372.testnet`; agent
  `agent-b1.fleet-modeb-748d4372.testnet`;
- multisig wasm 293,734 bytes,
  sha256 `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`,
  built from commit `1b0436c96379c63aee7d2429c6d5d24019031ab8`;
- freeze submit-to-observed 20,884 ms; unfreeze 27,064 ms (includes finality and
  polling);
- a direct member `freeze` refused with `active admin required`, a non-member
  `add_request` rejected, and a duplicate confirmation rejected;
- audit actions attributed to the multisig account, with the outer owner key
  recorded as `signer_pk`.

### 6.4 Limitations

- Both owner accounts were operated by the same test harness. The run proves the
  2-of-2 mechanism, not independent organizational custody.
- The multisig contract is third-party and unaudited; its upstream README
  disclaims guarantees. Known concerns are listed in `docs/PROVENANCE.md`.
- No SDK/CLI Mode B write path, no multisig request UI, and no relay/paymaster
  path exist in v0.3.

---

## 7. Contract events

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

In Mode B, `actor_account` is the multisig parent and `signer_pk` is the owner
key that signed the outer transaction. The controller cannot see the multisig's
internal confirmation count; it only observes the executed predecessor call.
