#!/usr/bin/env node
/**
 * fleet-mcp — read-only FLEET MCP server on stdio.
 *
 *   node packages/mcp/dist/cli.js [--rpc-url URL]
 *
 * Reads newline-delimited JSON-RPC 2.0 from stdin, writes responses to
 * stdout, and logs nothing else to stdout (diagnostics go to stderr).
 */

import { createInterface } from "node:readline";

import {
  FleetMcpService,
  MCP_SERVER_VERSION,
  handleRpc,
  type JsonRpcRequest,
} from "./index.js";

import { DEFAULT_TESTNET_RPC } from "@fleet/sdk";

function parseRpcUrl(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--rpc-url") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--rpc-url needs a value");
      if (/mainnet/i.test(value)) {
        throw new Error("FLEET is testnet-only; mainnet RPC URLs are refused");
      }
      return value;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        `fleet-mcp ${MCP_SERVER_VERSION} — read-only FLEET MCP server\n\nUsage:\n  fleet-mcp [--rpc-url URL]\n`,
      );
      process.exit(0);
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  const fromEnv = process.env.FLEET_MCP_RPC_URL ?? process.env.FLEET_RPC_URL;
  if (fromEnv !== undefined && /mainnet/i.test(fromEnv)) {
    throw new Error("FLEET is testnet-only; mainnet RPC URLs are refused");
  }
  return fromEnv ?? DEFAULT_TESTNET_RPC;
}

const rpcUrl = parseRpcUrl(process.argv.slice(2));
const service = new FleetMcpService({ rpcUrl });

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const text = line.trim();
    if (text.length === 0) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(text) as JsonRpcRequest;
    } catch {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        })}\n`,
      );
      continue;
    }
    if (request.method === undefined || request.jsonrpc !== "2.0") {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id ?? null,
          error: { code: -32600, message: "Invalid Request" },
        })}\n`,
      );
      continue;
    }
    const response = await handleRpc(service, request);
    if (response !== undefined) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`fleet-mcp: ${String(error)}\n`);
  process.exit(1);
});
