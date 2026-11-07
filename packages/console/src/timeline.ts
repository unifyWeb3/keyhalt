/**
 * Timeline assembly.
 *
 * Audit entries come from the controller. Refusals are not in the audit log,
 * so they are read from the receipts of explicitly watched transactions on an
 * archival RPC. A watch file is only a list of tx hashes; every displayed
 * field is parsed from the chain response, never from the file.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AuditEntry } from "@fleet/sdk";

import type { ProviderPool } from "./providers.js";

export interface ReceiptRecord {
  txHash: string;
  signerId: string;
  receiverId: string;
  method: string;
  blockHeight: number;
  blockHash: string;
  timestampNs: string;
  success: boolean;
  refusal: string | null;
  successValue: string | null;
  logs: string[];
  fetchedAt: string;
}

interface BlockResult {
  header?: { height?: number; hash?: string; timestamp?: number | string };
}

interface TxStatusResult {
  status?: unknown;
  transaction?: {
    signer_id?: string;
    receiver_id?: string;
    actions?: Array<{ FunctionCall?: { method_name?: string } }>;
  };
  transaction_outcome?: {
    id?: string;
    block_hash?: string;
    outcome?: { logs?: string[]; status?: unknown };
  };
  receipts_outcome?: Array<{
    block_hash?: string;
    outcome?: { logs?: string[]; status?: unknown };
  }>;
}

export interface TimelineEvent {
  id: string;
  kind: "audit" | "receipt";
  accountId: string;
  agentLabel: string;
  event: string;
  action: string;
  result: "ok" | "refused" | "failed";
  resultText: string;
  refused: boolean;
  blockHeight: number;
  timestampNs: string;
  txHash: string | null;
  entryHash: string | null;
  seq: number | null;
  verified: boolean;
  source: "audit" | "receipt" | "audit+receipt";
}

export interface TimelineCounts {
  events: number;
  refused: number;
  blocks: number;
  minBlock: number | null;
  maxBlock: number | null;
}

const BASE58_TX = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MAX_WATCHED = 60;

function readTxList(path: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object" && Array.isArray((raw as { txs?: unknown }).txs)
      ? (raw as { txs: unknown[] }).txs
      : [];
  const seen = new Set<string>();
  const txs: string[] = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const tx = value.trim();
    if (!BASE58_TX.test(tx) || seen.has(tx)) continue;
    seen.add(tx);
    txs.push(tx);
    if (txs.length >= MAX_WATCHED) break;
  }
  return txs;
}

function statusKind(status: unknown): string {
  if (status === null || status === undefined) return "unknown";
  if (typeof status === "string") return status;
  if (typeof status !== "object") return "unknown";
  return Object.keys(status as Record<string, unknown>)[0] ?? "unknown";
}

function decodeSuccessValue(status: unknown): string | null {
  if (status === null || typeof status !== "object") return null;
  const value = (status as { SuccessValue?: unknown }).SuccessValue;
  if (typeof value !== "string") return null;
  try {
    const text = Buffer.from(value, "base64").toString("utf8");
    try {
      const parsed = JSON.parse(text) as unknown;
      return typeof parsed === "string" ? parsed : text;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function findRefusal(logs: string[]): string | null {
  for (const log of logs) {
    const index = log.indexOf("FLEET_REFUSAL:");
    if (index >= 0) return log.slice(index + "FLEET_REFUSAL:".length).trim();
  }
  return null;
}

function isFailure(status: unknown): boolean {
  return statusKind(status) === "Failure";
}

function mapReceipt(
  txHash: string,
  result: TxStatusResult,
  block: BlockResult,
): ReceiptRecord {
  const transaction = result.transaction ?? {};
  const action = transaction.actions?.find((entry) => entry.FunctionCall !== undefined);
  const method = action?.FunctionCall?.method_name ?? "unknown";
  const logs: string[] = [];
  const statuses: unknown[] = [];
  if (Array.isArray(result.transaction_outcome?.outcome?.logs)) {
    logs.push(...result.transaction_outcome.outcome.logs);
  }
  statuses.push(result.transaction_outcome?.outcome?.status);
  for (const receipt of result.receipts_outcome ?? []) {
    if (Array.isArray(receipt.outcome?.logs)) logs.push(...receipt.outcome.logs);
    statuses.push(receipt.outcome?.status);
  }
  let successValue: string | null = null;
  for (const status of statuses) {
    const value = decodeSuccessValue(status);
    if (value !== null && value.length > 0) successValue = value;
  }
  const header = block.header ?? {};
  if (typeof header.height !== "number") {
    throw new Error(`block ${String(header.hash ?? "")} returned no height`);
  }
  return {
    txHash,
    signerId: String(transaction.signer_id ?? ""),
    receiverId: String(transaction.receiver_id ?? ""),
    method,
    blockHeight: header.height,
    blockHash: String(header.hash ?? result.transaction_outcome?.block_hash ?? ""),
    timestampNs: String(header.timestamp ?? "0"),
    success:
      !isFailure(result.status) &&
      !statuses.some((status) => isFailure(status)),
    refusal: findRefusal(logs),
    successValue,
    logs: logs.slice(0, 20),
    fetchedAt: new Date().toISOString(),
  };
}

export class ReceiptWatcher {
  private readonly pool: ProviderPool;
  private readonly cacheDir: string;
  private readonly watchFile: string;
  private readonly seedTxs: string[];
  private readonly senderAccountId: string;
  private readonly pollMs: number;
  private readonly onUpdate: () => void;
  private readonly records = new Map<string, ReceiptRecord>();
  private readonly attempted = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private ticking = false;
  private lastWatch: string[] = [];

  constructor(
    pool: ProviderPool,
    options: {
      cacheDir: string;
      watchFile: string;
      seedTxs: string[];
      senderAccountId: string;
      pollMs: number;
      onUpdate: () => void;
    },
  ) {
    this.pool = pool;
    this.cacheDir = options.cacheDir;
    this.watchFile = options.watchFile;
    this.seedTxs = options.seedTxs.filter((tx) => BASE58_TX.test(tx));
    this.senderAccountId = options.senderAccountId;
    this.pollMs = options.pollMs;
    this.onUpdate = options.onUpdate;
  }

  get receipts(): ReceiptRecord[] {
    return [...this.records.values()].sort(
      (left, right) =>
        right.blockHeight - left.blockHeight ||
        right.timestampNs.localeCompare(left.timestampNs),
    );
  }

  get watchedCount(): number {
    return new Set([...this.seedTxs, ...this.lastWatch]).size;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.loadCache();
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private loadCache(): void {
    try {
      mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
      const files = new Set(readdirSync(this.cacheDir).filter((name) => name.endsWith(".json")));
      const wanted = new Set([...this.seedTxs, ...readTxList(this.watchFile)]);
      for (const tx of wanted) {
        const file = `${tx}.json`;
        if (!files.has(file)) continue;
        try {
          const record = JSON.parse(
            readFileSync(join(this.cacheDir, file), "utf8"),
          ) as ReceiptRecord;
          if (
            record.txHash === tx &&
            typeof record.blockHeight === "number" &&
            typeof record.receiverId === "string"
          ) {
            this.records.set(tx, record);
          }
        } catch {
          // A corrupt cache entry is refetched from chain.
        }
      }
    } catch {
      // No cache yet.
    }
  }

  private saveCache(record: ReceiptRecord): void {
    try {
      mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(this.cacheDir, `${record.txHash}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
        { mode: 0o600 },
      );
    } catch {
      // Cache is an optimization; the chain response is still in memory.
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.pollMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      this.lastWatch = readTxList(this.watchFile);
      const wanted = [...new Set([...this.seedTxs, ...this.lastWatch])];
      for (const tx of wanted) {
        if (this.stopped) break;
        if (this.senderAccountId === "" || this.records.has(tx)) continue;
        const last = this.attempted.get(tx) ?? 0;
        if (Date.now() - last < 10_000) continue;
        this.attempted.set(tx, Date.now());
        try {
          const result = await this.pool.call<TxStatusResult>(
            "EXPERIMENTAL_tx_status",
            { tx_hash: tx, sender_account_id: this.senderAccountId },
            { archival: true, deadlineMs: 25_000, attemptTimeoutMs: 12_000 },
          );
          const blockHash = result.transaction_outcome?.block_hash;
          if (typeof blockHash !== "string") {
            throw new Error("tx status returned no block hash");
          }
          const block = await this.pool.call<BlockResult>(
            "block",
            { block_id: blockHash },
            { archival: true, deadlineMs: 25_000, attemptTimeoutMs: 12_000 },
          );
          const record = mapReceipt(tx, result, block);
          this.records.set(tx, record);
          this.saveCache(record);
          this.onUpdate();
        } catch {
          // Leave it pending; the next tick retries after the 10 s backoff.
        }
      }
    } finally {
      this.ticking = false;
      this.schedule();
    }
  }
}

function auditActionLabel(action: string): { event: string; resultText: string | null } {
  switch (action) {
    case "init":
      return { event: "init", resultText: "provisioned" };
    case "freeze":
      return { event: "freeze", resultText: "ok" };
    case "unfreeze":
      return { event: "unfreeze", resultText: "ok" };
    case "execute":
      return { event: "operator execute", resultText: null };
    case "grant_operator":
      return { event: "grant operator", resultText: "ok" };
    case "revoke_operator":
      return { event: "revoke operator", resultText: "ok" };
    case "rotate_operator":
      return { event: "rotate operator", resultText: "ok" };
    case "propose_admin":
      return { event: "propose admin", resultText: "pending" };
    case "cancel_admin":
      return { event: "cancel admin", resultText: "ok" };
    case "recover_confirmed":
      return { event: "recover admin", resultText: "ok" };
    case "accept_admin":
      return { event: "accept admin", resultText: "ok" };
    case "revoke_tag":
      return { event: "revoke tag", resultText: "ok" };
    default:
      return { event: action.replaceAll("_", " "), resultText: null };
  }
}

export function receiptEventLabel(record: ReceiptRecord): string {
  if (!record.success) {
    if (record.refusal?.includes("frozen")) return "execute while frozen";
    if (record.refusal?.includes("method not allowed")) return "execute, wrong method";
    if (record.refusal?.includes("receiver not allowed")) return "execute, wrong receiver";
    return `${record.method} failed`;
  }
  if (record.method === "execute") return "operator execute";
  return record.method.replaceAll("_", " ");
}

export function buildTimeline(
  agents: Array<{
    accountId: string;
    label: string;
    entries: AuditEntry[];
    verified: boolean;
  }>,
  receipts: ReceiptRecord[],
  limit: number,
): { events: TimelineEvent[]; counts: TimelineCounts } {
  const events: TimelineEvent[] = [];
  const auditRows = new Map<string, TimelineEvent>();
  for (const agent of agents) {
    for (const entry of agent.entries) {
      const label = auditActionLabel(entry.action);
      const row: TimelineEvent = {
        id: `audit:${agent.accountId}:${entry.seq}`,
        kind: "audit",
        accountId: agent.accountId,
        agentLabel: agent.label,
        event: label.event,
        action: entry.action,
        result: "ok",
        resultText: label.resultText ?? entry.subject ?? "ok",
        refused: false,
        blockHeight: entry.blockHeight,
        timestampNs: entry.blockTimestampNs,
        txHash: null,
        entryHash: entry.entryHash,
        seq: entry.seq,
        verified: agent.verified,
        source: "audit",
      };
      events.push(row);
      auditRows.set(`${agent.accountId}|${entry.blockHeight}|${entry.action}`, row);
    }
  }

  const usedReceipts = new Set<string>();
  for (const record of receipts) {
    if (usedReceipts.has(record.txHash)) continue;
    const match =
      record.success
        ? auditRows.get(`${record.receiverId}|${record.blockHeight}|${record.method}`)
        : undefined;
    if (match !== undefined && match.txHash === null) {
      match.txHash = record.txHash;
      match.source = "audit+receipt";
      if (record.successValue !== null && record.successValue.length > 0) {
        match.resultText = record.successValue;
      }
      usedReceipts.add(record.txHash);
      continue;
    }
    if (!record.success && record.receiverId) {
      // A failed receipt can share a block and method with a successful audit
      // entry; keep it as its own row because the refusal is the event.
    }
    const agent = agents.find((entry) => entry.accountId === record.receiverId);
    const event = receiptEventLabel(record);
    events.push({
      id: `tx:${record.txHash}`,
      kind: "receipt",
      accountId: record.receiverId,
      agentLabel: agent?.label ?? record.receiverId.split(".")[0] ?? record.receiverId,
      event,
      action: record.method,
      result: record.success ? "ok" : record.refusal !== null ? "refused" : "failed",
      resultText: record.success
        ? record.successValue && record.successValue.length > 0
          ? record.successValue
          : "ok"
        : `refused · ${record.refusal ?? "execution failed"}`,
      refused: !record.success,
      blockHeight: record.blockHeight,
      timestampNs: record.timestampNs,
      txHash: record.txHash,
      entryHash: null,
      seq: null,
      verified: false,
      source: "receipt",
    });
    usedReceipts.add(record.txHash);
  }

  events.sort(
    (left, right) =>
      right.blockHeight - left.blockHeight ||
      right.timestampNs.localeCompare(left.timestampNs) ||
      right.id.localeCompare(left.id),
  );
  const heights = events.map((event) => event.blockHeight);
  const minBlock = heights.length === 0 ? null : Math.min(...heights);
  const maxBlock = heights.length === 0 ? null : Math.max(...heights);
  return {
    events: events.slice(0, limit),
    counts: {
      events: events.length,
      refused: events.filter((event) => event.refused).length,
      blocks: minBlock === null || maxBlock === null ? 0 : maxBlock - minBlock,
      minBlock,
      maxBlock,
    },
  };
}
