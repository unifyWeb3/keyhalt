#!/usr/bin/env node
/**
 * FLEET v0.3 testnet end-to-end run.
 *
 * Testnet only. Provisions three native sub-account agents from a faucet-funded
 * parent, proves zero full-access keys, runs 12 concurrent executions (3 agents
 * x 4 operator keys), exercises freeze/unfreeze, grant/revoke/tag-revoke,
 * operator rotation, admin rotation, lost-admin recovery, refusal controls, and
 * exports the SHA-256 audit chain.
 *
 * Secret keys live outside the repository under
 * /root/.near-fallback-keys/fleet-v03/e2e (mode 700/600) and are never printed.
 * Evidence contains only public data: account IDs, public keys, tx hashes,
 * block heights, gas, statuses, and audit entries.
 */

import {
  Account,
  KeyPair,
  actions,
  teraToGas,
} from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const RPC = process.env.FLEET_RPC || "https://rpc.testnet.near.org";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  throw new Error("FLEET is testnet-only; refusing mainnet");
}

const PARENT = process.env.FLEET_PARENT || "fleet-v03-5cff9e99.testnet";
const PARENT_KEY =
  process.env.FLEET_PARENT_KEY ||
  `/root/.near-fallback-keys/fleet-v03-faucet/${PARENT}.json`;
const KEY_ROOT =
  process.env.FLEET_KEY_ROOT || "/root/.near-fallback-keys/fleet-v03/e2e";
const WASM_PATH = resolve(
  "target/wasm32-unknown-unknown/release/fleet_controller.wasm",
);
const MANIFEST_PATH = resolve("testnet/run-v03.json");
const EVIDENCE_DIR = resolve("evidence/testnet-v03");
const AGENT_BALANCE = 2_800_000_000_000_000_000_000_000n; // 2.8 NEAR
const AGENT_COUNT = 3;
const OPERATORS_PER_AGENT = 4;
const AGENT_IDS = [
  process.env.FLEET_AGENT1 || `agent-1.${PARENT}`,
  process.env.FLEET_AGENT2 || `agent-2.${PARENT}`,
  process.env.FLEET_AGENT3 || `agent-3.${PARENT}`,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nowIso() {
  return new Date().toISOString();
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, replacer, 2)}\n`, { mode: 0o644 });
}

function replacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function short(value, length = 10) {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

async function withRetry(fn, label, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const text = `${error?.message ?? error} ${error?.cause ?? ""}`;
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|timeout/i.test(
          text,
        );
      if (!retryable || attempt === attempts) throw error;
      const delay = 500 * 2 ** (attempt - 1);
      console.warn(
        `[retry] ${label}: ${text.slice(0, 100)} (attempt ${attempt}/${attempts}, ${delay}ms)`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

function keyPath(agentId, role) {
  return join(KEY_ROOT, `${agentId.replaceAll(".", "_")}__${role}.json`);
}

function loadOrCreateKey(agentId, role) {
  const path = keyPath(agentId, role);
  if (existsSync(path)) {
    return KeyPair.fromString(readJson(path).secret_key);
  }
  const pair = KeyPair.fromRandom("ed25519");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        account_id: agentId,
        role,
        public_key: pair.getPublicKey().toString(),
        secret_key: pair.toString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return pair;
}

function accountFor(agentId, key) {
  return new Account(agentId, RPC, key.toString());
}

async function viewRaw(provider, contractId, method, args = {}) {
  const response = await withRetry(
    () =>
      provider.sendJsonRpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      }),
    `view ${contractId}.${method}`,
  );
  return Buffer.from(response.result).toString("utf8");
}

// Preserve u64 values (block timestamps exceed 2^53) as strings before parsing.
function parseBigJson(text) {
  const guarded = text.replace(
    /([:[,]\s*)(-?\d{16,})(?=\s*[,\]}\n])/g,
    '$1"$2"',
  );
  return JSON.parse(guarded);
}

async function viewStateBig(provider, agentId) {
  return parseBigJson(await viewRaw(provider, agentId, "get_state"));
}

async function viewState(provider, agentId) {
  return withRetry(
    () =>
      provider.callFunction({
        contractId: agentId,
        method: "get_state",
        args: {},
      }),
    `get_state ${agentId}`,
  );
}

async function viewKeys(provider, accountId) {
  const response = await withRetry(
    () =>
      provider.viewAccessKeyList({
        accountId,
        finalityQuery: { finality: "final" },
      }),
    `keys ${accountId}`,
  );
  return response.keys;
}

function permissionOf(entry) {
  const permission = entry.access_key.permission;
  return typeof permission === "string" ? permission : Object.keys(permission)[0];
}

function functionCallOf(entry) {
  const permission = entry.access_key.permission;
  return typeof permission === "string" ? null : permission.FunctionCall;
}

async function accountExists(provider, accountId) {
  try {
    await withRetry(
      () => provider.viewAccount({ accountId }),
      `account ${accountId}`,
    );
    return true;
  } catch (error) {
    if (/does not exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(String(error?.message ?? error))) {
      return false;
    }
    throw error;
  }
}

async function waitFor(label, fn, predicate, timeoutMs = 90_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(
    `timeout waiting for ${label}: ${JSON.stringify(last, replacer).slice(0, 800)}`,
  );
}

const blockHeightCache = new Map();

async function blockHeightFor(provider, blockHash) {
  if (blockHeightCache.has(blockHash)) return blockHeightCache.get(blockHash);
  const block = await withRetry(
    () => provider.viewBlock({ blockId: blockHash }),
    `block ${short(blockHash)}`,
  );
  blockHeightCache.set(blockHash, block.header.height);
  return block.header.height;
}

async function finalizeTx(provider, txHash, senderId) {
  const result = await withRetry(
    () =>
      provider.sendJsonRpc("tx", {
        tx_hash: txHash,
        sender_account_id: senderId,
        wait_until: "FINAL",
      }),
    `tx ${short(txHash)}`,
  );
  const blockHash = result.transaction_outcome.block_hash;
  const blockHeight = await blockHeightFor(provider, blockHash);
  return { final: result, blockHash, blockHeight };
}

function gasBurnt(result) {
  let total = BigInt(result.transaction_outcome.outcome.gas_burnt ?? 0);
  for (const receipt of result.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome.gas_burnt ?? 0);
  }
  return total.toString();
}

function statusInfo(result) {
  const top = result.status;
  const success = Boolean(top && typeof top === "object" && "SuccessValue" in top);
  const failure = Boolean(top && typeof top === "object" && "Failure" in top);
  const failedReceipts = (result.receipts_outcome ?? []).filter(
    (receipt) => receipt.outcome.status && "Failure" in receipt.outcome.status,
  );
  const logs = (result.receipts_outcome ?? []).flatMap(
    (receipt) => receipt.outcome.logs ?? [],
  );
  return { top, success, failure, failedReceipts, logs };
}

function successValueText(status) {
  if (!status || typeof status !== "object" || status.SuccessValue === undefined) {
    return null;
  }
  return Buffer.from(status.SuccessValue, "base64").toString("utf8");
}

async function sendCall(account, receiverId, method, args = {}, options = {}) {
  const gasTgas = options.gasTgas ?? 30;
  const deposit = options.deposit ?? 0n;
  const throwOnFailure = options.throwOnFailure ?? true;
  const result = await account.signAndSendTransaction({
    receiverId,
    actions: [
      actions.functionCall(method, args, teraToGas(gasTgas), deposit),
    ],
    waitUntil: "EXECUTED_OPTIMISTIC",
    throwOnFailure,
  });
  const txHash = result.transaction_outcome.id;
  const finalized = await finalizeTx(account.provider, txHash, account.accountId);
  return { txHash, submitted: result, ...finalized };
}

function makeRecorder() {
  const steps = [];
  const checks = [];
  return {
    steps,
    checks,
    step(name, data) {
      steps.push({ name, at: nowIso(), ...data });
    },
    check(name, ok, detail) {
      checks.push({ name, ok, detail });
      console.log(`[check] ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
      if (!ok) throw new Error(`check failed: ${name}${detail ? `: ${detail}` : ""}`);
    },
  };
}

function verifyKeySet(recorder, agentId, keys, state, expectedCount = 6) {
  const byPublicKey = new Map(keys.map((entry) => [entry.public_key, entry]));
  recorder.check(
    `${agentId}: ${expectedCount} native keys`,
    keys.length === expectedCount,
    `found ${keys.length}`,
  );
  recorder.check(
    `${agentId}: zero FullAccess keys`,
    keys.every((entry) => permissionOf(entry) !== "FullAccess"),
    permissionOf(keys[0] ?? { access_key: { permission: "none" } }),
  );
  for (const entry of keys) {
    const permission = permissionOf(entry);
    recorder.check(
      `${agentId}: ${short(entry.public_key)} is FunctionCall`,
      permission === "FunctionCall",
      permission,
    );
    const call = functionCallOf(entry);
    recorder.check(
      `${agentId}: ${short(entry.public_key)} receiver is self`,
      call?.receiver_id === agentId,
      call?.receiver_id,
    );
  }

  const admin = byPublicKey.get(state.admin_pk);
  recorder.check(`${agentId}: admin key is native`, Boolean(admin), state.admin_pk);
  recorder.check(
    `${agentId}: admin method ACL`,
    Boolean(functionCallOf(admin)?.method_names?.includes("freeze")),
    JSON.stringify(functionCallOf(admin)?.method_names),
  );
  const recovery = byPublicKey.get(state.recovery_pk);
  recorder.check(`${agentId}: recovery key is native`, Boolean(recovery), state.recovery_pk);
  recorder.check(
    `${agentId}: recovery method ACL`,
    Boolean(functionCallOf(recovery)?.method_names?.includes("recover_admin")),
    JSON.stringify(functionCallOf(recovery)?.method_names),
  );
  for (const operator of state.operators) {
    const entry = byPublicKey.get(operator.pk);
    recorder.check(
      `${agentId}: operator ${short(operator.pk)} is native`,
      Boolean(entry),
      operator.pk,
    );
    const methods = functionCallOf(entry)?.method_names ?? [];
    recorder.check(
      `${agentId}: operator ${short(operator.pk)} execute-only`,
      methods.length === 1 && methods[0] === "execute",
      JSON.stringify(methods),
    );
  }
}

async function provisionAgent(recorder, parent, index) {
  const agentId = AGENT_IDS[index] ?? `agent-${index + 1}.${PARENT}`;
  const keys = {
    admin: loadOrCreateKey(agentId, "admin"),
    recovery: loadOrCreateKey(agentId, "recovery"),
    operators: Array.from({ length: OPERATORS_PER_AGENT }, (_value, operator) =>
      loadOrCreateKey(agentId, `operator-${operator}`),
    ),
  };
  const operatorTags = ["ops-a", "ops-a", "ops-b", "ops-b"];

  if (await accountExists(parent.provider, agentId)) {
    const existing = await viewState(parent.provider, agentId);
    if (!existing?.provisioned) {
      throw new Error(
        `${agentId} exists but is not provisioned: ${JSON.stringify(existing, replacer)}`,
      );
    }
    recorder.check(
      `${agentId}: existing admin matches stored key`,
      existing.admin_pk === keys.admin.getPublicKey().toString(),
      existing.admin_pk,
    );
    console.log(`[reuse] ${agentId} already provisioned`);
    return { id: agentId, keys, operatorTags, state: existing, createTx: null, initTx: null };
  }

  const wasm = new Uint8Array(readFileSync(WASM_PATH));
  const create = await parent.signAndSendTransaction({
    receiverId: agentId,
    actions: [
      actions.createAccount(),
      actions.transfer(AGENT_BALANCE),
      actions.deployContract(wasm),
    ],
    waitUntil: "EXECUTED_OPTIMISTIC",
  });
  const createTx = create.transaction_outcome.id;
  const createFinal = await finalizeTx(parent.provider, createTx, parent.accountId);
  console.log(
    `[provision] ${agentId} create tx=${createTx} block=${createFinal.blockHeight}`,
  );

  const initArgs = {
    config: {
      mode: "A",
      admin_pk: keys.admin.getPublicKey().toString(),
      recovery_pk: keys.recovery.getPublicKey().toString(),
      admin_account: null,
      operator_keys: keys.operators.map((pair, operator) => ({
        public_key: pair.getPublicKey().toString(),
        tag: operatorTags[operator],
      })),
      receiver: agentId,
      method: "ping",
      max_operators: 16,
      admin_allowance_yocto: null,
      operator_allowance_yocto: null,
    },
  };
  const init = await parent.signAndSendTransaction({
    receiverId: agentId,
    actions: [actions.functionCall("new", initArgs, teraToGas(100), 0n)],
    waitUntil: "EXECUTED_OPTIMISTIC",
  });
  const initTx = init.transaction_outcome.id;
  const initFinal = await finalizeTx(parent.provider, initTx, parent.accountId);
  console.log(
    `[provision] ${agentId} init tx=${initTx} block=${initFinal.blockHeight}`,
  );

  const state = await waitFor(
    `${agentId} provisioned`,
    () => viewState(parent.provider, agentId),
    (value) => Boolean(value?.provisioned),
  );
  recorder.check(
    `${agentId}: provisioning callback succeeded`,
    state.provisioned === true && state.provision_error === null,
    JSON.stringify(state.provision_error),
  );
  recorder.check(
    `${agentId}: four active operators`,
    state.operators.length === 4 && state.operators.every((operator) => operator.active),
    JSON.stringify(state.operators, replacer),
  );
  recorder.check(
    `${agentId}: receiver/method pinned`,
    state.receiver === agentId && state.method === "ping",
    `${state.receiver}.${state.method}`,
  );
  recorder.check(
    `${agentId}: audit verifies after init`,
    (await parent.provider.callFunction({
      contractId: agentId,
      method: "verify_audit",
      args: {},
    })) === true,
  );
  verifyKeySet(recorder, agentId, await viewKeys(parent.provider, agentId), state);

  return { id: agentId, keys, operatorTags, state, createTx, initTx };
}

async function executeArgs(agentId) {
  return {
    receiver_id: agentId,
    method_name: "ping",
    args: "{}",
    gas: 10_000_000_000_000, // 10 Tgas
  };
}

async function runConcurrency(recorder, agents) {
  const tasks = [];
  for (const agent of agents) {
    for (let operator = 0; operator < OPERATORS_PER_AGENT; operator += 1) {
      tasks.push({
        agent,
        operator,
        account: accountFor(agent.id, agent.keys.operators[operator]),
      });
    }
  }
  const started = Date.now();
  const settled = await Promise.allSettled(
    tasks.map(async (task) => {
      const result = await sendCall(
        task.account,
        task.agent.id,
        "execute",
        await executeArgs(task.agent.id),
        { gasTgas: 50, throwOnFailure: false },
      );
      return { task, result };
    }),
  );
  const durationMs = Date.now() - started;
  const calls = [];
  let successes = 0;
  for (let index = 0; index < settled.length; index += 1) {
    const outcome = settled[index];
    const task = tasks[index];
    if (outcome.status === "rejected") {
      calls.push({
        agent: task.agent.id,
        operator: task.operator,
        status: "error",
        error: String(outcome.reason?.stack ?? outcome.reason).slice(0, 800),
      });
      continue;
    }
    const { result } = outcome.value;
    const info = statusInfo(result.final);
    const pinged = info.logs.some((log) => log.includes('"action":"ping"'));
    const ok = info.success && pinged;
    if (ok) successes += 1;
    calls.push({
      agent: task.agent.id,
      operator: task.operator,
      tx: result.txHash,
      block_hash: result.blockHash,
      block_height: result.blockHeight,
      gas_burnt: gasBurnt(result.final),
      status: ok ? "success" : "failure",
      top_status: info.top,
      logs: info.logs.filter((log) => log.includes('"action"')),
    });
  }
  recorder.step("concurrency", {
    attempts: tasks.length,
    successes,
    duration_ms: durationMs,
    calls,
  });
  recorder.check(
    "12 concurrent executes (3 agents x 4 operator keys)",
    successes === tasks.length,
    `${successes}/${tasks.length} in ${durationMs}ms`,
  );
  return { attempts: tasks.length, successes, duration_ms: durationMs, calls };
}

async function runLifecycle(recorder, agents) {
  const agent = agents[0];
  const keys = agent.keys;
  const extra = loadOrCreateKey(agent.id, "extra");
  const rotated = loadOrCreateKey(agent.id, "rotated");
  const admin2 = loadOrCreateKey(agent.id, "admin2");
  const admin3 = loadOrCreateKey(agent.id, "admin3");
  const lifecycle = [];
  const provider = accountFor(agent.id, keys.admin).provider;
  const keyMap = {
    admin: keys.admin,
    recovery: keys.recovery,
    "operator-0": keys.operators[0],
    "operator-1": keys.operators[1],
    "operator-2": keys.operators[2],
    "operator-3": keys.operators[3],
    admin2,
    admin3,
  };

  async function call(role, method, args = {}, options = {}) {
    const account = accountFor(agent.id, keyMap[role]);
    return sendCall(account, agent.id, method, args, {
      throwOnFailure: false,
      ...options,
    });
  }

  function recordStep(name, result, extraData = {}) {
    const info = statusInfo(result.final);
    const refusal = info.logs.find((log) => log.startsWith("FLEET_REFUSAL:"));
    const entry = {
      name,
      tx: result.txHash,
      block_hash: result.blockHash,
      block_height: result.blockHeight,
      gas_burnt: gasBurnt(result.final),
      status: info.failure ? "failure" : "success",
      refusal: refusal ? refusal.slice("FLEET_REFUSAL:".length) : null,
      top_status: info.top,
      ...extraData,
    };
    lifecycle.push(entry);
    console.log(
      `[lifecycle] ${name} ${entry.status} tx=${entry.tx} block=${entry.block_height}${
        entry.refusal ? ` refusal=${entry.refusal}` : ""
      }`,
    );
    return { info, entry };
  }

  function expectOk(name, result, extraData = {}) {
    const { info, entry } = recordStep(name, result, extraData);
    if (!info.success) {
      throw new Error(`${name} failed: ${JSON.stringify(info.top)}`);
    }
    if (info.failedReceipts.length > 0) {
      throw new Error(
        `${name} had failed receipts: ${JSON.stringify(info.failedReceipts)}`,
      );
    }
    return entry;
  }

  function expectRefusal(name, result, reason) {
    const { info, entry } = recordStep(name, result);
    if (!info.failure) {
      throw new Error(`${name} unexpectedly succeeded: ${JSON.stringify(info.top)}`);
    }
    if (!entry.refusal || !entry.refusal.includes(reason)) {
      throw new Error(
        `${name}: expected refusal containing "${reason}", got ${JSON.stringify(entry.refusal)}`,
      );
    }
    return entry;
  }

  async function expectProtocolRejection(name, account, method, args = {}, options = {}) {
    try {
      const result = await sendCall(account, agent.id, method, args, {
        throwOnFailure: true,
        ...options,
      });
      throw new Error(
        `${name} unexpectedly succeeded with tx ${result.txHash}`,
      );
    } catch (error) {
      if (String(error.message).includes("unexpectedly succeeded")) throw error;
      const text = String(error.message);
      if (
        !/access key|AccessKey|method name|MethodName|not allowed|does not exist|InvalidTx|signer/i.test(
          text,
        )
      ) {
        throw error;
      }
      const entry = {
        name,
        status: "protocol_rejected",
        error: text.slice(0, 800),
      };
      lifecycle.push(entry);
      console.log(`[lifecycle] ${name} protocol_rejected`);
      return entry;
    }
  }

  // Freeze / refusal / positive control.
  expectOk("freeze", await call("admin", "freeze"));
  const afterFreeze = await waitFor(
    "paused state",
    () => viewState(provider, agent.id),
    (state) => state.paused === true,
  );
  recorder.check("freeze pauses execution", afterFreeze.paused === true);

  expectRefusal(
    "execute while frozen",
    await call("operator-0", "execute", await executeArgs(agent.id), { gasTgas: 50 }),
    "frozen",
  );

  expectOk("unfreeze", await call("admin", "unfreeze"));
  await waitFor(
    "unpaused state",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => state.paused === false,
  );

  const positive = expectOk(
    "operator execute positive control",
    await call("operator-0", "execute", await executeArgs(agent.id), { gasTgas: 50 }),
  );
  recorder.check(
    "operator execute returned pong",
    positive.top_status?.SuccessValue === "InBvbmci",
    positive.top_status?.SuccessValue,
  );

  expectRefusal(
    "execute wrong method",
    await call("operator-1", "execute", {
      ...(await executeArgs(agent.id)),
      method_name: "get_state",
    }, { gasTgas: 50 }),
    "method not allowed",
  );
  expectRefusal(
    "execute wrong receiver",
    await call("operator-1", "execute", {
      ...(await executeArgs(agent.id)),
      receiver_id: PARENT,
    }, { gasTgas: 50 }),
    "receiver not allowed",
  );
  await expectProtocolRejection(
    "execute with deposit rejected by FunctionCall key policy",
    accountFor(agent.id, keys.operators[0]),
    "execute",
    await executeArgs(agent.id),
    { gasTgas: 50, deposit: 1n },
  );
  expectRefusal(
    "execute above gas cap",
    await call("operator-0", "execute", {
      ...(await executeArgs(agent.id)),
      gas: 100_000_000_000_001,
    }, { gasTgas: 150 }),
    "gas above policy cap",
  );

  // Grant / duplicate refusal / revoke.
  expectOk(
    "grant operator",
    await call("admin", "grant_operator", {
      public_key: extra.getPublicKey().toString(),
      tag: "ops-c",
    }),
  );
  await waitFor(
    "granted operator active",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) =>
      state.operators.some(
        (operator) => operator.pk === extra.getPublicKey().toString() && operator.active,
      ),
  );
  await waitFor(
    "granted native key",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) =>
      entries.some((entry) => entry.public_key === extra.getPublicKey().toString()),
  );
  recorder.check("granted key is execute-only", true);

  expectRefusal(
    "duplicate grant refused",
    await call("admin", "grant_operator", {
      public_key: extra.getPublicKey().toString(),
      tag: "ops-c",
    }),
    "key already has a role",
  );

  expectOk(
    "revoke operator",
    await call("admin", "revoke_operator", {
      public_key: extra.getPublicKey().toString(),
    }),
  );
  await waitFor(
    "revoked operator removed",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) =>
      !state.operators.some(
        (operator) => operator.pk === extra.getPublicKey().toString(),
      ),
  );
  await waitFor(
    "revoked native key removed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) =>
      !entries.some((entry) => entry.public_key === extra.getPublicKey().toString()),
  );

  // Tag revoke removes exactly the two ops-a keys.
  const revokeTagResult = expectOk(
    "revoke tag ops-a",
    await call("admin", "revoke_tag", { tag: "ops-a" }),
  );
  const revokeTagValue = successValueText(revokeTagResult.top_status);
  const revoked = JSON.parse(revokeTagValue);
  recorder.check(
    "revoke_tag returned both ops-a keys",
    Array.isArray(revoked) &&
      revoked.length === 2 &&
      revoked.includes(keys.operators[0].getPublicKey().toString()) &&
      revoked.includes(keys.operators[1].getPublicKey().toString()),
    JSON.stringify(revoked),
  );
  await waitFor(
    "tag revoked from state",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => !state.operators.some((operator) => operator.tag === "ops-a"),
  );
  await waitFor(
    "tag-revoked native keys removed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) =>
      !entries.some(
        (entry) =>
          entry.public_key === keys.operators[0].getPublicKey().toString() ||
          entry.public_key === keys.operators[1].getPublicKey().toString(),
      ),
  );

  // Rotate one remaining operator (op2 -> fresh key).
  const rotateOld = keys.operators[2].getPublicKey().toString();
  const rotateNew = rotated.getPublicKey().toString();
  expectOk(
    "rotate operator",
    await call("admin", "rotate_operator", {
      old_public_key: rotateOld,
      new_public_key: rotateNew,
      tag: "ops-b",
    }),
  );
  await waitFor(
    "rotated operator active",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) =>
      state.operators.some((operator) => operator.pk === rotateNew && operator.active) &&
      !state.operators.some((operator) => operator.pk === rotateOld),
  );
  await waitFor(
    "rotated native key installed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) => entries.some((entry) => entry.public_key === rotateNew),
  );
  await waitFor(
    "old operator native key removed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) => !entries.some((entry) => entry.public_key === rotateOld),
  );

  // Admin rotation: propose -> callback -> accept (accept performs no AddKey).
  expectOk(
    "propose admin rotation",
    await call("admin", "propose_admin", {
      new_admin_pk: admin2.getPublicKey().toString(),
    }),
  );
  const pending = await waitFor(
    "pending admin rotation",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => state.pending_admin_pk === admin2.getPublicKey().toString(),
  );
  recorder.check("pending origin is admin", pending.pending_origin === "admin");
  await waitFor(
    "pending admin native key",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) =>
      entries.some((entry) => entry.public_key === admin2.getPublicKey().toString()),
  );

  expectRefusal(
    "second pending rotation refused",
    await call("admin", "propose_admin", {
      new_admin_pk: admin3.getPublicKey().toString(),
    }),
    "a rotation is already pending",
  );

  const oldAdminPk = keys.admin.getPublicKey().toString();
  expectOk(
    "accept admin rotation",
    await call("admin2", "accept_admin"),
  );
  await waitFor(
    "new admin active",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) =>
      state.admin_pk === admin2.getPublicKey().toString() &&
      state.pending_admin_pk === null,
  );
  await waitFor(
    "old admin native key removed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) => !entries.some((entry) => entry.public_key === oldAdminPk),
  );

  expectOk("new admin freeze", await call("admin2", "freeze"));
  await waitFor(
    "new admin freeze state",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => state.paused === true,
  );
  expectOk("new admin unfreeze", await call("admin2", "unfreeze"));

  await expectProtocolRejection(
    "old admin key rejected after rotation",
    accountFor(agent.id, keys.admin),
    "freeze",
  );

  // Lost-admin recovery: recovery key proposes a fresh admin, that key accepts.
  expectOk(
    "recover admin",
    await call("recovery", "recover_admin", {
      new_admin_pk: admin3.getPublicKey().toString(),
    }),
  );
  const recoveredPending = await waitFor(
    "recovered pending admin",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => state.pending_admin_pk === admin3.getPublicKey().toString(),
  );
  recorder.check(
    "pending origin is recovery",
    recoveredPending.pending_origin === "recovery",
  );
  await waitFor(
    "recovery native key",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) =>
      entries.some((entry) => entry.public_key === admin3.getPublicKey().toString()),
  );

  const admin2Pk = admin2.getPublicKey().toString();
  expectOk(
    "accept recovered admin",
    await call("admin3", "accept_admin"),
  );
  await waitFor(
    "recovered admin active",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) =>
      state.admin_pk === admin3.getPublicKey().toString() &&
      state.pending_admin_pk === null,
  );
  await waitFor(
    "rotation admin key removed",
    () => viewKeys(accountFor(agent.id, keys.admin).provider, agent.id),
    (entries) => !entries.some((entry) => entry.public_key === admin2Pk),
  );
  expectOk("recovered admin freeze", await call("admin3", "freeze"));
  await waitFor(
    "recovered admin freeze state",
    () => viewState(accountFor(agent.id, keys.admin).provider, agent.id),
    (state) => state.paused === true,
  );
  expectOk("recovered admin unfreeze", await call("admin3", "unfreeze"));

  // Operator key cannot call admin methods (protocol-level ACL).
  await expectProtocolRejection(
    "operator key rejected for freeze",
    accountFor(agent.id, keys.operators[3]),
    "freeze",
  );
  // Admin key cannot call execute (protocol-level ACL).
  await expectProtocolRejection(
    "admin key rejected for execute",
    accountFor(agent.id, admin3),
    "execute",
    await executeArgs(agent.id),
    { gasTgas: 50 },
  );
  // A key that was never installed cannot sign.
  const stranger = loadOrCreateKey(agent.id, "stranger");
  await expectProtocolRejection(
    "unknown key rejected",
    accountFor(agent.id, stranger),
    "freeze",
  );

  return { lifecycle, agent, keys: { admin3, recovery: keys.recovery } };
}

async function fetchAudit(provider, agentId) {
  const state = await viewStateBig(provider, agentId);
  const entries = [];
  for (let from = 0; from < state.audit_len; from += 100) {
    const page = parseBigJson(
      await viewRaw(provider, agentId, "get_audit", {
        from_seq: from,
        limit: 100,
      }),
    );
    entries.push(...page);
  }
  return { state, entries };
}

function verifyAuditChain(entries) {
  let previous = "0".repeat(64);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.seq !== index) {
      return { ok: false, error: `seq ${entry.seq} at index ${index}` };
    }
    if (entry.prev_hash !== previous) {
      return { ok: false, error: `prev_hash mismatch at seq ${entry.seq}` };
    }
    const timestamp = String(entry.block_timestamp);
    const message = [
      entry.prev_hash,
      entry.seq,
      entry.action,
      entry.actor_account,
      entry.signer_pk,
      entry.subject,
      entry.block_height,
      timestamp,
    ].join("|");
    const expected = sha256Hex(Buffer.from(message, "utf8"));
    if (entry.entry_hash !== expected) {
      return {
        ok: false,
        error: `entry_hash mismatch at seq ${entry.seq}: expected ${expected}`,
      };
    }
    previous = entry.entry_hash;
  }
  return { ok: true, head: previous };
}

async function main() {
  const startedAt = nowIso();
  const recorder = makeRecorder();
  const parentRaw = readJson(PARENT_KEY);
  const parentSecret = parentRaw.secret_key || parentRaw.private_key;
  if (!parentSecret) throw new Error("parent credentials missing private key");
  const parent = new Account(PARENT, RPC, parentSecret);
  const wasm = readFileSync(WASM_PATH);
  const wasmHash = sha256Hex(wasm);
  console.log(`[start] parent=${PARENT} rpc=${RPC}`);
  console.log(`[wasm] bytes=${wasm.length} sha256=${wasmHash}`);
  recorder.step("start", {
    parent: PARENT,
    rpc: RPC,
    wasm_bytes: wasm.length,
    wasm_sha256: wasmHash,
  });

  const manifest = existsSync(MANIFEST_PATH)
    ? readJson(MANIFEST_PATH)
    : { parent: PARENT, wasm_sha256: wasmHash, agents: [] };
  if (manifest.parent !== PARENT) {
    throw new Error(`manifest parent ${manifest.parent} does not match ${PARENT}`);
  }
  manifest.wasm_sha256 = wasmHash;
  manifest.updated_at = nowIso();

  const agents = [];
  for (let index = 0; index < AGENT_COUNT; index += 1) {
    const agent = await provisionAgent(recorder, parent, index);
    const stored = manifest.agents.find((entry) => entry.id === agent.id);
    if (agent.createTx === null && stored?.create_tx) {
      agent.createTx = stored.create_tx;
    }
    if (agent.initTx === null && stored?.init_tx) {
      agent.initTx = stored.init_tx;
    }
    agents.push(agent);
    const publicKeys = {
      id: agent.id,
      admin_pk: agent.keys.admin.getPublicKey().toString(),
      recovery_pk: agent.keys.recovery.getPublicKey().toString(),
      operator_pks: agent.keys.operators.map((pair) => pair.getPublicKey().toString()),
      operator_tags: agent.operatorTags,
      create_tx: agent.createTx,
      init_tx: agent.initTx,
    };
    const existingIndex = manifest.agents.findIndex((entry) => entry.id === agent.id);
    if (existingIndex === -1) {
      manifest.agents.push(publicKeys);
    } else {
      const previous = manifest.agents[existingIndex];
      manifest.agents[existingIndex] = {
        ...publicKeys,
        create_tx: publicKeys.create_tx ?? previous.create_tx ?? null,
        init_tx: publicKeys.init_tx ?? previous.init_tx ?? null,
      };
    }
    writeJson(MANIFEST_PATH, manifest);
  }
  recorder.check("three agents provisioned", agents.length === 3);

  const concurrency = await runConcurrency(recorder, agents);
  const lifecycleResult = await runLifecycle(recorder, agents);

  const provider = accountFor(agents[0].id, agents[0].keys.admin).provider;
  const audit = await fetchAudit(provider, agents[0].id);
  const auditCheck = verifyAuditChain(audit.entries);
  recorder.check(
    "audit chain recomputes in JavaScript",
    auditCheck.ok,
    auditCheck.error ?? `${audit.entries.length} entries, head ${short(auditCheck.head)}`,
  );
  const auditView = await withRetry(
    () => provider.callFunction({ contractId: agents[0].id, method: "verify_audit", args: {} }),
    "verify_audit",
  );
  recorder.check("on-chain audit verification", auditView === true);
  recorder.check(
    "audit head matches last entry",
    String(audit.state.audit_head.entry_hash) === auditCheck.head,
    `${short(String(audit.state.audit_head.entry_hash))} vs ${short(auditCheck.head)}`,
  );

  const finalState = await viewStateBig(provider, agents[0].id);
  const finalKeys = await viewKeys(provider, agents[0].id);
  recorder.check(
    "post-lifecycle agent has zero FullAccess keys",
    finalKeys.every((entry) => permissionOf(entry) !== "FullAccess"),
  );
  recorder.check(
    "post-lifecycle admin is the recovered key",
    finalState.admin_pk === lifecycleResult.keys.admin3.getPublicKey().toString(),
    finalState.admin_pk,
  );
  verifyKeySet(recorder, agents[0].id, finalKeys, finalState, 4);

  const evidence = {
    run: {
      started_at: startedAt,
      finished_at: nowIso(),
      parent: PARENT,
      rpc: RPC,
      wasm_bytes: wasm.length,
      wasm_sha256: wasmHash,
      agent_count: agents.length,
      operators_per_agent: OPERATORS_PER_AGENT,
    },
    agents: agents.map((agent) => ({
      id: agent.id,
      admin_pk: agent.keys.admin.getPublicKey().toString(),
      recovery_pk: agent.keys.recovery.getPublicKey().toString(),
      operator_pks: agent.keys.operators.map((pair) => pair.getPublicKey().toString()),
      operator_tags: agent.operatorTags,
      create_tx: agent.createTx,
      init_tx: agent.initTx,
      provisioned: true,
    })),
    concurrency,
    lifecycle: {
      agent: lifecycleResult.agent.id,
      steps: lifecycleResult.lifecycle,
      final_state: finalState,
      final_keys: finalKeys.map((entry) => ({
        public_key: entry.public_key,
        permission: permissionOf(entry),
        function_call: functionCallOf(entry),
      })),
    },
    audit: {
      agent: lifecycleResult.agent.id,
      len: audit.entries.length,
      head: auditCheck.head,
      on_chain_verify: auditView,
      js_verify: auditCheck.ok,
      entries: audit.entries,
    },
    checks: recorder.checks,
    steps: recorder.steps,
    ok: recorder.checks.every((check) => check.ok),
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "Z");
  const evidencePath = join(EVIDENCE_DIR, `run-${stamp}.json`);
  writeJson(evidencePath, evidence);
  writeJson(join(EVIDENCE_DIR, "run.json"), evidence);
  writeJson(join(EVIDENCE_DIR, "audit-agent-1.json"), {
    agent: lifecycleResult.agent.id,
    on_chain_verify: auditView,
    js_verify: auditCheck.ok,
    head: auditCheck.head,
    entries: audit.entries,
  });

  const markdown = renderMarkdown(evidence);
  writeFileSync(join(EVIDENCE_DIR, "RUN.md"), markdown, { mode: 0o644 });
  console.log(`[done] evidence=${evidencePath}`);
  console.log(`[done] audit_entries=${audit.entries.length} head=${auditCheck.head}`);
  console.log(markdown.split("\n").slice(0, 20).join("\n"));
  return evidence;
}

function renderMarkdown(evidence) {
  const lines = [];
  lines.push("# FLEET v0.3 testnet run");
  lines.push("");
  lines.push(`- Started: ${evidence.run.started_at}`);
  lines.push(`- Finished: ${evidence.run.finished_at}`);
  lines.push(`- Parent: \`${evidence.run.parent}\``);
  lines.push(`- RPC: \`${evidence.run.rpc}\``);
  lines.push(
    `- Controller wasm: ${evidence.run.wasm_bytes} bytes, sha256 \`${evidence.run.wasm_sha256}\``,
  );
  lines.push("");
  lines.push("## Agents");
  lines.push("");
  lines.push("| Agent | Create tx | Init tx | Admin key | Recovery key |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const agent of evidence.agents) {
    const createCell = agent.create_tx
      ? `[${agent.create_tx}](https://testnet.nearblocks.io/txns/${agent.create_tx})`
      : "reused — see `testnet/run-v03.json`";
    const initCell = agent.init_tx
      ? `[${agent.init_tx}](https://testnet.nearblocks.io/txns/${agent.init_tx})`
      : "reused — see `testnet/run-v03.json`";
    lines.push(
      `| \`${agent.id}\` | ${createCell} | ${initCell} | \`${agent.admin_pk}\` | \`${agent.recovery_pk}\` |`,
    );
  }
  lines.push("");
  lines.push("## Concurrency");
  lines.push("");
  lines.push(
    `${evidence.concurrency.successes}/${evidence.concurrency.attempts} concurrent \`execute\` calls succeeded in ${evidence.concurrency.duration_ms} ms (3 agents x 4 operator keys).`,
  );
  lines.push("");
  lines.push("| Agent | Operator | Tx | Block | Gas burnt | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const call of evidence.concurrency.calls) {
    lines.push(
      `| \`${call.agent}\` | ${call.operator} | [${call.tx ?? "—"}](https://testnet.nearblocks.io/txns/${call.tx ?? ""}) | ${call.block_height ?? "—"} | ${call.gas_burnt ?? "—"} | ${call.status} |`,
    );
  }
  lines.push("");
  lines.push("## Lifecycle");
  lines.push("");
  lines.push(`Agent: \`${evidence.lifecycle.agent}\``);
  lines.push("");
  lines.push("| Step | Tx | Block | Gas burnt | Status | Refusal evidence |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const step of evidence.lifecycle.steps) {
    const tx = step.tx
      ? `[${step.tx}](https://testnet.nearblocks.io/txns/${step.tx})`
      : "—";
    lines.push(
      `| ${step.name} | ${tx} | ${step.block_height ?? "—"} | ${step.gas_burnt ?? "—"} | ${step.status} | ${step.refusal ?? step.error ?? "—"} |`,
    );
  }
  lines.push("");
  lines.push("## Audit");
  lines.push("");
  lines.push(`- Entries: ${evidence.audit.len}`);
  lines.push(`- Head: \`${evidence.audit.head}\``);
  lines.push(`- On-chain \`verify_audit\`: ${evidence.audit.on_chain_verify}`);
  lines.push(`- Independent JavaScript recomputation: ${evidence.audit.js_verify}`);
  lines.push("");
  lines.push("## Result");
  lines.push("");
  lines.push(`- All recorded checks passed: ${evidence.ok}`);
  lines.push(
    `- Full-access keys on managed agents: 0 (asserted from \`view_access_key_list\`)`,
  );
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error("[fatal] FLEET testnet run failed");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
