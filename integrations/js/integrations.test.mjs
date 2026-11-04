// FLEET controller near-workspaces integration tests (Sandbox only).
//
// These tests run in the GitHub Actions x64 runner. The local arm64 host
// cannot run near-workspaces, so they are wired to the `integration` workflow
// instead of `make verify`. No network, no mainnet, no keys outside the
// ephemeral sandbox: every key pair is generated in memory for this run.

import {after, before, describe, it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {KeyPair} from "near-api-js";
import {parseNEAR, Worker} from "near-workspaces";

const WASM = fileURLToPath(
  new URL(
    "../../target/wasm32-unknown-unknown/release/fleet_controller.wasm",
    import.meta.url,
  ),
);

const GAS = 30_000_000_000_000n;
const AGENT_BALANCE = BigInt(parseNEAR("10"));
const OPERATOR_BALANCE = BigInt(parseNEAR("2"));

// The controller is allowlisted to exactly one receiver and one method.
const RECEIVER_METHOD = "ping";

async function setup() {
  const worker = await Worker.init({network: "sandbox"});
  const root = worker.rootAccount;
  const wasm = readFileSync(WASM);

  // Operator keys are fresh key pairs, exactly like the testnet flow: the
  // managed account receives them as FunctionCall-only keys, so no operator
  // account keeps a FullAccess key of its own on the agent.
  const operatorTags = ["ops-a", "ops-a", "ops-b", "ops-b"];
  const operators = [];
  for (const [index, tag] of operatorTags.entries()) {
    const keyPair = KeyPair.fromRandom("ed25519");
    const account = await root.createSubAccount(`op${index}`, {
      initialBalance: OPERATOR_BALANCE,
    });
    operators.push({
      account,
      tag,
      keyPair,
      publicKey: keyPair.getPublicKey().toString(),
    });
  }

  const agentId = `agent.${root.accountId}`;
  const createResult = await root
    .batch(agentId)
    .createAccount()
    .transfer(AGENT_BALANCE)
    .deployContract(wasm)
    .transact();
  assert.equal(createResult.succeeded, true, "agent creation must succeed");
  const agent = root.getAccount(agentId);

  const config = {
    mode: "B",
    admin_pk: null,
    recovery_pk: null,
    admin_account: root.accountId,
    operator_keys: operators.map((op) => ({
      public_key: op.publicKey,
      tag: op.tag,
    })),
    receiver: agentId,
    method: RECEIVER_METHOD,
    max_operators: 16,
    admin_allowance_yocto: null,
    operator_allowance_yocto: null,
  };
  await root.call(agent, "new", config, {gas: GAS});

  return {worker, root, agent, operators, config};
}

describe("fleet-controller integration (near-workspaces sandbox)", () => {
  let worker;
  let root;
  let agent;
  let operators;

  before(async () => {
    ({worker, root, agent, operators} = await setup());
  });

  after(async () => {
    if (worker) await worker.tearDown();
  });

  it("provisions a Mode B agent with four active FunctionCall operators", async () => {
    const state = await agent.view("get_state");
    assert.equal(state.mode, "B");
    assert.equal(state.paused, false);
    assert.equal(state.admin_account, root.accountId);
    assert.equal(state.admin_pk, null);
    assert.equal(state.recovery_pk, null);
    assert.equal(state.provisioned, true);
    assert.equal(state.operators.length, 4);
    assert.equal(
      state.operators.filter((op) => op.active).length,
      4,
      "every operator must be active after provisioning",
    );
    assert.equal(state.audit_len, 1);
  });

  it("holds no FullAccess key and no key outside the execute allowlist", async () => {
    const keys = await agent.viewAccessKeys(agent.accountId);
    assert.equal(keys.keys.length, 4, "one key per operator");
    for (const entry of keys.keys) {
      assert.notEqual(entry.access_key.permission, "FullAccess");
      assert.equal(entry.access_key.permission.FunctionCall.receiver_id, agent.accountId);
      assert.deepEqual(entry.access_key.permission.FunctionCall.method_names, ["execute"]);
    }
  });

  it("records a verifiable audit chain after init", async () => {
    assert.equal(await agent.view("verify_audit"), true);
    const entries = await agent.view("get_audit", {from_seq: 0, limit: 10});
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "init");
  });

  it("refuses a freeze from a non-admin predecessor without changing state", async () => {
    const stranger = await root.createSubAccount("stranger", {
      initialBalance: OPERATOR_BALANCE,
    });
    const attempt = await stranger.callRaw(agent, "freeze", {}, {gas: GAS});
    assert.equal(attempt.failed, true, "a non-admin freeze must fail");
    const state = await agent.view("get_state");
    assert.equal(state.paused, false);
    assert.equal(state.audit_len, 1, "a refused call must not append an audit entry");
  });

  it("executes through the operator key and returns pong", async () => {
    const result = await operators[0].account.callRaw(
      agent,
      "execute",
      {
        receiver_id: agent.accountId,
        method_name: RECEIVER_METHOD,
        args: "{}",
        gas: 10_000_000_000_000,
      },
      {gas: GAS, signWithKey: operators[0].keyPair},
    );
    assert.equal(result.succeeded, true, JSON.stringify(result.failures));
    assert.ok(
      result.logsContain("pong") || result.logsContain('"event":"ping"'),
      `expected ping logs, got: ${JSON.stringify(result.logs)}`,
    );
  });

  it("freezes, refuses execute, and unfreezes again", async () => {
    await root.call(agent, "freeze", {}, {gas: GAS});
    let state = await agent.view("get_state");
    assert.equal(state.paused, true);

    const frozen = await operators[0].account.callRaw(
      agent,
      "execute",
      {
        receiver_id: agent.accountId,
        method_name: RECEIVER_METHOD,
        args: "{}",
        gas: 10_000_000_000_000,
      },
      {gas: GAS, signWithKey: operators[0].keyPair},
    );
    assert.equal(frozen.failed, true, "a frozen execute must fail");
    assert.match(JSON.stringify(frozen.failures), /frozen/i);

    await root.call(agent, "unfreeze", {}, {gas: GAS});
    state = await agent.view("get_state");
    assert.equal(state.paused, false);

    const restored = await operators[0].account.callRaw(
      agent,
      "execute",
      {
        receiver_id: agent.accountId,
        method_name: RECEIVER_METHOD,
        args: "{}",
        gas: 10_000_000_000_000,
      },
      {gas: GAS, signWithKey: operators[0].keyPair},
    );
    assert.equal(restored.succeeded, true, JSON.stringify(restored.failures));
  });

  it("keeps the audit chain verifiable after freeze and unfreeze", async () => {
    assert.equal(await agent.view("verify_audit"), true);
    const state = await agent.view("get_state");
    assert.equal(state.audit_len, 3, "init + freeze + unfreeze");
    const entries = await agent.view("get_audit", {from_seq: 0, limit: 10});
    assert.deepEqual(
      entries.map((entry) => entry.action),
      ["init", "freeze", "unfreeze"],
    );
  });
});
