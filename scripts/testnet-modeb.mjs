#!/usr/bin/env node
/**
 * Keyhalt Mode B 2-of-2 multisig testnet run.
 *
 * Testnet only. This script proves the Mode B administration path with the
 * pinned `near/core-contracts/multisig2` v0.4.0 contract:
 *
 *   1. A fresh 10 NEAR faucet account becomes the multisig account (parent).
 *   2. A Mode B agent is provisioned as its sub-account with the Keyhalt
 *      controller wasm and `admin_account = parent`.
 *   3. A Mode A latency agent is provisioned under the same parent so direct
 *      freeze latency can be measured without mutating the canonical agents.
 *   4. The multisig wasm is deployed to the parent, initialized with two
 *      account members and 2-of-2 confirmation, then the parent's bootstrap
 *      FullAccess key is deleted.
 *   5. One confirmation does not execute; the second confirmation freezes the
 *      agent. A member calling the controller directly is rejected. A
 *      non-member cannot create a multisig request. Frozen execution is
 *      rejected; a second 2-of-2 request unfreezes; execution resumes.
 *   6. The audit chain is verified on-chain and recomputed independently.
 *
 * Secret keys live outside the repository under
 * /root/.near-fallback-keys/fleet-v03/modeb (mode 700/600) and are never
 * printed. Evidence contains only public data.
 */

import {
  Account,
  KeyPair,
  actions,
  baseDecode,
  baseEncode,
  teraToGas,
} from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { installHttpsFetch } from "./lib/https-fetch.mjs";

// IPv4 first avoids bare "fetch failed" on hosts without a working IPv6 route.
setDefaultResultOrder("ipv4first");
// Node's built-in fetch cannot reach the Cloudflare-fronted testnet RPCs from
// this host; node:https can. Install the small HTTPS transport before any RPC
// or faucet call.
installHttpsFetch();

const RPC = process.env.KEYHALT_RPC || "https://rpc.testnet.near.org";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  throw new Error("Keyhalt is testnet-only; refusing mainnet");
}

const KEY_ROOT = "/root/.near-fallback-keys/fleet-v03/modeb";
const FAUCET_KEY_ROOT = "/root/.near-fallback-keys/fleet-v03-faucet";
const CONTROLLER_WASM = resolve(
  "target/wasm32-unknown-unknown/release/fleet_controller.wasm",
);
const MULTISIG_WASM =
  process.env.KEYHALT_MULTISIG_WASM || "/tmp/opencode/multisig2-built.wasm";
const EVIDENCE_DIR = resolve("evidence/modeb-v03");
const RUN_PATH = join(EVIDENCE_DIR, "run.json");
const PARENT_PATH = join(EVIDENCE_DIR, "parent.json");
const AGENT_BALANCE = 2_800_000_000_000_000_000_000_000n; // 2.8 NEAR
const AGENT_COUNT_KEYS = 4;
const OWNER1 = process.env.KEYHALT_OWNER1 || "fleet-v03-5cff9e99.testnet";
const OWNER2 = process.env.KEYHALT_OWNER2 || "fleet-v03-fund2-8b91351d.testnet";
const MULTISIG_COMMIT = "1b0436c96379c63aee7d2429c6d5d24019031ab8";
const MULTISIG_REPO = "https://github.com/near/core-contracts";
const MULTISIG_VERSION = "0.4.0";
const MULTISIG_LICENSE = "MIT OR Apache-2.0";
const GAS_INNER = "50000000000000"; // 50 Tgas for the inner multisig call

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nowIso() {
  return new Date().toISOString();
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeHashHex(codeHash) {
  return Buffer.from(baseDecode(codeHash)).toString("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, replacer, 2)}\n`, {
    mode: 0o644,
  });
}

function replacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function short(value, length = 10) {
  const text = String(value);
  return text.length <= length ? text : `${text.slice(0, length)}…`;
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

function keyPath(accountId, role) {
  return join(KEY_ROOT, `${accountId.replaceAll(".", "_")}__${role}.json`);
}

function saveKey(accountId, role, pair) {
  const path = keyPath(accountId, role);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        account_id: accountId,
        role,
        public_key: pair.getPublicKey().toString(),
        secret_key: pair.toString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

function loadOrCreateKey(accountId, role) {
  const path = keyPath(accountId, role);
  if (existsSync(path)) {
    return KeyPair.fromString(readJson(path).secret_key);
  }
  const pair = KeyPair.fromRandom("ed25519");
  saveKey(accountId, role, pair);
  return pair;
}

function loadExternalKey(path) {
  const raw = readJson(path);
  const secret = raw.secret_key || raw.private_key;
  if (!secret) throw new Error(`credentials missing a private key field: ${path}`);
  return KeyPair.fromString(secret);
}

function accountFor(accountId, key) {
  return new Account(accountId, RPC, key.toString());
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

async function viewJson(provider, contractId, method, args = {}) {
  return withRetry(
    () =>
      provider.callFunction({
        contractId,
        method,
        args,
      }),
    `${contractId}.${method}`,
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

async function viewAccount(provider, accountId) {
  return withRetry(
    () => provider.viewAccount({ accountId }),
    `account ${accountId}`,
  );
}

function permissionOf(entry) {
  const permission = entry.access_key.permission;
  return typeof permission === "string"
    ? permission
    : Object.keys(permission)[0];
}

function functionCallOf(entry) {
  const permission = entry.access_key.permission;
  return typeof permission === "string" ? null : permission.FunctionCall;
}

async function accountExists(provider, accountId) {
  try {
    await viewAccount(provider, accountId);
    return true;
  } catch (error) {
    if (
      /does not exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(
        String(error?.message ?? error),
      )
    ) {
      return false;
    }
    throw error;
  }
}

async function waitFor(label, fn, predicate, timeoutMs = 120_000) {
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

function tokensBurnt(result) {
  let total = BigInt(result.transaction_outcome.outcome.tokens_burnt ?? 0);
  for (const receipt of result.receipts_outcome ?? []) {
    total += BigInt(receipt.outcome.tokens_burnt ?? 0);
  }
  return total.toString();
}

function statusInfo(result) {
  const top = result.status;
  const success = Boolean(top && typeof top === "object" && "SuccessValue" in top);
  const failure = Boolean(top && typeof top === "object" && "Failure" in top);
  const failedReceipts = (result.receipts_outcome ?? []).filter(
    (receipt) =>
      receipt.outcome.status && "Failure" in receipt.outcome.status,
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

function refusalOf(info) {
  const log = info.logs.find((entry) => entry.startsWith("FLEET_REFUSAL:"));
  return log ? log.slice("FLEET_REFUSAL:".length) : null;
}

function failureTextOf(info) {
  return JSON.stringify([
    info.top,
    ...info.failedReceipts.map((receipt) => receipt.outcome.status),
  ]);
}

function isTransportError(error) {
  const text = `${error?.message ?? error} ${error?.cause?.message ?? error?.cause ?? ""}`;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|socket hang up|timeout|Bad Gateway|unavailable|Internal server error|\b(429|500|502|503|504)\b/i.test(
    text,
  );
}

/**
 * Sign once, then retry that same signed transaction. This host's HTTPS path
 * to the testnet RPC occasionally resets while a large write is in flight. A
 * reset is ambiguous: the transaction may still be accepted. Re-sending the
 * identical signed transaction is safe (same hash, same nonce), and querying
 * the hash recovers the outcome if the first submission landed.
 */
async function signActionList(account, receiverId, actionList) {
  const publicKey = await account.signer.getPublicKey();
  const transaction = await account.createTransaction({
    receiverId,
    actions: actionList,
    publicKey,
  });
  const { txHash, signedTransaction } =
    await account.signer.signTransaction(transaction);
  return { txHash: baseEncode(txHash), signedTransaction };
}

async function submitSigned(account, signedTransaction, txHash, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await account.provider.sendTransactionUntil(
        signedTransaction,
        "EXECUTED_OPTIMISTIC",
      );
    } catch (error) {
      lastError = error;
      // If the reset happened after the node accepted the transaction, the
      // hash query returns the outcome instead of an error.
      try {
        const existing = await account.provider.sendJsonRpc("tx", {
          tx_hash: txHash,
          sender_account_id: account.accountId,
          wait_until: "EXECUTED_OPTIMISTIC",
        });
        console.warn(
          `[send-retry] recovered ${short(txHash)} after: ${String(error?.message ?? error).slice(0, 80)}`,
        );
        return existing;
      } catch {
        // Not visible yet; re-submit below when the error is transport-level.
      }
      if (!isTransportError(error)) throw error;
      const delay = Math.min(500 * 2 ** (attempt - 1), 8_000);
      console.warn(
        `[send-retry] ${short(txHash)}: ${String(error?.message ?? error).slice(0, 100)} (attempt ${attempt}/${attempts}, ${delay}ms)`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

async function runSigned(account, receiverId, actionList, options = {}) {
  const throwOnFailure = options.throwOnFailure ?? true;
  const { txHash, signedTransaction } = await signActionList(
    account,
    receiverId,
    actionList,
  );
  const submitted = await submitSigned(account, signedTransaction, txHash);
  const info = statusInfo(submitted);
  if (throwOnFailure && info.failure) {
    const error = new Error(
      `transaction failed: ${txHash}: ${failureTextOf(info).slice(0, 1200)}`,
    );
    error.txHash = txHash;
    error.result = submitted;
    throw error;
  }
  const finalized = await finalizeTx(account.provider, txHash, account.accountId);
  return { txHash, submitted, ...finalized };
}

async function sendCall(account, receiverId, method, args = {}, options = {}) {
  const gasTgas = options.gasTgas ?? 30;
  const deposit = options.deposit ?? 0n;
  return runSigned(
    account,
    receiverId,
    [actions.functionCall(method, args, teraToGas(gasTgas), deposit)],
    options,
  );
}

async function sendActions(account, receiverId, actionList, options = {}) {
  return runSigned(account, receiverId, actionList, options);
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
      console.log(
        `[check] ${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`,
      );
      if (!ok) {
        throw new Error(`check failed: ${name}${detail ? `: ${detail}` : ""}`);
      }
    },
  };
}

function txRecord(result, extra = {}) {
  const info = statusInfo(result.final);
  return {
    tx: result.txHash,
    block_hash: result.blockHash,
    block_height: result.blockHeight,
    gas_burnt: gasBurnt(result.final),
    tokens_burnt: tokensBurnt(result.final),
    status: info.failure ? "failure" : "success",
    refusal: refusalOf(info),
    top_status: info.top,
    failure_text: info.failure ? failureTextOf(info).slice(0, 1000) : null,
    failed_receipts: info.failedReceipts.length,
    logs: info.logs.filter(
      (log) =>
        log.startsWith("FLEET_REFUSAL:") ||
        log.startsWith("EVENT_JSON:") ||
        /already|member|confirmed|panic/i.test(log),
    ),
    ...extra,
  };
}

async function fetchAudit(provider, agentId) {
  const state = await viewStateBig(provider, agentId);
  const entries = [];
  for (let from = 0; from < Number(state.audit_len); from += 100) {
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
    if (Number(entry.seq) !== index) {
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

function executeArgs(agentId) {
  return {
    receiver_id: agentId,
    method_name: "ping",
    args: "{}",
    gas: 10_000_000_000_000, // 10 Tgas
  };
}

function multisigRequest(receiverId, methodName) {
  return {
    request: {
      receiver_id: receiverId,
      actions: [
        {
          type: "FunctionCall",
          method_name: methodName,
          args: "",
          deposit: "0",
          gas: GAS_INNER,
        },
      ],
    },
  };
}

async function faucet(accountId, publicKey) {
  const response = await withRetry(
    () =>
      fetch("https://helper.testnet.near.org/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newAccountId: accountId,
          newAccountPublicKey: publicKey,
        }),
        timeout: 120_000,
      }),
    `faucet ${accountId}`,
    4,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`faucet HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`faucet returned non-JSON: ${text.slice(0, 400)}`);
  }
  if (body.error) {
    throw new Error(`faucet error: ${JSON.stringify(body.error).slice(0, 400)}`);
  }
  return body;
}

async function ensureParent(recorder) {
  const envParent = process.env.KEYHALT_MODEB_PARENT;
  const fresh = process.env.KEYHALT_MODEB_FRESH === "1";
  const previous = !fresh && existsSync(RUN_PATH) ? readJson(RUN_PATH) : null;
  const parentMeta =
    !fresh && existsSync(PARENT_PATH) ? readJson(PARENT_PATH) : null;
  const parentId =
    envParent || previous?.run?.parent || (!fresh ? parentMeta?.account : null);
  const parentKeyPath = parentId ? keyPath(parentId, "parent") : null;

  if (parentId && parentKeyPath && existsSync(parentKeyPath)) {
    const key = loadOrCreateKey(parentId, "parent");
    const meta = parentMeta?.account === parentId ? parentMeta : null;
    const faucetTx =
      process.env.KEYHALT_MODEB_FAUCET_TX ?? meta?.faucet_tx ?? null;
    const account = await viewAccount(accountFor(parentId, key).provider, parentId);
    console.log(
      `[parent] reuse ${parentId} balance=${Number(account.amount) / 1e24} NEAR tx=${faucetTx ?? "not recorded"}`,
    );
    recorder.step("faucet_parent", {
      account: parentId,
      public_key: key.getPublicKey().toString(),
      faucet_tx: faucetTx,
      response_captured: meta?.response_captured ?? false,
      response_error: meta?.response_error ?? null,
      balance_yocto: account.amount,
      code_hash: account.code_hash,
      reused: true,
    });
    writeJson(PARENT_PATH, {
      account: parentId,
      public_key: key.getPublicKey().toString(),
      faucet_tx: faucetTx,
      response_captured: meta?.response_captured ?? false,
      response_error: meta?.response_error ?? null,
      balance_yocto: account.amount,
      code_hash: account.code_hash,
      recorded_at: nowIso(),
    });
    return {
      id: parentId,
      key,
      account: accountFor(parentId, key),
      created: Boolean(faucetTx),
      faucetTx,
      faucetResponseCaptured: meta?.response_captured ?? false,
      faucetError: meta?.response_error ?? null,
      balanceYocto: account.amount,
    };
  }

  const key = KeyPair.fromRandom("ed25519");
  const id = `fleet-modeb-${randomBytes(4).toString("hex")}.testnet`;
  saveKey(id, "parent", key);
  console.log(`[parent] faucet ${id}`);
  let response = null;
  let faucetError = null;
  try {
    response = await faucet(id, key.getPublicKey().toString());
  } catch (error) {
    faucetError = String(error?.message ?? error);
    console.warn(`[parent] faucet response issue: ${faucetError.slice(0, 160)}`);
  }
  const provider = accountFor(id, key).provider;
  const visible = await waitFor(
    "parent account visible",
    () => accountExists(provider, id),
    (exists) => exists,
    120_000,
  );
  if (!visible) {
    throw new Error(
      `faucet did not create ${id}: ${faucetError ?? "account not visible"}`,
    );
  }
  const account = await viewAccount(provider, id);
  const faucetTx =
    response?.transaction_outcome?.id ?? response?.tx_hash ?? null;
  recorder.step("faucet_parent", {
    account: id,
    public_key: key.getPublicKey().toString(),
    faucet_tx: faucetTx,
    final_execution_status: response?.final_execution_status ?? null,
    response_captured: response !== null,
    response_error: faucetError,
    balance_yocto: account.amount,
    code_hash: account.code_hash,
  });
  writeJson(PARENT_PATH, {
    account: id,
    public_key: key.getPublicKey().toString(),
    faucet_tx: faucetTx,
    response_captured: response !== null,
    response_error: faucetError,
    balance_yocto: account.amount,
    code_hash: account.code_hash,
    recorded_at: nowIso(),
  });
  console.log(
    `[parent] visible ${id} balance=${Number(account.amount) / 1e24} NEAR tx=${faucetTx ?? "not captured"}`,
  );
  return {
    id,
    key,
    account: accountFor(id, key),
    created: true,
    faucetTx,
    faucetResponseCaptured: response !== null,
    faucetError,
    balanceYocto: account.amount,
  };
}

async function ensureStranger(recorder) {
  const envStranger = process.env.KEYHALT_MODEB_STRANGER;
  if (envStranger && existsSync(keyPath(envStranger, "stranger"))) {
    const key = loadOrCreateKey(envStranger, "stranger");
    const provider = accountFor(envStranger, key).provider;
    await waitFor(
      "reused stranger account visible",
      () => accountExists(provider, envStranger),
      (exists) => exists,
      60_000,
    );
    return {
      id: envStranger,
      key,
      account: accountFor(envStranger, key),
      created: false,
      faucetTx: process.env.KEYHALT_MODEB_STRANGER_TX ?? null,
    };
  }
  const key = KeyPair.fromRandom("ed25519");
  const id = `fleet-modeb-stranger-${randomBytes(4).toString("hex")}.testnet`;
  saveKey(id, "stranger", key);
  console.log(`[stranger] faucet ${id}`);
  let response = null;
  let faucetError = null;
  try {
    response = await faucet(id, key.getPublicKey().toString());
  } catch (error) {
    faucetError = String(error?.message ?? error);
    console.warn(
      `[stranger] faucet response issue: ${faucetError.slice(0, 160)}`,
    );
  }
  const provider = accountFor(id, key).provider;
  const visible = await waitFor(
    "stranger account visible",
    () => accountExists(provider, id),
    (exists) => exists,
    120_000,
  );
  if (!visible) {
    throw new Error(
      `faucet did not create ${id}: ${faucetError ?? "account not visible"}`,
    );
  }
  const account = await viewAccount(provider, id);
  const faucetTx =
    response?.transaction_outcome?.id ?? response?.tx_hash ?? null;
  recorder.step("faucet_stranger", {
    account: id,
    public_key: key.getPublicKey().toString(),
    faucet_tx: faucetTx,
    response_captured: response !== null,
    response_error: faucetError,
    balance_yocto: account.amount,
  });
  console.log(
    `[stranger] visible ${id} balance=${Number(account.amount) / 1e24} NEAR tx=${faucetTx ?? "not captured"}`,
  );
  return {
    id,
    key,
    account: accountFor(id, key),
    created: true,
    faucetTx,
    faucetResponseCaptured: response !== null,
    faucetError,
    balanceYocto: account.amount,
  };
}

async function provisionAgent(recorder, parent, options) {
  const {
    agentId,
    mode,
    adminKey,
    recoveryKey,
    operatorKeys,
    operatorTags,
    createTxOverride = null,
    initTxOverride = null,
  } = options;
  const provider = parent.account.provider;
  let createTx = null;
  let initTx = null;

  if (await accountExists(provider, agentId)) {
    const account = await viewAccount(provider, agentId);
    if (account.code_hash === "11111111111111111111111111111111") {
      console.log(`[provision] ${agentId} exists without code; deploying`);
      const deploy = await sendActions(parent.account, agentId, [
        actions.deployContract(readFileSync(CONTROLLER_WASM)),
      ]);
      createTx = txRecord(deploy, { action: "deploy_only" });
    } else {
      console.log(`[provision] ${agentId} already deployed; checking init`);
    }
  } else {
    const wasm = readFileSync(CONTROLLER_WASM);
    const create = await sendActions(parent.account, agentId, [
      actions.createAccount(),
      actions.transfer(AGENT_BALANCE),
      actions.deployContract(wasm),
    ]);
    createTx = txRecord(create, { action: "create_transfer_deploy" });
    console.log(
      `[provision] ${agentId} create tx=${create.txHash} block=${create.blockHeight}`,
    );
  }

  let state = null;
  try {
    state = await viewState(provider, agentId);
  } catch {
    state = null;
  }

  if (!state) {
    const initArgs = {
      config: {
        mode,
        admin_pk:
          mode === "A" ? adminKey.getPublicKey().toString() : null,
        recovery_pk:
          mode === "A" ? recoveryKey.getPublicKey().toString() : null,
        admin_account: mode === "B" ? parent.id : null,
        operator_keys: operatorKeys.map((pair, index) => ({
          public_key: pair.getPublicKey().toString(),
          tag: operatorTags[index],
        })),
        receiver: agentId,
        method: "ping",
        max_operators: 16,
        admin_allowance_yocto: null,
        operator_allowance_yocto: null,
      },
    };
    const init = await sendCall(parent.account, agentId, "new", initArgs, {
      gasTgas: 100,
      throwOnFailure: false,
    });
    initTx = txRecord(init, { action: "init" });
    console.log(
      `[provision] ${agentId} init tx=${init.txHash} block=${init.blockHeight}`,
    );
    if (statusInfo(init.final).failure) {
      throw new Error(
        `${agentId} init failed: ${JSON.stringify(statusInfo(init.final).top)}`,
      );
    }
  }

  const provisioned = await waitFor(
    "provisioned state",
    () => viewState(provider, agentId),
    (value) => value.provisioned === true,
  );
  console.log(`[provision] ${agentId} provisioned=${provisioned.provisioned}`);

  const resolvedCreate = createTx ?? createTxOverride;
  const resolvedInit = initTx ?? initTxOverride;
  if (resolvedCreate || resolvedInit) {
    recorder.step("agent_provision_metadata", {
      agent: agentId,
      create_tx: resolvedCreate?.tx ?? resolvedCreate,
      init_tx: resolvedInit?.tx ?? resolvedInit,
      source: createTx || initTx ? "this_run" : "env_override",
    });
  }
  return {
    agentId,
    state: provisioned,
    createTx: resolvedCreate,
    initTx: resolvedInit,
  };
}

async function ensureMultisig(recorder, parent, multisigWasm) {
  const provider = parent.account.provider;
  const account = await viewAccount(provider, parent.id);
  const emptyCode = "11111111111111111111111111111111";
  let deployTx = null;
  let initTx = null;
  let deleteBootstrapTx = null;

  if (account.code_hash === emptyCode) {
    console.log(`[multisig] deploy to ${parent.id}`);
    const deploy = await sendActions(parent.account, parent.id, [
      actions.deployContract(multisigWasm),
    ]);
    deployTx = txRecord(deploy, { action: "multisig_deploy" });
    console.log(
      `[multisig] deploy tx=${deploy.txHash} block=${deploy.blockHeight}`,
    );
    if (statusInfo(deploy.final).failure) {
      throw new Error(
        `multisig deploy failed: ${JSON.stringify(statusInfo(deploy.final).top)}`,
      );
    }
  } else {
    console.log(`[multisig] code already present on ${parent.id}`);
  }

  let members = null;
  try {
    members = await viewJson(provider, parent.id, "get_members");
  } catch {
    members = null;
  }

  if (!members) {
    console.log(`[multisig] init 2-of-2 on ${parent.id}`);
    const init = await sendCall(
      parent.account,
      parent.id,
      "new",
      {
        members: [{ account_id: OWNER1 }, { account_id: OWNER2 }],
        num_confirmations: 2,
      },
      { gasTgas: 30, throwOnFailure: false },
    );
    initTx = txRecord(init, { action: "multisig_init" });
    console.log(`[multisig] init tx=${init.txHash} block=${init.blockHeight}`);
    if (statusInfo(init.final).failure) {
      throw new Error(
        `multisig init failed: ${JSON.stringify(statusInfo(init.final).top)}`,
      );
    }
  }

  members = await waitFor(
    "multisig members",
    () => viewJson(provider, parent.id, "get_members"),
    (value) => Array.isArray(value) && value.length === 2,
  );

  const numConfirmations = await viewJson(
    provider,
    parent.id,
    "get_num_confirmations",
  );
  const providers = members.map((member) => member.account_id ?? member.public_key);
  recorder.check(
    "multisig has exactly two account members",
    members.length === 2 &&
      providers.includes(OWNER1) &&
      providers.includes(OWNER2),
    JSON.stringify(providers),
  );
  recorder.check(
    "multisig requires two confirmations",
    Number(numConfirmations) === 2,
    String(numConfirmations),
  );

  let keys = await viewKeys(provider, parent.id);
  const keysBefore = keys.length;
  if (keys.length > 0) {
    console.log(`[multisig] delete bootstrap key(s): ${keys.length}`);
    const deleteTx = await sendActions(parent.account, parent.id, [
      actions.deleteKey(parent.key.getPublicKey()),
    ]);
    deleteBootstrapTx = txRecord(deleteTx, { action: "delete_bootstrap_key" });
    console.log(
      `[multisig] delete key tx=${deleteTx.txHash} block=${deleteTx.blockHeight}`,
    );
    if (statusInfo(deleteTx.final).failure) {
      throw new Error(
        `bootstrap key delete failed: ${JSON.stringify(statusInfo(deleteTx.final).top)}`,
      );
    }
    keys = await waitFor(
      "parent key deletion",
      () => viewKeys(provider, parent.id),
      (value) => value.length === 0,
    );
  }

  recorder.check(
    "multisig account has zero access keys after bootstrap",
    keys.length === 0,
    `${keysBefore} before, ${keys.length} after`,
  );
  const fresh = await viewJson(provider, parent.id, "get_members");
  const nonce = await viewJson(provider, parent.id, "get_request_nonce");
  return {
    members: fresh,
    numConfirmations: Number(numConfirmations),
    keysBefore,
    keysAfter: keys.length,
    deployTx,
    initTx,
    deleteBootstrapTx,
    requestNonce: Number(nonce),
    codeHash: (await viewAccount(provider, parent.id)).code_hash,
  };
}

function formatStats(samples) {
  if (samples.length === 0) return null;
  const values = samples.map((sample) => sample.wall_ms);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    n: values.length,
    min_ms: Math.min(...values),
    mean_ms: Math.round(total / values.length),
    max_ms: Math.max(...values),
    samples,
  };
}

async function runModeBTests(recorder, context) {
  const {
    parentId,
    agentId,
    agentKeys,
    owner1,
    owner2,
    stranger,
    provider,
  } = context;
  const result = {
    direct_bypass: null,
    non_member: null,
    freeze: null,
    frozen_execute: null,
    unfreeze: null,
    restored_execute: null,
  };

  let state = await viewStateBig(provider, agentId);
  const initialAudit = await fetchAudit(provider, agentId);
  const pristine =
    !state.paused &&
    initialAudit.entries.length === 1 &&
    initialAudit.entries[0].action === "init";
  recorder.check(
    "Mode B agent starts with only the provisioning audit entry",
    pristine,
    JSON.stringify(initialAudit.entries.map((entry) => entry.action)),
  );

  // 1. A multisig member cannot bypass the multisig by calling the controller
  //    directly. This is a valid transaction from owner1 to the agent; the
  //    controller sees predecessor owner1, not the multisig account.
  if (pristine) {
    const bypass = await sendCall(
      owner1.account,
      agentId,
      "freeze",
      {},
      { gasTgas: 30, throwOnFailure: false },
    );
    const info = statusInfo(bypass.final);
    const record = txRecord(bypass, { action: "direct_member_bypass" });
    recorder.check(
      "member direct freeze is rejected",
      info.failure && refusalOf(info) === "active admin required",
      `${record.status} refusal=${record.refusal}`,
    );
    const after = await viewState(provider, agentId);
    recorder.check(
      "member direct freeze leaves the agent unpaused",
      after.paused === false,
      String(after.paused),
    );
    result.direct_bypass = record;
  }

  // 2. A non-member cannot create a multisig request.
  if (pristine) {
    const nonceBefore = Number(
      await viewJson(provider, parentId, "get_request_nonce"),
    );
    const attempt = await sendCall(
      stranger.account,
      parentId,
      "add_request",
      multisigRequest(agentId, "freeze"),
      { gasTgas: 100, throwOnFailure: false },
    );
    const info = statusInfo(attempt.final);
    const record = txRecord(attempt, { action: "non_member_add_request" });
    const failureText = failureTextOf(info);
    recorder.check(
      "non-member cannot create a multisig request",
      info.failure && /Predecessor must be a member/i.test(failureText),
      `${record.status} ${failureText.slice(0, 300)}`,
    );
    const nonceAfter = Number(
      await viewJson(provider, parentId, "get_request_nonce"),
    );
    recorder.check(
      "non-member request does not consume a request id",
      nonceAfter === nonceBefore,
      `${nonceBefore} -> ${nonceAfter}`,
    );
    result.non_member = record;
  }

  // 3. 2-of-2 freeze: one confirmation is a no-op; the second executes.
  if (pristine) {
    const add = await sendCall(
      owner1.account,
      parentId,
      "add_request",
      multisigRequest(agentId, "freeze"),
      { gasTgas: 100, throwOnFailure: false },
    );
    const addInfo = statusInfo(add.final);
    if (addInfo.failure || addInfo.failedReceipts.length > 0) {
      throw new Error(`add_request failed: ${JSON.stringify(addInfo.top)}`);
    }
    const requestId = Number(
      successValueText(addInfo.top) ?? "NaN",
    );
    recorder.check(
      "freeze request id parsed",
      Number.isInteger(requestId) && requestId >= 0,
      String(requestId),
    );
    const addRecord = txRecord(add, { action: "freeze_add_request", request_id: requestId });

    const confirmationsAfterAdd = await viewJson(
      provider,
      parentId,
      "get_confirmations",
      { request_id: requestId },
    );
    recorder.check(
      "new freeze request has zero confirmations",
      confirmationsAfterAdd.length === 0,
      JSON.stringify(confirmationsAfterAdd),
    );
    const afterAddState = await viewState(provider, agentId);
    recorder.check(
      "unconfirmed request does not pause the agent",
      afterAddState.paused === false,
      String(afterAddState.paused),
    );

    const first = await sendCall(
      owner1.account,
      parentId,
      "confirm",
      { request_id: requestId },
      { gasTgas: 100, throwOnFailure: false },
    );
    const firstInfo = statusInfo(first.final);
    if (firstInfo.failure || firstInfo.failedReceipts.length > 0) {
      throw new Error(`first confirm failed: ${JSON.stringify(firstInfo.top)}`);
    }
    const confirmationsAfterFirst = await viewJson(
      provider,
      parentId,
      "get_confirmations",
      { request_id: requestId },
    );
    recorder.check(
      "one confirmation is recorded",
      confirmationsAfterFirst.length === 1,
      JSON.stringify(confirmationsAfterFirst),
    );
    const afterFirstState = await viewState(provider, agentId);
    recorder.check(
      "one confirmation does not pause the agent",
      afterFirstState.paused === false,
      String(afterFirstState.paused),
    );
    const firstRecord = txRecord(first, { action: "freeze_first_confirm", request_id: requestId });

    const duplicate = await sendCall(
      owner1.account,
      parentId,
      "confirm",
      { request_id: requestId },
      { gasTgas: 100, throwOnFailure: false },
    );
    const duplicateInfo = statusInfo(duplicate.final);
    const duplicateFailure = failureTextOf(duplicateInfo);
    recorder.check(
      "the same member cannot confirm twice",
      duplicateInfo.failure &&
        /Already confirmed this request/i.test(duplicateFailure),
      `${duplicateInfo.failure} ${duplicateFailure.slice(0, 300)}`,
    );
    const duplicateRecord = txRecord(duplicate, {
      action: "freeze_duplicate_confirm",
      request_id: requestId,
    });

    const started = Date.now();
    const second = await sendCall(
      owner2.account,
      parentId,
      "confirm",
      { request_id: requestId },
      { gasTgas: 150, throwOnFailure: false },
    );
    const secondInfo = statusInfo(second.final);
    const paused = await waitFor(
      "mode B freeze",
      () => viewState(provider, agentId),
      (value) => value.paused === true,
    );
    const wallMs = Date.now() - started;
    recorder.check(
      "second confirmation pauses the agent",
      paused.paused === true,
      String(paused.paused),
    );
    recorder.check(
      "second confirmation has no failed receipts",
      secondInfo.failedReceipts.length === 0,
      JSON.stringify(secondInfo.failedReceipts).slice(0, 300),
    );
    const remaining = await viewJson(provider, parentId, "list_request_ids");
    recorder.check(
      "executed freeze request is removed",
      remaining.length === 0,
      JSON.stringify(remaining),
    );
    const secondRecord = txRecord(second, {
      action: "freeze_second_confirm",
      request_id: requestId,
      wall_ms_to_paused: wallMs,
    });
    result.freeze = {
      request_id: requestId,
      add_request: addRecord,
      first_confirm: firstRecord,
      duplicate_confirm: duplicateRecord,
      second_confirm: secondRecord,
      wall_ms_to_paused: wallMs,
      paused: paused.paused,
      confirmations_after_first: confirmationsAfterFirst.length,
      confirmations_after_add: confirmationsAfterAdd.length,
    };
    state = paused;
  }

  // 4. Frozen execution is refused.
  if (state.paused) {
    const refused = await sendCall(
      accountFor(agentId, agentKeys.operators[0]),
      agentId,
      "execute",
      executeArgs(agentId),
      { gasTgas: 50, throwOnFailure: false },
    );
    const info = statusInfo(refused.final);
    const record = txRecord(refused, { action: "execute_while_frozen" });
    recorder.check(
      "frozen execute is refused with the recorded reason",
      info.failure && refusalOf(info) === "controller is frozen",
      `${record.status} refusal=${record.refusal}`,
    );
    result.frozen_execute = record;
  }

  // 5. 2-of-2 unfreeze; then the same operator key succeeds.
  if (state.paused) {
    const add = await sendCall(
      owner1.account,
      parentId,
      "add_request",
      multisigRequest(agentId, "unfreeze"),
      { gasTgas: 100, throwOnFailure: false },
    );
    const addInfo = statusInfo(add.final);
    if (addInfo.failure || addInfo.failedReceipts.length > 0) {
      throw new Error(`unfreeze add_request failed: ${JSON.stringify(addInfo.top)}`);
    }
    const requestId = Number(successValueText(addInfo.top) ?? "NaN");
    const addRecord = txRecord(add, {
      action: "unfreeze_add_request",
      request_id: requestId,
    });
    const first = await sendCall(
      owner1.account,
      parentId,
      "confirm",
      { request_id: requestId },
      { gasTgas: 100, throwOnFailure: false },
    );
    const firstInfo = statusInfo(first.final);
    if (firstInfo.failure || firstInfo.failedReceipts.length > 0) {
      throw new Error(`unfreeze first confirm failed: ${JSON.stringify(firstInfo.top)}`);
    }
    const afterFirst = await viewState(provider, agentId);
    recorder.check(
      "one unfreeze confirmation does not unpause",
      afterFirst.paused === true,
      String(afterFirst.paused),
    );
    const firstRecord = txRecord(first, {
      action: "unfreeze_first_confirm",
      request_id: requestId,
    });
    const started = Date.now();
    const second = await sendCall(
      owner2.account,
      parentId,
      "confirm",
      { request_id: requestId },
      { gasTgas: 150, throwOnFailure: false },
    );
    const secondInfo = statusInfo(second.final);
    const unpaused = await waitFor(
      "mode B unfreeze",
      () => viewState(provider, agentId),
      (value) => value.paused === false,
    );
    const wallMs = Date.now() - started;
    recorder.check(
      "second unfreeze confirmation unpauses the agent",
      unpaused.paused === false,
      String(unpaused.paused),
    );
    recorder.check(
      "second unfreeze confirmation has no failed receipts",
      secondInfo.failedReceipts.length === 0,
      JSON.stringify(secondInfo.failedReceipts).slice(0, 300),
    );
    const secondRecord = txRecord(second, {
      action: "unfreeze_second_confirm",
      request_id: requestId,
      wall_ms_to_unpaused: wallMs,
    });
    result.unfreeze = {
      request_id: requestId,
      add_request: addRecord,
      first_confirm: firstRecord,
      second_confirm: secondRecord,
      wall_ms_to_unpaused: wallMs,
      paused: unpaused.paused,
    };
    state = unpaused;
  }

  // 6. The operator key works again after unfreeze.
  const restored = await sendCall(
    accountFor(agentId, agentKeys.operators[0]),
    agentId,
    "execute",
    executeArgs(agentId),
    { gasTgas: 50, throwOnFailure: false },
  );
  const restoredInfo = statusInfo(restored.final);
  const restoredRecord = txRecord(restored, { action: "execute_after_unfreeze" });
  const pong = successValueText(restoredInfo.top);
  recorder.check(
    "operator execute succeeds after unfreeze",
    restoredInfo.success && restoredInfo.failedReceipts.length === 0,
    `${restoredRecord.status} ${JSON.stringify(restoredInfo.top)}`,
  );
  recorder.check(
    "restored execute returns pong",
    pong === "pong" ||
      restoredInfo.logs.some((log) => log.includes('"action":"ping"')),
    pong ?? JSON.stringify(restoredInfo.logs).slice(0, 200),
  );
  result.restored_execute = restoredRecord;

  return result;
}

async function runLatency(recorder, latency) {
  const provider = latency.account.provider;
  const adminAccount = accountFor(latency.agentId, latency.adminKey);
  const freezeSamples = [];
  const unfreezeSamples = [];
  const storageBefore = (
    await viewAccount(provider, latency.agentId)
  ).storage_usage;

  const auditBefore = await fetchAudit(provider, latency.agentId);
  const cyclesRemaining = Math.max(
    0,
    Math.ceil((6 - auditBefore.entries.length) / 2),
  );

  for (let cycle = 1; cycle <= cyclesRemaining; cycle += 1) {
    const freezeStart = Date.now();
    const freeze = await sendCall(
      adminAccount,
      latency.agentId,
      "freeze",
      {},
      { gasTgas: 30, throwOnFailure: false },
    );
    const freezeInfo = statusInfo(freeze.final);
    if (freezeInfo.failure || freezeInfo.failedReceipts.length > 0) {
      throw new Error(`latency freeze failed: ${JSON.stringify(freezeInfo.top)}`);
    }
    const frozen = await waitFor(
      "latency freeze",
      () => viewState(provider, latency.agentId),
      (value) => value.paused === true,
    );
    const freezeMs = Date.now() - freezeStart;
    freezeSamples.push({
      cycle,
      wall_ms: freezeMs,
      tx: freeze.txHash,
      block_height: freeze.blockHeight,
      gas_burnt: gasBurnt(freeze.final),
      tokens_burnt: tokensBurnt(freeze.final),
      paused: frozen.paused,
    });

    const unfreezeStart = Date.now();
    const unfreeze = await sendCall(
      adminAccount,
      latency.agentId,
      "unfreeze",
      {},
      { gasTgas: 30, throwOnFailure: false },
    );
    const unfreezeInfo = statusInfo(unfreeze.final);
    if (unfreezeInfo.failure || unfreezeInfo.failedReceipts.length > 0) {
      throw new Error(
        `latency unfreeze failed: ${JSON.stringify(unfreezeInfo.top)}`,
      );
    }
    const unpaused = await waitFor(
      "latency unfreeze",
      () => viewState(provider, latency.agentId),
      (value) => value.paused === false,
    );
    const unfreezeMs = Date.now() - unfreezeStart;
    unfreezeSamples.push({
      cycle,
      wall_ms: unfreezeMs,
      tx: unfreeze.txHash,
      block_height: unfreeze.blockHeight,
      gas_burnt: gasBurnt(unfreeze.final),
      tokens_burnt: tokensBurnt(unfreeze.final),
      paused: unpaused.paused,
    });
  }

  const storageAfter = (
    await viewAccount(provider, latency.agentId)
  ).storage_usage;
  const audit = await fetchAudit(provider, latency.agentId);
  const auditCheck = verifyAuditChain(audit.entries);
  const onChain = await viewJson(provider, latency.agentId, "verify_audit");
  recorder.check(
    "latency agent audit chain recomputes",
    auditCheck.ok,
    auditCheck.error ?? `${audit.entries.length} entries`,
  );
  recorder.check(
    "latency agent audit verifies on-chain",
    onChain === true,
    String(onChain),
  );

  const keys = await viewKeys(provider, latency.agentId);
  const adminEntry = keys.find(
    (entry) =>
      entry.public_key === latency.adminKey.getPublicKey().toString(),
  );
  const allowance =
    functionCallOf(adminEntry ?? { access_key: { permission: {} } })?.allowance ??
    null;

  const freezeTokens = freezeSamples.map((sample) => BigInt(sample.tokens_burnt));
  const meanTokens =
    freezeTokens.length === 0
      ? 0n
      : freezeTokens.reduce((sum, value) => sum + value, 0n) /
        BigInt(freezeTokens.length);
  const allowanceYocto = allowance === null ? 0n : BigInt(allowance);
  const derivedCalls =
    meanTokens === 0n ? null : Number(allowanceYocto / meanTokens);

  const storageDelta = storageAfter - storageBefore;
  const entryCount = audit.entries.length;
  const addedEntries = entryCount - auditBefore.entries.length;
  const bytesPerEntry =
    addedEntries <= 0
      ? null
      : Number((storageDelta / addedEntries).toFixed(2));

  return {
    agent: latency.agentId,
    freeze: formatStats(freezeSamples),
    unfreeze: formatStats(unfreezeSamples),
    storage: {
      before: storageBefore,
      after: storageAfter,
      delta: storageDelta,
      audit_entries_before: auditBefore.entries.length,
      audit_entries_after: entryCount,
      audit_entries_added: addedEntries,
      bytes_per_audit_entry_including_vector_growth: bytesPerEntry,
    },
    admin_allowance_yocto: allowance,
    derived_budget: {
      mean_tokens_burnt_per_freeze: meanTokens.toString(),
      upper_bound_freeze_calls:
        derivedCalls === null ? null : derivedCalls,
      note:
        "Derived from the measured per-call tokens burnt and the native key allowance; this is not a live exhaustion test.",
    },
    audit: {
      len: entryCount,
      head: auditCheck.head,
      on_chain_verify: onChain,
      js_verify: auditCheck.ok,
      entries: audit.entries,
    },
  };
}

async function runIsolation(recorder, latency, modeBAgent) {
  const results = [];

  async function expectSuccess(name, signerId, key, receiverId) {
    const result = await sendCall(
      accountFor(signerId, key),
      receiverId,
      "execute",
      executeArgs(receiverId),
      { gasTgas: 50, throwOnFailure: false },
    );
    const info = statusInfo(result.final);
    const pong = successValueText(info.top);
    recorder.check(
      `${name} succeeds on its own agent`,
      info.success && info.failedReceipts.length === 0 &&
        (pong === "pong" ||
          info.logs.some((log) => log.includes('"action":"ping"'))),
      `${result.txHash} ${pong ?? ""}`,
    );
    results.push({
      name,
      kind: "positive_control",
      status: "success",
      tx: result.txHash,
      block_height: result.blockHeight,
      gas_burnt: gasBurnt(result.final),
      result: pong,
    });
  }

  async function expectProtocolReject(name, signerId, key, receiverId) {
    try {
      const result = await sendCall(
        accountFor(signerId, key),
        receiverId,
        "execute",
        executeArgs(receiverId),
        { gasTgas: 50, throwOnFailure: true },
      );
      throw new Error(
        `${name} unexpectedly succeeded with tx ${result.txHash}`,
      );
    } catch (error) {
      if (String(error.message).includes("unexpectedly succeeded")) throw error;
      const text = String(error.message ?? error);
      recorder.check(
        `${name} is rejected by the native key ACL`,
        /access key|AccessKey|receiver|not allowed|MethodName|InvalidTx/i.test(
          text,
        ),
        text.slice(0, 180),
      );
      results.push({
        name,
        kind: "cross_agent",
        status: "protocol_rejected",
        error: text.slice(0, 600),
      });
    }
  }

  await expectProtocolReject(
    "latency operator key against the Mode B agent",
    latency.agentId,
    latency.operatorKeys[0],
    modeBAgent.agentId,
  );
  await expectSuccess(
    "latency operator key on the latency agent",
    latency.agentId,
    latency.operatorKeys[0],
    latency.agentId,
  );
  await expectProtocolReject(
    "Mode B operator key against the latency agent",
    modeBAgent.agentId,
    modeBAgent.keys.operators[0],
    latency.agentId,
  );
  await expectSuccess(
    "Mode B operator key on the Mode B agent",
    modeBAgent.agentId,
    modeBAgent.keys.operators[0],
    modeBAgent.agentId,
  );

  return results;
}

async function main() {
  const startedAt = nowIso();
  const recorder = makeRecorder();
  const controllerWasm = readFileSync(CONTROLLER_WASM);
  const multisigWasm = readFileSync(MULTISIG_WASM);
  const controllerHash = sha256Hex(controllerWasm);
  const multisigHash = sha256Hex(multisigWasm);
  console.log(`[start] rpc=${RPC}`);
  console.log(
    `[wasm] controller=${controllerWasm.length}B ${controllerHash}`,
  );
  console.log(`[wasm] multisig=${multisigWasm.length}B ${multisigHash}`);

  recorder.check(
    "controller wasm matches the canonical deployed hash",
    controllerHash ===
      "cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f",
    controllerHash,
  );

  const owner1Key = loadExternalKey(`${FAUCET_KEY_ROOT}/${OWNER1}.json`);
  const owner2Key = loadExternalKey(`${FAUCET_KEY_ROOT}/${OWNER2}.json`);
  const owner1 = { id: OWNER1, key: owner1Key, account: accountFor(OWNER1, owner1Key) };
  const owner2 = { id: OWNER2, key: owner2Key, account: accountFor(OWNER2, owner2Key) };
  for (const owner of [owner1, owner2]) {
    const keys = await viewKeys(owner.account.provider, owner.id);
    const own = keys.find(
      (entry) => entry.public_key === owner.key.getPublicKey().toString(),
    );
    recorder.check(
      `${owner.id} owner key is FullAccess`,
      Boolean(own) && permissionOf(own) === "FullAccess",
      own ? permissionOf(own) : "missing",
    );
  }

  const parent = await ensureParent(recorder);
  const parentAccount = parent.account;
  const agentId = process.env.KEYHALT_MODEB_AGENT || `agent-b1.${parent.id}`;
  const latencyAgentId =
    process.env.KEYHALT_MODEB_LATENCY_AGENT || `agent-lat1.${parent.id}`;

  const modeBAgentKeys = {
    operators: Array.from({ length: AGENT_COUNT_KEYS }, (_value, index) =>
      loadOrCreateKey(agentId, `operator-${index}`),
    ),
    operatorTags: ["ops-a", "ops-a", "ops-b", "ops-b"],
  };
  const modeBAgent = await provisionAgent(recorder, parent, {
    agentId,
    mode: "B",
    operatorKeys: modeBAgentKeys.operators,
    operatorTags: modeBAgentKeys.operatorTags,
    createTxOverride: process.env.KEYHALT_MODEB_AGENT_CREATE_TX ?? null,
    initTxOverride: process.env.KEYHALT_MODEB_AGENT_INIT_TX ?? null,
  });
  const modeBState = await viewStateBig(parentAccount.provider, agentId);
  recorder.check(
    "Mode B agent reports mode B",
    modeBState.mode === "B",
    modeBState.mode,
  );
  recorder.check(
    "Mode B admin is the multisig account",
    modeBState.admin_account === parent.id,
    String(modeBState.admin_account),
  );
  recorder.check(
    "Mode B agent has no admin or recovery key",
    modeBState.admin_pk === null && modeBState.recovery_pk === null,
    `${modeBState.admin_pk} ${modeBState.recovery_pk}`,
  );
  recorder.check(
    "Mode B agent has four active operators",
    modeBState.operators.length === 4 &&
      modeBState.operators.every((operator) => operator.active),
    JSON.stringify(modeBState.operators.map((operator) => operator.active)),
  );
  const modeBKeys = await viewKeys(parentAccount.provider, agentId);
  recorder.check(
    "Mode B agent has four FunctionCall keys and zero FullAccess",
    modeBKeys.length === 4 &&
      modeBKeys.every((entry) => permissionOf(entry) === "FunctionCall"),
    JSON.stringify(modeBKeys.map(permissionOf)),
  );
  recorder.check(
    "Mode B agent has no key for the multisig account",
    modeBKeys.every((entry) => functionCallOf(entry)?.receiver_id === agentId),
    JSON.stringify(modeBKeys.map((entry) => functionCallOf(entry)?.receiver_id)),
  );
  const modeBAccount = await viewAccount(parentAccount.provider, agentId);
  recorder.check(
    "Mode B agent on-chain code hash matches the controller wasm",
    codeHashHex(modeBAccount.code_hash) === controllerHash,
    `${modeBAccount.code_hash} -> ${codeHashHex(modeBAccount.code_hash)}`,
  );

  const latencyKeys = {
    admin: loadOrCreateKey(latencyAgentId, "admin"),
    recovery: loadOrCreateKey(latencyAgentId, "recovery"),
    operators: Array.from({ length: AGENT_COUNT_KEYS }, (_value, index) =>
      loadOrCreateKey(latencyAgentId, `operator-${index}`),
    ),
    operatorTags: ["ops-a", "ops-a", "ops-b", "ops-b"],
  };
  const latencyAgent = await provisionAgent(recorder, parent, {
    agentId: latencyAgentId,
    mode: "A",
    adminKey: latencyKeys.admin,
    recoveryKey: latencyKeys.recovery,
    operatorKeys: latencyKeys.operators,
    operatorTags: latencyKeys.operatorTags,
  });
  const latencyState = await viewStateBig(parentAccount.provider, latencyAgentId);
  recorder.check(
    "latency agent reports mode A",
    latencyState.mode === "A",
    latencyState.mode,
  );
  const latencyNativeKeys = await viewKeys(
    parentAccount.provider,
    latencyAgentId,
  );
  recorder.check(
    "latency agent has six FunctionCall keys and zero FullAccess",
    latencyNativeKeys.length === 6 &&
      latencyNativeKeys.every((entry) => permissionOf(entry) === "FunctionCall"),
    JSON.stringify(latencyNativeKeys.map(permissionOf)),
  );
  const latencyAccount = await viewAccount(
    parentAccount.provider,
    latencyAgentId,
  );
  recorder.check(
    "latency agent on-chain code hash matches the controller wasm",
    codeHashHex(latencyAccount.code_hash) === controllerHash,
    `${latencyAccount.code_hash} -> ${codeHashHex(latencyAccount.code_hash)}`,
  );

  const multisig = await ensureMultisig(recorder, parent, multisigWasm);
  recorder.check(
    "multisig on-chain code hash matches the built wasm",
    codeHashHex(multisig.codeHash) === multisigHash,
    `${multisig.codeHash} -> ${codeHashHex(multisig.codeHash)}`,
  );
  const multisigEvidence = {
    ...multisig,
    deployTx: multisig.deployTx,
    initTx: multisig.initTx,
    deleteBootstrapTx: multisig.deleteBootstrapTx,
  };

  // From this point the parent has no keys; only the two members can act.
  const stranger = await ensureStranger(recorder);
  const provider = parentAccount.provider;

  const modeB = await runModeBTests(recorder, {
    parentId: parent.id,
    agentId,
    agentKeys: modeBAgentKeys,
    owner1,
    owner2,
    stranger,
    provider,
  });

  const modeBAudit = await fetchAudit(provider, agentId);
  const modeBAuditCheck = verifyAuditChain(modeBAudit.entries);
  const modeBOnChain = await viewJson(provider, agentId, "verify_audit");
  recorder.check(
    "Mode B audit chain recomputes",
    modeBAuditCheck.ok,
    modeBAuditCheck.error ??
      `${modeBAudit.entries.length} entries, head ${short(modeBAuditCheck.head)}`,
  );
  recorder.check(
    "Mode B audit verifies on-chain",
    modeBOnChain === true,
    String(modeBOnChain),
  );
  recorder.check(
    "Mode B audit contains init, freeze, and unfreeze",
    modeBAudit.entries.map((entry) => entry.action).join(",") ===
      "init,freeze,unfreeze",
    JSON.stringify(modeBAudit.entries.map((entry) => entry.action)),
  );
  const lifecycleAudit = modeBAudit.entries.filter(
    (entry) => entry.action === "freeze" || entry.action === "unfreeze",
  );
  recorder.check(
    "Mode B audit has one freeze and one unfreeze entry",
    lifecycleAudit.length === 2,
    String(lifecycleAudit.length),
  );
  const ownerKeys = new Set([
    owner1.key.getPublicKey().toString(),
    owner2.key.getPublicKey().toString(),
  ]);
  for (const entry of modeBAudit.entries) {
    if (entry.action === "init") {
      recorder.check(
        "init audit entry is the provisioning callback",
        entry.actor_account === "" &&
          entry.signer_pk === "" &&
          entry.subject === "provisioned",
        JSON.stringify({
          actor: entry.actor_account,
          signer: entry.signer_pk,
          subject: entry.subject,
        }),
      );
      continue;
    }
    recorder.check(
      `audit seq ${entry.seq} attributes the action to the multisig`,
      entry.actor_account === parent.id,
      entry.actor_account,
    );
    recorder.check(
      `audit seq ${entry.seq} records an owner signature`,
      ownerKeys.has(entry.signer_pk),
      entry.signer_pk,
    );
  }

  const latency = await runLatency(recorder, {
    agentId: latencyAgentId,
    adminKey: latencyKeys.admin,
    operatorKeys: latencyKeys.operators,
    account: accountFor(latencyAgentId, latencyKeys.admin),
  });

  const isolation = await runIsolation(recorder, {
    agentId: latencyAgentId,
    operatorKeys: latencyKeys.operators,
  }, {
    agentId,
    keys: modeBAgentKeys,
  });

  const finishedAt = nowIso();
  const evidence = {
    run: {
      started_at: startedAt,
      finished_at: finishedAt,
      network: "testnet",
      rpc: RPC,
      parent: parent.id,
      parent_created_by_faucet: parent.created,
      agent: agentId,
      latency_agent: latencyAgentId,
      owners: [OWNER1, OWNER2],
      stranger: stranger.id,
      controller_wasm: {
        bytes: controllerWasm.length,
        sha256: controllerHash,
      },
      multisig_wasm: {
        bytes: multisigWasm.length,
        sha256: multisigHash,
        source: `${MULTISIG_REPO}/tree/${MULTISIG_COMMIT}/multisig2`,
        commit: MULTISIG_COMMIT,
        version: MULTISIG_VERSION,
        license: MULTISIG_LICENSE,
      },
    },
    faucet: {
      parent_tx: parent.faucetTx ?? null,
      stranger_tx: stranger.faucetTx ?? null,
    },
    multisig: multisigEvidence,
    mode_b: {
      provision: {
        create_tx: modeBAgent.createTx?.tx ?? modeBAgent.createTx,
        init_tx: modeBAgent.initTx?.tx ?? modeBAgent.initTx,
        create_tx_source:
          modeBAgent.createTx && typeof modeBAgent.createTx === "object"
            ? "this_run"
            : "env_override",
        init_tx_source:
          modeBAgent.initTx && typeof modeBAgent.initTx === "object"
            ? "this_run"
            : "env_override",
      },
      state: modeBState,
      native_keys: modeBKeys.map((entry) => ({
        public_key: entry.public_key,
        permission: permissionOf(entry),
        receiver_id: functionCallOf(entry)?.receiver_id ?? null,
        method_names: functionCallOf(entry)?.method_names ?? null,
        allowance: functionCallOf(entry)?.allowance ?? null,
      })),
      direct_bypass: modeB.direct_bypass,
      non_member: modeB.non_member,
      freeze: modeB.freeze,
      frozen_execute: modeB.frozen_execute,
      unfreeze: modeB.unfreeze,
      restored_execute: modeB.restored_execute,
      audit: {
        len: modeBAudit.entries.length,
        head: modeBAuditCheck.head,
        on_chain_verify: modeBOnChain,
        js_verify: modeBAuditCheck.ok,
        entries: modeBAudit.entries,
      },
    },
    latency,
    isolation,
    checks: recorder.checks,
    steps: recorder.steps,
    ok: recorder.checks.every((check) => check.ok),
  };

  writeJson(RUN_PATH, evidence);
  writeJson(join(EVIDENCE_DIR, "audit-modeb.json"), {
    account_id: agentId,
    head: modeBAuditCheck.head,
    on_chain_verify: modeBOnChain,
    js_verify: modeBAuditCheck.ok,
    entries: modeBAudit.entries,
  });
  writeJson(join(EVIDENCE_DIR, "audit-latency.json"), {
    account_id: latencyAgentId,
    head: latency.audit.head,
    on_chain_verify: latency.audit.on_chain_verify,
    js_verify: latency.audit.js_verify,
    entries: latency.audit.entries,
  });
  writeJson(join(EVIDENCE_DIR, "build.json"), {
    generated_at: finishedAt,
    multisig: {
      repository: MULTISIG_REPO,
      commit: MULTISIG_COMMIT,
      version: MULTISIG_VERSION,
      license: MULTISIG_LICENSE,
      source_hashes: {
        "Cargo.toml":
          "e701331328e5a6d4c9945ec261560a73c68723b049205dde58771e4b95be414d",
        "Cargo.lock":
          "e00a5ad4dcf75d055cb1e8d0cbdce051c429194fb23e3fd6b3a677e3619cf90e",
        "src/lib.rs":
          "65bc055731f6c5a9344ba3155b9685f95ebdfafe83d938cf3c5bdd10ad458046",
        README:
          "fc40966324c1ad0b08184d0f43e637537080dff6944db6b5817ce4b848bbfdeb",
        "res/multisig2.wasm":
          "f3f9ee3e5e29d020dc73f581ff1490c03dff875ed01327dfebbe666724930a76",
      },
      prebuilt_wasm: {
        bytes: 340613,
        sha256:
          "f3f9ee3e5e29d020dc73f581ff1490c03dff875ed01327dfebbe666724930a76",
        note:
          "Checked-in artifact; not used. The run used the source build below.",
      },
      source_build: {
        bytes: multisigWasm.length,
        sha256: multisigHash,
        command:
          "CARGO_TARGET_DIR=<isolated> CARGO_BUILD_JOBS=2 RUSTFLAGS='-C link-arg=-s' cargo build --locked --target wasm32-unknown-unknown --release",
        toolchain:
          "rustc 1.93.0 (254b59607 2026-01-19), cargo 1.93.0 (083ac5135 2025-12-15)",
      },
      notes: [
        "The access-key allowlist in MULTISIG_METHOD_NAMES names 'add_and_confirm_request' while the method is 'add_request_and_confirm'. Account members are used, so this ACL typo is not exercised.",
        "SetNumConfirmations has no bound check against the member count; this run never calls it.",
        "execute_request removes the request before the promise executes; a failed inner call loses the request. This run verifies the inner call succeeded.",
        "The multisig can deploy code to itself through the DeployContract action; that is the owner's power, not the controller's.",
        "No third-party audit was found; the upstream README disclaims guarantees.",
      ],
    },
  });

  console.log(`[done] mode B evidence written to ${RUN_PATH}`);
  console.log(
    `[done] audit entries=${modeBAudit.entries.length} head=${modeBAuditCheck.head}`,
  );
  console.log(
    `[done] latency freeze mean=${latency.freeze?.mean_ms}ms unfreeze mean=${latency.unfreeze?.mean_ms}ms`,
  );
  console.log(`[done] checks=${recorder.checks.length} ok=${evidence.ok}`);
  if (!evidence.ok) process.exit(1);
}

main().catch((error) => {
  console.error(`[fatal] ${error?.stack ?? error}`);
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, "run-failed.json"),
      `${JSON.stringify(
        {
          at: nowIso(),
          error: String(error?.stack ?? error),
        },
        replacer,
        2,
      )}\n`,
      { mode: 0o644 },
    );
  } catch {
    // Ignore evidence-write failures; the original error is more important.
  }
  process.exit(1);
});
