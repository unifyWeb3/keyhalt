#!/usr/bin/env node
/**
 * Read-only NEAR testnet RPC check.
 *
 * Refuses mainnet configuration. Never reads or writes a key.
 *
 * A public RPC can be transiently unavailable. The check retries three times;
 * if it still fails, it is a SKIP by default so local reproduction does not
 * depend on a third-party service. Set FLEET_REQUIRE_RPC=1 to make it fatal.
 */

const url = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const required = process.env.FLEET_REQUIRE_RPC === "1";

if (process.env.NEAR_MAINNET) {
  console.error("RPC CHECK: FAIL: NEAR_MAINNET is set; FLEET is testnet-only");
  process.exit(1);
}
if (/mainnet/i.test(url)) {
  console.error(`RPC CHECK: FAIL: refusing mainnet endpoint ${url}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastError = "unknown";

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `fleet-phase1-rpc-check-${attempt}`,
        method: "status",
        params: [],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      lastError = `HTTP ${response.status}`;
    } else {
      const json = await response.json();
      const chainId = json?.result?.chain_id;
      if (chainId !== "testnet") {
        console.error(`RPC CHECK: FAIL: expected testnet, got ${String(chainId)}`);
        process.exit(1);
      }
      const height = json?.result?.sync_info?.latest_block_height;
      console.log(`RPC CHECK: OK testnet latest_block_height=${String(height)} (attempt ${attempt}/3)`);
      process.exit(0);
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  if (attempt < 3) await sleep(attempt * 1_000);
}

if (required) {
  console.error(`RPC CHECK: FAIL after 3 attempts: ${lastError}`);
  process.exit(1);
}
console.log(`RPC CHECK: SKIP (testnet RPC unavailable after 3 attempts: ${lastError})`);
console.log("Set FLEET_REQUIRE_RPC=1 to make this failure fatal.");
