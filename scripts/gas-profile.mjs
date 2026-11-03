#!/usr/bin/env node
/**
 * FLEET gas profile.
 *
 * Re-reads the canonical testnet evidence, fetches create/init outcomes from
 * the public RPC, and writes per-operation gas statistics. Gas is reported in
 * Tgas (1 Tgas = 1e12 gas units). No key material is read.
 *
 * Output: evidence/testnet-v03/gas-profile.{json,md}
 */

import { setDefaultResultOrder } from "node:dns";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

setDefaultResultOrder("ipv4first");

const root = fileURLToPath(new URL("..", import.meta.url));
const runPath = `${root}/evidence/testnet-v03/run.json`;
const outJson = `${root}/evidence/testnet-v03/gas-profile.json`;
const outMd = `${root}/evidence/testnet-v03/gas-profile.md`;
const run = JSON.parse(readFileSync(runPath, "utf8"));
const RPC = run.run.rpc;
const TGAS = 1_000_000_000_000n;

async function rpc(method, params) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "fleet-gas", method, params }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body.result;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function txOutcome(txHash, senderAccountId) {
  let result;
  try {
    result = await rpc("tx", {
      tx_hash: txHash,
      sender_account_id: senderAccountId,
      wait_until: "FINAL",
    });
  } catch {
    result = await rpc("EXPERIMENTAL_tx_status", {
      tx_hash: txHash,
      sender_account_id: senderAccountId,
    });
  }
  let total = 0n;
  total += BigInt(result.transaction_outcome?.outcome?.gas_burnt ?? 0);
  for (const receipt of result.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome?.gas_burnt ?? 0);
  }
  return total;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2n
    : sorted[middle];
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function tgas(value) {
  const whole = value / TGAS;
  const fraction = ((value % TGAS) * 1000n) / TGAS;
  return `${whole}.${fraction.toString().padStart(3, "0")}`;
}

function summarize(operation, source, samples) {
  const total = samples.reduce((sum, value) => sum + value, 0n);
  const mean = samples.length === 0 ? 0n : total / BigInt(samples.length);
  return {
    operation,
    source,
    samples: samples.length,
    total_gas: total.toString(),
    mean_gas: mean.toString(),
    min_gas: (samples.length ? samples.reduce((a, b) => (a < b ? a : b)) : 0n).toString(),
    max_gas: (samples.length ? samples.reduce((a, b) => (a > b ? a : b)) : 0n).toString(),
    median_gas: median(samples).toString(),
    p95_gas: percentile(samples, 95).toString(),
    mean_tgas: tgas(mean),
    median_tgas: tgas(median(samples)),
    max_tgas: tgas(samples.length ? samples.reduce((a, b) => (a > b ? a : b)) : 0n),
    total_tgas: tgas(total),
    failed_samples: samples.filter((value) => value === 0n).length,
  };
}

const operations = new Map();
function addSample(operation, source, gas, failed) {
  const key = `${source}::${operation}`;
  if (!operations.has(key)) {
    operations.set(key, { operation, source, samples: [], failures: 0 });
  }
  const bucket = operations.get(key);
  bucket.samples.push(gas);
  if (failed) bucket.failures += 1;
}

for (const call of run.concurrency.calls) {
  addSample("execute (concurrent)", "concurrency", BigInt(call.gas_burnt ?? 0), false);
}

for (const step of run.lifecycle.steps) {
  addSample(step.name, "lifecycle", BigInt(step.gas_burnt ?? 0), step.status !== "success");
}

const provision = [];
for (const agent of run.agents) {
  if (!agent.create_tx || !agent.init_tx) continue;
  const createGas = await txOutcome(agent.create_tx, run.run.parent);
  const initGas = await txOutcome(agent.init_tx, run.run.parent);
  provision.push({
    agent: agent.id,
    create_tx: agent.create_tx,
    init_tx: agent.init_tx,
    create_gas: createGas.toString(),
    init_gas: initGas.toString(),
    total_gas: (createGas + initGas).toString(),
    create_tgas: tgas(createGas),
    init_tgas: tgas(initGas),
    total_tgas: tgas(createGas + initGas),
  });
  addSample("provision (create + deploy)", "provision", createGas, false);
  addSample("provision (init + AddKey receipts)", "provision", initGas, false);
}

const summaries = [...operations.values()]
  .map((bucket) => ({
    ...summarize(bucket.operation, bucket.source, bucket.samples),
    failures: bucket.failures,
  }))
  .sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return BigInt(b.total_gas) > BigInt(a.total_gas) ? 1 : -1;
  });

const report = {
  generated_at: new Date().toISOString(),
  network: "testnet",
  rpc: RPC,
  source_run: "evidence/testnet-v03/run.json",
  wasm_sha256: run.run.wasm_sha256,
  unit: "gas units; Tgas = gas / 1e12",
  provision,
  operations: summaries,
};

writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  "# FLEET gas profile (testnet)",
  "",
  `Generated: ${report.generated_at}`,
  `Source run: \`${report.source_run}\` (${run.run.started_at} — ${run.run.finished_at})`,
  `Wasm: \`${report.wasm_sha256}\``,
  `RPC: ${RPC}`,
  "",
  "Gas is the sum of the transaction outcome and all receipt outcomes, in Tgas.",
  "Contract-level policy refusals burn gas and are listed as named lifecycle steps.",
  "Transactions rejected by the protocol before execution (key ACL or deposit policy) report 0 Tgas.",
  "",
  "## Provisioning",
  "",
  "| Agent | Create (Tgas) | Init + AddKey (Tgas) | Total (Tgas) |",
  "| --- | ---: | ---: | ---: |",
  ...provision.map(
    (row) =>
      `| \`${row.agent}\` | ${row.create_tgas} | ${row.init_tgas} | ${row.total_tgas} |`,
  ),
  "",
  "## Operations",
  "",
  "| Operation | Source | Samples | Mean (Tgas) | Median (Tgas) | Max (Tgas) | Total (Tgas) |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ...summaries.map(
    (row) =>
      `| ${row.operation} | ${row.source} | ${row.samples} | ${row.mean_tgas} | ${row.median_tgas} | ${row.max_tgas} | ${row.total_tgas} |`,
  ),
  "",
  "Raw per-call gas is in `gas-profile.json` and in `run.json`.",
  "",
];
writeFileSync(outMd, lines.join("\n"));

console.log(`[gas] provision rows: ${provision.length}`);
for (const row of provision) {
  console.log(
    `[gas] ${row.agent} create=${row.create_tgas} init=${row.init_tgas} total=${row.total_tgas} Tgas`,
  );
}
console.log(`[gas] operations: ${summaries.length}`);
for (const row of summaries) {
  console.log(
    `[gas] ${row.source}/${row.operation}: n=${row.samples} mean=${row.mean_tgas} max=${row.max_tgas} Tgas`,
  );
}
console.log(`[gas] wrote ${outJson}`);
console.log(`[gas] wrote ${outMd}`);
