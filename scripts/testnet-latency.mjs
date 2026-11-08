#!/usr/bin/env node
/**
 * Keyhalt v0.3 latency measurement.
 *
 * Testnet only. Measures freeze and unfreeze from submit to visible state,
 * both with optimistic inclusion and with final inclusion, for:
 *   - Mode A: direct admin FunctionCall key (single transaction)
 *   - Mode B: 2-of-2 multisig (add_request + two confirmations)
 *
 * Definitions used by the evidence file:
 *   - submit           = the moment the initiating transaction is signed and
 *                        sent (Mode A: the freeze/unfreeze call; Mode B: the
 *                        multisig `add_request` call).
 *   - optimistic_ms    = wall time from submit until a view call against the
 *                        latest optimistic block observes the effect.
 *   - final_ms         = wall time from submit until the transaction is
 *                        FINAL and a view call against the final block
 *                        observes the effect.
 *   - effect_block     = earliest block whose post-state shows the effect
 *                        (exact, found by block-height bisection).
 *   - blocks_*         = inclusive block counts (submit block .. effect block).
 *
 * Samples are appended to the evidence file after every cycle, so an
 * interrupted run can be resumed with KEYHALT_LATENCY_RESUME=1. Secret keys
 * live outside the repository and are never printed; the evidence contains
 * only public data.
 */
import { Account, SignedTransaction, actions, teraToGas } from "near-api-js";
import { setDefaultResultOrder } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { installHttpsFetch } from "./lib/https-fetch.mjs";

setDefaultResultOrder("ipv4first");
installHttpsFetch();

const RPC = process.env.KEYHALT_RPC || "https://rpc.testnet.fastnear.com";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  throw new Error("Keyhalt is testnet-only; refusing mainnet");
}
const SAMPLES = Number(process.env.KEYHALT_LATENCY_SAMPLES ?? 20);
if (!Number.isInteger(SAMPLES) || SAMPLES < 1) {
  throw new Error("KEYHALT_LATENCY_SAMPLES must be an integer >= 1");
}
const MODES = (process.env.KEYHALT_LATENCY_MODES ?? "mode_a,mode_b")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
for (const mode of MODES) {
  if (!["mode_a", "mode_b"].includes(mode)) {
    throw new Error(`unknown KEYHALT_LATENCY_MODES entry: ${mode}`);
  }
}
const RESUME = process.env.KEYHALT_LATENCY_RESUME === "1";

const KEY_ROOT = "/root/.near-fallback-keys/fleet-v03/modeb";
const FAUCET_KEY_ROOT = "/root/.near-fallback-keys/fleet-v03-faucet";
const PARENT = process.env.KEYHALT_MODEB_PARENT || "fleet-modeb-748d4372.testnet";
const LATENCY_AGENT = process.env.KEYHALT_LATENCY_AGENT || `agent-lat1.${PARENT}`;
const MODE_B_AGENT = process.env.KEYHALT_MODEB_AGENT || `agent-b1.${PARENT}`;
const OWNER1 = process.env.KEYHALT_OWNER1 || "fleet-v03-5cff9e99.testnet";
const OWNER2 = process.env.KEYHALT_OWNER2 || "fleet-v03-fund2-8b91351d.testnet";
const EVIDENCE_DIR = resolve("evidence/latency-v03");
const EVIDENCE_PATH = join(EVIDENCE_DIR, "run.json");
const INNER_GAS = "10000000000000";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowMs = () => Date.now();

async function withRetry(fn, label, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const text = `${error?.message ?? error} ${error?.cause ?? ""}`;
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|timeout|unknown block|garbage collected|does not exist/i.test(
          text,
        );
      if (!retryable || attempt === attempts) throw error;
      const delay = 500 * 2 ** (attempt - 1);
      console.warn(
        `[retry] ${label}: ${text.slice(0, 120)} (attempt ${attempt}/${attempts}, ${delay}ms)`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

function loadSecret(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  return value.secret_key || value.private_key;
}

function accountFor(accountId, path) {
  const value = loadSecret(path);
  if (!value) throw new Error(`missing key in ${path}`);
  return new Account(accountId, RPC, value);
}

async function rpc(provider, method, params) {
  return withRetry(() => provider.sendJsonRpc(method, params), method);
}

function parseBigJson(text) {
  const guarded = text.replace(
    /([:[,]\s*)(-?\d{16,})(?=\s*[,\]}\n])/g,
    '$1"$2"',
  );
  return JSON.parse(guarded);
}

async function queryState(provider, agentId, target) {
  const response = await rpc(provider, "query", {
    request_type: "call_function",
    ...(target.blockId
      ? { block_id: target.blockId }
      : { finality: target.finality ?? "optimistic" }),
    account_id: agentId,
    method_name: "get_state",
    args_base64: Buffer.from("{}", "utf8").toString("base64"),
  });
  return {
    state: parseBigJson(Buffer.from(response.result).toString("utf8")),
    blockHeight: Number(response.block_height),
    blockHash: response.block_hash,
  };
}

async function blockAt(provider, blockId) {
  const block = await rpc(provider, "block", { block_id: blockId });
  return { height: Number(block.header.height), hash: block.header.hash };
}

function statusInfo(result) {
  const top = result.status;
  const failed = Boolean(top && typeof top === "object" && "Failure" in top);
  const failedReceipts = (result.receipts_outcome ?? []).filter(
    (receipt) => receipt.outcome.status && "Failure" in receipt.outcome.status,
  );
  return { top, failed, failedReceipts };
}

function gasBurnt(result) {
  let total = BigInt(result.transaction_outcome.outcome.gas_burnt ?? 0);
  for (const receipt of result.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome.gas_burnt ?? 0);
  }
  return total.toString();
}

function tokensBurnt(result) {
  let total = BigInt(result.transaction_outcome.outcome.tokens_burnt ?? 0);
  for (const receipt of result.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome.tokens_burnt ?? 0);
  }
  return total.toString();
}

async function optimisticCall(account, receiverId, method, args, options = {}) {
  // Sign once, then retry the identical signed transaction. A retry after a
  // dropped connection is safe: the network deduplicates by transaction hash.
  const signed = await withRetry(
    async () =>
      account.createSignedTransaction({
        receiverId,
        actions: [
          actions.functionCall(
            method,
            args,
            teraToGas(options.gasTgas ?? 30),
            options.deposit ?? 0n,
          ),
        ],
        signer: account.getSigner(),
      }),
    `${method} sign`,
  );
  const bytes = new Uint8Array(Buffer.from(signed.encode()));
  return withRetry(
    () =>
      account.provider.sendTransactionUntil(
        SignedTransaction.decode(bytes),
        "EXECUTED_OPTIMISTIC",
      ),
    `${method} send`,
  );
}

async function finalize(provider, txHash, senderId) {
  return withRetry(
    () =>
      provider.sendJsonRpc("tx", {
        tx_hash: txHash,
        sender_account_id: senderId,
        wait_until: "FINAL",
      }),
    `tx ${txHash.slice(0, 14)}`,
  );
}

function assertSuccessful(result, label) {
  const info = statusInfo(result);
  if (info.failed || info.failedReceipts.length > 0) {
    throw new Error(`${label} failed: ${JSON.stringify(info.top)}`);
  }
}

function targetPredicate(kind) {
  return kind === "freeze"
    ? (state) => state.paused === true
    : (state) => state.paused === false;
}

async function waitForOptimisticEffect(provider, agentId, predicate, startMs) {
  const deadline = nowMs() + 120_000;
  let last;
  while (nowMs() < deadline) {
    const observation = await queryState(provider, agentId, {
      finality: "optimistic",
    });
    last = observation;
    if (predicate(observation.state)) {
      return { ...observation, observedAtMs: nowMs() - startMs };
    }
    await sleep(25);
  }
  throw new Error(
    `timeout waiting for optimistic effect; last=${JSON.stringify(last?.state)?.slice(0, 300)}`,
  );
}

/**
 * Finds the earliest block whose post-state shows the effect. The observation
 * block is an upper bound; the submit block is a lower bound. Bisection keeps
 * the number of view calls small. If the node has already garbage-collected a
 * bisection height (fastnear load-balances across nodes), fall back to walking
 * backwards from the observation block by hash, which only touches recent
 * blocks.
 */
async function findEffectBlock(
  provider,
  agentId,
  predicate,
  lowHeight,
  highHeight,
  highHash,
) {
  if (lowHeight >= highHeight) return highHeight;
  try {
    let low = lowHeight;
    let high = highHeight;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const block = await blockAt(provider, mid);
      const observation = await queryState(provider, agentId, {
        blockId: block.hash,
      });
      if (predicate(observation.state)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  } catch (error) {
    if (!highHash) throw error;
    console.warn(
      `[warn] block bisection failed (${error?.message ?? error}); walking back from ${highHeight}`,
    );
    return findEffectBlockByWalk(
      provider,
      agentId,
      predicate,
      highHash,
      highHeight,
      lowHeight,
    );
  }
}

async function findEffectBlockByWalk(
  provider,
  agentId,
  predicate,
  startHash,
  startHeight,
  lowHeight,
) {
  let hash = startHash;
  let height = startHeight;
  while (height > lowHeight) {
    const block = await rpc(provider, "block", { block_id: hash });
    const prevHash = block.header.prev_hash;
    const prevHeight = Number(block.header.height) - 1;
    if (prevHeight < lowHeight) return lowHeight;
    const observation = await queryState(provider, agentId, {
      blockId: prevHash,
    });
    if (!predicate(observation.state)) return prevHeight + 1;
    hash = prevHash;
    height = prevHeight;
  }
  return lowHeight;
}

function nearestRank(sorted, percentile) {
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

function stats(samples, field) {
  const values = samples
    .map((sample) => sample[field])
    .filter((value) => typeof value === "number");
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    n: sorted.length,
    min_ms: Math.min(...sorted),
    p50_ms: median,
    p95_ms: nearestRank(sorted, 95),
    mean_ms: Math.round(total / sorted.length),
    max_ms: Math.max(...sorted),
  };
}

function blockStats(samples, field) {
  const values = samples
    .map((sample) => sample[field])
    .filter((value) => typeof value === "number");
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    n: sorted.length,
    min: Math.min(...sorted),
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    mean: Math.round((total / sorted.length) * 10) / 10,
    max: Math.max(...sorted),
  };
}

function summarize(bucket) {
  for (const kind of ["freeze", "unfreeze"]) {
    bucket[kind] = stats(bucket[`${kind}_samples`], "optimistic_ms");
    bucket[`${kind}_final`] = stats(bucket[`${kind}_samples`], "final_ms");
    bucket[`${kind}_blocks`] = blockStats(
      bucket[`${kind}_samples`],
      "blocks_to_effect_optimistic",
    );
    bucket[`${kind}_blocks_final`] = blockStats(
      bucket[`${kind}_samples`],
      "blocks_to_effect_final",
    );
  }
  return bucket;
}

async function runOneDirect(account, provider, agentId, method, cycle) {
  const start = nowMs();
  const submitted = await optimisticCall(account, agentId, method, {}, { gasTgas: 30 });
  assertSuccessful(submitted, method);
  const submitBlock = (
    await blockAt(provider, submitted.transaction_outcome.block_hash)
  ).height;
  const predicate = targetPredicate(method);
  const optimistic = await waitForOptimisticEffect(
    provider,
    agentId,
    predicate,
    start,
  );
  const effectBlock = await findEffectBlock(
    provider,
    agentId,
    predicate,
    submitBlock,
    optimistic.blockHeight,
    optimistic.blockHash,
  );
  const final = await finalize(provider, submitted.transaction_outcome.id, account.accountId);
  assertSuccessful(final, `${method} final`);
  const finalState = await queryState(provider, agentId, { finality: "final" });
  if (!predicate(finalState.state)) {
    throw new Error(`${method} final state does not show the effect`);
  }
  return {
    cycle,
    kind: method,
    transactions: 1,
    tx: submitted.transaction_outcome.id,
    submit_block: submitBlock,
    optimistic_ms: optimistic.observedAtMs,
    optimistic_observed_block: optimistic.blockHeight,
    effect_block: effectBlock,
    blocks_to_effect_optimistic: effectBlock - submitBlock + 1,
    final_ms: nowMs() - start,
    final_state_block: finalState.blockHeight,
    blocks_to_effect_final: finalState.blockHeight - submitBlock + 1,
    gas_burnt: gasBurnt(final),
    tokens_burnt: tokensBurnt(final),
  };
}

async function runOneModeB(provider, agentId, owner1, owner2, method, cycle) {
  const start = nowMs();
  const addStart = nowMs();
  const submitted = await optimisticCall(
    owner1,
    PARENT,
    "add_request",
    {
      request: {
        receiver_id: agentId,
        actions: [
          {
            type: "FunctionCall",
            method_name: method,
            args: "",
            deposit: "0",
            gas: INNER_GAS,
          },
        ],
      },
    },
    { gasTgas: 100 },
  );
  const addMs = nowMs() - addStart;
  assertSuccessful(submitted, `${method} add_request`);
  const requestId = Number(
    Buffer.from(statusInfo(submitted).top.SuccessValue, "base64")
      .toString("utf8")
      .trim(),
  );
  if (!Number.isInteger(requestId)) {
    throw new Error(`could not parse ${method} request id`);
  }
  const addBlock = (
    await blockAt(provider, submitted.transaction_outcome.block_hash)
  ).height;

  const firstStart = nowMs();
  const first = await optimisticCall(
    owner1,
    PARENT,
    "confirm",
    { request_id: requestId },
    { gasTgas: 100 },
  );
  const firstMs = nowMs() - firstStart;
  assertSuccessful(first, `${method} first confirm`);

  const secondStart = nowMs();
  const second = await optimisticCall(
    owner2,
    PARENT,
    "confirm",
    { request_id: requestId },
    { gasTgas: 150 },
  );
  const secondMs = nowMs() - secondStart;
  assertSuccessful(second, `${method} second confirm`);
  const secondBlock = (
    await blockAt(provider, second.transaction_outcome.block_hash)
  ).height;

  const predicate = targetPredicate(method);
  const optimistic = await waitForOptimisticEffect(
    provider,
    agentId,
    predicate,
    start,
  );
  const effectBlock = await findEffectBlock(
    provider,
    agentId,
    predicate,
    addBlock,
    optimistic.blockHeight,
    optimistic.blockHash,
  );
  const final = await finalize(provider, second.transaction_outcome.id, owner2.accountId);
  assertSuccessful(final, `${method} second confirm final`);
  const finalState = await queryState(provider, agentId, { finality: "final" });
  if (!predicate(finalState.state)) {
    throw new Error(`${method} final state does not show the effect`);
  }
  return {
    cycle,
    kind: method,
    transactions: 3,
    request_id: requestId,
    add_tx: submitted.transaction_outcome.id,
    add_block: addBlock,
    add_submit_ms: addMs,
    first_confirm_tx: first.transaction_outcome.id,
    first_confirm_ms: firstMs,
    second_confirm_tx: second.transaction_outcome.id,
    second_confirm_block: secondBlock,
    second_confirm_ms: secondMs,
    optimistic_ms: optimistic.observedAtMs,
    optimistic_observed_block: optimistic.blockHeight,
    effect_block: effectBlock,
    blocks_to_effect_optimistic: effectBlock - addBlock + 1,
    final_ms: nowMs() - start,
    final_state_block: finalState.blockHeight,
    blocks_to_effect_final: finalState.blockHeight - addBlock + 1,
    gas_burnt: gasBurnt(final),
    tokens_burnt: tokensBurnt(final),
  };
}

/**
 * Reconciles the agent state before a measured cycle, so a run that died
 * between a freeze and its unfreeze (or vice versa) does not measure a
 * refused call. The reconcile uses the same call path as the measurement but
 * is not recorded as a sample.
 */
async function ensureDirectState(account, provider, agentId, wantFrozen) {
  const observation = await queryState(provider, agentId, {
    finality: "optimistic",
  });
  if (observation.state.paused === wantFrozen) return;
  const method = wantFrozen ? "freeze" : "unfreeze";
  console.log(
    `[reconcile] mode a ${agentId} paused=${observation.state.paused} -> ${wantFrozen} via ${method}`,
  );
  await runOneDirect(account, provider, agentId, method, 0);
}

async function ensureModeBState(provider, agentId, owner1, owner2, wantFrozen) {
  const observation = await queryState(provider, agentId, {
    finality: "optimistic",
  });
  if (observation.state.paused === wantFrozen) return;
  const method = wantFrozen ? "freeze" : "unfreeze";
  console.log(
    `[reconcile] mode b ${agentId} paused=${observation.state.paused} -> ${wantFrozen} via ${method}`,
  );
  await runOneModeB(provider, agentId, owner1, owner2, method, 0);
}

function loadEvidence() {
  if (RESUME && existsSync(EVIDENCE_PATH)) {
    const existing = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    existing.mode_a_direct = existing.mode_a_direct ?? {
      freeze_samples: [],
      unfreeze_samples: [],
    };
    existing.mode_b_multisig = existing.mode_b_multisig ?? {
      freeze_samples: [],
      unfreeze_samples: [],
    };
    return existing;
  }
  return {
    generated_at: new Date().toISOString(),
    network: "testnet",
    rpc: RPC,
    mode_a_agent: LATENCY_AGENT,
    mode_b_agent: MODE_B_AGENT,
    multisig_parent: PARENT,
    owners: [OWNER1, OWNER2],
    definitions: {
      submit:
        "the initiating transaction is signed and sent; Mode A uses the direct admin call, Mode B uses the multisig add_request call",
      optimistic_ms:
        "wall time from submit until a view call against the latest optimistic block observes the effect",
      final_ms:
        "wall time from submit until the transaction is FINAL and a view call against the final block observes the effect",
      effect_block:
        "earliest block whose post-state shows the effect, found by block-height bisection",
      blocks_to_effect_optimistic:
        "inclusive block count from the submit block through the effect block",
      blocks_to_effect_final:
        "inclusive block count from the submit block through the final block at which the effect was observed",
      percentiles: "p50 = median; p95 = nearest-rank",
    },
    mode_a_direct: { freeze_samples: [], unfreeze_samples: [] },
    mode_b_multisig: { freeze_samples: [], unfreeze_samples: [] },
  };
}

function saveEvidence(evidence) {
  mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o644,
  });
}

async function main() {
  console.log(
    `[latency] rpc=${RPC} samples=${SAMPLES} modes=${MODES.join(",")} resume=${RESUME}`,
  );
  const owner1 = accountFor(OWNER1, join(FAUCET_KEY_ROOT, `${OWNER1}.json`));
  const owner2 = accountFor(OWNER2, join(FAUCET_KEY_ROOT, `${OWNER2}.json`));
  const provider = owner1.provider;
  const adminPath = join(
    KEY_ROOT,
    `${LATENCY_AGENT.replaceAll(".", "_")}__admin.json`,
  );
  if (!existsSync(adminPath)) {
    throw new Error(`missing latency admin key file for ${LATENCY_AGENT}`);
  }
  const admin = accountFor(LATENCY_AGENT, adminPath);

  const evidence = loadEvidence();

  if (MODES.includes("mode_a")) {
    const bucket = evidence.mode_a_direct;
    bucket.freeze_samples = bucket.freeze_samples ?? [];
    bucket.unfreeze_samples = bucket.unfreeze_samples ?? [];
    let cycle = bucket.freeze_samples.length;
    while (cycle < SAMPLES) {
      cycle += 1;
      await ensureDirectState(admin, provider, LATENCY_AGENT, false);
      const freeze = await runOneDirect(
        admin,
        provider,
        LATENCY_AGENT,
        "freeze",
        cycle,
      );
      await ensureDirectState(admin, provider, LATENCY_AGENT, true);
      const unfreeze = await runOneDirect(
        admin,
        provider,
        LATENCY_AGENT,
        "unfreeze",
        cycle,
      );
      bucket.freeze_samples.push(freeze);
      bucket.unfreeze_samples.push(unfreeze);
      summarize(evidence.mode_a_direct);
      saveEvidence(evidence);
      console.log(
        `[sample] mode a #${cycle} freeze optimistic=${freeze.optimistic_ms}ms final=${freeze.final_ms}ms blocks=${freeze.blocks_to_effect_optimistic} | unfreeze optimistic=${unfreeze.optimistic_ms}ms final=${unfreeze.final_ms}ms blocks=${unfreeze.blocks_to_effect_optimistic}`,
      );
    }
  }

  if (MODES.includes("mode_b")) {
    const bucket = evidence.mode_b_multisig;
    bucket.freeze_samples = bucket.freeze_samples ?? [];
    bucket.unfreeze_samples = bucket.unfreeze_samples ?? [];
    let cycle = bucket.freeze_samples.length;
    while (cycle < SAMPLES) {
      cycle += 1;
      await ensureModeBState(provider, MODE_B_AGENT, owner1, owner2, false);
      const freeze = await runOneModeB(
        provider,
        MODE_B_AGENT,
        owner1,
        owner2,
        "freeze",
        cycle,
      );
      await ensureModeBState(provider, MODE_B_AGENT, owner1, owner2, true);
      const unfreeze = await runOneModeB(
        provider,
        MODE_B_AGENT,
        owner1,
        owner2,
        "unfreeze",
        cycle,
      );
      bucket.freeze_samples.push(freeze);
      bucket.unfreeze_samples.push(unfreeze);
      summarize(evidence.mode_b_multisig);
      saveEvidence(evidence);
      console.log(
        `[sample] mode b #${cycle} freeze optimistic=${freeze.optimistic_ms}ms final=${freeze.final_ms}ms blocks=${freeze.blocks_to_effect_optimistic} | unfreeze optimistic=${unfreeze.optimistic_ms}ms final=${unfreeze.final_ms}ms blocks=${unfreeze.blocks_to_effect_optimistic}`,
      );
    }
  }

  summarize(evidence.mode_a_direct);
  summarize(evidence.mode_b_multisig);
  evidence.completed_at = new Date().toISOString();
  saveEvidence(evidence);
  console.log(`[done] wrote ${EVIDENCE_PATH}`);
  console.log(
    JSON.stringify(
      {
        mode_a_freeze_optimistic: evidence.mode_a_direct.freeze,
        mode_a_freeze_final: evidence.mode_a_direct.freeze_final,
        mode_a_freeze_blocks: evidence.mode_a_direct.freeze_blocks,
        mode_a_unfreeze_optimistic: evidence.mode_a_direct.unfreeze,
        mode_a_unfreeze_final: evidence.mode_a_direct.unfreeze_final,
        mode_b_freeze_optimistic: evidence.mode_b_multisig.freeze,
        mode_b_freeze_final: evidence.mode_b_multisig.freeze_final,
        mode_b_freeze_blocks: evidence.mode_b_multisig.freeze_blocks,
        mode_b_unfreeze_optimistic: evidence.mode_b_multisig.unfreeze,
        mode_b_unfreeze_final: evidence.mode_b_multisig.unfreeze_final,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
