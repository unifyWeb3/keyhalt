/**
 * Finalized block feed. Free public NEAR RPC has no block websocket, so the
 * console polls `block { finality: "final" }` at a paced interval and pushes
 * each new finalized block to subscribers. The ticker in the header is this
 * feed, not a timer.
 */

import type { ProviderPool } from "./providers.js";

export interface BlockInfo {
  height: number;
  hash: string;
  timestampNs: string;
}

interface BlockRpcResult {
  header?: {
    height?: number;
    hash?: string;
    timestamp?: number | string;
  };
}

export interface BlockFeedState {
  head: BlockInfo | null;
  lastGoodAt: number | null;
  lastError: string | null;
  stale: boolean;
  staleSince: number | null;
  pollCount: number;
  failureCount: number;
}

export class BlockFeed {
  private readonly pool: ProviderPool;
  private readonly intervalMs: number;
  private readonly staleAfterMs: number;
  private readonly onBlock: (block: BlockInfo) => void;
  private readonly state: BlockFeedState;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private polling = false;

  constructor(
    pool: ProviderPool,
    options: {
      intervalMs: number;
      staleAfterMs: number;
      onBlock: (block: BlockInfo) => void;
    },
  ) {
    this.pool = pool;
    this.intervalMs = options.intervalMs;
    this.staleAfterMs = options.staleAfterMs;
    this.onBlock = options.onBlock;
    this.state = {
      head: null,
      lastGoodAt: null,
      lastError: null,
      stale: true,
      staleSince: Date.now(),
      pollCount: 0,
      failureCount: 0,
    };
  }

  get current(): BlockFeedState {
    return { ...this.state };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.stopTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay);
    this.timer.unref?.();
  }

  private async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const result = await this.pool.call<BlockRpcResult>(
        "block",
        { finality: "final" },
        { deadlineMs: 12_000, attemptTimeoutMs: 8_000 },
      );
      const header = result.header;
      if (
        header === undefined ||
        typeof header.height !== "number" ||
        typeof header.hash !== "string"
      ) {
        throw new Error("block feed returned no header");
      }
      const block: BlockInfo = {
        height: header.height,
        hash: header.hash,
        timestampNs: String(header.timestamp ?? "0"),
      };
      const previous = this.state.head;
      this.state.head = block;
      this.state.lastGoodAt = Date.now();
      this.state.lastError = null;
      this.state.stale = false;
      this.state.staleSince = null;
      this.state.pollCount += 1;
      if (previous === null || block.height > previous.height) {
        try {
          this.onBlock(block);
        } catch {
          // A subscriber error must not stop the feed.
        }
      }
    } catch (error) {
      this.state.failureCount += 1;
      this.state.lastError = String(
        (error as { message?: unknown })?.message ?? error,
      ).slice(0, 240);
      if (
        this.state.lastGoodAt !== null &&
        Date.now() - this.state.lastGoodAt > this.staleAfterMs
      ) {
        this.state.stale = true;
        this.state.staleSince ??= Date.now();
      }
    } finally {
      this.polling = false;
      // Keep polling only while the server is running. When no SSE client is
      // attached, the snapshot still needs blocks; the server keeps clients at
      // least 1 via `setClients` from the HTTP layer's initial connect. A fully
      // idle console still polls, because health and the API are useful alone.
      if (!this.stopped) this.schedule(this.intervalMs);
    }
  }
}
