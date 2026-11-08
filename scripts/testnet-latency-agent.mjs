#!/usr/bin/env node
/**
 * Keyhalt v0.3 latency agent provisioning.
 *
 * Testnet only. Creates a dedicated Mode A agent for the latency harness so
 * that the canonical agents are never mutated by a measurement run.
 *
 * The agent gets a fresh admin key whose allowance is the controller maximum
 * (1 NEAR, `admin_allowance_yocto`). The default admin allowance (0.1 NEAR)
 * is consumed by the gas of every admin call, so a 40-call measurement needs
 * more headroom than the default allows.
 *
 * The parent account is funded by the public NEAR testnet faucet. Secret keys
 * live outside the repository under /root/.near-fallback-keys/fleet-v03/modeb
 * (mode 700/600) and are never printed; the manifest holds public data only.
 */
import {
  Account,
  KeyPair,
  actions,
  teraToGas,
} from "near-api-js";
import { setDefaultResultOrder } from "node:dns";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { installHttpsFetch } from "./lib/https-fetch.mjs";

setDefaultResultOrder("ipv4first");
installHttpsFetch();

const RPC = process.env.KEYHALT_RPC || "https://rpc.testnet.fastnear.com";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  throw new Error("Keyhalt is testnet-only; refusing mainnet");
}
const KEY_ROOT = "/root/.near-fallback-keys/fleet-v03/modeb";
const CONTROLLER_WASM = resolve(
  "target/wasm32-unknown-unknown/release/fleet_controller.wasm",
);
const EVIDENCE_DIR = resolve("evidence/latency-v03");
const AGENT_BALANCE = 4_000_000_000_000_000_000_000_000n; // 4 NEAR
const ADMIN_ALLOWANCE = "1000000000000000000000000"; // 1 NEAR, controller maximum
const OPERATOR_TAGS = ["ops-a", "ops-a", "ops-b", "ops-b"];
const FAUCET_URL = "https://helper.testnet.near.org/account";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, label, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const text = `${error?.message ?? error} ${error?.cause ?? ""}`;
      const retryable =
        /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|timeout/i.test(
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

function keyPath(accountId, role) {
  return join(KEY_ROOT, `${accountId.replaceAll(".", "_")}__${role}.json`);
}

function saveKey(accountId, role, keyPair) {
  const path = keyPath(accountId, role);
  mkdirSync(KEY_ROOT, { recursive: true, mode: 0o700 });
  const secret = keyPair.secretKey.startsWith("ed25519:")
    ? keyPair.secretKey
    : `ed25519:${keyPair.secretKey}`;
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        public_key: keyPair.getPublicKey().toString(),
        secret_key: secret,
        account_id: accountId,
        role,
      },
      null,
      1,
    )}\n`,
    { mode: 0o600 },
  );
  return path;
}

function loadKey(accountId, role) {
  const path = keyPath(accountId, role);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function accountFor(accountId, secretKey) {
  return new Account(accountId, RPC, secretKey);
}

function statusInfo(result) {
  const top = result.status;
  const failed = Boolean(top && typeof top === "object" && "Failure" in top);
  const failedReceipts = (result.receipts_outcome ?? []).filter(
    (receipt) => receipt.outcome.status && "Failure" in receipt.outcome.status,
  );
  return { top, failed, failedReceipts };
}

async function sendActions(account, receiverId, actionList, gasTgas = 100) {
  const result = await account.signAndSendTransaction({
    receiverId,
    actions: actionList,
    waitUntil: "EXECUTED_OPTIMISTIC",
    throwOnFailure: false,
  });
  return result;
}

async function viewAccount(provider, accountId) {
  const response = await withRetry(
    () =>
      provider.sendJsonRpc("query", {
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
      }),
    `view_account ${accountId}`,
  );
  return response;
}

async function viewKeys(provider, accountId) {
  const response = await withRetry(
    () =>
      provider.sendJsonRpc("query", {
        request_type: "view_access_key_list",
        finality: "final",
        account_id: accountId,
      }),
    `view_keys ${accountId}`,
  );
  return response.keys;
}

async function viewState(provider, agentId) {
  const response = await withRetry(
    () =>
      provider.sendJsonRpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: agentId,
        method_name: "get_state",
        args_base64: Buffer.from("{}", "utf8").toString("base64"),
      }),
    `view_state ${agentId}`,
  );
  const raw = response.result;
  const text = Array.isArray(raw)
    ? Buffer.from(raw).toString("utf8")
    : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

async function waitFor(label, fn, predicate, timeoutMs = 120_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`timeout: ${label}; last=${JSON.stringify(last)?.slice(0, 300)}`);
}

async function faucet(accountId, publicKey) {
  const response = await withRetry(
    () =>
      fetch(FAUCET_URL, {
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
    throw new Error(`faucet HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body?.error) {
    throw new Error(`faucet error: ${JSON.stringify(body.error).slice(0, 300)}`);
  }
  return body;
}

async function ensureParent() {
  const existing = process.env.KEYHALT_LATENCY_PARENT;
  if (existing) {
    const key = loadKey(existing, "latency-parent");
    if (!key) throw new Error(`missing latency-parent key for ${existing}`);
    return { id: existing, key, created: false, faucetTx: null };
  }
  const id = `fleet-lat-${Date.now().toString(16)}.testnet`;
  const keyPair = KeyPair.fromRandom("ed25519");
  saveKey(id, "latency-parent", keyPair);
  console.log(`[parent] faucet ${id}`);
  const body = await faucet(id, keyPair.getPublicKey().toString());
  const account = accountFor(id, keyPair.secretKey);
  await waitFor(
    "parent visible",
    () => viewAccount(account.provider, id).then(() => true),
    (value) => value === true,
  );
  const faucetTx = body?.transaction_outcome?.id ?? body?.tx_hash ?? null;
  return {
    id,
    key: { public_key: keyPair.getPublicKey().toString(), secret_key: keyPair.secretKey },
    created: true,
    faucetTx,
  };
}

async function main() {
  console.log(`[latency-agent] rpc=${RPC}`);
  const parent = await ensureParent();
  const parentAccount = accountFor(parent.id, parent.key.secret_key);
  const provider = parentAccount.provider;
  const balance = await viewAccount(provider, parent.id);
  console.log(
    `[parent] ${parent.id} balance=${Number(balance.amount) / 1e24} NEAR`,
  );
  if (Number(balance.amount) / 1e24 < 5) {
    throw new Error(
      `parent ${parent.id} has ${Number(balance.amount) / 1e24} NEAR; at least 5 NEAR is needed`,
    );
  }

  const agentId = `agent-lat.${parent.id}`;
  const admin = KeyPair.fromRandom("ed25519");
  const recovery = KeyPair.fromRandom("ed25519");
  const operators = OPERATOR_TAGS.map(() => KeyPair.fromRandom("ed25519"));
  saveKey(agentId, "admin", admin);
  saveKey(agentId, "recovery", recovery);
  operators.forEach((keyPair, index) => saveKey(agentId, `operator-${index}`, keyPair));

  const wasm = readFileSync(CONTROLLER_WASM);
  const create = await sendActions(parentAccount, agentId, [
    actions.createAccount(),
    actions.transfer(AGENT_BALANCE),
    actions.deployContract(wasm),
  ]);
  const createInfo = statusInfo(create);
  if (createInfo.failed || createInfo.failedReceipts.length > 0) {
    throw new Error(`agent create failed: ${JSON.stringify(createInfo.top)}`);
  }
  console.log(`[agent] create tx=${create.transaction_outcome.id}`);

  const initArgs = {
    config: {
      mode: "A",
      admin_pk: admin.getPublicKey().toString(),
      recovery_pk: recovery.getPublicKey().toString(),
      admin_account: null,
      operator_keys: operators.map((keyPair, index) => ({
        public_key: keyPair.getPublicKey().toString(),
        tag: OPERATOR_TAGS[index],
      })),
      receiver: agentId,
      method: "ping",
      max_operators: 16,
      admin_allowance_yocto: ADMIN_ALLOWANCE,
      operator_allowance_yocto: null,
    },
  };
  const init = await parentAccount.signAndSendTransaction({
    receiverId: agentId,
    actions: [actions.functionCall("new", initArgs, teraToGas(100), 0n)],
    waitUntil: "EXECUTED_OPTIMISTIC",
    throwOnFailure: false,
  });
  const initInfo = statusInfo(init);
  if (initInfo.failed || initInfo.failedReceipts.length > 0) {
    throw new Error(`agent init failed: ${JSON.stringify(initInfo.top)}`);
  }
  console.log(`[agent] init tx=${init.transaction_outcome.id}`);

  const state = await waitFor(
    "agent provisioned",
    () => viewState(provider, agentId),
    (value) => value?.provisioned === true,
  );
  const keys = await viewKeys(provider, agentId);
  const fullAccess = keys.filter(
    (entry) => entry.access_key.permission === "FullAccess",
  );
  if (fullAccess.length > 0) {
    throw new Error(
      `agent ${agentId} holds ${fullAccess.length} FullAccess keys after provisioning`,
    );
  }
  const adminKey = keys.find(
    (entry) => entry.public_key === admin.getPublicKey().toString(),
  );
  const adminAllowance =
    adminKey?.access_key.permission?.FunctionCall?.allowance ?? null;

  const manifest = {
    generated_at: new Date().toISOString(),
    network: "testnet",
    rpc: RPC,
    parent: {
      account_id: parent.id,
      public_key: parent.key.public_key,
      faucet_tx: parent.faucetTx,
      created_by_faucet: parent.created,
    },
    agent: {
      account_id: agentId,
      mode: "A",
      create_tx: create.transaction_outcome.id,
      init_tx: init.transaction_outcome.id,
      admin_public_key: admin.getPublicKey().toString(),
      recovery_public_key: recovery.getPublicKey().toString(),
      operator_public_keys: operators.map((keyPair) => keyPair.getPublicKey().toString()),
      admin_allowance_yocto: ADMIN_ALLOWANCE,
      admin_allowance_on_chain: adminAllowance,
      operator_tags: OPERATOR_TAGS,
      receiver: state.receiver,
      method: state.method,
      provisioned: state.provisioned,
      audit_len: state.audit_len,
    },
    key_check: {
      total_keys: keys.length,
      full_access_keys: fullAccess.length,
      function_call_keys: keys.length - fullAccess.length,
    },
  };
  mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(EVIDENCE_DIR, "agent.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
  console.log(
    `[agent] ${agentId} keys=${keys.length} full_access=${fullAccess.length} admin_allowance=${adminAllowance}`,
  );
  console.log(`[agent] wrote ${join(EVIDENCE_DIR, "agent.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
