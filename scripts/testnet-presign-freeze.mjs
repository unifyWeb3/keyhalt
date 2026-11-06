#!/usr/bin/env node
/**
 * FLEET v0.3 — pre-signed freeze on NEAR testnet.
 *
 * Testnet only. No mainnet, no spend, no registration.
 *
 * The script drives the published CLI (packages/cli) through the whole
 * pre-signed path:
 *
 *   1. `fleet freeze <agent> --pre-sign --out <file>` signs the call locally
 *      and writes it out without broadcasting it;
 *   2. the agent must still be unfrozen at this point — a pre-signed
 *      transaction must not change any state;
 *   3. `fleet freeze <agent> --submit-signed <file>` broadcasts the signed
 *      transaction;
 *   4. the agent must now be frozen, and the audit chain must have grown by
 *      one entry;
 *   5. `fleet unfreeze <agent>` restores the agent.
 *
 * The signed file holds a signature, not a secret key. The script checks the
 * file mode (600), checks that it carries no secret key, and deletes it at
 * the end. The secret key itself never leaves the key file.
 *
 * Usage:
 *   node scripts/testnet-presign-freeze.mjs
 *
 * Environment:
 *   FLEET_RPC           RPC URL (default: https://rpc.testnet.fastnear.com)
 *   FLEET_PRESIGN_AGENT agent account id
 *   FLEET_SDK_KEY_ROOT  directory with the agent key files
 *
 * Evidence: evidence/sdk-v03/presign.json
 */

import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createFleetClient } from "../packages/sdk/dist/index.js";

const run = promisify(execFile);

const RPC = process.env.FLEET_RPC || "https://rpc.testnet.fastnear.com";
if (/mainnet/i.test(RPC) || process.env.NEAR_MAINNET) {
  console.error("refusing to run against mainnet");
  process.exit(2);
}

const AGENT =
  process.env.FLEET_PRESIGN_AGENT || "agent-lat.fleet-lat-1a1a7db6741.testnet";
const KEY_ROOT =
  process.env.FLEET_SDK_KEY_ROOT || "/root/.near-fallback-keys/fleet-v03/modeb";
const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url));
const SIGNED_DIR = resolve("evidence/sdk-v03");
const EVIDENCE = join(SIGNED_DIR, "presign.json");

function keyPath(accountId, role) {
  return join(KEY_ROOT, `${accountId.replaceAll(".", "_")}__${role}.json`);
}

function loadSecret(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const secret = value.secret_key ?? value.private_key;
  if (!secret) throw new Error(`missing secret key in ${path}`);
  return secret;
}

async function fleet(args) {
  const { stdout } = await run(process.execPath, [CLI, ...args]);
  return JSON.parse(stdout);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function isTransient(message) {
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|timeout|\b(429|500|502|503|504)\b/i.test(
    message,
  );
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Retry a read-only SDK call on a transient RPC error. The public testnet
 * RPC occasionally drops a connection; the call itself is idempotent.
 */
async function withRetry(label, action) {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = String(error?.message ?? error);
      if (!isTransient(lastError) || attempt === 5) {
        console.error(`[presign] ${label} failed: ${lastError}`);
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`${label}: ${lastError}`);
}

/**
 * Unfreeze the agent through the CLI. The script calls this on the normal
 * path and in the failure path, so a run that dies half-way never leaves the
 * agent frozen.
 */
async function unfreezeAgent(client, adminPath) {
  const state = await withRetry("get_state", () => client.getState());
  if (!state.paused) {
    return { ok: true, txHash: "", skipped: true };
  }
  return fleet([
    "unfreeze",
    AGENT,
    "--signer-key-file",
    adminPath,
    "--rpc-url",
    RPC,
    "--json",
  ]);
}

async function main() {
  const adminPath = keyPath(AGENT, "admin");
  const secret = loadSecret(adminPath);
  const client = createFleetClient({ rpcUrl: RPC, accountId: AGENT, signer: secret });

  const before = await withRetry("get_state", () => client.getState());
  if (before.paused) {
    throw new Error("agent is frozen; unfreeze it before the pre-sign run");
  }

  mkdirSync(SIGNED_DIR, { recursive: true, mode: 0o700 });
  const signedPath = join(SIGNED_DIR, "presign-freeze.json");
  rmSync(signedPath, { force: true });

  console.log(`[presign] rpc=${RPC} agent=${AGENT}`);

  try {
    // 1. Sign locally, do not broadcast.
  const preSigned = await fleet([
    "freeze",
    AGENT,
    "--signer-key-file",
    adminPath,
    "--pre-sign",
    "--out",
    signedPath,
    "--rpc-url",
    RPC,
    "--json",
  ]);
  assert(preSigned.ok === true, "pre-sign must succeed");
  assert(preSigned.phase === "pre-signed", "pre-sign must report the pre-signed phase");
  assert(
    preSigned.txHash === preSigned.txHash && preSigned.txHash.length > 20,
    "pre-sign must report a transaction hash",
  );

  // 2. The file is a signature, not a secret, and it is mode 600.
  const mode = statSync(signedPath).mode & 0o777;
  assert(mode === 0o600, `signed file must be mode 600, got ${mode.toString(8)}`);
  const raw = readFileSync(signedPath, "utf8");
  assert(
    !/"(secret_key|private_key|seed_phrase|mnemonic)"\s*:/i.test(raw),
    "signed file must not contain key material",
  );
  assert(!raw.includes(secret), "signed file must not contain the secret key");
  const payload = JSON.parse(raw);
  assert(
    payload.format === "fleet-signed-tx-v1",
    "signed file must carry the FLEET format marker",
  );
  assert(payload.method === "freeze", "signed file must carry the freeze method");
  assert(payload.network === "testnet", "signed file must target testnet");

  // 3. Nothing was broadcast: the agent is still unfrozen.
  const afterPreSign = await withRetry("get_state", () => client.getState());
  assert(
    afterPreSign.paused === false,
    "a pre-signed transaction must not change any state",
  );
  assert(
    afterPreSign.auditLength === before.auditLength,
    "a pre-signed transaction must not append an audit entry",
  );

  // 4. Broadcast the signed transaction.
  const submitted = await fleet([
    "freeze",
    AGENT,
    "--submit-signed",
    signedPath,
    "--rpc-url",
    RPC,
    "--json",
  ]);
  assert(submitted.ok === true, "submit-signed must succeed");
  assert(submitted.phase === "submitted", "submit-signed must report the submitted phase");

  // 5. The agent is frozen and the audit chain grew by one entry.
  const afterSubmit = await withRetry("get_state", () => client.getState());
  assert(afterSubmit.paused === true, "the agent must be frozen after the submission");
  assert(
    afterSubmit.auditLength === before.auditLength + 1,
    "the freeze must append exactly one audit entry",
  );
  assert(
    (await withRetry("verify_audit", () => client.verifyAuditOnChain())) === true,
    "the audit chain must stay verifiable",
  );

    // 6. Restore the agent.
    const unfrozen = await unfreezeAgent(client, adminPath);
    assert(unfrozen.ok === true, "unfreeze must succeed");
    const restored = await withRetry("get_state", () => client.getState());
    assert(restored.paused === false, "the agent must be unfrozen again");

    const report = {
    generated_at: new Date().toISOString(),
    network: "testnet",
    rpc: RPC,
    agent: AGENT,
    path: "packages/cli fleet freeze --pre-sign / --submit-signed",
    pre_signed: {
      tx_hash: preSigned.txHash,
      public_key: preSigned.publicKey,
      nonce: preSigned.nonce,
      created_at: preSigned.createdAt,
      file_mode: "600",
      carries_key_material: false,
      state_changed: false,
      audit_len_before: before.auditLength,
      audit_len_after_pre_sign: afterPreSign.auditLength,
    },
    submitted: {
      tx_hash: submitted.txHash,
      block_height: submitted.blockHeight,
      gas_burnt: submitted.gasBurnt,
      refusal: submitted.refusal,
      paused_after_submit: afterSubmit.paused,
      audit_len_after_submit: afterSubmit.auditLength,
      audit_chain_verifiable: await withRetry("verify_audit", () => client.verifyAuditOnChain()),
    },
    restored: {
      tx_hash: unfrozen.txHash,
      paused: restored.paused,
    },
  };

    writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

    console.log(
      `[presign] pre-signed ${preSigned.txHash} (not sent) -> submitted ${submitted.txHash} -> agent restored`,
    );
    console.log(`[presign] evidence -> ${EVIDENCE}`);
  } finally {
    // A run that dies half-way must not leave the agent frozen.
    rmSync(signedPath, { force: true });
    try {
      const state = await withRetry("get_state", () => client.getState());
      if (state.paused) {
        console.log("[presign] restoring the agent (unfreeze)");
        await unfreezeAgent(client, adminPath);
      }
    } catch (error) {
      console.error(`[presign] could not restore the agent: ${error?.message ?? error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
