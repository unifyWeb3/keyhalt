/**
 * Console configuration. Everything here is read-only: there is deliberately
 * no field for a signer, key file, seed phrase, or write method.
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentConfig {
  accountId: string;
  label: string;
}

export interface ProviderConfig {
  name: string;
  url: string;
  archival: boolean;
  /** Minimum gap between request starts for this provider. */
  pacingMs: number;
  /** How long to skip a provider after a rate-limit/server failure. */
  cooldownMs: number;
}

export interface ConsoleConfig {
  host: string;
  port: number;
  repoRoot: string;
  webRoot: string;
  fontsRoot: string;
  claimsPath: string;
  agents: AgentConfig[];
  providers: ProviderConfig[];
  archivalProviders: ProviderConfig[];
  seedTxs: string[];
  watchFile: string;
  cacheDir: string;
  blockPollMs: number;
  detailEveryBlocks: number;
  watchPollMs: number;
  staleAfterMs: number;
  /** Hard upper bound for a single failover loop. */
  maxRetryMs: number;
  modeBAccountId: string;
  modeBUrl: string;
}

export const CANONICAL_AGENTS: AgentConfig[] = [
  { accountId: "agent-1b.fleet-v03-5cff9e99.testnet", label: "agent-1b" },
  { accountId: "agent-2.fleet-v03-5cff9e99.testnet", label: "agent-2" },
  { accountId: "agent-3.fleet-v03-5cff9e99.testnet", label: "agent-3" },
];

export const MODE_B_ACCOUNT = "agent-b1.fleet-modeb-748d4372.testnet";
export const MODE_B_URL = `https://testnet.nearblocks.io/account/${MODE_B_ACCOUNT}`;

/**
 * Public testnet lifecycle receipts already recorded in `evidence/`. They are
 * seed candidates only: the server still fetches each receipt from an archival
 * RPC and never renders a row the chain did not return.
 */
export const SEED_TXS = [
  "7tqiVYBosLgGE37C58xEoFCXypw5GFvYcQoowG2JGMeP",
  "FnEEzuhSRTKSMPR6ox1MuLJiJqEj1qpsZBNufZzVvyhF",
  "5LuCwM3Nv3WX2awA6jV4U5AKY29GVcVKMXj6hBxkQc2m",
  "5piMKPcwkEokqNiX6CqdQibjchSdD3wzHczKqseh8iN",
  "283uKM9bcWhGNVe4tg9NUSXXbjtNjQFGBpF5pARfWiGc",
  "4pCwwpqDRWzd9SQmeJHdu3EHNriaZWn8gv3CPKGtREdg",
  "C17ztrDHerug5ysYKvFWAFuz15davmD5XX59bRkxo9ci",
  "4ho3w5H3MQqb1T6xE2jyYatmPBWYBR1vr74gYF9Lfa1n",
  "CmQsxdxF48sVbzpX4uHjXrXWJyypT7umkA5hbztfxt8o",
];

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: "FastNEAR",
    url: "https://rpc.testnet.fastnear.com",
    archival: false,
    pacingMs: 250,
    cooldownMs: 30_000,
  },
  {
    name: "dRPC",
    url: "https://near-testnet.drpc.org",
    archival: false,
    pacingMs: 200,
    cooldownMs: 30_000,
  },
  {
    name: "NEAR Foundation",
    url: "https://rpc.testnet.near.org",
    archival: false,
    pacingMs: 2_100,
    cooldownMs: 60_000,
  },
  {
    name: "Intear",
    url: "https://testnet-rpc.intea.rs",
    archival: false,
    pacingMs: 500,
    cooldownMs: 30_000,
  },
];

const DEFAULT_ARCHIVAL_PROVIDERS: ProviderConfig[] = [
  {
    name: "FastNEAR archival",
    url: "https://archival-rpc.testnet.fastnear.com",
    archival: true,
    pacingMs: 1_500,
    cooldownMs: 120_000,
  },
  {
    name: "NEAR Foundation archival",
    url: "https://archival-rpc.testnet.near.org",
    archival: true,
    pacingMs: 3_100,
    cooldownMs: 120_000,
  },
];

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined ? undefined : value;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = env(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer ${min}..${max}, got ${raw}`);
  }
  return value;
}

function parseAccounts(raw: string | undefined): AgentConfig[] {
  if (raw === undefined) return CANONICAL_AGENTS;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const seen = new Set<string>();
  return ids.map((accountId) => {
    if (!/^[a-z0-9._-]+$/.test(accountId)) {
      throw new Error(`invalid testnet account id in FLEET_CONSOLE_ACCOUNTS: ${accountId}`);
    }
    if (seen.has(accountId)) {
      throw new Error(`duplicate account id in FLEET_CONSOLE_ACCOUNTS: ${accountId}`);
    }
    seen.add(accountId);
    const label = accountId.split(".")[0] ?? accountId;
    return { accountId, label };
  });
}

function parseTxList(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  const list = raw
    .split(",")
    .map((tx) => tx.trim())
    .filter((tx) => tx.length > 0);
  for (const tx of list) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(tx)) {
      throw new Error(`invalid transaction hash in FLEET_CONSOLE_SEED_TXS: ${tx}`);
    }
  }
  return list;
}

function resolveRoot(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function parseProviders(
  raw: string | undefined,
  fallback: ProviderConfig[],
  archival: boolean,
): ProviderConfig[] {
  if (raw === undefined || raw.trim() === "") return fallback;
  const urls = raw.split(",").map((url) => url.trim()).filter(Boolean);
  return urls.map((url, index) => {
    if (/mainnet/i.test(url)) {
      throw new Error(`refusing mainnet RPC URL in console configuration: ${url}`);
    }
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`RPC URL must start with http(s)://: ${url}`);
    }
    const base = fallback[index] ?? fallback[fallback.length - 1];
    return {
      name: `${archival ? "archival " : ""}custom-${index + 1}`,
      url,
      archival,
      pacingMs: base?.pacingMs ?? 500,
      cooldownMs: base?.cooldownMs ?? 30_000,
    };
  });
}

export function loadConfig(): ConsoleConfig {
  const repoRoot = resolveRoot(env("FLEET_CONSOLE_ROOT"));
  const port = envInt("FLEET_CONSOLE_PORT", 4173, 1, 65_535);
  const host = env("FLEET_CONSOLE_HOST") ?? "127.0.0.1";
  if (!/^(127\.0\.0\.1|localhost|::1)$/.test(host) && env("FLEET_CONSOLE_ALLOW_REMOTE") !== "1") {
    throw new Error(
      `FLEET_CONSOLE_HOST=${host} is not loopback; set FLEET_CONSOLE_ALLOW_REMOTE=1 to override`,
    );
  }
  const providers = parseProviders(
    env("FLEET_CONSOLE_PROVIDERS"),
    DEFAULT_PROVIDERS,
    false,
  );
  const archivalProviders = parseProviders(
    env("FLEET_CONSOLE_ARCHIVAL_PROVIDERS"),
    DEFAULT_ARCHIVAL_PROVIDERS,
    true,
  );
  return {
    host,
    port,
    repoRoot,
    webRoot: resolve(repoRoot, "web"),
    fontsRoot: resolve(repoRoot, "design/fonts"),
    claimsPath: resolve(repoRoot, "CLAIMS.md"),
    agents: parseAccounts(env("FLEET_CONSOLE_ACCOUNTS")),
    providers,
    archivalProviders,
    seedTxs: parseTxList(env("FLEET_CONSOLE_SEED_TXS"), SEED_TXS),
    watchFile:
      env("FLEET_CONSOLE_WATCH_FILE") === undefined
        ? resolve(repoRoot, "tmp/console-watch.json")
        : resolveRoot(env("FLEET_CONSOLE_WATCH_FILE")),
    cacheDir:
      env("FLEET_CONSOLE_CACHE_DIR") === undefined
        ? resolve(repoRoot, "tmp/console-cache")
        : resolveRoot(env("FLEET_CONSOLE_CACHE_DIR")),
    blockPollMs: envInt("FLEET_CONSOLE_BLOCK_POLL_MS", 1_000, 250, 60_000),
    detailEveryBlocks: envInt("FLEET_CONSOLE_DETAIL_BLOCKS", 5, 1, 1_000),
    watchPollMs: envInt("FLEET_CONSOLE_WATCH_POLL_MS", 2_000, 500, 60_000),
    staleAfterMs: envInt("FLEET_CONSOLE_STALE_AFTER_MS", 12_000, 1_000, 600_000),
    maxRetryMs: envInt("FLEET_CONSOLE_MAX_RETRY_MS", 120_000, 5_000, 120_000),
    modeBAccountId: MODE_B_ACCOUNT,
    modeBUrl: MODE_B_URL,
  };
}

export interface ClaimsCount {
  verified: number;
  total: number;
}

/** Count the claim table so the footer never hard-codes a number. */
export function readClaimsCount(path: string): ClaimsCount {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { verified: 0, total: 0 };
  }
  // Mirror scripts/check-claims.mjs: rows inside fenced code blocks are
  // documentation templates, not claims.
  let inFence = false;
  let verified = 0;
  let total = 0;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!/^\|\s*F-\d{3}\s*\|/.test(line)) continue;
    total += 1;
    if (/\|\s*VERIFIED\s*\|/.test(line)) verified += 1;
  }
  return { verified, total };
}
