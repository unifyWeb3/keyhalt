#!/usr/bin/env node
/**
 * Keyhalt v0.3 testnet smoke test.
 *
 * Uses a faucet-funded throwaway parent and provisions one native sub-account
 * agent with the controller wasm. The managed agent is created with
 * CreateAccount + Transfer + DeployContract and receives only FunctionCall keys
 * from the controller init; no FullAccess key is added.
 *
 * Key material is kept outside the repository under
 * /root/.near-fallback-keys/fleet-v03 (mode 700, files 600). This script never
 * prints secret keys or seed phrases.
 */

import { Account, KeyPair, actions, teraToGas } from "near-api-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

const RPC = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  throw new Error("Keyhalt is testnet-only; refusing mainnet");
}

const FUNDER = process.env.KEYHALT_PARENT || "fleet-v03-5cff9e99.testnet";
const CREDENTIALS =
  process.env.KEYHALT_PARENT_KEY ||
  `/root/.near-fallback-keys/fleet-v03-faucet/${FUNDER}.json`;
const KEY_ROOT = "/root/.near-fallback-keys/fleet-v03";
const WASM = new URL("../target/wasm32-unknown-unknown/release/fleet_controller.wasm", import.meta.url);
const AGENT_BALANCE = 3_000_000_000_000_000_000_000_000n; // 3 NEAR; ~2.49 is code storage

const cls = "smoke";

function tag() {
  return randomBytes(4).toString("hex");
}

function loadFunder() {
  const raw = JSON.parse(readFileSync(CREDENTIALS, "utf8"));
  const secret = raw.secret_key || raw.private_key;
  if (!secret) throw new Error("funder credentials missing a private key field");
  return secret;
}

function saveKey(path, keyPair) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const body = JSON.stringify({
    public_key: keyPair.getPublicKey().toString(),
    secret_key: keyPair.toString(),
  });
  writeFileSync(path, body, { mode: 0o600 });
}

function keyFor(name) {
  const path = join(KEY_ROOT, cls, `${name}.json`);
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return KeyPair.fromString(raw.secret_key);
  }
  const pair = KeyPair.fromRandom("ed25519");
  saveKey(path, pair);
  return pair;
}

function keyName(agent, role) {
  return `${agent.replaceAll(".", "_")}__${role}`;
}

async function viewState(provider, agentId) {
  return provider.callFunction({
    contractId: agentId,
    method: "get_state",
    args: {},
  });
}

function stringify(value) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

async function main() {
  const funderSecret = loadFunder();
  const parent = new Account(FUNDER, RPC, funderSecret);
  const suffix = tag();
  const existingAgent = process.env.KEYHALT_AGENT;
  const agentId = existingAgent || `agent-smoke-${suffix}.${FUNDER}`;
  console.log(`Keyhalt SMOKE: parent=${FUNDER} agent=${agentId}${existingAgent ? " (reuse)" : ""}`);

  const wasmBytes = new Uint8Array(readFileSync(WASM));
  const wasmHash = createHash("sha256").update(wasmBytes).digest("hex");
  console.log(`WASM: bytes=${wasmBytes.length} sha256=${wasmHash}`);

  let createTx = "reused";
  let initTx = "reused";
  if (!existingAgent) {
    const createAgent = await parent.signAndSendTransaction({
      receiverId: agentId,
      actions: [
        actions.createAccount(),
        actions.transfer(AGENT_BALANCE),
        actions.deployContract(wasmBytes),
      ],
    });
    createTx = createAgent.transaction_outcome.id;
    console.log(`CREATE_AGENT: tx=${createTx}`);
  }

  const admin = keyFor(keyName(agentId, "admin"));
  const recovery = keyFor(keyName(agentId, "recovery"));
  const operators = [0, 1, 2, 3].map((i) => keyFor(keyName(agentId, `operator-${i}`)));

  if (!existingAgent) {
    const initArgs = {
      config: {
        mode: "A",
        admin_pk: admin.getPublicKey().toString(),
        recovery_pk: recovery.getPublicKey().toString(),
        admin_account: null,
        operator_keys: operators.map((pair, i) => ({
          public_key: pair.getPublicKey().toString(),
          tag: `op-${i % 2}`,
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
    });
    initTx = init.transaction_outcome.id;
    console.log(`INIT: tx=${initTx}`);
  }

  let state;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = await viewState(parent.provider, agentId);
    if (state?.provisioned) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`STATE: ${stringify(state)}`);

  const agentKeys = await parent.provider.viewAccessKeyList({
    accountId: agentId,
    finalityQuery: { finality: "final" },
  });
  const summary = agentKeys.keys.map((entry) => ({
    public_key: entry.public_key,
    permission:
      typeof entry.access_key.permission === "string"
        ? entry.access_key.permission
        : entry.access_key.permission.FunctionCall,
  }));
  console.log(`AGENT_KEYS: ${stringify(summary)}`);

  const fullAccess = summary.filter((entry) => entry.permission === "FullAccess");
  const functionCall = summary.filter((entry) => entry.permission !== "FullAccess");
  if (fullAccess.length !== 0) throw new Error("agent has a FullAccess key");
  if (functionCall.length !== 6) throw new Error(`expected 6 function-call keys, got ${functionCall.length}`);
  if (!state?.provisioned) throw new Error("controller did not reach provisioned=true");
  if (state.operators.length !== 4) throw new Error(`expected 4 operators, got ${state.operators.length}`);
  if (!state.operators.every((operator) => operator.active)) {
    throw new Error("not every operator was activated by the provisioning callback");
  }
  if (state.receiver !== agentId || state.method !== "ping") {
    throw new Error("controller receiver/method mismatch");
  }
  if (state.audit_len !== 1) throw new Error(`expected one audit entry, got ${state.audit_len}`);
  if (!(await parent.provider.callFunction({ contractId: agentId, method: "verify_audit", args: {} }))) {
    throw new Error("audit chain does not verify");
  }

  console.log("Keyhalt SMOKE: PASS");
  console.log(`SUMMARY: ${stringify({ agent: agentId, create_tx: createTx, init_tx: initTx, wasm_sha256: wasmHash, keys: summary.length, full_access: 0, operators: state.operators.length, provisioned: state.provisioned })}`);
}

main().catch((error) => {
  console.error("Keyhalt SMOKE: FAIL");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
