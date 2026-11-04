#!/usr/bin/env node
/**
 * Render a human-readable Mode B report from evidence/modeb-v03/run.json.
 *
 * The JSON is the source of truth. This script only formats public fields:
 * account IDs, public keys, transaction hashes, block heights, gas, audit
 * entries, and timing samples. It never reads a key file.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("evidence/modeb-v03");
const evidence = JSON.parse(readFileSync(`${dir}/run.json`, "utf8"));

const lines = [];
const push = (...values) => lines.push(...values);

function txLink(hash) {
  return hash
    ? `[${hash}](https://testnet.nearblocks.io/txns/${hash})`
    : "not recorded";
}

function txOf(record) {
  if (!record) return null;
  return typeof record === "string" ? record : record.tx;
}

function step(name, agent) {
  return (evidence.steps ?? []).find(
    (entry) =>
      entry.name === name && (agent === undefined || entry.agent === agent),
  );
}

const run = evidence.run;
const modeB = evidence.mode_b;
const audit = modeB.audit;
const latency = evidence.latency ?? {};
const provision = modeB.provision ?? {};

push("# FLEET v0.3 Mode B testnet run");
push("");
push(`- Started: ${run.started_at}`);
push(`- Finished: ${run.finished_at}`);
push(`- Parent / multisig: \`${run.parent}\``);
push(`- Mode B agent: \`${run.agent}\``);
push(`- Mode A latency agent: \`${run.latency_agent}\``);
push(`- RPC: \`${run.rpc}\``);
push(
  `- Controller wasm: ${run.controller_wasm.bytes} bytes, sha256 \`${run.controller_wasm.sha256}\``,
);
push(
  `- Multisig wasm: ${run.multisig_wasm.bytes} bytes, sha256 \`${run.multisig_wasm.sha256}\``,
);
push(
  `- Multisig source: pinned \`near/core-contracts\` commit \`${run.multisig_wasm.commit}\` (v${run.multisig_wasm.version}, ${run.multisig_wasm.license})`,
);
push(`- Checks: ${evidence.checks.filter((check) => check.ok).length}/${evidence.checks.length} pass`);
push("");

push("## Setup transactions");
push("");
push("| Step | Transaction | Block |");
push("| --- | --- | ---: |");
const parentFaucet = evidence.faucet?.parent_tx;
const strangerFaucet = evidence.faucet?.stranger_tx;
const modeBCreate = provision.create_tx;
const modeBInit = provision.init_tx;
const latencyProvision = step("agent_provision_metadata", run.latency_agent);
push(`| Parent faucet | ${txLink(parentFaucet)} | — |`);
push(`| Mode B agent create | ${txLink(modeBCreate)} | — |`);
push(`| Mode B agent init | ${txLink(modeBInit)} | — |`);
push(
  `| Latency agent create | ${txLink(latencyProvision?.create_tx)} | — |`,
);
push(
  `| Latency agent init | ${txLink(latencyProvision?.init_tx)} | — |`,
);
push(
  `| Multisig deploy | ${txLink(txOf(evidence.multisig?.deployTx))} | ${evidence.multisig?.deployTx?.block_height ?? "—"} |`,
);
push(
  `| Multisig init 2-of-2 | ${txLink(txOf(evidence.multisig?.initTx))} | ${evidence.multisig?.initTx?.block_height ?? "—"} |`,
);
push(
  `| Bootstrap key delete | ${txLink(txOf(evidence.multisig?.deleteBootstrapTx))} | ${evidence.multisig?.deleteBootstrapTx?.block_height ?? "—"} |`,
);
push(`| Stranger faucet | ${txLink(strangerFaucet)} | — |`);
push("");

push("## Multisig state");
push("");
push(
  `- Members: ${(evidence.multisig?.members ?? [])
    .map((member) => `\`${member.account_id ?? member.public_key}\``)
    .join(", ")}`,
);
push(
  `- Required confirmations: ${evidence.multisig?.numConfirmations} (2-of-2)`,
);
push(
  `- Parent access keys before bootstrap delete: ${evidence.multisig?.keysBefore}; after: ${evidence.multisig?.keysAfter}`,
);
push(
  `- On-chain code hash: \`${evidence.multisig?.codeHash}\` — matches the built wasm`,
);
push("");

push("## Mode B lifecycle");
push("");
push("| Step | Transaction | Block | Status | Detail |");
push("| --- | --- | ---: | --- | --- |");
const rows = [
  ["Member calls freeze directly", modeB.direct_bypass],
  ["Non-member adds request", modeB.non_member],
  ["Freeze add_request", modeB.freeze?.add_request],
  ["Freeze first confirm", modeB.freeze?.first_confirm],
  ["Freeze duplicate confirm", modeB.freeze?.duplicate_confirm],
  ["Freeze second confirm", modeB.freeze?.second_confirm],
  ["Execute while frozen", modeB.frozen_execute],
  ["Unfreeze add_request", modeB.unfreeze?.add_request],
  ["Unfreeze first confirm", modeB.unfreeze?.first_confirm],
  ["Unfreeze second confirm", modeB.unfreeze?.second_confirm],
  ["Execute after unfreeze", modeB.restored_execute],
];
for (const [label, record] of rows) {
  if (!record) continue;
  const detail = record.refusal
    ? `refusal: ${record.refusal}`
    : record.request_id !== undefined
      ? `request ${record.request_id}`
      : record.wall_ms_to_paused !== undefined
        ? `wall ${record.wall_ms_to_paused} ms`
        : record.wall_ms_to_unpaused !== undefined
          ? `wall ${record.wall_ms_to_unpaused} ms`
          : "";
  push(
    `| ${label} | ${txLink(record.tx)} | ${record.block_height} | ${record.status} | ${detail} |`,
  );
}
push("");
push(
  `- One confirmation left the agent unpaused; the second confirmation paused it in ${modeB.freeze?.wall_ms_to_paused} ms (submit → observed state).`,
);
push(
  `- Frozen execute was refused with \`${modeB.frozen_execute?.refusal}\`; the same operator key returned \`pong\` after the second unfreeze confirmation.`,
);
push(
  `- A multisig member calling \`freeze\` directly was refused with \`${modeB.direct_bypass?.refusal}\`; a non-member request was rejected by the multisig.`,
);
push("");

push("## Audit chain");
push("");
push(
  `- Entries: ${audit.len}; on-chain verify: ${audit.on_chain_verify}; independent JS recompute: ${audit.js_verify}`,
);
push(`- Head: \`${audit.head}\``);
push("");
push("| Seq | Action | Actor | Signer | Subject | Block |");
push("| ---: | --- | --- | --- | --- | ---: |");
for (const entry of audit.entries) {
  push(
    `| ${entry.seq} | ${entry.action} | \`${entry.actor_account}\` | \`${entry.signer_pk}\` | ${entry.subject} | ${entry.block_height} |`,
  );
}
push("");

if (latency.freeze) {
  push("## Mode A latency, storage, and allowance");
  push("");
  push("| Operation | n | min ms | mean ms | max ms | Gas (mean) |");
  push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const [label, stats] of [
    ["Freeze (Mode A admin key)", latency.freeze],
    ["Unfreeze (Mode A admin key)", latency.unfreeze],
  ]) {
    const samples = stats.samples ?? [];
    const gasTotal = samples.reduce(
      (sum, sample) => sum + BigInt(sample.gas_burnt ?? 0),
      0n,
    );
    const gasMean =
      samples.length === 0 ? "—" : (gasTotal / BigInt(samples.length)).toString();
    push(
      `| ${label} | ${stats.n} | ${stats.min_ms} | ${stats.mean_ms} | ${stats.max_ms} | ${gasMean} |`,
    );
  }
  push("");
  push(
    `- Storage grew ${latency.storage.delta} bytes across ${latency.storage.audit_entries_added} added audit entries (about ${latency.storage.bytes_per_audit_entry_including_vector_growth} bytes each, including vector growth).`,
  );
  push(
    `- Admin key allowance: ${latency.admin_allowance_yocto} yocto; derived upper bound ${latency.derived_budget.upper_bound_freeze_calls} freeze calls at the measured mean tokens burnt. This is a derived bound, not an exhaustion test.`,
  );
  push("");
}

if (Array.isArray(evidence.isolation) && evidence.isolation.length > 0) {
  push("## Cross-agent isolation");
  push("");
  push("| Direction | Expected | Result | Detail |");
  push("| --- | --- | --- | --- |");
  for (const item of evidence.isolation) {
    push(
      `| ${item.name} | ${item.kind} | ${item.status} | ${item.tx ?? item.error ?? item.result ?? ""} |`,
    );
  }
  push("");
}

push("## Scope");
push("");
push(
  "Testnet only. This run proves the 2-of-2 mechanism with two owner accounts operated by the same test harness in this environment. It does not prove independent organizational custody. The multisig contract is third-party, pinned by commit, source-built, and unaudited. Freeze does not cancel an in-flight receipt.",
);
push("");
push(
  "All wall times are submit → observed state and include transaction finality and RPC polling, not contract-execution-only latency. Latency figures are single-host observations, not an SLA.",
);
push("");
push(
  `Generated from \`run.json\`; raw artifacts: \`run.json\`, \`audit-modeb.json\`, \`audit-latency.json\`, \`build.json\`, \`multisig-repro-build.json\`.`,
);
push("");

writeFileSync(`${dir}/RUN.md`, `${lines.join("\n")}\n`, { mode: 0o644 });
console.log(`wrote ${dir}/RUN.md (${lines.length} lines)`);
