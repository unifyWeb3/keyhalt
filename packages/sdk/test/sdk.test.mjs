import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  KeyPair,
  Signature,
  SignedTransaction,
  Transaction,
  actions,
  baseEncode,
} from "near-api-js";

import {
  createKeyhaltClient,
  createMultisigAdminClient,
  KEYHALT_SDK_VERSION,
  KeyhaltError,
  keyhaltTransactionHash,
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
  assert.equal(KEYHALT_SDK_VERSION, "0.3.0");
});

test("SDK rejects an invalid blockId before any network call", () => {
  for (const bad of [-1, 1.5, Number.NaN]) {
    assert.throws(
      () =>
        createKeyhaltClient({
          rpcUrl: "https://rpc.testnet.fastnear.com",
          accountId: "agent.testnet",
          blockId: bad,
        }),
      (error) => {
        assert.ok(error instanceof KeyhaltError);
        assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
        return true;
      },
    );
  }
});

test("SDK pins contract and key reads to the requested block", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    let result;
    if (body.method === "status") {
      result = { chain_id: "testnet" };
    } else if (body.params?.request_type === "call_function") {
      result = { result: Array.from(Buffer.from("[]")) };
    } else if (body.params?.request_type === "view_access_key_list") {
      result = { keys: [], block_height: 4242 };
    } else {
      throw new Error(`unexpected method ${body.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const keyhalt = createKeyhaltClient({
      rpcUrl: "https://rpc.testnet.fastnear.com",
      accountId: "agent.testnet",
      blockId: 4242,
    });
    assert.equal(keyhalt.blockId, 4242);
    await keyhalt.getAudit(0, 10);
    await keyhalt.getNativeKeys();
    const reads = calls.filter((call) => call.method === "query");
    assert.equal(reads.length, 2);
    for (const read of reads) {
      assert.equal(read.params.block_id, 4242);
      assert.equal("finality" in read.params, false);
      assert.equal(read.params.account_id, "agent.testnet");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SDK reads without a blockId use finality final", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const result =
      body.method === "status"
        ? { chain_id: "testnet" }
        : body.params?.request_type === "view_access_key_list"
          ? { keys: [] }
          : { result: Array.from(Buffer.from("[]")) };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const keyhalt = createKeyhaltClient({
      rpcUrl: "https://rpc.testnet.fastnear.com",
      accountId: "agent.testnet",
    });
    assert.equal(keyhalt.blockId, null);
    await keyhalt.getNativeKeys();
    const read = calls.find(
      (call) => call.params?.request_type === "view_access_key_list",
    );
    assert.equal(read.params.finality, "final");
    assert.equal("block_id" in read.params, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SDK refuses a mainnet RPC before any network call", () => {
  assert.throws(
    () =>
      createKeyhaltClient({
        rpcUrl: "https://rpc.mainnet.near.org",
        accountId: "agent.testnet",
      }),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_MAINNET");
      return true;
    },
  );
});

test("SDK write path refuses a missing signer before any network call", async () => {
  const client = createKeyhaltClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.freeze(),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_NO_SIGNER");
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

test("SDK rejects a pre-signed transaction without the Keyhalt format marker", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ format: "something-else" })),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
      assert.match(error.message, /format must be/);
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction that targets mainnet", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ network: "mainnet" })),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_MAINNET");
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
        assert.ok(error instanceof KeyhaltError);
        assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
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
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
      assert.match(error.message, /must not contain key material/);
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction with a malformed public key", () => {
  assert.throws(
    () => parseSignedTransaction(signedFixture({ public_key: "not-a-key" })),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
      return true;
    },
  );
});

test("SDK rejects a pre-signed transaction that is not an object", () => {
  for (const value of [null, 7, "freeze", []]) {
    assert.throws(
      () => parseSignedTransaction(value),
      (error) => {
        assert.ok(error instanceof KeyhaltError);
        assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
        return true;
      },
    );
  }
});

test("SDK pre-sign path refuses a missing signer before any network call", async () => {
  const client = createKeyhaltClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.prepareFreeze(),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_NO_SIGNER");
      return true;
    },
  );
  await assert.rejects(
    () => client.prepareUnfreeze(),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_NO_SIGNER");
      return true;
    },
  );
});

test("SDK refuses to broadcast a pre-signed transaction for another account", async () => {
  const client = createKeyhaltClient({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    accountId: "agent.testnet",
  });
  await assert.rejects(
    () => client.submitSigned(signedFixture({ account_id: "other.testnet" })),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_BAD_ARGS");
      assert.match(error.message, /other\.testnet/);
      return true;
    },
  );
});

test("SDK transaction hash covers the unsigned transaction, not the signed bytes", () => {
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey();
  const transaction = new Transaction({
    signerId: "agent.testnet",
    publicKey,
    nonce: 42n,
    receiverId: "agent.testnet",
    actions: [actions.functionCall("freeze", {}, 30_000_000_000_000n, 0n)],
    blockHash: new Uint8Array(32).fill(7),
  });
  const signature = new Signature({
    keyType: publicKey.keyType,
    data: new Uint8Array(64).fill(3),
  });
  const signed = new SignedTransaction({ transaction, signature });

  // A NEAR transaction hash is base58(sha256(borsh(unsigned Transaction))).
  // The RPC reports exactly this value as transaction_outcome.id, which is why
  // a pre-signed payload can carry a hash before it is broadcast.
  const expected = baseEncode(
    createHash("sha256").update(transaction.encode()).digest(),
  );
  assert.equal(keyhaltTransactionHash(signed), expected);

  // Regression guard: hashing the signed transaction returns a different,
  // unusable identifier for the same transaction.
  assert.notDeepEqual(
    Buffer.from(signed.encode()),
    Buffer.from(transaction.encode()),
  );
  const wrong = baseEncode(
    createHash("sha256").update(signed.encode()).digest(),
  );
  assert.notEqual(keyhaltTransactionHash(signed), wrong);
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

test("multisig client rejects a mainnet RPC URL", () => {
  assert.throws(
    () =>
      createMultisigAdminClient({
        rpcUrl: "https://rpc.mainnet.near.org",
        accountId: "multisig.testnet",
      }),
    (error) => {
      assert.ok(error instanceof KeyhaltError);
      assert.equal(error.code, "KEYHALT_E_MAINNET");
      return true;
    },
  );
});

test("multisig views parse members, nonce, request ids and request details", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    let result;
    if (body.method === "status") {
      result = { chain_id: "testnet" };
    } else if (body.method === "query") {
      const args = JSON.parse(
        Buffer.from(body.params.args_base64, "base64").toString("utf8"),
      );
      switch (body.params.method_name) {
        case "get_members":
          result = {
            result: Array.from(
              Buffer.from(
                JSON.stringify([
                  { account_id: "owner-a.testnet" },
                  { public_key: "ed25519:kB5fcDtfZA6Au6xmd8U2coeBiRg4dHpShADXCAybB2L" },
                ]),
              ),
            ),
          };
          break;
        case "get_num_confirmations":
          result = { result: Array.from(Buffer.from("2")) };
          break;
        case "get_request_nonce":
          result = { result: Array.from(Buffer.from("53")) };
          break;
        case "list_request_ids":
          result = { result: Array.from(Buffer.from("[2,5]")) };
          break;
        case "get_confirmations":
          assert.equal(args.request_id, 5);
          result = {
            result: Array.from(
              Buffer.from(
                JSON.stringify(['{"account_id":"owner-a.testnet"}']),
              ),
            ),
          };
          break;
        case "get_request":
          assert.equal(args.request_id, 5);
          result = {
            result: Array.from(
              Buffer.from(
                JSON.stringify({
                  receiver_id: "agent.testnet",
                  actions: [
                    {
                      type: "FunctionCall",
                      method_name: "freeze",
                      args: "",
                      deposit: "0",
                      gas: "50000000000000",
                    },
                  ],
                }),
              ),
            ),
          };
          break;
        default:
          throw new Error(`unexpected view ${body.params.method_name}`);
      }
    } else {
      throw new Error(`unexpected method ${body.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const multisig = createMultisigAdminClient({
      rpcUrl: "https://rpc.testnet.fastnear.com",
      accountId: "multisig.testnet",
    });
    const members = await multisig.getMembers();
    assert.deepEqual(members, [
      { kind: "account", accountId: "owner-a.testnet", publicKey: null },
      { kind: "accessKey", accountId: null, publicKey: "ed25519:kB5fcDtfZA6Au6xmd8U2coeBiRg4dHpShADXCAybB2L" },
    ]);
    assert.equal(await multisig.getNumConfirmations(), 2);
    assert.equal(await multisig.getRequestNonce(), 53);
    assert.deepEqual(await multisig.listRequestIds(), [2, 5]);
    assert.deepEqual(await multisig.getConfirmations(5), ["owner-a.testnet"]);
    const request = await multisig.getRequest(5);
    assert.equal(request.receiverId, "agent.testnet");
    assert.equal(request.methodName, "freeze");
    assert.deepEqual(request.actionTypes, ["FunctionCall"]);
    assert.equal(request.confirmationCount, 1);
    assert.equal(request.required, 2);
    assert.equal(request.functionCalls[0].gas, "50000000000000");
    assert.equal(request.functionCalls[0].depositYocto, "0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multisig views reject an undeclared method before Broadcasting", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const result =
      body.method === "status"
        ? { chain_id: "testnet" }
        : { result: Array.from(Buffer.from("[1,2")) };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const multisig = createMultisigAdminClient({
      rpcUrl: "https://rpc.testnet.fastnear.com",
      accountId: "multisig.testnet",
    });
    await assert.rejects(
      () => multisig.listRequestIds(),
      (error) => {
        assert.ok(error instanceof KeyhaltError);
        assert.equal(error.code, "KEYHALT_E_RPC");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
