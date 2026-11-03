#!/usr/bin/env node
/**
 * Read-only NEAR testnet RPC check.
 *
 * Refuses mainnet configuration. Never reads or writes a key.
 */

const url = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";

if (process.env.NEAR_MAINNET) {
  console.error("RPC CHECK: FAIL: NEAR_MAINNET is set; FLEET is testnet-only");
  process.exit(1);
}
if (/mainnet/i.test(url)) {
  console.error(`RPC CHECK: FAIL: refusing mainnet endpoint ${url}`);
  process.exit(1);
}

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "fleet-phase1-rpc-check",
      method: "status",
      params: [],
    }),
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.error(`RPC CHECK: FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (!response.ok) {
  console.error(`RPC CHECK: FAIL: HTTP ${response.status}`);
  process.exit(1);
}

const json = await response.json();
const chainId = json?.result?.chain_id;
if (chainId !== "testnet") {
  console.error(`RPC CHECK: FAIL: expected testnet, got ${String(chainId)}`);
  process.exit(1);
}

const height = json?.result?.sync_info?.latest_block_height;
console.log(`RPC CHECK: OK testnet latest_block_height=${String(height)}`);
