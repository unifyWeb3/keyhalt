/**
 * Provider pool for read-only NEAR JSON-RPC.
 *
 * A single request may fail over across providers, but the whole loop is
 * bounded by `maxRetryMs` (at most two minutes). Rate-limited or failing
 * providers get a cooldown instead of being hammered. There is no write
 * method in this file.
 */

import type { ProviderConfig } from "./config.js";

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: { retryable: boolean; status?: number | null }) {
    super(message);
    this.name = "ProviderError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

export interface ProviderStat {
  name: string;
  url: string;
  archival: boolean;
  requests: number;
  ok: number;
  fail: number;
  lastError: string | null;
  lastOkAt: string | null;
  lastFailAt: string | null;
  cooldownUntil: string | null;
  coolingDown: boolean;
}

interface ProviderState {
  config: ProviderConfig;
  requests: number;
  ok: number;
  fail: number;
  lastError: string | null;
  lastOkAt: number | null;
  lastFailAt: number | null;
  cooldownUntil: number;
}

export interface AttemptOptions {
  archival?: boolean;
  deadlineMs?: number;
  /** Per-attempt timeout for an SDK call that does not expose a signal. */
  attemptTimeoutMs?: number;
}

const DEFAULT_DEADLINE_MS = 20_000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 9_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? error).slice(0, 300);
}

function classify(error: unknown): {
  retryable: boolean;
  cooldown: boolean;
  message: string;
} {
  if (error instanceof ProviderError) {
    return {
      retryable: error.retryable,
      cooldown: error.status === 429 || (error.status ?? 0) >= 500,
      message: error.message,
    };
  }
  const code = (error as { code?: unknown })?.code;
  const message = messageOf(error);
  if (code === "KEYHALT_E_MAINNET") {
    return { retryable: false, cooldown: false, message };
  }
  if (code === "KEYHALT_E_RPC") {
    return { retryable: true, cooldown: false, message };
  }
  return {
    retryable: /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|aborted|timeout|429|5\d\d|rate limit|too many/i.test(
      message,
    ),
    cooldown: /429|rate limit|too many/i.test(message),
    message,
  };
}

interface RpcEnvelope {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
    cause?: { name?: string; info?: unknown };
  } | null;
}

function rpcErrorOf(envelope: RpcEnvelope): ProviderError | null {
  const error = envelope.error;
  if (error === undefined || error === null) return null;
  const name = String(error.cause?.name ?? "");
  const detail = `${error.message ?? ""} ${JSON.stringify(error.data ?? "")}`;
  const retryable =
    /UNKNOWN_TRANSACTION|UNKNOWN_BLOCK|UNKNOWN_CHUNK|UNKNOWN_ACCOUNT|TIMEOUT|UNAVAILABLE/i.test(
      `${name} ${detail}`,
    ) || /rate limit|too many|timeout|unavailable/i.test(detail);
  const status =
    error.code === -32_905 || /UNKNOWN_TRANSACTION|UNKNOWN_BLOCK|UNKNOWN_CHUNK/i.test(name)
      ? null
      : error.code ?? null;
  return new ProviderError(
    `RPC ${name || error.code || "error"}: ${(error.message ?? "request failed").slice(0, 240)}`,
    { retryable, status },
  );
}

export class ProviderPool {
  private readonly states: ProviderState[];
  private readonly nextStart = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly maxRetryMs: number;

  constructor(providers: ProviderConfig[], options: { maxRetryMs?: number } = {}) {
    if (providers.length === 0) {
      throw new Error("console needs at least one read-only RPC provider");
    }
    for (const provider of providers) {
      if (/mainnet/i.test(provider.url)) {
        throw new Error(`refusing mainnet RPC URL: ${provider.url}`);
      }
    }
    this.states = providers.map((provider) => ({
      config: provider,
      requests: 0,
      ok: 0,
      fail: 0,
      lastError: null,
      lastOkAt: null,
      lastFailAt: null,
      cooldownUntil: 0,
    }));
    this.maxRetryMs = Math.min(options.maxRetryMs ?? 120_000, 120_000);
  }

  private providers(archival: boolean): ProviderState[] {
    return this.states.filter((state) => state.config.archival === archival);
  }

  private async pace(state: ProviderState): Promise<void> {
    const url = state.config.url;
    const previous = this.queues.get(url) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait = Math.max(0, (this.nextStart.get(url) ?? 0) - Date.now());
      if (wait > 0) await sleep(wait);
      this.nextStart.set(url, Date.now() + state.config.pacingMs);
    });
    // Keep the chain alive even if a caller is cancelled by the deadline.
    this.queues.set(url, run.catch(() => undefined));
    await run;
  }

  async attempt<T>(
    options: AttemptOptions,
    fn: (provider: ProviderConfig) => Promise<T>,
  ): Promise<T> {
    const list = this.providers(options.archival === true);
    if (list.length === 0) {
      throw new ProviderError(
        `no ${options.archival === true ? "archival " : ""}RPC provider configured`,
        { retryable: false },
      );
    }
    const deadline =
      Date.now() +
      Math.min(options.deadlineMs ?? DEFAULT_DEADLINE_MS, this.maxRetryMs);
    const attemptTimeout = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    let lastError: ProviderError | null = null;

    while (Date.now() < deadline) {
      if (list.every((state) => state.cooldownUntil > Date.now())) {
        const soonest = Math.min(...list.map((state) => state.cooldownUntil));
        if (soonest - Date.now() > 2_000 || soonest > deadline) {
          throw new ProviderError(
            "all RPC providers are cooling down after rate limits",
            { retryable: false },
          );
        }
        await sleep(Math.max(0, soonest - Date.now()));
      }
      for (const state of list) {
        if (Date.now() >= deadline) break;
        if (state.cooldownUntil > Date.now()) continue;
        await this.pace(state);
        state.requests += 1;
        const remaining = Math.max(250, deadline - Date.now());
        try {
          const value = await this.withTimeout(
            fn(state.config),
            Math.min(attemptTimeout, remaining),
          );
          state.ok += 1;
          state.lastOkAt = Date.now();
          state.lastError = null;
          return value;
        } catch (error) {
          const verdict = classify(error);
          state.fail += 1;
          state.lastFailAt = Date.now();
          state.lastError = verdict.message;
          if (verdict.cooldown) {
            state.cooldownUntil = Date.now() + state.config.cooldownMs;
          }
          lastError = new ProviderError(verdict.message, {
            retryable: verdict.retryable,
          });
          if (!verdict.retryable) throw lastError;
        }
      }
      if (Date.now() < deadline) await sleep(400);
    }
    throw new ProviderError(
      lastError
        ? `RPC retry budget exhausted: ${lastError.message}`
        : "RPC retry budget exhausted",
      { retryable: false },
    );
  }

  async call<T>(
    method: string,
    params: unknown,
    options: AttemptOptions = {},
  ): Promise<T> {
    return this.attempt(options, async (provider) => {
      let response: Response;
      try {
        response = await fetch(provider.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "keyhalt-console", method, params }),
          signal: AbortSignal.timeout(9_000),
        });
      } catch (error) {
        throw new ProviderError(messageOf(error), { retryable: true });
      }
      if (!response.ok) {
        throw new ProviderError(`HTTP ${response.status} from ${provider.name}`, {
          retryable: response.status === 429 || response.status >= 500,
          status: response.status,
        });
      }
      const envelope = (await response.json()) as RpcEnvelope;
      const rpcError = rpcErrorOf(envelope);
      if (rpcError !== null) throw rpcError;
      if (envelope.result === undefined) {
        throw new ProviderError(`empty result from ${provider.name}`, {
          retryable: true,
        });
      }
      return envelope.result as T;
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new ProviderError(`RPC attempt timed out after ${ms} ms`, { retryable: true })),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  stats(): ProviderStat[] {
    const now = Date.now();
    return this.states.map((state) => ({
      name: state.config.name,
      url: state.config.url,
      archival: state.config.archival,
      requests: state.requests,
      ok: state.ok,
      fail: state.fail,
      lastError: state.lastError,
      lastOkAt: state.lastOkAt === null ? null : new Date(state.lastOkAt).toISOString(),
      lastFailAt: state.lastFailAt === null ? null : new Date(state.lastFailAt).toISOString(),
      cooldownUntil:
        state.cooldownUntil > now ? new Date(state.cooldownUntil).toISOString() : null,
      coolingDown: state.cooldownUntil > now,
    }));
  }

  /** The provider label most recently used successfully, for the footer. */
  primaryLabel(): string {
    return this.states.find((state) => !state.config.archival)?.config.name ?? "RPC";
  }
}
