import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createFleetClient,
  FLEET_SDK_VERSION,
  FleetError,
  normalizeAuditEntry,
  parseBigJson,
  verifyAuditChain,
  verifyAuditExport,
} from "../dist/index.js";

const evidence = new URL("../../../evidence/testnet-v03/audit-agent-1.json", import.meta.url);
const exported = new URL("../../../evidence/cli-v03/agent-2-audit.json", import.meta.url);

function loadEntries(url) {
  const raw = JSON.parse(readFileSync(url, "utf8"));
  return raw.entries.map(normalizeAuditEntry);
}

test("SDK exposes the v0.3 version", () => {
  assert.equal(FLEET_SDK_VERSION, "0.3.0");
});

test("SDK refuses a mainnet RPC before any network call", () => {
  assert.throws(
    () =>
      createFleetClient({
        rpcUrl: "https://rpc.mainnet.near.org",
        accountId: "agent.testnet",
      }),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_MAINNET");
      return true;
    },
  );
});

test("SDK write path refuses a missing signer before any network call", async () => {
  const client = createFleetClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.freeze(),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_NO_SIGNER");
      return true;
    },
  );
});

test("parseBigJson preserves u64 audit timestamps as strings", () => {
  const value = parseBigJson('{"block_timestamp":1793723581078050800,"seq":0}');
  assert.deepEqual(value, { block_timestamp: "1793723581078050800", seq: 0 });
});

test("SDK verifies the canonical 19-entry testnet audit chain", () => {
  const entries = loadEntries(evidence);
  const result = verifyAuditChain(entries);
  assert.equal(entries.length, 19);
  assert.equal(result.ok, true);
  assert.equal(
    result.head,
    "cc33b0ea668c9a42d34d5950638e53907009e52c4b197e1328a1f4ce762ee10b",
  );
});

test("SDK audit verifier rejects a tampered entry", () => {
  const entries = loadEntries(evidence);
  entries[3].subject = "tampered";
  const result = verifyAuditChain(entries);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /entry_hash mismatch at seq 3/);
});

test("SDK audit verifier rejects a broken previous-hash link", () => {
  const entries = loadEntries(evidence);
  entries[4].prevHash = "0".repeat(64);
  const result = verifyAuditChain(entries);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /prev_hash mismatch at seq 4/);
});

test("SDK accepts the raw E2E audit export and the fleet-audit-v1 export", () => {
  assert.equal(verifyAuditExport(JSON.parse(readFileSync(evidence, "utf8"))).ok, true);
  assert.equal(verifyAuditExport(JSON.parse(readFileSync(exported, "utf8"))).ok, true);
});
