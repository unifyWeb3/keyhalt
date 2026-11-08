/**
 * Pinned, read-only snapshots.
 *
 * Every contract read in one refresh is requested at the same finalized block.
 * State is read on every finalized block so a freeze is visible as soon as the
 * block that finalized it arrives. Key lists and audit pages are cached and
 * refreshed when the state changes or every N blocks, whichever comes first.
 */

import {
  buildAuditExport,
  createKeyhaltClient,
  verifyAuditChain,
  type AuditEntry,
  type KeyhaltAuditExport,
  type KeyhaltClient,
  type KeyhaltState,
  type NativeKey,
} from "@keyhalt/sdk";

import type { AgentConfig, ClaimsCount, ConsoleConfig } from "./config.js";
import type { BlockFeed, BlockInfo } from "./blockfeed.js";
import type { ProviderPool, ProviderStat } from "./providers.js";
import type { ReceiptRecord, TimelineCounts, TimelineEvent } from "./timeline.js";
import { buildTimeline, receiptEventLabel } from "./timeline.js";

interface AgentRecord {
  config: AgentConfig;
  state: KeyhaltState | null;
  nativeKeys: NativeKey[] | null;
  audit: AuditEntry[];
  stateBlock: number | null;
  detailBlock: number | null;
  updatedAt: string | null;
  error: string | null;
  detailError: string | null;
  chainVerified: boolean;
  onChainVerified: boolean | null;
  onChainVerifiedLength: number;
  operatorsSignature: string;
}

export interface AgentRow {
  accountId: string;
  label: string;
  mode: "A";
  state: "active" | "frozen" | "unknown";
  paused: boolean | null;
  operatorKeys: number | null;
  operatorTags: Record<string, number>;
  fullAccessKeys: number | null;
  auditLength: number | null;
  contractVersion: string | null;
  blockHeight: number | null;
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
  lastEvent: TimelineEvent | null;
  href: string;
}

export interface KeyhaltPayload {
  ok: true;
  readOnly: true;
  service: "keyhalt-console";
  version: string;
  status: "loading" | "live" | "stale" | "partial" | "empty";
  mode: "A";
  chainId: "testnet";
  headBlock: number | null;
  pinnedBlock: number | null;
  lastGoodBlock: number | null;
  lastGoodAt: string | null;
  stale: boolean;
  staleSince: string | null;
  updatedAt: string;
  blockPollMs: number;
  agents: AgentRow[];
  totals: {
    agents: number;
    operatorKeys: number | null;
    activeOperators: number | null;
    fullAccessKeys: number | null;
  };
  modeB: { accountId: string; url: string };
  claims: ClaimsCount;
  providers: ProviderStat[];
  receipts: { watched: number; resolved: number };
  timeline: { events: number; refused: number; blocks: number };
}

export interface AgentPayload {
  ok: true;
  readOnly: true;
  service: "keyhalt-console";
  accountId: string;
  label: string;
  mode: "A";
  chainId: "testnet";
  status: "loading" | "live" | "stale" | "partial";
  headBlock: number | null;
  stateBlock: number | null;
  detailBlock: number | null;
  lastGoodAt: string | null;
  stale: boolean;
  updatedAt: string | null;
  state: KeyhaltState;
  operators: KeyhaltState["operators"];
  /** Null while the pinned key read is still in flight or failed. */
  nativeKeys: NativeKey[] | null;
  fullAccessKeys: number | null;
  detailError: string | null;
  detailsReady: boolean;
  admin: {
    publicKey: string | null;
    recoveryPublicKey: string | null;
    pendingPublicKey: string | null;
    pendingOrigin: string | null;
  };
  audit: AuditEntry[];
  auditVerification: { ok: boolean; entries: number; head: string; error: string | null };
  onChainVerified: boolean | null;
  events: TimelineEvent[];
  commands: {
    inventory: string;
    freeze: string;
    unfreeze: string;
  };
  exportUrl: string;
}

export interface TimelinePayload {
  ok: true;
  readOnly: true;
  service: "keyhalt-console";
  status: "loading" | "live" | "stale" | "partial" | "empty";
  headBlock: number | null;
  lastGoodBlock: number | null;
  stale: boolean;
  updatedAt: string;
  events: TimelineEvent[];
  counts: TimelineCounts;
  receipts: { watched: number; resolved: number };
}

export class SnapshotService {
  private readonly config: ConsoleConfig;
  private readonly pool: ProviderPool;
  private readonly feed: BlockFeed;
  private readonly receiptSource: () => ReceiptRecord[];
  private readonly receiptCounts: () => { watched: number; resolved: number };
  private readonly claims: ClaimsCount;
  private readonly onUpdate: () => void;
  private readonly agents = new Map<string, AgentRecord>();
  private refreshing = false;
  private pending: BlockInfo | null = null;
  private head: BlockInfo | null = null;
  private pinnedBlock: number | null = null;
  private lastGoodBlock: number | null = null;
  private lastGoodAt: string | null = null;
  private lastError: string | null = null;

  constructor(options: {
    config: ConsoleConfig;
    pool: ProviderPool;
    feed: BlockFeed;
    receipts: () => ReceiptRecord[];
    receiptCounts: () => { watched: number; resolved: number };
    claims: ClaimsCount;
    onUpdate: () => void;
  }) {
    this.config = options.config;
    this.pool = options.pool;
    this.feed = options.feed;
    this.receiptSource = options.receipts;
    this.receiptCounts = options.receiptCounts;
    this.claims = options.claims;
    this.onUpdate = options.onUpdate;
    for (const agent of options.config.agents) {
      this.agents.set(agent.accountId, {
        config: agent,
        state: null,
        nativeKeys: null,
        audit: [],
        stateBlock: null,
        detailBlock: null,
        updatedAt: null,
        error: null,
        detailError: null,
        chainVerified: false,
        onChainVerified: null,
        onChainVerifiedLength: 0,
        operatorsSignature: "",
      });
    }
    this.feed = options.feed;
  }

  get agentConfigs(): AgentConfig[] {
    return this.config.agents;
  }

  hasAgent(accountId: string): boolean {
    return this.agents.has(accountId);
  }

  get headBlock(): number | null {
    return this.head?.height ?? null;
  }

  get lastGood(): number | null {
    return this.lastGoodBlock;
  }

  get stale(): boolean {
    const feed = this.feed.current;
    if (feed.head === null) return false;
    if (feed.stale) return true;
    if (this.lastGoodBlock === null) return false;
    return Date.now() - Date.parse(this.lastGoodAt ?? "1970-01-01") > this.config.staleAfterMs;
  }

  private staleSince(): string | null {
    const feed = this.feed.current;
    if (feed.stale && feed.staleSince !== null) return new Date(feed.staleSince).toISOString();
    if (
      this.lastGoodAt !== null &&
      Date.now() - Date.parse(this.lastGoodAt) > this.config.staleAfterMs
    ) {
      return new Date(Date.parse(this.lastGoodAt) + this.config.staleAfterMs).toISOString();
    }
    return null;
  }

  private status(): KeyhaltPayload["status"] {
    if (this.agents.size === 0) return "empty";
    if (this.head === null || this.lastGoodBlock === null) return "loading";
    if (this.stale) return "stale";
    const behind = [...this.agents.values()].some(
      (agent) =>
        agent.stateBlock !== null &&
        this.head !== null &&
        this.head.height - agent.stateBlock > this.config.detailEveryBlocks * 2,
    );
    return behind ? "partial" : "live";
  }

  handleBlock(block: BlockInfo): void {
    this.head = block;
    if (this.refreshing) {
      this.pending = block;
      return;
    }
    void this.refresh(block);
  }

  private async refresh(block: BlockInfo): Promise<void> {
    this.refreshing = true;
    let any = false;
    try {
      if (this.agents.size === 0) {
        this.pinnedBlock = block.height;
        this.onUpdate();
        return;
      }
      const results = await Promise.allSettled(
        [...this.agents.values()].map((agent) => this.refreshAgent(agent, block)),
      );
      results.forEach((result, index) => {
        const agent = [...this.agents.values()][index];
        if (agent === undefined) return;
        if (result.status === "fulfilled" && result.value) {
          any = true;
        }
      });
      if (any) {
        this.pinnedBlock = block.height;
        this.lastGoodBlock = Math.max(
          ...[...this.agents.values()]
            .map((agent) => agent.stateBlock)
            .filter((height): height is number => height !== null),
        );
        this.lastGoodAt = new Date().toISOString();
        this.lastError = null;
      } else {
        this.lastError = "all agent reads failed";
      }
    } finally {
      this.refreshing = false;
      this.onUpdate();
      const next = this.pending;
      this.pending = null;
      if (next !== null) void this.refresh(next);
    }
  }

  private async refreshAgent(agent: AgentRecord, block: BlockInfo): Promise<boolean> {
    try {
      const state = await this.withClient(agent.config.accountId, block.height, (client) =>
        client.getState(),
      );
      const previousState = agent.state;
      agent.state = state;
      agent.stateBlock = block.height;
      agent.updatedAt = new Date().toISOString();
      agent.error = null;
      agent.operatorsSignature = JSON.stringify(state.operators);

      const changedOperators =
        previousState === null ||
        JSON.stringify(previousState.operators) !== agent.operatorsSignature;
      const detailDue =
        changedOperators ||
        agent.nativeKeys === null ||
        block.height % this.config.detailEveryBlocks === 0;

      const detailTasks: Array<Promise<void>> = [];
      if (detailDue) {
        detailTasks.push(
          this.withClient(agent.config.accountId, block.height, (client) =>
            client.getNativeKeys(),
          ).then(
            (keys) => {
              agent.nativeKeys = keys;
              agent.detailBlock = block.height;
              agent.detailError = null;
            },
            (error: unknown) => {
              agent.detailError = messageOf(error);
            },
          ),
        );
      }
      if (state.auditLength > agent.audit.length) {
        detailTasks.push(
          this.fetchAudit(agent, block.height).catch((error: unknown) => {
            agent.detailError = messageOf(error);
          }),
        );
      }
      if (
        detailDue &&
        state.auditLength > 0 &&
        (agent.onChainVerified === null ||
          agent.onChainVerifiedLength !== state.auditLength)
      ) {
        detailTasks.push(
          this.withClient(agent.config.accountId, block.height, (client) =>
            client.verifyAuditOnChain(),
          ).then(
            (verified) => {
              agent.onChainVerified = verified;
              agent.onChainVerifiedLength = state.auditLength;
            },
            () => {
              agent.onChainVerified = null;
            },
          ),
        );
      }
      await Promise.allSettled(detailTasks);
      return true;
    } catch (error) {
      agent.error = messageOf(error);
      return false;
    }
  }

  private async fetchAudit(agent: AgentRecord, blockHeight: number): Promise<void> {
    const expected = agent.state?.auditLength ?? 0;
    while (agent.audit.length < expected) {
      const page = await this.withClient(agent.config.accountId, blockHeight, (client) =>
        client.getAudit(agent.audit.length, 100),
      );
      if (page.length === 0) break;
      const next = agent.audit.length;
      for (const entry of page) {
        if (entry.seq < next) continue;
        if (entry.seq === agent.audit.length) agent.audit.push(entry);
      }
      if (page.length < 100) break;
    }
    agent.chainVerified = verifyAuditChain(agent.audit).ok;
  }

  private async withClient<T>(
    accountId: string,
    blockId: number,
    fn: (client: KeyhaltClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.attempt(
      { deadlineMs: 22_000, attemptTimeoutMs: 10_000 },
      async (provider) => {
        const client = createKeyhaltClient({
          rpcUrl: provider.url,
          accountId,
          blockId,
        });
        return fn(client);
      },
    );
  }

  private timeline(limit: number, accountId?: string): {
    events: TimelineEvent[];
    counts: TimelineCounts;
  } {
    const built = buildTimeline(
      [...this.agents.values()].map((agent) => ({
        accountId: agent.config.accountId,
        label: agent.config.label,
        entries: agent.audit,
        verified: agent.chainVerified,
      })),
      this.receiptSource(),
      limit,
    );
    if (accountId === undefined) return built;
    const filtered = built.events.filter((event) => event.accountId === accountId);
    // The counts still describe the whole fleet; the caller can show only rows.
    return { events: filtered, counts: built.counts };
  }

  keyhaltPayload(): KeyhaltPayload {
    const allEvents = this.timeline(500).events;
    const rows: AgentRow[] = [...this.agents.values()].map((agent) => {
      const state = agent.state;
      const tags: Record<string, number> = {};
      for (const operator of state?.operators ?? []) {
        if (!operator.active) continue;
        tags[operator.tag] = (tags[operator.tag] ?? 0) + 1;
      }
      const lastEvent =
        allEvents.find((event) => event.accountId === agent.config.accountId) ?? null;
      return {
        accountId: agent.config.accountId,
        label: agent.config.label,
        mode: "A",
        state: state === null ? "unknown" : state.paused ? "frozen" : "active",
        paused: state === null ? null : state.paused,
        operatorKeys:
          state === null
            ? null
            : state.operators.filter((operator) => operator.active).length,
        operatorTags: tags,
        fullAccessKeys:
          agent.nativeKeys === null
            ? null
            : agent.nativeKeys.filter((key) => key.permission === "FullAccess").length,
        auditLength: state?.auditLength ?? null,
        contractVersion: state?.contractVersion ?? null,
        blockHeight: agent.stateBlock,
        updatedAt: agent.updatedAt,
        stale:
          agent.stateBlock !== null &&
          this.head !== null &&
          this.head.height - agent.stateBlock > this.config.detailEveryBlocks * 2,
        error: agent.error,
        lastEvent,
        href: `#/agent/${agent.config.accountId}`,
      };
    });
    const operatorKeys = rows.some((row) => row.operatorKeys === null)
      ? null
      : rows.reduce((sum, row) => sum + (row.operatorKeys ?? 0), 0);
    const fullAccessKeys = rows.some((row) => row.fullAccessKeys === null)
      ? null
      : rows.reduce((sum, row) => sum + (row.fullAccessKeys ?? 0), 0);
    const timeline = this.timeline(200);
    return {
      ok: true,
      readOnly: true,
      service: "keyhalt-console",
      version: "0.3.0",
      status: this.status(),
      mode: "A",
      chainId: "testnet",
      headBlock: this.head?.height ?? null,
      pinnedBlock: this.pinnedBlock,
      lastGoodBlock: this.lastGoodBlock,
      lastGoodAt: this.lastGoodAt,
      stale: this.stale,
      staleSince: this.staleSince(),
      updatedAt: new Date().toISOString(),
      blockPollMs: this.config.blockPollMs,
      agents: rows,
      totals: {
        agents: rows.length,
        operatorKeys,
        activeOperators: operatorKeys,
        fullAccessKeys,
      },
      modeB: { accountId: this.config.modeBAccountId, url: this.config.modeBUrl },
      claims: this.claims,
      providers: this.pool.stats(),
      receipts: this.receiptCounts(),
      timeline: {
        events: timeline.counts.events,
        refused: timeline.counts.refused,
        blocks: timeline.counts.blocks,
      },
    };
  }

  agentPayload(accountId: string): AgentPayload | null {
    const agent = this.agents.get(accountId);
    if (agent === undefined) return null;
    const state = agent.state;
    if (state === null) return null;
    const verification = verifyAuditChain(agent.audit);
    const events = this.timeline(200, accountId).events;
    const status = this.stale
      ? "stale"
      : agent.stateBlock !== null &&
          this.head !== null &&
          this.head.height - agent.stateBlock > this.config.detailEveryBlocks * 2
        ? "partial"
        : "live";
    return {
      ok: true,
      readOnly: true,
      service: "keyhalt-console",
      accountId,
      label: agent.config.label,
      mode: "A",
      chainId: "testnet",
      status,
      headBlock: this.head?.height ?? null,
      stateBlock: agent.stateBlock,
      detailBlock: agent.detailBlock,
      lastGoodAt: this.lastGoodAt,
      stale: this.stale || agent.error !== null,
      updatedAt: agent.updatedAt,
      state,
      operators: state.operators,
      nativeKeys: agent.nativeKeys,
      fullAccessKeys:
        agent.nativeKeys === null
          ? null
          : agent.nativeKeys.filter((key) => key.permission === "FullAccess").length,
      detailError: agent.detailError,
      detailsReady: agent.nativeKeys !== null || agent.detailError !== null,
      admin: {
        publicKey: state.adminPublicKey,
        recoveryPublicKey: state.recoveryPublicKey,
        pendingPublicKey: state.pendingAdminPublicKey,
        pendingOrigin: state.pendingOrigin,
      },
      audit: agent.audit,
      auditVerification: {
        ok: verification.ok,
        entries: verification.entries,
        head: verification.head,
        error: verification.error,
      },
      onChainVerified: agent.onChainVerified,
      events,
      commands: {
        inventory: `node packages/cli/dist/index.js inventory ${accountId} --json`,
        freeze: `node packages/cli/dist/index.js freeze ${accountId} --signer-key-file "$KEYHALT_ADMIN_KEY_FILE" --json`,
        unfreeze: `node packages/cli/dist/index.js unfreeze ${accountId} --signer-key-file "$KEYHALT_ADMIN_KEY_FILE" --json`,
      },
      exportUrl: `/api/audit-export?account=${encodeURIComponent(accountId)}`,
    };
  }

  timelinePayload(limit: number, accountId?: string): TimelinePayload {
    const built = this.timeline(limit, accountId);
    return {
      ok: true,
      readOnly: true,
      service: "keyhalt-console",
      status: this.status(),
      headBlock: this.head?.height ?? null,
      lastGoodBlock: this.lastGoodBlock,
      stale: this.stale,
      updatedAt: new Date().toISOString(),
      events: built.events,
      counts: built.counts,
      receipts: this.receiptCounts(),
    };
  }

  async auditExport(accountId: string): Promise<KeyhaltAuditExport | null> {
    const agent = this.agents.get(accountId);
    if (agent === undefined || agent.state === null) return null;
    const block = agent.stateBlock ?? this.head?.height ?? null;
    if (block === null) return null;
    try {
      const entries = await this.withClient<AuditEntry[]>(accountId, block, (client) =>
        client.getAuditAll(),
      );
      agent.audit = entries;
      agent.chainVerified = verifyAuditChain(entries).ok;
      return buildAuditExport(accountId, agent.state, entries);
    } catch {
      return buildAuditExport(accountId, agent.state, agent.audit);
    }
  }

  describeLastEvent(record: ReceiptRecord): string {
    return receiptEventLabel(record);
  }
}

function messageOf(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? error).slice(0, 240);
}
