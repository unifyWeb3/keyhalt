/**
 * Keyhalt TypeScript SDK v0.3.
 *
 * Reads use raw JSON-RPC `query` calls so u64 audit timestamps are preserved as
 * decimal strings instead of being rounded by JSON.parse. Writes are signed
 * locally with a testnet-only FunctionCall key; the SDK never prints, stores, or
 * transmits a secret key.
 */

import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

import {
  Account,
  JsonRpcProvider,
  SignedTransaction,
  actions,
  baseEncode,
  teraToGas,
} from "near-api-js";
import type { KeyPairString } from "near-api-js";

// Some Linux hosts resolve IPv6 first but have no working IPv6 route; NEAR RPC
// fetches then fail with a bare "fetch failed". Prefer IPv4 for this process.
try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Older Node versions may not expose this; leave the platform default.
}

export const KEYHALT_SDK_VERSION = "0.3.0";
export const DEFAULT_TESTNET_RPC = "https://rpc.testnet.fastnear.com";
export const AUDIT_EXPORT_FORMAT = "fleet-audit-v1";
export const SIGNED_TX_FORMAT = "keyhalt-signed-tx-v1";

export type KeyhaltMode = "A" | "B";
export type KeyhaltErrorCode =
  | "KEYHALT_E_NO_SIGNER"
  | "KEYHALT_E_MAINNET"
  | "KEYHALT_E_RPC"
  | "KEYHALT_E_REJECTED"
  | "KEYHALT_E_RECEIPT"
  | "KEYHALT_E_AUDIT"
  | "KEYHALT_E_BAD_ARGS"
  | "KEYHALT_E_UNSUPPORTED";

export const KEYHALT_EXIT_CODES: Record<KeyhaltErrorCode, number> = {
  KEYHALT_E_NO_SIGNER: 3,
  KEYHALT_E_MAINNET: 4,
  KEYHALT_E_RPC: 5,
  KEYHALT_E_REJECTED: 6,
  KEYHALT_E_RECEIPT: 7,
  KEYHALT_E_AUDIT: 6,
  KEYHALT_E_BAD_ARGS: 2,
  KEYHALT_E_UNSUPPORTED: 2,
};

export class KeyhaltError extends Error {
  readonly code: KeyhaltErrorCode;
  readonly txHash: string | null;
  readonly blockHeight: number | null;
  readonly refusal: string | null;

  constructor(
    code: KeyhaltErrorCode,
    message: string,
    detail: {
      txHash?: string;
      blockHeight?: number;
      refusal?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = "KeyhaltError";
    this.code = code;
    this.txHash = detail.txHash ?? null;
    this.blockHeight = detail.blockHeight ?? null;
    this.refusal = detail.refusal ?? null;
  }
}

export function keyhaltExitCode(code: string): number {
  return KEYHALT_EXIT_CODES[code as KeyhaltErrorCode] ?? 2;
}

export interface OperatorKey {
  publicKey: string;
  tag: string;
  active: boolean;
}

export interface AuditHead {
  seq: number;
  entryHash: string;
  blockHeight: number;
  blockTimestampNs: string;
}

export interface KeyhaltState {
  accountId: string;
  contractVersion: string;
  mode: KeyhaltMode;
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

export interface NativeKey {
  publicKey: string;
  permission: "FullAccess" | "FunctionCall" | "Unknown";
  allowanceNear: string | null;
  receiverId: string | null;
  methodNames: string[];
}

export interface KeyhaltInventory {
  accountId: string;
  state: KeyhaltState;
  operators: OperatorKey[];
  nativeKeys: NativeKey[];
  fullAccessKeys: number;
  auditHead: AuditHead;
}

export interface KeyhaltTxResult {
  txHash: string;
  blockHeight: number;
  gasBurnt: string;
  logs: string[];
  refusal: string | null;
}

/**
 * A freeze or unfreeze that has been signed locally but not broadcast.
 *
 * The payload carries the signed transaction bytes and the signature. It never
 * carries a secret key: the signer stays in the signing process.
 */
export interface KeyhaltSignedTransaction {
  format: typeof SIGNED_TX_FORMAT;
  network: "testnet";
  account_id: string;
  receiver_id: string;
  method: string;
  args: Record<string, unknown>;
  gas_tgas: number;
  public_key: string;
  nonce: string;
  tx_hash: string;
  signed_transaction: string;
  created_at: string;
}

export interface AuditVerification {
  ok: boolean;
  error: string | null;
  entries: number;
  head: string;
}

export interface KeyhaltAuditExport {
  format: typeof AUDIT_EXPORT_FORMAT;
  accountId: string;
  exportedAt: string;
  contractVersion: string;
  head: AuditHead;
  entries: AuditEntry[];
  verified: boolean;
}

export interface KeyhaltClientOptions {
  rpcUrl: string;
  accountId: string;
  /**
   * Pin every read to this finalized block height. When omitted, reads use
   * `finality: "final"`. The console uses this so every screen renders one
   * consistent snapshot instead of mixing heights.
   */
  blockId?: number;
  /**
   * Local signer: a `ed25519:...`/`secp256k1:...` secret string or an object
   * with a `secretKey` field. It is passed only to the in-process Account.
   */
  signer?: string | { secretKey: string };
}

export interface KeyhaltClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  readonly blockId: number | null;
  getState(): Promise<KeyhaltState>;
  getNativeKeys(): Promise<NativeKey[]>;
  getInventory(): Promise<KeyhaltInventory>;
  getAudit(fromSeq: number, limit: number): Promise<AuditEntry[]>;
  getAuditAll(): Promise<AuditEntry[]>;
  getAuditHead(): Promise<AuditHead>;
  verifyAuditOnChain(): Promise<boolean>;

  freeze(): Promise<KeyhaltTxResult>;
  unfreeze(): Promise<KeyhaltTxResult>;
  /**
   * Sign a freeze locally without broadcasting it. The RPC is only read
   * (account nonce, latest block hash); no transaction is sent.
   */
  prepareFreeze(): Promise<KeyhaltSignedTransaction>;
  /**
   * Sign an unfreeze locally without broadcasting it. The RPC is only read
   * (account nonce, latest block hash); no transaction is sent.
   */
  prepareUnfreeze(): Promise<KeyhaltSignedTransaction>;
  /**
   * Broadcast a transaction that was signed earlier by `prepareFreeze` or
   * `prepareUnfreeze`.
   */
  submitSigned(signed: KeyhaltSignedTransaction): Promise<KeyhaltTxResult>;
  grantOperator(publicKey: string, tag: string): Promise<KeyhaltTxResult>;
  rotateOperator(
    oldPublicKey: string,
    newPublicKey: string,
    tag: string,
  ): Promise<KeyhaltTxResult>;
  revokeOperator(publicKey: string): Promise<KeyhaltTxResult>;
  revokeTag(tag: string): Promise<KeyhaltTxResult>;
  proposeAdmin(newPublicKey: string): Promise<KeyhaltTxResult>;
  acceptAdmin(): Promise<KeyhaltTxResult>;
  cancelAdmin(): Promise<KeyhaltTxResult>;
  recoverAdmin(newPublicKey: string): Promise<KeyhaltTxResult>;
  execute(
    receiverId: string,
    methodName: string,
    args?: string,
    gasTgas?: number,
  ): Promise<KeyhaltTxResult>;
}

interface RawQueryResult {
  result: number[] | Uint8Array;
  logs?: string[];
  block_height?: number;
  block_hash?: string;
}

interface RawAccessKeyList {
  keys?: Array<{
    public_key: string;
    access_key?: { permission?: unknown };
  }>;
  block_height?: number;
  block_hash?: string;
}

interface RawOutcome {
  status: unknown;
  transaction_outcome?: {
    id?: string;
    block_hash?: string;
    outcome?: { gas_burnt?: number | string };
  };
  receipts_outcome?: Array<{
    outcome?: {
      status?: unknown;
      gas_burnt?: number | string;
      logs?: string[];
    };
  }>;
}

interface RawAuditEntry {
  seq: number | string;
  action: string;
  actor_account?: string;
  actorAccount?: string;
  signer_pk?: string;
  signerPublicKey?: string;
  subject: string;
  block_height?: number | string;
  blockHeight?: number | string;
  block_timestamp?: number | string;
  blockTimestampNs?: number | string;
  prev_hash?: string;
  prevHash?: string;
  entry_hash?: string;
  entryHash?: string;
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// The console creates a fresh client for each pinned snapshot. A chain-id check
// is a property of the RPC endpoint, not the client, so cache it per URL.
const TESTNET_CHECKS = new Map<string, Promise<void>>();

function toNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new KeyhaltError(
    "KEYHALT_E_RPC",
    `invalid ${field} in controller view: ${String(value)}`,
  );
}

function toDecimalString(value: unknown, field: string): string {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  throw new KeyhaltError(
    "KEYHALT_E_RPC",
    `invalid ${field} in controller view: ${String(value)}`,
  );
}

/**
 * Quote integers of 16+ digits before JSON.parse so u64 block timestamps are
 * preserved exactly as decimal strings. Controller view bytes are trusted
 * enough to parse; this function only guards numeric precision.
 */
export function parseBigJson(text: string): unknown {
  const guarded = text.replace(
    /([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,
    '$1"$2"',
  );
  return JSON.parse(guarded);
}

/**
 * Validate a signed-transaction payload. The payload must carry the Keyhalt
 * format marker, must target testnet, and must never contain key material.
 */
export function parseSignedTransaction(value: unknown): KeyhaltSignedTransaction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KeyhaltError(
      "KEYHALT_E_BAD_ARGS",
      "signed transaction must be a JSON object",
    );
  }
  const raw = value as Record<string, unknown>;
  if (raw.format !== SIGNED_TX_FORMAT) {
    throw new KeyhaltError(
      "KEYHALT_E_BAD_ARGS",
      `signed transaction format must be ${SIGNED_TX_FORMAT}`,
    );
  }
  if (raw.network !== "testnet") {
    throw new KeyhaltError(
      "KEYHALT_E_MAINNET",
      "signed transaction network must be testnet",
    );
  }
  const required = [
    "account_id",
    "receiver_id",
    "method",
    "public_key",
    "nonce",
    "tx_hash",
    "signed_transaction",
    "created_at",
  ];
  for (const key of required) {
    const field = raw[key];
    if (typeof field !== "string" || field.length === 0) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `signed transaction is missing ${key}`,
      );
    }
  }
  if (
    typeof raw.args !== "object" ||
    raw.args === null ||
    Array.isArray(raw.args)
  ) {
    throw new KeyhaltError(
      "KEYHALT_E_BAD_ARGS",
      "signed transaction args must be a JSON object",
    );
  }
  if (!/^(ed25519|secp256k1):/.test(raw.public_key as string)) {
    throw new KeyhaltError(
      "KEYHALT_E_BAD_ARGS",
      "signed transaction public_key is not a NEAR public key",
    );
  }
  if (/"(secret_key|private_key|seed_phrase|mnemonic)"\s*:/i.test(JSON.stringify(raw))) {
    throw new KeyhaltError(
      "KEYHALT_E_BAD_ARGS",
      "signed transaction must not contain key material",
    );
  }
  return raw as unknown as KeyhaltSignedTransaction;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256")
    .update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes)
    .digest("hex");
}

/**
 * The NEAR transaction hash: base58 of the SHA-256 of the borsh-serialized
 * **unsigned** `Transaction`.
 *
 * This is not the hash of the signed transaction. The signature is over this
 * hash, and the RPC reports the same value as `transaction_outcome.id` when
 * the signed payload is broadcast. Hashing the signed bytes instead would
 * produce a different, unusable identifier for the same transaction.
 */
export function keyhaltTransactionHash(signed: SignedTransaction): string {
  const digest = createHash("sha256")
    .update(signed.transaction.encode())
    .digest();
  return baseEncode(digest);
}

export function verifyAuditChain(entries: AuditEntry[]): AuditVerification {
  let previous = "0".repeat(64);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      return { ok: false, error: `missing entry at index ${index}`, entries: entries.length, head: previous };
    }
    if (entry.seq !== index) {
      return {
        ok: false,
        error: `seq ${entry.seq} at index ${index}`,
        entries: entries.length,
        head: previous,
      };
    }
    if (entry.prevHash !== previous) {
      return {
        ok: false,
        error: `prev_hash mismatch at seq ${entry.seq}`,
        entries: entries.length,
        head: previous,
      };
    }
    const message = [
      entry.prevHash,
      entry.seq,
      entry.action,
      entry.actorAccount,
      entry.signerPublicKey,
      entry.subject,
      entry.blockHeight,
      entry.blockTimestampNs,
    ].join("|");
    const expected = sha256Hex(message);
    if (entry.entryHash !== expected) {
      return {
        ok: false,
        error: `entry_hash mismatch at seq ${entry.seq}: expected ${expected}`,
        entries: entries.length,
        head: previous,
      };
    }
    previous = entry.entryHash;
  }
  return { ok: true, error: null, entries: entries.length, head: previous };
}

export function normalizeAuditEntry(raw: RawAuditEntry): AuditEntry {
  return {
    seq: toNumber(raw.seq, "seq"),
    action: String(raw.action),
    actorAccount: String(raw.actorAccount ?? raw.actor_account ?? ""),
    signerPublicKey: String(raw.signerPublicKey ?? raw.signer_pk ?? ""),
    subject: String(raw.subject),
    blockHeight: toNumber(raw.blockHeight ?? raw.block_height, "block_height"),
    blockTimestampNs: toDecimalString(
      raw.blockTimestampNs ?? raw.block_timestamp,
      "block_timestamp",
    ),
    prevHash: String(raw.prevHash ?? raw.prev_hash ?? ""),
    entryHash: String(raw.entryHash ?? raw.entry_hash ?? ""),
  };
}

function mapAuditHead(raw: Record<string, unknown>, where: string): AuditHead {
  return {
    seq: toNumber(raw.seq, `${where}.seq`),
    entryHash: String(raw.entry_hash ?? raw.entryHash ?? ""),
    blockHeight: toNumber(
      raw.block_height ?? raw.blockHeight,
      `${where}.block_height`,
    ),
    blockTimestampNs: toDecimalString(
      raw.block_timestamp ?? raw.blockTimestampNs,
      `${where}.block_timestamp`,
    ),
  };
}

function mapState(rawValue: unknown, fallbackAccountId: string): KeyhaltState {
  const raw = rawValue as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new KeyhaltError("KEYHALT_E_RPC", "controller get_state returned no state");
  }
  const operatorsRaw = Array.isArray(raw.operators) ? raw.operators : [];
  const operators: OperatorKey[] = operatorsRaw.map((value) => {
    const operator = value as Record<string, unknown>;
    return {
      publicKey: String(operator.pk ?? ""),
      tag: String(operator.tag ?? ""),
      active: Boolean(operator.active),
    };
  });
  const auditHeadRaw = (raw.audit_head ?? {}) as Record<string, unknown>;
  const mode = String(raw.mode ?? "");
  return {
    accountId: String(raw.account_id ?? fallbackAccountId),
    contractVersion: String(raw.version ?? ""),
    mode: mode === "B" ? "B" : "A",
    paused: Boolean(raw.paused),
    adminPublicKey: raw.admin_pk == null ? null : String(raw.admin_pk),
    adminAccount: raw.admin_account == null ? null : String(raw.admin_account),
    recoveryPublicKey:
      raw.recovery_pk == null ? null : String(raw.recovery_pk),
    pendingAdminPublicKey:
      raw.pending_admin_pk == null ? null : String(raw.pending_admin_pk),
    pendingOrigin:
      raw.pending_origin == null
        ? null
        : String(raw.pending_origin) === "recovery"
          ? "recovery"
          : "admin",
    inflightAdminPublicKey:
      raw.inflight_admin_pk == null ? null : String(raw.inflight_admin_pk),
    operators,
    receiverId: String(raw.receiver ?? ""),
    methodName: String(raw.method ?? ""),
    maxOperators: toNumber(raw.max_operators, "max_operators"),
    provisioned: Boolean(raw.provisioned),
    provisionError:
      raw.provision_error == null ? null : String(raw.provision_error),
    auditHead: mapAuditHead(auditHeadRaw, "audit_head"),
    auditLength: toNumber(raw.audit_len, "audit_len"),
  };
}

function formatAllowance(value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : String(value);
  if (!/^\d+$/.test(text)) return null;
  const yocto = BigInt(text);
  const whole = yocto / 10n ** 24n;
  const fraction = (yocto % 10n ** 24n).toString().padStart(24, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length === 0 ? whole.toString() : `${whole}.${trimmed}`;
}

function permissionOf(entry: {
  access_key?: { permission?: unknown };
}): NativeKey {
  const permission = entry.access_key?.permission;
  if (permission === "FullAccess") {
    return {
      publicKey: "",
      permission: "FullAccess",
      allowanceNear: null,
      receiverId: null,
      methodNames: [],
    };
  }
  const functionCall = (
    permission as { FunctionCall?: Record<string, unknown> } | undefined
  )?.FunctionCall;
  if (!functionCall) {
    return {
      publicKey: "",
      permission: "Unknown",
      allowanceNear: null,
      receiverId: null,
      methodNames: [],
    };
  }
  return {
    publicKey: "",
    permission: "FunctionCall",
    allowanceNear: formatAllowance(functionCall.allowance),
    receiverId:
      functionCall.receiver_id == null ? null : String(functionCall.receiver_id),
    methodNames: Array.isArray(functionCall.method_names)
      ? functionCall.method_names.map(String)
      : [],
  };
}

function statusKind(status: unknown): "success" | "failure" | "unknown" {
  if (typeof status !== "object" || status === null) return "unknown";
  if ("SuccessValue" in status || "SuccessReceiptId" in status) return "success";
  if ("Failure" in status) return "failure";
  return "unknown";
}

function collectLogs(outcome: RawOutcome): string[] {
  return (outcome.receipts_outcome ?? []).flatMap(
    (receipt) => receipt.outcome?.logs ?? [],
  );
}

function refusalOf(logs: string[]): string | null {
  const line = logs.find((log) => log.startsWith("FLEET_REFUSAL:"));
  return line ? line.slice("FLEET_REFUSAL:".length) : null;
}

function sumGas(outcome: RawOutcome): string {
  let total = BigInt(outcome.transaction_outcome?.outcome?.gas_burnt ?? 0);
  for (const receipt of outcome.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome?.gas_burnt ?? 0);
  }
  return total.toString();
}

function isRpcFailure(error: unknown): boolean {
  const text = `${(error as { message?: string })?.message ?? error}`;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|\b429\b|\b5\d\d\b|internal server error|unavailable|bad gateway|timeout/i.test(
    text,
  );
}

function wrapError(error: unknown, fallback: KeyhaltErrorCode): KeyhaltError {
  if (error instanceof KeyhaltError) return error;
  return new KeyhaltError(
    isRpcFailure(error) ? "KEYHALT_E_RPC" : fallback,
    String((error as { message?: string })?.message ?? error),
    { cause: error },
  );
}

class KeyhaltClientImpl implements KeyhaltClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  readonly blockId: number | null;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account | null;
  private readonly blockQuery: { block_id: number } | { finality: "final" };

  constructor(options: KeyhaltClientOptions) {
    if (!options.accountId || !/^[a-z0-9._-]+$/.test(options.accountId)) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `invalid testnet account id: ${options.accountId}`,
      );
    }
    if (/mainnet/i.test(options.rpcUrl)) {
      throw new KeyhaltError(
        "KEYHALT_E_MAINNET",
        "Keyhalt is testnet-only; mainnet RPC URLs are refused",
      );
    }
    if (
      options.blockId !== undefined &&
      (!Number.isSafeInteger(options.blockId) || options.blockId < 0)
    ) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `blockId must be a non-negative integer, got ${String(options.blockId)}`,
      );
    }
    this.rpcUrl = options.rpcUrl;
    this.accountId = options.accountId;
    this.blockId = options.blockId ?? null;
    this.blockQuery =
      options.blockId === undefined
        ? { finality: "final" }
        : { block_id: options.blockId };
    this.provider = new JsonRpcProvider({ url: options.rpcUrl });
    const signer = options.signer;
    if (signer === undefined) {
      this.account = null;
    } else {
      const secret =
        typeof signer === "string" ? signer : signer.secretKey;
      if (!/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(secret)) {
        throw new KeyhaltError(
          "KEYHALT_E_BAD_ARGS",
          "signer must be a NEAR secret key string",
        );
      }
      this.account = new Account(
        options.accountId,
        options.rpcUrl,
        secret as KeyPairString,
      );
    }
  }

  private async ensureTestnet(): Promise<void> {
    const cached = TESTNET_CHECKS.get(this.rpcUrl);
    if (cached !== undefined) return cached;
    const check = (async () => {
      const status = (await this.provider.sendJsonRpc("status", [])) as {
        chain_id?: string;
      };
      if (status.chain_id !== "testnet") {
        throw new KeyhaltError(
          "KEYHALT_E_MAINNET",
          `refusing non-testnet chain: ${String(status.chain_id)}`,
        );
      }
    })().catch((error: unknown) => {
      TESTNET_CHECKS.delete(this.rpcUrl);
      throw wrapError(error, "KEYHALT_E_RPC");
    });
    TESTNET_CHECKS.set(this.rpcUrl, check);
    return check;
  }

  private async viewRaw(
    method: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    await this.ensureTestnet();
    try {
      const response = (await this.provider.sendJsonRpc("query", {
        request_type: "call_function",
        ...this.blockQuery,
        account_id: this.accountId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      })) as unknown as RawQueryResult;
      return Buffer.from(response.result).toString("utf8");
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_RPC");
    }
  }

  async getState(): Promise<KeyhaltState> {
    const text = await this.viewRaw("get_state", {});
    return mapState(parseBigJson(text), this.accountId);
  }

  async getNativeKeys(): Promise<NativeKey[]> {
    await this.ensureTestnet();
    try {
      // near-api-js viewAccessKeyList accepts only a finality reference, so a
      // block-pinned read goes through raw `query`. Mixing finality here would
      // silently mix heights inside one console snapshot.
      const response = (await this.provider.sendJsonRpc("query", {
        request_type: "view_access_key_list",
        ...this.blockQuery,
        account_id: this.accountId,
      })) as unknown as RawAccessKeyList;
      return (response.keys ?? []).map((entry) => {
        const mapped = permissionOf(entry);
        return { ...mapped, publicKey: entry.public_key };
      });
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_RPC");
    }
  }

  async getInventory(): Promise<KeyhaltInventory> {
    const [state, nativeKeys] = await Promise.all([
      this.getState(),
      this.getNativeKeys(),
    ]);
    return {
      accountId: this.accountId,
      state,
      operators: state.operators,
      nativeKeys,
      fullAccessKeys: nativeKeys.filter((key) => key.permission === "FullAccess")
        .length,
      auditHead: state.auditHead,
    };
  }

  async getAudit(fromSeq: number, limit: number): Promise<AuditEntry[]> {
    if (!Number.isSafeInteger(fromSeq) || fromSeq < 0) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", "fromSeq must be a non-negative integer");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", "limit must be 1..100");
    }
    const text = await this.viewRaw("get_audit", {
      from_seq: fromSeq,
      limit,
    });
    const raw = parseBigJson(text);
    if (!Array.isArray(raw)) {
      throw new KeyhaltError("KEYHALT_E_RPC", "get_audit did not return an array");
    }
    return raw.map((entry) => normalizeAuditEntry(entry as RawAuditEntry));
  }

  async getAuditAll(): Promise<AuditEntry[]> {
    const state = await this.getState();
    const entries: AuditEntry[] = [];
    while (entries.length < state.auditLength) {
      const page = await this.getAudit(entries.length, 100);
      if (page.length === 0) break;
      entries.push(...page);
    }
    return entries;
  }

  async getAuditHead(): Promise<AuditHead> {
    const text = await this.viewRaw("get_audit_head", {});
    const raw = parseBigJson(text);
    return mapAuditHead(raw as Record<string, unknown>, "audit_head");
  }

  async verifyAuditOnChain(): Promise<boolean> {
    const text = await this.viewRaw("verify_audit", {});
    return text.trim() === "true";
  }

  private async write(
    method: string,
    args: Record<string, unknown>,
    gasTgas: number,
  ): Promise<KeyhaltTxResult> {
    if (this.account === null) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        `keyhalt ${method} requires a local signer key file`,
      );
    }
    await this.ensureTestnet();
    let outcome: unknown;
    try {
      outcome = await this.account.signAndSendTransaction({
        receiverId: this.accountId,
        actions: [
          actions.functionCall(method, args, teraToGas(gasTgas), 0n),
        ],
        waitUntil: "FINAL",
        throwOnFailure: false,
      });
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_REJECTED");
    }
    return this.toTxResult(outcome as RawOutcome, method);
  }

  private async toTxResult(
    outcome: RawOutcome,
    method: string,
  ): Promise<KeyhaltTxResult> {
    const txHash = outcome.transaction_outcome?.id ?? "";
    const blockHash = outcome.transaction_outcome?.block_hash;
    let blockHeight = 0;
    if (blockHash) {
      try {
        const block = await this.provider.viewBlock({ blockId: blockHash });
        blockHeight = block.header.height;
      } catch {
        blockHeight = 0;
      }
    }
    const logs = collectLogs(outcome);
    const refusal = refusalOf(logs);
    const top = statusKind(outcome.status);
    const failedReceipt = (outcome.receipts_outcome ?? []).find(
      (receipt) => statusKind(receipt.outcome?.status) === "failure",
    );
    if (top === "failure" || failedReceipt !== undefined) {
      const code =
        top === "failure" ? "KEYHALT_E_REJECTED" : "KEYHALT_E_RECEIPT";
      throw new KeyhaltError(
        code,
        refusal ??
          `${method} failed: ${JSON.stringify(outcome.status).slice(0, 400)}`,
        { txHash, blockHeight, refusal },
      );
    }
    return {
      txHash,
      blockHeight,
      gasBurnt: sumGas(outcome),
      logs,
      refusal,
    };
  }

  freeze(): Promise<KeyhaltTxResult> {
    return this.write("freeze", {}, 30);
  }

  unfreeze(): Promise<KeyhaltTxResult> {
    return this.write("unfreeze", {}, 30);
  }

  /**
   * Sign a call locally and return it without broadcasting. The signing
   * process reads the account nonce and the latest block hash from the RPC,
   * but no transaction is sent.
   */
  private async prepare(
    method: string,
    args: Record<string, unknown>,
    gasTgas: number,
  ): Promise<KeyhaltSignedTransaction> {
    if (this.account === null) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        `keyhalt ${method} requires a local signer key file`,
      );
    }
    const signer = this.account.getSigner();
    if (signer === undefined) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        `keyhalt ${method} requires a local signer key file`,
      );
    }
    let signed: SignedTransaction;
    try {
      signed = await this.account.createSignedTransaction({
        receiverId: this.accountId,
        actions: [actions.functionCall(method, args, teraToGas(gasTgas), 0n)],
        signer,
      });
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_REJECTED");
    }
    const bytes = signed.encode();
    return {
      format: SIGNED_TX_FORMAT,
      network: "testnet",
      account_id: this.accountId,
      receiver_id: this.accountId,
      method,
      args,
      gas_tgas: gasTgas,
      public_key: signed.transaction.publicKey.toString(),
      nonce: signed.transaction.nonce.toString(),
      tx_hash: keyhaltTransactionHash(signed),
      signed_transaction: Buffer.from(bytes).toString("base64"),
      created_at: new Date().toISOString(),
    };
  }

  prepareFreeze(): Promise<KeyhaltSignedTransaction> {
    return this.prepare("freeze", {}, 30);
  }

  prepareUnfreeze(): Promise<KeyhaltSignedTransaction> {
    return this.prepare("unfreeze", {}, 30);
  }

  async submitSigned(signed: KeyhaltSignedTransaction): Promise<KeyhaltTxResult> {
    const payload = parseSignedTransaction(signed);
    if (payload.account_id !== this.accountId) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `signed transaction is for ${payload.account_id}, not ${this.accountId}`,
      );
    }
    await this.ensureTestnet();
    let outcome: unknown;
    try {
      const bytes = new Uint8Array(
        Buffer.from(payload.signed_transaction, "base64"),
      );
      const decoded = SignedTransaction.decode(bytes);
      outcome = await this.provider.sendTransactionUntil(decoded, "FINAL");
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_REJECTED");
    }
    return this.toTxResult(outcome as RawOutcome, payload.method);
  }

  grantOperator(publicKey: string, tag: string): Promise<KeyhaltTxResult> {
    return this.write("grant_operator", { public_key: publicKey, tag }, 100);
  }

  rotateOperator(
    oldPublicKey: string,
    newPublicKey: string,
    tag: string,
  ): Promise<KeyhaltTxResult> {
    return this.write(
      "rotate_operator",
      {
        old_public_key: oldPublicKey,
        new_public_key: newPublicKey,
        tag,
      },
      100,
    );
  }

  revokeOperator(publicKey: string): Promise<KeyhaltTxResult> {
    return this.write("revoke_operator", { public_key: publicKey }, 100);
  }

  revokeTag(tag: string): Promise<KeyhaltTxResult> {
    return this.write("revoke_tag", { tag }, 100);
  }

  proposeAdmin(newPublicKey: string): Promise<KeyhaltTxResult> {
    return this.write("propose_admin", { new_admin_pk: newPublicKey }, 100);
  }

  acceptAdmin(): Promise<KeyhaltTxResult> {
    return this.write("accept_admin", {}, 30);
  }

  cancelAdmin(): Promise<KeyhaltTxResult> {
    return this.write("cancel_admin", {}, 100);
  }

  recoverAdmin(newPublicKey: string): Promise<KeyhaltTxResult> {
    return this.write("recover_admin", { new_admin_pk: newPublicKey }, 100);
  }

  execute(
    receiverId: string,
    methodName: string,
    args = "{}",
    gasTgas = 10,
  ): Promise<KeyhaltTxResult> {
    return this.write(
      "execute",
      {
        receiver_id: receiverId,
        method_name: methodName,
        args,
        gas: gasTgas * 1_000_000_000_000,
      },
      Math.min(250, gasTgas + 40),
    );
  }
}

export function createKeyhaltClient(options: KeyhaltClientOptions): KeyhaltClient {
  return new KeyhaltClientImpl(options);
}

/**
 * Verify a `fleet-audit-v1` export, or the raw audit JSON written by
 * `scripts/testnet-e2e.mjs` (which uses snake_case entries).
 */
export function verifyAuditExport(value: unknown): AuditVerification {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "audit file is not an object", entries: 0, head: "" };
  }
  const raw = value as Record<string, unknown>;
  const entriesRaw = raw.entries;
  if (!Array.isArray(entriesRaw)) {
    return {
      ok: false,
      error: "audit file has no entries array",
      entries: 0,
      head: "",
    };
  }
  let entries: AuditEntry[];
  try {
    entries = entriesRaw.map((entry) =>
      normalizeAuditEntry(entry as RawAuditEntry),
    );
  } catch (error) {
    return {
      ok: false,
      error: String((error as Error).message ?? error),
      entries: entriesRaw.length,
      head: "",
    };
  }
  const verification = verifyAuditChain(entries);
  const exportedHead = raw.head;
  if (
    verification.ok &&
    typeof exportedHead === "string" &&
    exportedHead !== verification.head
  ) {
    return {
      ok: false,
      error: `exported head ${exportedHead} does not match recomputed head ${verification.head}`,
      entries: entries.length,
      head: verification.head,
    };
  }
  return verification;
}

export function buildAuditExport(
  accountId: string,
  state: KeyhaltState,
  entries: AuditEntry[],
): KeyhaltAuditExport {
  const verification = verifyAuditChain(entries);
  return {
    format: AUDIT_EXPORT_FORMAT,
    accountId,
    exportedAt: new Date().toISOString(),
    contractVersion: state.contractVersion,
    head: state.auditHead,
    entries,
    verified: verification.ok,
  };
}

// ============================================================
// Mode B: 2-of-2 multisig administration
//
// The Mode B controller's admin is the pinned `near/core-contracts`
// `multisig2` contract (v0.4.0), not a key. Calls to `add_request` propose an
// action; reaching `num_confirmations` (2 here) members makes `confirm`
// execute it. Views are JSON-encoded. This client signs locally; it never
// holds a key beyond the in-process Account.
// ============================================================

export interface MultisigMemberInfo {
  kind: "account" | "accessKey";
  accountId: string | null;
  publicKey: string | null;
}

export interface MultisigFunctionCall {
  methodName: string;
  argsBase64: string;
  depositYocto: string;
  gas: string;
}

export interface MultisigRequestInfo {
  requestId: number;
  receiverId: string;
  actionTypes: string[];
  functionCalls: MultisigFunctionCall[];
  /** The first FunctionCall method name, if any. */
  methodName: string | null;
  confirmations: string[];
  confirmationCount: number;
  required: number;
}

export interface MultisigProposeResult extends KeyhaltTxResult {
  requestId: number;
  multisigId: string;
}

export interface MultisigConfirmResult extends KeyhaltTxResult {
  requestId: number;
  executed: boolean;
  confirmations: string[];
  confirmationCount: number;
  required: number;
}

export interface MultisigAdminClientOptions {
  rpcUrl: string;
  /** The multisig contract account: the agent's `adminAccount`. */
  accountId: string;
  /**
   * Optional member signer. Writes sign with the member's account id, never
   * the multisig contract (the contract holds no keys). The file-export
   * format `{ account_id, public_key, secret_key }` carries the id; a bare
   * `{ secretKey }` without `accountId` is accepted for views only and is
   * refused for writes.
   */
  signer?: string | { secretKey: string; accountId?: string };
}

export interface MultisigAdminClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  /** Members of the multisig (account ids, or access keys for pk members). */
  getMembers(): Promise<MultisigMemberInfo[]>;
  getNumConfirmations(): Promise<number>;
  getRequestNonce(): Promise<number>;
  listRequestIds(): Promise<number[]>;
  getConfirmations(requestId: number): Promise<string[]>;
  getRequest(requestId: number): Promise<MultisigRequestInfo>;
  /**
   * Propose a `FunctionCall` action through the multisig. The signer's key
   * must belong to a member; the contract refuses non-members.
   */
  addFunctionCallRequest(
    receiverId: string,
    methodName: string,
    argsBase64?: string,
    gasTgas?: number,
  ): Promise<MultisigProposeResult>;
  /**
   * Confirm a pending request. Reaching `numConfirmations` executes the
   * proposed action; otherwise the confirmation is recorded and nothing
   * happens. The caller gets `executed` back from the receipt itself.
   */
  confirm(requestId: number, gasTgas?: number): Promise<MultisigConfirmResult>;
}

const MULTISIG_MAX_REQUEST_ID = 1_000_000;

interface MultisigRawAction {
  type?: unknown;
  method_name?: unknown;
  args?: unknown;
  deposit?: unknown;
  gas?: unknown;
}

interface MultisigRawRequest {
  receiver_id?: unknown;
  actions?: unknown;
}

interface MultisigRawOutcome extends RawOutcome {
  // The multisig contract returns raw JSON bytes; see the module note.
}

function base64OfUtf8(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function utf8OfBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function parseMultisigMemberString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.account_id === "string") return parsed.account_id;
    if (typeof parsed.public_key === "string") return parsed.public_key;
  } catch {
    // Keep the raw string; the chain's encoding is a hint, not a guarantee.
  }
  return trimmed;
}

function normalizeMultisigMember(raw: unknown): MultisigMemberInfo {
  const member = (raw ?? {}) as Record<string, unknown>;
  if (typeof member.account_id === "string") {
    return { kind: "account", accountId: member.account_id, publicKey: null };
  }
  if (typeof member.public_key === "string") {
    return { kind: "accessKey", accountId: null, publicKey: member.public_key };
  }
  throw new KeyhaltError(
    "KEYHALT_E_RPC",
    `unexpected multisig member encoding: ${JSON.stringify(raw).slice(0, 200)}`,
  );
}

function parseMultisigRequest(
  requestId: number,
  raw: unknown,
  confirmations: string[],
  numConfirmations: number,
): MultisigRequestInfo {
  const request = (raw ?? {}) as MultisigRawRequest;
  if (typeof request.receiver_id !== "string") {
    throw new KeyhaltError(
      "KEYHALT_E_RPC",
      `multisig request ${requestId} has no receiver_id`,
    );
  }
  const rawActions = Array.isArray(request.actions) ? request.actions : [];
  const functionCalls: MultisigFunctionCall[] = [];
  const actionTypes: string[] = [];
  for (const entry of rawActions as MultisigRawAction[]) {
    const type = typeof entry?.type === "string" ? entry.type : "Unknown";
    actionTypes.push(type);
    if (type !== "FunctionCall") continue;
    functionCalls.push({
      methodName: String(entry.method_name ?? ""),
      argsBase64: typeof entry.args === "string" ? entry.args : "",
      depositYocto:
        entry.deposit === undefined || entry.deposit === null
          ? "0"
          : String(entry.deposit),
      gas:
        entry.gas === undefined || entry.gas === null ? "0" : String(entry.gas),
    });
  }
  return {
    requestId,
    receiverId: request.receiver_id,
    actionTypes,
    functionCalls,
    methodName: functionCalls[0]?.methodName ?? null,
    confirmations,
    confirmationCount: confirmations.length,
    required: numConfirmations,
  };
}

class MultisigClientImpl implements MultisigAdminClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account | null;
  private signerAccountId: string | null = null;
  private signerBlocked = false;

  constructor(options: MultisigAdminClientOptions) {
    if (!options.accountId || !/^[a-z0-9._-]+$/.test(options.accountId)) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `invalid testnet account id: ${options.accountId}`,
      );
    }
    if (/mainnet/i.test(options.rpcUrl)) {
      throw new KeyhaltError(
        "KEYHALT_E_MAINNET",
        "Keyhalt is testnet-only; mainnet RPC URLs are refused",
      );
    }
    this.rpcUrl = options.rpcUrl;
    this.accountId = options.accountId;
    this.provider = new JsonRpcProvider({ url: options.rpcUrl });
    const signer = options.signer;
    if (signer === undefined) {
      this.account = null;
      this.signerAccountId = null;
    } else if (typeof signer === "string") {
      // A bare secret carries no member account id. Views work; writes need
      // it, so constructing an Account without one would sign with the wrong
      // identity. Refuse early and loudly.
      this.account = null;
      this.signerAccountId = null;
      this.signerBlocked = true;
    } else {
      const secret = signer.secretKey;
      if (!/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(secret)) {
        throw new KeyhaltError(
          "KEYHALT_E_BAD_ARGS",
          "signer must be a NEAR secret key string",
        );
      }
      const signerAccountId =
        typeof signer.accountId === "string" && /^[a-z0-9._-]+$/.test(signer.accountId)
          ? signer.accountId
          : null;
      if (signerAccountId === null) {
        this.account = null;
        this.signerAccountId = null;
        this.signerBlocked = true;
      } else {
        this.signerAccountId = signerAccountId;
        this.signerBlocked = false;
        this.account = new Account(signerAccountId, options.rpcUrl, secret as KeyPairString);
      }
    }
  }

  private async ensureTestnet(): Promise<void> {
    const cached = TESTNET_CHECKS.get(this.rpcUrl);
    if (cached !== undefined) return cached;
    const check = (async () => {
      const status = (await this.provider.sendJsonRpc("status", [])) as {
        chain_id?: string;
      };
      if (status.chain_id !== "testnet") {
        throw new KeyhaltError(
          "KEYHALT_E_MAINNET",
          `refusing non-testnet chain: ${String(status.chain_id)}`,
        );
      }
    })().catch((error: unknown) => {
      TESTNET_CHECKS.delete(this.rpcUrl);
      throw wrapError(error, "KEYHALT_E_RPC");
    });
    TESTNET_CHECKS.set(this.rpcUrl, check);
    return check;
  }

  private async viewJson<T>(
    method: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    await this.ensureTestnet();
    try {
      const response = (await this.provider.sendJsonRpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: this.accountId,
        method_name: method,
        args_base64: base64OfUtf8(JSON.stringify(args)),
      })) as unknown as RawQueryResult;
      const text = Buffer.from(response.result).toString("utf8");
      if (text.length === 0) {
        throw new KeyhaltError(
          "KEYHALT_E_RPC",
          `multisig view ${method} returned an empty result`,
        );
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof KeyhaltError) throw error;
      throw wrapError(error, "KEYHALT_E_RPC");
    }
  }

  async getMembers(): Promise<MultisigMemberInfo[]> {
    const raw = await this.viewJson<unknown[]>("get_members", {});
    if (!Array.isArray(raw)) {
      throw new KeyhaltError("KEYHALT_E_RPC", "get_members did not return an array");
    }
    return raw.map(normalizeMultisigMember);
  }

  async getNumConfirmations(): Promise<number> {
    return toNumber(await this.viewJson<unknown>("get_num_confirmations", {}), "get_num_confirmations");
  }

  async getRequestNonce(): Promise<number> {
    return toNumber(await this.viewJson<unknown>("get_request_nonce", {}), "get_request_nonce");
  }

  async listRequestIds(): Promise<number[]> {
    const raw = await this.viewJson<unknown[]>("list_request_ids", {});
    if (!Array.isArray(raw)) {
      throw new KeyhaltError("KEYHALT_E_RPC", "list_request_ids did not return an array");
    }
    return raw.map((value) => toNumber(value, "list_request_ids id"));
  }

  async getConfirmations(requestId: number): Promise<string[]> {
    const raw = await this.viewJson<unknown>("get_confirmations", {
      request_id: requestId,
    });
    if (!Array.isArray(raw)) {
      throw new KeyhaltError(
        "KEYHALT_E_RPC",
        `get_confirmations did not return an array for request ${requestId}`,
      );
    }
    return raw.map((value) => parseMultisigMemberString(String(value)));
  }

  async getRequest(requestId: number): Promise<MultisigRequestInfo> {
    if (
      !Number.isSafeInteger(requestId) ||
      requestId < 0 ||
      requestId > MULTISIG_MAX_REQUEST_ID
    ) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `requestId must be an integer 0..${MULTISIG_MAX_REQUEST_ID}`,
      );
    }
    const numConfirmations = await this.getNumConfirmations();
    let confirmations: string[] = [];
    try {
      confirmations = await this.getConfirmations(requestId);
    } catch {
      confirmations = [];
    }
    const raw = await this.viewJson<unknown>("get_request", {
      request_id: requestId,
    });
    return parseMultisigRequest(requestId, raw, confirmations, numConfirmations);
  }

  private async multisigCall(
    method: string,
    args: Record<string, unknown>,
    gasTgas: number,
  ): Promise<MultisigRawOutcome> {
    if (this.signerBlocked) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        "a Mode B admin write needs the member account id; the signer file must contain account_id (the NEAR default key-file format does)",
      );
    }
    if (this.account === null) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        `keyhalt ${method} requires a member signer key file`,
      );
    }
    await this.ensureTestnet();
    try {
      const outcome = await this.account.signAndSendTransaction({
        receiverId: this.accountId,
        actions: [
          actions.functionCall(method, args, teraToGas(gasTgas), 0n),
        ],
        waitUntil: "FINAL",
        throwOnFailure: false,
      });
      return outcome as MultisigRawOutcome;
    } catch (error) {
      throw wrapError(error, "KEYHALT_E_REJECTED");
    }
  }

  private receiptLogs(outcome: MultisigRawOutcome): string[] {
    return collectLogs(outcome);
  }

  private failureText(outcome: MultisigRawOutcome): string {
    const top = statusKind(outcome.status);
    const receipts = outcome.receipts_outcome ?? [];
    return JSON.stringify([
      outcome.status,
      top,
      ...receipts.map((receipt) => receipt.outcome?.status),
    ]);
  }

  private async toResult(
    outcome: MultisigRawOutcome,
    method: string,
  ): Promise<{
    txHash: string;
    blockHeight: number;
    gasBurnt: string;
    logs: string[];
    refusal: string | null;
    valueText: string | null;
  }> {
    const txHash = outcome.transaction_outcome?.id ?? "";
    const blockHash = outcome.transaction_outcome?.block_hash;
    let blockHeight = 0;
    if (blockHash) {
      try {
        const block = await this.provider.viewBlock({ blockId: blockHash });
        blockHeight = block.header.height;
      } catch {
        blockHeight = 0;
      }
    }
    const logs = collectLogs(outcome);
    const refusal =
      logs.find((log) => log.startsWith("FLEET_REFUSAL:"))?.slice(
        "FLEET_REFUSAL:".length,
      )?.trim() ?? null;
    const top = statusKind(outcome.status);
    const failedReceipt = (outcome.receipts_outcome ?? []).find(
      (receipt) => statusKind(receipt.outcome?.status) === "failure",
    );
    const valueBytes =
      (outcome.status as { SuccessValue?: unknown } | undefined)?.SuccessValue;
    const valueText =
      typeof valueBytes === "string" ? utf8OfBase64(valueBytes) : null;
    if (top === "failure" || failedReceipt !== undefined) {
      const failure = this.failureText(outcome);
      throw new KeyhaltError(
        "KEYHALT_E_REJECTED",
        refusal ?? `${method} failed: ${failure.slice(0, 400)}`,
        { txHash, blockHeight, refusal },
      );
    }
    return {
      txHash,
      blockHeight,
      gasBurnt: sumGas(outcome),
      logs,
      refusal,
      valueText,
    };
  }

  async addFunctionCallRequest(
    receiverId: string,
    methodName: string,
    argsBase64 = "",
    gasTgas = 50,
  ): Promise<MultisigProposeResult> {
    if (this.account === null) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        "keyhalt admin request requires a member signer key file",
      );
    }
    if (!/^[a-z0-9._-]+$/.test(receiverId)) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", `invalid receiver: ${receiverId}`);
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(methodName)) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", `invalid method: ${methodName}`);
    }
    if (!Number.isSafeInteger(gasTgas) || gasTgas < 5 || gasTgas > 200) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", "gasTgas must be 5..200");
    }
    // The args payload is base64 of raw bytes; freeze/unfreeze take none.
    const hexGas = String(gasTgas * 1e12);
    const request = {
      receiver_id: receiverId,
      actions: [
        {
          type: "FunctionCall",
          method_name: methodName,
          args: argsBase64,
          deposit: "0",
          gas: hexGas,
        },
      ],
    };
    const outcome = await this.multisigCall(
      "add_request",
      { request },
      Math.min(200, Math.max(30, gasTgas + 50)),
    );
    const result = await this.toResult(outcome, "add_request");
    const requestId =
      result.valueText === null ? NaN : Number(result.valueText);
    if (!Number.isSafeInteger(requestId) || requestId < 0) {
      throw new KeyhaltError(
        "KEYHALT_E_RPC",
        `add_request did not return a request id (raw: ${String(
          result.valueText,
        ).slice(0, 120)})`,
      );
    }
    return {
      txHash: result.txHash,
      blockHeight: result.blockHeight,
      gasBurnt: result.gasBurnt,
      logs: result.logs,
      refusal: result.refusal,
      requestId,
      multisigId: this.accountId,
    };
  }

  async confirm(
    requestId: number,
    gasTgas = 100,
  ): Promise<MultisigConfirmResult> {
    if (this.account === null) {
      throw new KeyhaltError(
        "KEYHALT_E_NO_SIGNER",
        "keyhalt admin confirm requires a member signer key file",
      );
    }
    if (!Number.isSafeInteger(requestId) || requestId < 0 || requestId > 1_000_000) {
      throw new KeyhaltError(
        "KEYHALT_E_BAD_ARGS",
        `requestId must be an integer 0..1000000`,
      );
    }
    if (!Number.isSafeInteger(gasTgas) || gasTgas < 20 || gasTgas > 200) {
      throw new KeyhaltError("KEYHALT_E_BAD_ARGS", "gasTgas must be 20..200");
    }
    const outcome = await this.multisigCall(
      "confirm",
      { request_id: requestId },
      gasTgas,
    );
    const result = await this.toResult(outcome, "confirm");
    // The contract's confirm returns true whether or not it executed the
    // action: execution removes the request and its confirmations. Reading
    // the post-transaction request list is the deterministic answer.
    let remainingIds: number[] = [];
    let confirmations: string[] = [];
    let required = 0;
    try {
      remainingIds = await this.listRequestIds();
    } catch {
      remainingIds = [requestId];
    }
    try {
      confirmations = await this.getConfirmations(requestId);
    } catch {
      confirmations = [];
    }
    try {
      required = await this.getNumConfirmations();
    } catch {
      required = confirmations.length >= 1 ? confirmations.length : 2;
    }
    const executed = !remainingIds.includes(requestId);
    return {
      txHash: result.txHash,
      blockHeight: result.blockHeight,
      gasBurnt: result.gasBurnt,
      logs: result.logs,
      refusal: result.refusal,
      requestId,
      executed,
      confirmations,
      confirmationCount: confirmations.length,
      required,
    };
  }
}

export function createMultisigAdminClient(
  options: MultisigAdminClientOptions,
): MultisigAdminClient {
  return new MultisigClientImpl(options);
}
