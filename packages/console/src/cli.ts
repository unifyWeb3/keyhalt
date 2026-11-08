#!/usr/bin/env node
/**
 * Keyhalt console runner.
 *
 *   node packages/console/dist/cli.js
 *   KEYHALT_CONSOLE_ACCOUNTS= node packages/console/dist/cli.js
 *
 * This process has no signer and no write route. It binds loopback by default.
 */

import { loadConfig } from "./config.js";
import { createConsoleServer } from "./server.js";

const HELP = `Keyhalt console v0.3.0: read-only testnet console

Usage:
  keyhalt-console [--port N] [--host HOST] [--json]

Environment:
  KEYHALT_CONSOLE_ACCOUNTS       comma-separated controllers; empty string = empty state
  KEYHALT_CONSOLE_PORT           default 4173
  KEYHALT_CONSOLE_HOST           default 127.0.0.1 (loopback only unless explicitly overridden)
  KEYHALT_CONSOLE_PROVIDERS      comma-separated read-only RPC URLs
  KEYHALT_CONSOLE_WATCH_FILE     runtime tx watch list (default tmp/console-watch.json)
  KEYHALT_CONSOLE_SEED_TXS       comma-separated receipts to seed the timeline
  KEYHALT_CONSOLE_BLOCK_POLL_MS  default 1000
  KEYHALT_CONSOLE_STALE_AFTER_MS default 12000

The console never signs, stores a key, or calls a write method.
`;

interface Args {
  port: number | null;
  host: string | null;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: null, host: null, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--port") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--port needs a value");
      const port = Number(value);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`--port must be 1..65535, got ${value}`);
      }
      args.port = port;
      index += 1;
    } else if (arg === "--host") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--host needs a value");
      args.host = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String((error as Error).message));
    console.error("Run with --help for usage.");
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const config = loadConfig();
  const running = createConsoleServer(config);
  try {
    const address = await running.start(args.port ?? config.port, args.host ?? config.host);
    const url = `http://${address.host === "::1" ? "[::1]" : address.host}:${address.port}`;
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          url,
          host: address.host,
          port: address.port,
          readOnly: true,
          noSigner: true,
          agents: config.agents.map((agent) => agent.accountId),
        })}\n`,
      );
    } else {
      process.stdout.write(
        [
          "Keyhalt console v0.3.0: read-only testnet console",
          `  ${url}`,
          `  agents: ${
            config.agents.length === 0
              ? "none (empty state; set KEYHALT_CONSOLE_ACCOUNTS to read agents)"
              : config.agents.map((agent) => agent.accountId).join(", ")
          }`,
          `  rpc: ${config.providers.map((provider) => provider.name).join(" → ")} (failover; retry cap ${config.maxRetryMs} ms)`,
          "  mode: read-only; no signer, no write methods",
          "  stop: Ctrl-C",
          "",
        ].join("\n"),
      );
    }
    const shutdown = (): void => {
      void running.stop().then(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error(`Keyhalt console failed to start: ${String((error as Error).message)}`);
    process.exit(1);
  }
}

await main();
