/**
 * Read-only HTTP server for the Keyhalt console.
 *
 * GET and HEAD only. No signer, key path, write route, or wallet connection
 * exists in this process. The browser never talks to an RPC directly; it reads
 * same-origin JSON and an SSE stream from this server.
 */

import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

import type { ConsoleConfig } from "./config.js";
import { readClaimsCount } from "./config.js";
import { BlockFeed } from "./blockfeed.js";
import { ProviderPool } from "./providers.js";
import { ReceiptWatcher } from "./timeline.js";
import { SnapshotService } from "./snapshot.js";

const VERSION = "0.3.0";
const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

interface SseClient {
  res: ServerResponse;
}

export interface ConsoleServer {
  server: ReturnType<typeof createServer>;
  start: (port?: number, host?: string) => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  address: () => { port: number; host: string } | null;
  snapshot: SnapshotService;
  feed: BlockFeed;
  pool: ProviderPool;
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...extraHeaders,
  });
  if (res.req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(payload);
}

function fail(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  extraHeaders: Record<string, string> = {},
): void {
  json(res, status, { ok: false, code, message, readOnly: true }, extraHeaders);
}

function contentType(path: string): string | null {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".ttf":
      return "font/ttf";
    case ".woff2":
      return "font/woff2";
    case ".png":
      return "image/png";
    default:
      return null;
  }
}

function safeJoin(root: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  const normalized = normalize(decoded).replace(/^([/\\])+/, "");
  if (normalized.includes("..") || normalized.startsWith(sep)) return null;
  const full = resolve(root, normalized);
  return full === root || full.startsWith(`${root}${sep}`) ? full : null;
}

function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  cache: string,
): boolean {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = contentType(path);
  if (type === null) return false;
  res.writeHead(200, {
    "content-type": type,
    "content-length": String(stat.size),
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(path).pipe(res);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function createConsoleServer(config: ConsoleConfig): ConsoleServer {
  const pool = new ProviderPool([...config.providers, ...config.archivalProviders], {
    maxRetryMs: config.maxRetryMs,
  });
  const claims = readClaimsCount(config.claimsPath);
  const clients = new Set<SseClient>();
  let stopped = false;

  const broadcast = (event: string, data: unknown): void => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(frame);
      } catch {
        clients.delete(client);
      }
    }
  };

  const watcher = new ReceiptWatcher(pool, {
    cacheDir: config.cacheDir,
    watchFile: config.watchFile,
    seedTxs: config.agents.length === 0 ? [] : config.seedTxs,
    senderAccountId: config.agents[0]?.accountId ?? "",
    pollMs: config.watchPollMs,
    onUpdate: () => {
      const receipts = watcher.receipts;
      broadcast("timeline", {
        event: "receipt",
        resolved: receipts.length,
        latestBlock:
          receipts.length === 0 ? null : Math.max(...receipts.map((record) => record.blockHeight)),
      });
    },
  });

  const feed = new BlockFeed(pool, {
    intervalMs: config.blockPollMs,
    staleAfterMs: config.staleAfterMs,
    onBlock: (block) => {
      snapshot.handleBlock(block);
      broadcast("block", { ...block, finality: "final", chainId: "testnet" });
    },
  });

  const snapshot = new SnapshotService({
    config,
    pool,
    feed,
    receipts: () => watcher.receipts,
    receiptCounts: () => ({
      watched: watcher.watchedCount,
      resolved: watcher.receipts.length,
    }),
    claims,
    onUpdate: () => {
      const current = snapshot.keyhaltPayload();
      broadcast("snapshot", {
        status: current.status,
        headBlock: current.headBlock,
        pinnedBlock: current.pinnedBlock,
        lastGoodBlock: current.lastGoodBlock,
        stale: current.stale,
        staleSince: current.staleSince,
        updatedAt: current.updatedAt,
        events: current.timeline.events,
        refused: current.timeline.refused,
      });
    },
  });

  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        fail(res, 500, "KEYHALT_CONSOLE_ERROR", String((error as Error).message ?? error));
      } else {
        res.end();
      }
    });
  });

  async function waitForData(accountId?: string, timeoutMs = 8_000): Promise<boolean> {
    if (config.agents.length === 0) return true;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (stopped) return false;
      if (accountId === undefined) {
        if (snapshot.lastGood !== null) return true;
      } else {
        const payload = snapshot.agentPayload(accountId);
        if (payload !== null && payload.detailsReady) return true;
      }
      await sleep(80);
    }
    return false;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    if (!READ_ONLY_METHODS.has(method)) {
      fail(res, 405, "KEYHALT_CONSOLE_READ_ONLY", "console is read-only; use GET or HEAD", {
        allow: "GET, HEAD",
      });
      return;
    }
    const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
    const path = url.pathname;

    if (path === "/api/health") {
      const feedState = feed.current;
      const keyhalt = snapshot.keyhaltPayload();
      json(res, 200, {
        ok: true,
        status: keyhalt.status,
        service: "keyhalt-console",
        version: VERSION,
        readOnly: true,
        noSigner: true,
        chainId: "testnet",
        headBlock: keyhalt.headBlock,
        pinnedBlock: keyhalt.pinnedBlock,
        lastGoodBlock: keyhalt.lastGoodBlock,
        lastGoodAt: keyhalt.lastGoodAt,
        stale: keyhalt.stale,
        staleSince: keyhalt.staleSince,
        blockFeed: {
          pollMs: config.blockPollMs,
          lastGoodAt:
            feedState.lastGoodAt === null
              ? null
              : new Date(feedState.lastGoodAt).toISOString(),
          stale: feedState.stale,
          lastError: feedState.lastError,
          polls: feedState.pollCount,
          failures: feedState.failureCount,
        },
        limits: {
          maxRetryMs: config.maxRetryMs,
          staleAfterMs: config.staleAfterMs,
          detailEveryBlocks: config.detailEveryBlocks,
        },
        agents: config.agents.map((agent) => ({
          accountId: agent.accountId,
          label: agent.label,
        })),
        modeB: { accountId: config.modeBAccountId, url: config.modeBUrl },
        claims,
        providers: pool.stats(),
        receipts: {
          watched: watcher.watchedCount,
          resolved: watcher.receipts.length,
        },
      });
      return;
    }

    if (path === "/api/keyhalt") {
      if (config.agents.length > 0 && snapshot.lastGood === null) {
        await waitForData(undefined, 6_000);
      }
      json(res, 200, snapshot.keyhaltPayload());
      return;
    }

    if (path === "/api/agent") {
      const accountId = url.searchParams.get("account");
      if (accountId === null || accountId === "") {
        fail(res, 400, "KEYHALT_CONSOLE_BAD_ARGS", "missing account query parameter");
        return;
      }
      if (!snapshot.hasAgent(accountId)) {
        fail(res, 404, "KEYHALT_CONSOLE_UNKNOWN_AGENT", `account is not configured: ${accountId}`);
        return;
      }
      const current = snapshot.agentPayload(accountId);
      if (current === null || !current.detailsReady) {
        await waitForData(accountId, 8_000);
      }
      const payload = snapshot.agentPayload(accountId);
      if (payload === null) {
        fail(res, 503, "KEYHALT_CONSOLE_LOADING", "agent snapshot is not ready yet");
        return;
      }
      json(res, 200, payload);
      return;
    }

    if (path === "/api/timeline") {
      const accountId = url.searchParams.get("account") ?? undefined;
      if (accountId !== undefined && !snapshot.hasAgent(accountId)) {
        fail(res, 404, "KEYHALT_CONSOLE_UNKNOWN_AGENT", `account is not configured: ${accountId}`);
        return;
      }
      const rawLimit = url.searchParams.get("limit");
      let limit = 200;
      if (rawLimit !== null) {
        const parsed = Number(rawLimit);
        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
          fail(res, 400, "KEYHALT_CONSOLE_BAD_ARGS", "limit must be 1..500");
          return;
        }
        limit = parsed;
      }
      json(res, 200, snapshot.timelinePayload(limit, accountId));
      return;
    }

    if (path === "/api/audit-export") {
      const accountId = url.searchParams.get("account");
      if (accountId === null || accountId === "") {
        fail(res, 400, "KEYHALT_CONSOLE_BAD_ARGS", "missing account query parameter");
        return;
      }
      if (!snapshot.hasAgent(accountId)) {
        fail(res, 404, "KEYHALT_CONSOLE_UNKNOWN_AGENT", `account is not configured: ${accountId}`);
        return;
      }
      await waitForData(accountId, 8_000);
      const exported = await snapshot.auditExport(accountId);
      if (exported === null) {
        fail(res, 503, "KEYHALT_CONSOLE_LOADING", "audit chain is not ready yet");
        return;
      }
      const body = JSON.stringify(exported, null, 2);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${accountId}-audit.json"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    if (path === "/api/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write("retry: 3000\n\n");
      const client: SseClient = { res };
      clients.add(client);
      const current = snapshot.keyhaltPayload();
      res.write(
        `event: init\ndata: ${JSON.stringify({
          status: current.status,
          headBlock: current.headBlock,
          pinnedBlock: current.pinnedBlock,
          lastGoodBlock: current.lastGoodBlock,
          stale: current.stale,
          events: current.timeline.events,
        })}\n\n`,
      );
      const heartbeat = setInterval(() => {
        try {
          res.write(": keep-alive\n\n");
        } catch {
          clients.delete(client);
          clearInterval(heartbeat);
        }
      }, 15_000);
      heartbeat.unref?.();
      req.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(client);
      });
      return;
    }

    if (path.startsWith("/api/")) {
      fail(res, 404, "KEYHALT_CONSOLE_NOT_FOUND", `no route for ${path}`);
      return;
    }

    if (path === "/" || path === "/index.html") {
      const file = safeJoin(config.webRoot, "index.html");
      if (file !== null && serveFile(req, res, file, "no-store")) return;
      fail(res, 404, "KEYHALT_CONSOLE_NOT_FOUND", "console build missing web/index.html");
      return;
    }

    if (path === "/claims.md" || path === "/threat-model.md") {
      const file =
        path === "/claims.md"
          ? config.claimsPath
          : resolve(config.repoRoot, "docs/THREAT_MODEL.md");
      if (serveFile(req, res, file, "no-store")) return;
      fail(res, 404, "KEYHALT_CONSOLE_NOT_FOUND", `${path} is not available`);
      return;
    }

    if (path.startsWith("/fonts/")) {
      const file = safeJoin(config.fontsRoot, path.slice("/fonts/".length));
      if (file !== null && serveFile(req, res, file, "public, max-age=31536000, immutable")) {
        return;
      }
      fail(res, 404, "KEYHALT_CONSOLE_NOT_FOUND", "font not found");
      return;
    }

    const file = safeJoin(config.webRoot, path);
    if (file !== null && serveFile(req, res, file, "no-store")) return;
    fail(res, 404, "KEYHALT_CONSOLE_NOT_FOUND", `not found: ${path}`);
  }

  return {
    server,
    snapshot,
    feed,
    pool,
    address(): { port: number; host: string } | null {
      const address = server.address();
      if (address === null || typeof address === "string") return null;
      return { port: address.port, host: address.address };
    },
    start(port = config.port, host = config.host): Promise<{ port: number; host: string }> {
      return new Promise((resolveStart, rejectStart) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening);
          rejectStart(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          watcher.start();
          feed.start();
          const address = server.address();
          if (address === null || typeof address === "string") {
            rejectStart(new Error("server has no TCP address"));
            return;
          }
          resolveStart({ port: address.port, host });
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    async stop(): Promise<void> {
      stopped = true;
      feed.stop();
      watcher.stop();
      for (const client of clients) {
        try {
          client.res.end();
        } catch {
          // already closed
        }
      }
      clients.clear();
      await new Promise<void>((resolveStop) => {
        server.close(() => resolveStop());
        server.closeAllConnections?.();
      });
    },
  };
}
