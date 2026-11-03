# FLEET interfaces

**Status:** Phase 1 — interface definitions. TypeScript types, CLI `--version` /
`--help`, and read-only API `/health` exist; all product methods are `PLANNED`.
**Date:** 2026-11-03 UTC.
**Rule:** a private key never enters a browser, a server, a log, or the
repository. Writes are signed locally by the CLI/SDK; the API is read-only.

---

## 1. Principles

1. **Reads are public and safe.** Inventory and audit views can be served by a
   read-only API or static cache.
2. **Writes are local.** `freeze`, `grant`, `rotate`, `revoke`, `recover`, and
   admin rotation are signed on the user's machine. The API has no write route.
3. **No key transport.** The SDK accepts a signer object in-process. It never
   serializes a private key, sends one over HTTP, or stores one in a browser.
4. **Public keys only in outputs.** Account IDs, public keys, tags, hashes, block
   heights, timestamps, and tx hashes are safe to display.
5. **Fail closed.** Unknown command, unknown route, malformed args, mainnet RPC,
   or missing evidence → nonzero exit / 4xx, not a fake success.

---

## 2. TypeScript SDK

Package: `@fleet/sdk` (`packages/sdk`). Version marker `0.0.0-phase1`.

### 2.1 Types

```ts
export type FleetMode = "A" | "B";

export interface OperatorKey { publicKey: string; tag: string; }

export interface FleetState {
  accountId: string;
  mode: FleetMode;
  paused: boolean;
  adminPublicKey?: string;      // Mode A
  adminAccount?: string;        // Mode B
  pendingAdminPublicKey?: string;
  recoveryPublicKey?: string;   // Mode A
  contractVersion: string;
}

export interface AuditEntry {
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

export interface AuditHead {
  seq: number;
  entryHash: string;
  blockHeight: number;
  blockTimestampNs: string;
}

export interface FleetInventory {
  accountId: string;
  state: FleetState;
  operators: OperatorKey[];
  nativeKeys: NativeKey[];
  auditHead: AuditHead;
}
```

### 2.2 Client

```ts
export interface FleetClientOptions {
  rpcUrl: string;          // must be testnet in v0.3
  accountId: string;
  signer?: LocalSigner;    // in-process only; never serialized
}

export interface FleetClient {
  getState(): Promise<FleetState>;
  getInventory(): Promise<FleetInventory>;
  getAudit(fromSeq: number, limit: number): Promise<AuditEntry[]>;
  getAuditHead(): Promise<AuditHead>;

  freeze(): Promise<string>;                 // tx hash
  unfreeze(): Promise<string>;
  grantOperator(publicKey: string, tag: string): Promise<string>;
  rotateOperator(oldPublicKey: string, newPublicKey: string, tag: string): Promise<string>;
  revokeOperator(publicKey: string): Promise<string>;
  revokeTag(tag: string): Promise<string>;
  proposeAdmin(newPublicKey: string): Promise<string>;
  acceptAdmin(): Promise<string>;
  recoverAdmin(newPublicKey: string): Promise<string>;
}
```

**Phase 1 behavior:** `createFleetClient()` throws
`FLEET SDK is not implemented in Phase 1.` No RPC call is made. Tests:
`packages/sdk/test/sdk.test.mjs` (2 passing).

### 2.3 Error model

| Code | Meaning | CLI exit |
| --- | --- | --- |
| `FLEET_E_NO_SIGNER` | Write attempted without a local signer | 3 |
| `FLEET_E_MAINNET` | RPC URL is mainnet | 4 |
| `FLEET_E_RPC` | RPC/network failure | 5 |
| `FLEET_E_REJECTED` | On-chain call rejected; receipt inspected | 6 |
| `FLEET_E_RECEIPT` | Top-level success but action receipt failed | 7 |
| `FLEET_E_STALE` | Pre-signed transaction too old | 8 |
| `FLEET_E_UNSUPPORTED` | Not implemented in this phase | 2 |

A top-level `SuccessValue` with a failed action receipt is `FLEET_E_RECEIPT`, not
success. This is the v0.2 `AddKey` lesson.

---

## 3. CLI

Package: `@fleet/cli` (`packages/cli`). Binary: `fleet`.

### 3.1 Implemented in Phase 1

| Command | Behavior | Test |
| --- | --- | --- |
| `fleet --version` | Prints `fleet 0.0.0-phase1` | `packages/cli/test/cli.test.mjs` |
| `fleet --help` | Prints planned command list | same |
| `fleet <anything else>` | Exit 2, “not implemented in Phase 1” | same |

### 3.2 Planned commands

| Command | Writes? | Output | Test |
| --- | --- | --- | --- |
| `fleet inventory <account>` | No | JSON inventory + native keys + audit head | T-I-09 |
| `fleet audit export <account> --out <file>` | No | `fleet-audit-v1` JSON | T-I-10 |
| `fleet verify-audit <file>` | No | OK/fail; recomputes hash chain | T-I-10, T-I-11 |
| `fleet freeze <account>` | Yes | tx hash; waits for `paused=true` | T-I-05, T-L-01 |
| `fleet unfreeze <account>` | Yes | tx hash; waits for `paused=false` | T-I-05 |
| `fleet grant <account> --key <public> --tag <tag>` | Yes | tx hash; verifies native key permission | T-I-01 |
| `fleet rotate <account> --old <public> --new <public> --tag <tag>` | Yes | tx hash; no `AddKeyAlreadyExists` | T-I-02 |
| `fleet rotate-admin <account> --new <public> [--allowance-near 0.1]` | Yes | propose + accept; fresh key | T-I-03 |
| `fleet revoke <account> --key <public>` | Yes | tx hash; key inactive | T-I-08 |
| `fleet revoke-tag <account> --tag <tag>` | Yes | removed list; exact tag only | T-I-08 |
| `fleet recover <account> --new-admin <public>` | Yes | recovery proposal + accept | T-I-07 |
| `fleet verify <account>` | No | inventory vs native keys vs audit head | T-I-09 |
| `fleet demo ...` | Yes (testnet) | deterministic E2E output | T-E-01…07 |

Flags common to writes: `--rpc-url` (testnet only), `--signer-key-file` (path
outside the repo, mode 600), `--json`, `--timeout`, `--dry-run`. The CLI must
redact the key path from JSON output if it contains a username.

### 3.3 Output contract

Every JSON command prints one object to stdout and human text to stderr. Exit
codes follow §2.3. A `--json` object always contains `ok`, `command`,
`accountId`, and either `txHash`/`blockHeight` or `error.code`/`error.message`.

---

## 4. Read-only API

Package: `@fleet/api` (`packages/api`). Phase 1 exports a pure handler; no server
is started and no key is loaded.

### 4.1 Routes

| Method | Path | Response | Test |
| --- | --- | --- | --- |
| `GET` | `/health` | `{status:"phase1-scaffold", version, readOnly:true}` | `api.test.mjs` (passing) |
| `GET` | `/v1/accounts/:id/inventory` | `FleetInventory` | T-I-09 (planned) |
| `GET` | `/v1/accounts/:id/audit?from=0&limit=100` | `{entries, head}` | T-I-10 (planned) |
| `GET` | `/v1/accounts/:id/audit/:seq` | one `AuditEntry` or 404 | T-I-10 (planned) |
| `GET` | `/v1/accounts/:id/audit/head` | `AuditHead` | T-I-10 (planned) |
| `GET` | `/v1/claims` | current `CLAIMS.md` rows (read-only) | T-SC-02 (planned) |
| any | any write path | **Not present** | `api.test.mjs` refuses POST/PUT/PATCH/DELETE |

### 4.2 Rules

- The handler rejects non-GET/HEAD before routing.
- No cookies, no auth token, no wallet, no signer, no private key.
- Cache responses with `ETag`/`blockHeight`; never serve a cached inventory as
  current without the block height.
- If the RPC is unavailable, return `503` with the last known block height; do not
  invent state.
- If the RPC chain ID is not `testnet`, return `500` and refuse to serve.
- The API may be hosted as a static read-only demo; it must stay up through
  2026-11-18 if hosted.

### 4.3 Example

```http
GET /v1/accounts/agent-1.testnet/inventory HTTP/1.1
Host: demo.example

HTTP/1.1 200 OK
Content-Type: application/json

{
  "accountId": "agent-1.testnet",
  "state": {
    "accountId": "agent-1.testnet",
    "mode": "B",
    "paused": false,
    "adminAccount": "fleet-admin.testnet",
    "contractVersion": "fleet-controller-v0.3.0"
  },
  "operators": [{"publicKey": "ed25519:...", "tag": "A"}],
  "nativeKeys": [{"publicKey": "ed25519:...", "permission": "FunctionCall"}],
  "auditHead": {"seq": 12, "entryHash": "...", "blockHeight": 123, "blockTimestampNs": "..."}
}
```

The example is illustrative; it is not a live response and must not be used as
evidence.

---

## 5. Contract view interface

The SDK/API consume these controller views (defined in `docs/SPEC_v0.3.md`):

| View | Returns | Used by |
| --- | --- | --- |
| `get_state()` | mode, paused, admin/pending/recovery public keys or admin account, version | SDK, API, CLI |
| `get_inventory()` | state + operators + native key snapshot + audit head | SDK, API, CLI |
| `get_audit(from_seq, limit)` | paginated `AuditEntry[]` | SDK, API, CLI |
| `get_audit_entry(seq)` | one entry or null | CLI verifier |
| `get_audit_head()` | seq, hash, block height/time | SDK, API, CLI verifier |

Views are read-only and never expose a private key. `signer_pk` is a public key.

---

## 6. Test mapping

| Interface | Test | Status |
| --- | --- | --- |
| SDK types/version | `packages/sdk/test/sdk.test.mjs` | **PASS** |
| SDK refuses fake client | same | **PASS** |
| CLI version/help/refusal | `packages/cli/test/cli.test.mjs` | **PASS** |
| API read-only health | `packages/api/test/api.test.mjs` | **PASS** |
| API refuses writes | same | **PASS** |
| Inventory/audit reads | T-I-09, T-I-10 | PLANNED |
| CLI writes | T-I-01…T-I-08 | PLANNED |
| Audit verifier | T-I-10, T-I-11 | PLANNED |
| No key in browser/server | T-S-006, T-U-06 | **PASS** for placeholder; product test PLANNED |

Phase 1 does not claim any product interface works. The passing tests prove the
scaffold refuses to fake it.
