#!/usr/bin/env node
/**
 * Keyhalt v0.3: repeated 12-call, 3-agent concurrency measurement.
 *
 * Testnet only. No mainnet, no spend on anything but gas, no registration.
 *
 * This script replays the 12-call scenario (3 agents × 4 operator keys) through
 * the published TypeScript SDK at least 50 times by default. Its purpose is a
 * measured success rate, not a throughput demo: every attempt of every call is
 * recorded, including failures and their causes, so the public claim can quote
 * the measured rate exactly.
 *
 * Agents used (all must have four active operator keys and be unfrozen):
 *   agent-2.fleet-v03-5cff9e99.testnet
 *   agent-3.fleet-v03-5cff9e99.testnet
 *   agent-lat.fleet-lat-1a1a7db6741.testnet
 *
 * `agent-1b` is not used: the canonical lifecycle run revoked two of its
 * operators, so it no longer carries four active keys.
 *
 * Usage:
 *   node scripts/testnet-concurrency-50x.mjs
 *
 * Environment:
 *   KEYHALT_RPC     RPC URL (default: https://rpc.testnet.fastnear.com)
 *   KEYHALT_ROUNDS  number of rounds (default: 50)
 *   KEYHALT_PACE_MS pause between rounds (default: 3000)
 *   KEYHALT_LONG_PAUSE_MS   longer pause every ten rounds (default: 60000)
 *
 * Evidence: evidence/sdk-v03/concurrency-50x.json
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createKeyhaltClient } from "../packages/sdk/dist/index.js";

const RPC = process.env.KEYHALT_RPC || "https://rpc.testnet.fastnear.com";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  console.error("refusing to run against mainnet");
  process.exit(2);
}

const ROUNDS = Number(process.env.KEYHALT_ROUNDS ?? 50);
const PACE_MS = Number(process.env.KEYHALT_PACE_MS ?? 3000);
const LONG_PAUSE_MS = Number(process.env.KEYHALT_LONG_PAUSE_MS ?? 60000);
const CALL_TIMEOUT_MS = Number(process.env.KEYHALT_CALL_TIMEOUT_MS ?? 90000);
const METHOD = "ping";
const GAS_TGAS = 10;
const EVIDENCE = resolve("evidence/sdk-v03/concurrency-50x.json");

const AGENTS = [
  {
    id: "agent-2.fleet-v03-5cff9e99.testnet",
    dir: "/root/.near-fallback-keys/fleet-v03/e2e",
    base: "agent-2_fleet-v03-5cff9e99_testnet",
  },
  {
    id: "agent-3.fleet-v03-5cff9e99.testnet",
    dir: "/root/.near-fallback-keys/fleet-v03/e2e",
    base: "agent-3_fleet-v03-5cff9e99_testnet",
  },
  {
    id: "agent-lat.fleet-lat-1a1a7db6741.testnet",
    dir: "/root/.near-fallback-keys/fleet-v03/modeb",
    base: "agent-lat_fleet-lat-1a1a7db6741_testnet",
  },
];
const OPERATORS_PER_AGENT = 4;

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

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`call timeout after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function main() {
  const clients = [];
  for (const agent of AGENTS) {
    const entry = [];
    for (let operator = 0; operator < OPERATORS_PER_AGENT; operator += 1) {
      const secret = loadSecret(join(agent.dir, `${agent.base}__operator-${operator}.json`));
      entry.push(
        createKeyhaltClient({ rpcUrl: RPC, accountId: agent.id, signer: secret }),
      );
    }
    clients.push({ agent, clients: entry });
  }

  // Pre-flight: every agent must be reachable, provisioned, and unfrozen.
  for (const { agent, clients: agentClients } of clients) {
    const state = await agentClients[0].getState();
    if (state.paused) throw new Error(`${agent.id} is frozen; unfreeze it first`);
    if (!state.provisioned) throw new Error(`${agent.id} is not provisioned`);
    console.log(`[concurrency-50x] ${agent.id} ready (unfrozen, provisioned)`);
  }

  console.log(
    `[concurrency-50x] rpc=${RPC} rounds=${ROUNDS} calls/round=12 pace=${PACE_MS}ms`,
  );

  const rounds = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const started = nowMs();
    const tasks = [];
    for (const { agent, clients: agentClients } of clients) {
      for (let operator = 0; operator < OPERATORS_PER_AGENT; operator += 1) {
        tasks.push({ agent: agent.id, operator, client: agentClients[operator] });
      }
    }

    const settled = await Promise.allSettled(
      tasks.map(async (task) => {
        const begin = nowMs();
        const errors = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const result = await withTimeout(
              task.client.execute(task.agent, METHOD, "{}", GAS_TGAS),
              CALL_TIMEOUT_MS,
            );
            return {
              agent: task.agent,
              operator: task.operator,
              ok: true,
              attempts: attempt,
              errors,
              tx_hash: result.txHash,
              block_height: result.blockHeight,
              elapsed_ms: nowMs() - begin,
            };
          } catch (error) {
            const message = String(error?.message ?? error);
            errors.push(message);
            if (!isTransient(message) || attempt === 3) {
              return {
                agent: task.agent,
                operator: task.operator,
                ok: false,
                attempts: attempt,
                errors,
                tx_hash: null,
                block_height: null,
                elapsed_ms: nowMs() - begin,
              };
            }
            await sleep(1000 * attempt);
          }
        }
        throw new Error("unreachable");
      }),
    );

    const calls = settled.map((outcome, index) => {
      if (outcome.status === "rejected") {
        return {
          agent: tasks[index].agent,
          operator: tasks[index].operator,
          ok: false,
          attempts: 0,
          errors: [String(outcome.reason?.message ?? outcome.reason)],
          tx_hash: null,
          block_height: null,
          elapsed_ms: null,
        };
      }
      return outcome.value;
    });

    const completed = calls.filter((row) => row.ok).length;
    const firstAttempt = calls.filter((row) => row.ok && row.attempts === 1).length;
    const retried = calls.filter((row) => row.ok && row.attempts > 1).length;
    const failed = calls.length - completed;
    const duration = nowMs() - started;
    rounds.push({ round, calls, completed, first_attempt: firstAttempt, retried, failed, duration_ms: duration });
    console.log(
      `[concurrency-50x] round ${round + 1}/${ROUNDS}: ${completed}/12 completed ` +
        `(${firstAttempt} first attempt, ${retried} after retry, ${failed} failed) in ${duration} ms`,
    );
    if (round + 1 < ROUNDS) {
      // The public endpoints throttle bursts: pace every round and add a
      // longer pause every ten rounds so the measurement runs under the
      // provider's rate-limit window instead of hitting 429s.
      const long = (round + 1) % 10 === 0;
      await sleep(long ? LONG_PAUSE_MS : PACE_MS);
    }
  }

  const allCalls = rounds.flatMap((round) => round.calls);
  const completed = allCalls.filter((row) => row.ok).length;
  const firstAttempt = allCalls.filter((row) => row.ok && row.attempts === 1).length;
  const retried = allCalls.filter((row) => row.ok && row.attempts > 1).length;
  const failures = allCalls
    .filter((row) => !row.ok)
    .map((row) => ({
      agent: row.agent,
      operator: row.operator,
      attempts: row.attempts,
      errors: row.errors,
    }));
  const transientRetries = allCalls
    .filter((row) => row.attempts > 1)
    .map((row) => ({
      agent: row.agent,
      operator: row.operator,
      ok: row.ok,
      attempts: row.attempts,
      errors: row.errors,
    }));

  const report = {
    generated_at: new Date().toISOString(),
    network: "testnet",
    rpc: RPC,
    path: "packages/sdk createKeyhaltClient().execute()",
    scenario: "12 concurrent calls per round, 3 agents x 4 operator keys",
    agents: AGENTS.map((agent) => agent.id),
    rounds: ROUNDS,
    calls_per_round: 12,
    total_calls: allCalls.length,
    completed,
    failed: allCalls.length - completed,
    first_attempt_successes: firstAttempt,
    completed_after_retry: retried,
    failure_cause_summary: [...new Set(failures.flatMap((row) => row.errors))],
    retry_cause_summary: [
      ...new Set(transientRetries.flatMap((row) => row.errors)),
    ],
    failures,
    transient_retries: transientRetries,
    round_summaries: rounds.map((round) => ({
      round: round.round,
      completed: round.completed,
      first_attempt: round.first_attempt,
      retried: round.retried,
      failed: round.failed,
      duration_ms: round.duration_ms,
    })),
    calls: allCalls,
  };

  mkdirSync(dirname(EVIDENCE), { recursive: true, mode: 0o700 });
  writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  console.log(
    `[concurrency-50x] total: ${completed}/${allCalls.length} completed ` +
      `(${firstAttempt} first attempt, ${retried} after retry, ${allCalls.length - completed} failed)`,
  );
  console.log(`[concurrency-50x] evidence -> ${EVIDENCE}`);
  if (completed !== allCalls.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
