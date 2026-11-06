import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createFleetClient,
  FLEET_SDK_VERSION,
  FleetError,
  normalizeAuditEntry,
  parseBigJson,
  parseSignedTransaction,
  SIGNED_TX_FORMAT,
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

// ---------------------------------------------------------------------------
// Pre-signed freeze path
// ---------------------------------------------------------------------------

function signedFixture(overrides = {}) {
  return {
    format: SIGNED_TX_FORMAT,
    network: "testnet",
    account_id: "agent.testnet",
    receiver_id: "agent.testnet",
    method: "freeze",
    args: {},
    gas_tgas: 30,
    public_key: "ed25519:2dckMmmyFQdr4J78vGfqm7XaK4ck2HgCvN8gSDfiQyx2",
    nonce: "12345678901234567890",
    tx_hash: "3ZfQ8mLpYqX2v7Ck9WnT4bRs6Hdj5GfUa1E0pQo2YtNx",
    signed_transaction: "AGFzbQEAAAA=",
    created_at: "2026-11-05T00:00:00.000Z",
    ...overrides,
  };
}

test("SDK accepts a well-formed pre-signed transaction", () => {
  const value = parseSignedTransaction(signedFixture());
  assert.equal(value.format, SIGNED_TX_FORMAT);
  assert.equal(value.method, "freeze");
});

test("SDK rejects a pre-signed transaction without the FLEET format marker", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ format: "something-else" })),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_BAD_ARGS");
      assert.match(error.message, /format must be/);
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction that targets mainnet", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ network: "mainnet" })),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_MAINNET");
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction that is missing a field", () => {
  for (const field of [
    "account_id",
    "receiver_id",
    "method",
    "public_key",
    "nonce",
    "tx_hash",
    "signed_transaction",
    "created_at",
  ]) {
    const payload = signedFixture();
    delete payload[field];
    assert.throws(
      () => parseSignedTransaction(payload),
      (error) => {
        assert.ok(error instanceof FleetError);
        assert.equal(error.code, "FLEET_E_BAD_ARGS");
        assert.match(error.message, new RegExp(field));
        return true;
      },
      `missing ${field} must be refused`,
    );
  }
});

test("SDK rejects a pre-signed transaction that carries key material", () => {
  assert.throws(
    () =>
      parseSignedTransaction(
        signedFixture({ secret_key: "ed25519:11111111111111111111111111111111" }),
      ),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_BAD_ARGS");
      assert.match(error.message, /must not contain key material/);
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction with a malformed public key", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ public_key: "not-a-key" })),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_BAD_ARGS");
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction that is not an object", () => {
  for (const value of [null, 7, "freeze", []]) {
    assert.throws(
      () => parseSignedTransaction(value),
      (error) => {
        assert.ok(error instanceof FleetError);
        assert.equal(error.code, "FLEET_E_BAD_ARGS");
        return true;
      },
    );
  }
});

test("SDK pre-sign path refuses a missing signer before any network call", async () => {
  const client = createFleetClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.prepareFreeze(),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_NO_SIGNER");
      return true;
    },
  );
  await assert.rejects(
    () => client.prepareUnfreeze(),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_NO_SIGNER");
      return true;
    },
  );
});

test("SDK refuses to broadcast a pre-signed transaction for another account", async () => {
  const client = createFleetClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.submitSigned(signedFixture({ account_id: "other.testnet" })),
    (error) => {
      assert.ok(error instanceof FleetError);
      assert.equal(error.code, "FLEET_E_BAD_ARGS");
      assert.match(error.message, /other\.testnet/);
      return true;
    },
  );
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
