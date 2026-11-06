/**
 * FLEET TypeScript SDK v0.3.
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

export const FLEET_SDK_VERSION = "0.3.0";
export const DEFAULT_TESTNET_RPC = "https://rpc.testnet.fastnear.com";
export const AUDIT_EXPORT_FORMAT = "fleet-audit-v1";
export const SIGNED_TX_FORMAT = "fleet-signed-tx-v1";

export type FleetMode = "A" | "B";
export type FleetErrorCode =
  | "FLEET_E_NO_SIGNER"
  | "FLEET_E_MAINNET"
  | "FLEET_E_RPC"
  | "FLEET_E_REJECTED"
  | "FLEET_E_RECEIPT"
  | "FLEET_E_AUDIT"
  | "FLEET_E_BAD_ARGS"
  | "FLEET_E_UNSUPPORTED";

export const FLEET_EXIT_CODES: Record<FleetErrorCode, number> = {
  FLEET_E_NO_SIGNER: 3,
  FLEET_E_MAINNET: 4,
  FLEET_E_RPC: 5,
  FLEET_E_REJECTED: 6,
  FLEET_E_RECEIPT: 7,
  FLEET_E_AUDIT: 6,
  FLEET_E_BAD_ARGS: 2,
  FLEET_E_UNSUPPORTED: 2,
};

export class FleetError extends Error {
  readonly code: FleetErrorCode;
  readonly txHash: string | null;
  readonly blockHeight: number | null;
  readonly refusal: string | null;

  constructor(
    code: FleetErrorCode,
    message: string,
    detail: {
      txHash?: string;
      blockHeight?: number;
      refusal?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = "FleetError";
    this.code = code;
    this.txHash = detail.txHash ?? null;
    this.blockHeight = detail.blockHeight ?? null;
    this.refusal = detail.refusal ?? null;
  }
}

export function fleetExitCode(code: string): number {
  return FLEET_EXIT_CODES[code as FleetErrorCode] ?? 2;
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

export interface FleetState {
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

export interface FleetInventory {
  accountId: string;
  state: FleetState;
  operators: OperatorKey[];
  nativeKeys: NativeKey[];
  fullAccessKeys: number;
  auditHead: AuditHead;
}

export interface FleetTxResult {
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
export interface FleetSignedTransaction {
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

export interface FleetAuditExport {
  format: typeof AUDIT_EXPORT_FORMAT;
  accountId: string;
  exportedAt: string;
  contractVersion: string;
  head: AuditHead;
  entries: AuditEntry[];
  verified: boolean;
}

export interface FleetClientOptions {
  rpcUrl: string;
  accountId: string;
  /**
   * Local signer: a `ed25519:...`/`secp256k1:...` secret string or an object
   * with a `secretKey` field. It is passed only to the in-process Account.
   */
  signer?: string | { secretKey: string };
}

export interface FleetClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  getState(): Promise<FleetState>;
  getNativeKeys(): Promise<NativeKey[]>;
  getInventory(): Promise<FleetInventory>;
  getAudit(fromSeq: number, limit: number): Promise<AuditEntry[]>;
  getAuditAll(): Promise<AuditEntry[]>;
  getAuditHead(): Promise<AuditHead>;
  verifyAuditOnChain(): Promise<boolean>;

  freeze(): Promise<FleetTxResult>;
  unfreeze(): Promise<FleetTxResult>;
  /**
   * Sign a freeze locally without broadcasting it. The RPC is only read
   * (account nonce, latest block hash); no transaction is sent.
   */
  prepareFreeze(): Promise<FleetSignedTransaction>;
  /**
   * Sign an unfreeze locally without broadcasting it. The RPC is only read
   * (account nonce, latest block hash); no transaction is sent.
   */
  prepareUnfreeze(): Promise<FleetSignedTransaction>;
  /**
   * Broadcast a transaction that was signed earlier by `prepareFreeze` or
   * `prepareUnfreeze`.
   */
  submitSigned(signed: FleetSignedTransaction): Promise<FleetTxResult>;
  grantOperator(publicKey: string, tag: string): Promise<FleetTxResult>;
  rotateOperator(
    oldPublicKey: string,
    newPublicKey: string,
    tag: string,
  ): Promise<FleetTxResult>;
  revokeOperator(publicKey: string): Promise<FleetTxResult>;
  revokeTag(tag: string): Promise<FleetTxResult>;
  proposeAdmin(newPublicKey: string): Promise<FleetTxResult>;
  acceptAdmin(): Promise<FleetTxResult>;
  cancelAdmin(): Promise<FleetTxResult>;
  recoverAdmin(newPublicKey: string): Promise<FleetTxResult>;
  execute(
    receiverId: string,
    methodName: string,
    args?: string,
    gasTgas?: number,
  ): Promise<FleetTxResult>;
}

interface RawQueryResult {
  result: number[] | Uint8Array;
  logs?: string[];
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

function toNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new FleetError(
    "FLEET_E_RPC",
    `invalid ${field} in controller view: ${String(value)}`,
  );
}

function toDecimalString(value: unknown, field: string): string {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  throw new FleetError(
    "FLEET_E_RPC",
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
 * Validate a signed-transaction payload. The payload must carry the FLEET
 * format marker, must target testnet, and must never contain key material.
 */
export function parseSignedTransaction(value: unknown): FleetSignedTransaction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signed transaction must be a JSON object",
    );
  }
  const raw = value as Record<string, unknown>;
  if (raw.format !== SIGNED_TX_FORMAT) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      `signed transaction format must be ${SIGNED_TX_FORMAT}`,
    );
  }
  if (raw.network !== "testnet") {
    throw new FleetError(
      "FLEET_E_MAINNET",
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
      throw new FleetError(
        "FLEET_E_BAD_ARGS",
        `signed transaction is missing ${key}`,
      );
    }
  }
  if (
    typeof raw.args !== "object" ||
    raw.args === null ||
    Array.isArray(raw.args)
  ) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signed transaction args must be a JSON object",
    );
  }
  if (!/^(ed25519|secp256k1):/.test(raw.public_key as string)) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signed transaction public_key is not a NEAR public key",
    );
  }
  if (/"(secret_key|private_key|seed_phrase|mnemonic)"\s*:/i.test(JSON.stringify(raw))) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signed transaction must not contain key material",
    );
  }
  return raw as unknown as FleetSignedTransaction;
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
export function fleetTransactionHash(signed: SignedTransaction): string {
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

function mapState(rawValue: unknown, fallbackAccountId: string): FleetState {
  const raw = rawValue as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new FleetError("FLEET_E_RPC", "controller get_state returned no state");
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
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|\b429\b|\b5\d\d\b|timeout/i.test(
    text,
  );
}

function wrapError(error: unknown, fallback: FleetErrorCode): FleetError {
  if (error instanceof FleetError) return error;
  return new FleetError(
    isRpcFailure(error) ? "FLEET_E_RPC" : fallback,
    String((error as { message?: string })?.message ?? error),
    { cause: error },
  );
}

class FleetClientImpl implements FleetClient {
  readonly rpcUrl: string;
  readonly accountId: string;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account | null;
  private testnetCheck: Promise<void> | null = null;

  constructor(options: FleetClientOptions) {
    if (!options.accountId || !/^[a-z0-9._-]+$/.test(options.accountId)) {
      throw new FleetError(
        "FLEET_E_BAD_ARGS",
        `invalid testnet account id: ${options.accountId}`,
      );
    }
    if (/mainnet/i.test(options.rpcUrl)) {
      throw new FleetError(
        "FLEET_E_MAINNET",
        "FLEET is testnet-only; mainnet RPC URLs are refused",
      );
    }
    this.rpcUrl = options.rpcUrl;
    this.accountId = options.accountId;
    this.provider = new JsonRpcProvider({ url: options.rpcUrl });
    const signer = options.signer;
    if (signer === undefined) {
      this.account = null;
    } else {
      const secret =
        typeof signer === "string" ? signer : signer.secretKey;
      if (!/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(secret)) {
        throw new FleetError(
          "FLEET_E_BAD_ARGS",
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
    if (this.testnetCheck === null) {
      this.testnetCheck = (async () => {
        const status = (await this.provider.sendJsonRpc("status", [])) as {
          chain_id?: string;
        };
        if (status.chain_id !== "testnet") {
          throw new FleetError(
            "FLEET_E_MAINNET",
            `refusing non-testnet chain: ${String(status.chain_id)}`,
          );
        }
      })().catch((error: unknown) => {
        this.testnetCheck = null;
        throw wrapError(error, "FLEET_E_RPC");
      });
    }
    return this.testnetCheck;
  }

  private async viewRaw(
    method: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    await this.ensureTestnet();
    try {
      const response = (await this.provider.sendJsonRpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: this.accountId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      })) as unknown as RawQueryResult;
      return Buffer.from(response.result).toString("utf8");
    } catch (error) {
      throw wrapError(error, "FLEET_E_RPC");
    }
  }

  async getState(): Promise<FleetState> {
    const text = await this.viewRaw("get_state", {});
    return mapState(parseBigJson(text), this.accountId);
  }

  async getNativeKeys(): Promise<NativeKey[]> {
    await this.ensureTestnet();
    try {
      const response = await this.provider.viewAccessKeyList({
        accountId: this.accountId,
        finalityQuery: { finality: "final" },
      });
      return response.keys.map((entry) => {
        const mapped = permissionOf(entry);
        return { ...mapped, publicKey: entry.public_key };
      });
    } catch (error) {
      throw wrapError(error, "FLEET_E_RPC");
    }
  }

  async getInventory(): Promise<FleetInventory> {
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
      throw new FleetError("FLEET_E_BAD_ARGS", "fromSeq must be a non-negative integer");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new FleetError("FLEET_E_BAD_ARGS", "limit must be 1..100");
    }
    const text = await this.viewRaw("get_audit", {
      from_seq: fromSeq,
      limit,
    });
    const raw = parseBigJson(text);
    if (!Array.isArray(raw)) {
      throw new FleetError("FLEET_E_RPC", "get_audit did not return an array");
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
  ): Promise<FleetTxResult> {
    if (this.account === null) {
      throw new FleetError(
        "FLEET_E_NO_SIGNER",
        `fleet ${method} requires a local signer key file`,
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
      throw wrapError(error, "FLEET_E_REJECTED");
    }
    return this.toTxResult(outcome as RawOutcome, method);
  }

  private async toTxResult(
    outcome: RawOutcome,
    method: string,
  ): Promise<FleetTxResult> {
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
        top === "failure" ? "FLEET_E_REJECTED" : "FLEET_E_RECEIPT";
      throw new FleetError(
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

  freeze(): Promise<FleetTxResult> {
    return this.write("freeze", {}, 30);
  }

  unfreeze(): Promise<FleetTxResult> {
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
  ): Promise<FleetSignedTransaction> {
    if (this.account === null) {
      throw new FleetError(
        "FLEET_E_NO_SIGNER",
        `fleet ${method} requires a local signer key file`,
      );
    }
    const signer = this.account.getSigner();
    if (signer === undefined) {
      throw new FleetError(
        "FLEET_E_NO_SIGNER",
        `fleet ${method} requires a local signer key file`,
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
      throw wrapError(error, "FLEET_E_REJECTED");
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
      tx_hash: fleetTransactionHash(signed),
      signed_transaction: Buffer.from(bytes).toString("base64"),
      created_at: new Date().toISOString(),
    };
  }

  prepareFreeze(): Promise<FleetSignedTransaction> {
    return this.prepare("freeze", {}, 30);
  }

  prepareUnfreeze(): Promise<FleetSignedTransaction> {
    return this.prepare("unfreeze", {}, 30);
  }

  async submitSigned(signed: FleetSignedTransaction): Promise<FleetTxResult> {
    const payload = parseSignedTransaction(signed);
    if (payload.account_id !== this.accountId) {
      throw new FleetError(
        "FLEET_E_BAD_ARGS",
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
      throw wrapError(error, "FLEET_E_REJECTED");
    }
    return this.toTxResult(outcome as RawOutcome, payload.method);
  }

  grantOperator(publicKey: string, tag: string): Promise<FleetTxResult> {
    return this.write("grant_operator", { public_key: publicKey, tag }, 100);
  }

  rotateOperator(
    oldPublicKey: string,
    newPublicKey: string,
    tag: string,
  ): Promise<FleetTxResult> {
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

  revokeOperator(publicKey: string): Promise<FleetTxResult> {
    return this.write("revoke_operator", { public_key: publicKey }, 100);
  }

  revokeTag(tag: string): Promise<FleetTxResult> {
    return this.write("revoke_tag", { tag }, 100);
  }

  proposeAdmin(newPublicKey: string): Promise<FleetTxResult> {
    return this.write("propose_admin", { new_admin_pk: newPublicKey }, 100);
  }

  acceptAdmin(): Promise<FleetTxResult> {
    return this.write("accept_admin", {}, 30);
  }

  cancelAdmin(): Promise<FleetTxResult> {
    return this.write("cancel_admin", {}, 100);
  }

  recoverAdmin(newPublicKey: string): Promise<FleetTxResult> {
    return this.write("recover_admin", { new_admin_pk: newPublicKey }, 100);
  }

  execute(
    receiverId: string,
    methodName: string,
    args = "{}",
    gasTgas = 10,
  ): Promise<FleetTxResult> {
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

export function createFleetClient(options: FleetClientOptions): FleetClient {
  return new FleetClientImpl(options);
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
  state: FleetState,
  entries: AuditEntry[],
): FleetAuditExport {
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
