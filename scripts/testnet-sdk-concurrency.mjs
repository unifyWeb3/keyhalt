#!/usr/bin/env node
/**
 * Keyhalt v0.3: twelve concurrent SDK calls on NEAR testnet.
 *
 * Testnet only. No mainnet, no spend, no registration.
 *
 * The script drives the published TypeScript SDK (packages/sdk), not the raw
 * RPC helper: every call goes through `createKeyhaltClient(...).execute(...)`,
 * signs locally with an operator key, and waits for a final receipt.
 *
 * The agent is the dedicated Mode A latency agent
 * (agent-lat.fleet-lat-1a1a7db6741.testnet). Its four operator keys are
 * FunctionCall-only keys on the agent itself, so the operator has no
 * FullAccess key on any account. Twelve calls are spread over the four
 * operator keys (three each).
 *
 * Usage:
 *   node scripts/testnet-sdk-concurrency.mjs
 *
 * Environment:
 *   KEYHALT_RPC           RPC URL (default: https://rpc.testnet.fastnear.com)
 *   KEYHALT_SDK_AGENT     agent account id
 *   KEYHALT_SDK_KEY_ROOT  directory with the agent key files
 *   KEYHALT_SDK_CALLS     number of concurrent calls (default: 12)
 *
 * Evidence: evidence/sdk-v03/concurrency.json
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createKeyhaltClient } from "../packages/sdk/dist/index.js";

const RPC = process.env.KEYHALT_RPC || "https://rpc.testnet.fastnear.com";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  console.error("refusing to run against mainnet");
  process.exit(2);
}

const AGENT =
  process.env.KEYHALT_SDK_AGENT || "agent-lat.fleet-lat-1a1a7db6741.testnet";
const KEY_ROOT =
  process.env.KEYHALT_SDK_KEY_ROOT || "/root/.near-fallback-keys/fleet-v03/modeb";
const CALLS = Number(process.env.KEYHALT_SDK_CALLS ?? 12);
const OPERATORS = 4;
const RECEIVER_METHOD = "ping";
const EVIDENCE = resolve("evidence/sdk-v03/concurrency.json");

const root = fileURLToPath(new URL("..", import.meta.url));
void root;

function keyPath(accountId, role) {
  return join(KEY_ROOT, `${accountId.replaceAll(".", "_")}__${role}.json`);
}

function loadSecret(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const secret = value.secret_key ?? value.private_key;
  if (!secret) throw new Error(`missing secret key in ${path}`);
  return secret;
}

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isTransient(message) {
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|timeout|\b(429|500|502|503|504)\b/i.test(
    message,
  );
}

async function main() {
  const secrets = [];
  for (let index = 0; index < OPERATORS; index += 1) {
    secrets.push(loadSecret(keyPath(AGENT, `operator-${index}`)));
  }

  const clients = secrets.map((secret) =>
    createKeyhaltClient({ rpcUrl: RPC, accountId: AGENT, signer: secret }),
  );

  const state = await clients[0].getState();
  if (state.paused) {
    throw new Error("agent is frozen; unfreeze it before the concurrency run");
  }
  if (!state.provisioned) {
    throw new Error("agent is not provisioned");
  }

  console.log(`[sdk-concurrency] rpc=${RPC} agent=${AGENT} calls=${CALLS}`);

  const started = nowMs();
  const results = await Promise.all(
    Array.from({ length: CALLS }, async (_unused, index) => {
      const operator = index % OPERATORS;
      const client = clients[operator];
      const begin = nowMs();
      const errors = [];
      // A transient RPC error (fetch failed, timeout, 5xx) is retried with a
      // fresh nonce. Every attempt is recorded, so the evidence shows what
      // happened rather than only the final outcome.
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const result = await client.execute(AGENT, RECEIVER_METHOD, "{}", 10);
          return {
            index,
            operator,
            ok: true,
            attempts: attempt,
            first_errors: errors,
            tx_hash: result.txHash,
            block_height: result.blockHeight,
            gas_burnt: result.gasBurnt ?? null,
            refusal: result.refusal,
            elapsed_ms: nowMs() - begin,
          };
        } catch (error) {
          const message = String(error?.message ?? error);
          errors.push(message);
          if (!isTransient(message) || attempt === 3) {
            return {
              index,
              operator,
              ok: false,
              attempts: attempt,
              first_errors: errors,
              tx_hash: null,
              block_height: null,
              gas_burnt: null,
              refusal: message,
              elapsed_ms: nowMs() - begin,
            };
          }
          await sleep(1000 * attempt);
        }
      }
      throw new Error("unreachable");
    }),
  );
  const elapsed = nowMs() - started;

  const succeeded = results.filter((row) => row.ok).length;
  const report = {
    generated_at: new Date().toISOString(),
    network: "testnet",
    rpc: RPC,
    agent: AGENT,
    sdk_version: "0.3.0",
    path: "packages/sdk createKeyhaltClient().execute()",
    calls: CALLS,
    operators: OPERATORS,
    succeeded,
    failed: CALLS - succeeded,
    elapsed_ms: elapsed,
    receiver_method: RECEIVER_METHOD,
    results,
  };

  mkdirSync(dirname(EVIDENCE), { recursive: true, mode: 0o700 });
  writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  console.log(
    `[sdk-concurrency] ${succeeded}/${CALLS} succeeded in ${elapsed} ms -> ${EVIDENCE}`,
  );
  if (succeeded !== CALLS) {
    for (const row of results.filter((entry) => !entry.ok)) {
      console.error(`  call ${row.index}: ${row.refusal}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
