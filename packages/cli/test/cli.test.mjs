import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const evidence = fileURLToPath(
  new URL("../../../evidence/testnet-v03/audit-agent-1.json", import.meta.url),
);
const tampered = fileURLToPath(
  new URL("../../../evidence/cli-v03/tampered-audit.json", import.meta.url),
);

async function runJson(args) {
  const { stdout } = await run(process.execPath, [cli, ...args]);
  return JSON.parse(stdout);
}

async function runJsonFailure(args, expectedCode) {
  try {
    await run(process.execPath, [cli, ...args]);
  } catch (error) {
    assert.equal(error.code, expectedCode);
    return JSON.parse(String(error.stdout));
  }
  assert.fail(`expected exit code ${expectedCode}`);
}

test("CLI prints its version", async () => {
  const { stdout } = await run(process.execPath, [cli, "--version"]);
  assert.equal(stdout, "fleet 0.3.0\n");
});

test("CLI version supports --json", async () => {
  const value = await runJson(["--version", "--json"]);
  assert.deepEqual(value, { ok: true, command: "version", version: "0.3.0" });
});

test("CLI help lists implemented product commands", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  assert.match(stdout, /fleet freeze <account>/);
  assert.match(stdout, /fleet verify-audit <file>/);
  assert.doesNotMatch(stdout, /not implemented in Phase 1/);
});

test("CLI refuses an unknown command with exit code 2", async () => {
  const value = await runJsonFailure(["nope", "--json"], 2);
  assert.equal(value.ok, false);
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
});

test("CLI refuses a mainnet RPC with exit code 4", async () => {
  const value = await runJsonFailure(
    [
      "inventory",
      "agent.testnet",
      "--rpc-url",
      "https://rpc.mainnet.near.org",
      "--json",
    ],
    4,
  );
  assert.equal(value.error.code, "FLEET_E_MAINNET");
});

test("CLI refuses a write without a signer with exit code 3", async () => {
  const value = await runJsonFailure(["freeze", "agent.testnet", "--json"], 3);
  assert.equal(value.error.code, "FLEET_E_NO_SIGNER");
});

test("CLI refuses a group-readable signer key file with exit code 2", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = join(directory, "key.json");
  writeFileSync(
    path,
    JSON.stringify({ secret_key: "ed25519:11111111111111111111111111111111" }),
    { mode: 0o644 },
  );
  chmodSync(path, 0o644);
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--signer-key-file", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /mode 600/);
});

test("CLI verifies the canonical 19-entry audit file", async () => {
  const value = await runJson(["verify-audit", evidence, "--json"]);
  assert.equal(value.ok, true);
  assert.equal(value.verified, true);
  assert.equal(value.entries, 19);
});

test("CLI audit verify alias also accepts the file", async () => {
  const value = await runJson(["audit", "verify", evidence, "--json"]);
  assert.equal(value.ok, true);
  assert.equal(value.entries, 19);
});

test("CLI rejects a tampered audit file with exit code 6", async () => {
  const value = await runJsonFailure(["verify-audit", tampered, "--json"], 6);
  assert.equal(value.ok, false);
  assert.equal(value.verified, false);
  assert.match(value.error, /entry_hash mismatch/);
});

// ---------------------------------------------------------------------------
// Pre-signed freeze path
// ---------------------------------------------------------------------------

const SIGNED_TX_FORMAT = "fleet-signed-tx-v1";

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

function writeSigned(directory, name, payload) {
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return path;
}

test("CLI help documents the pre-signed freeze path", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  assert.match(stdout, /--pre-sign/);
  assert.match(stdout, /--submit-signed/);
});

test("CLI freeze --pre-sign without --out fails with exit code 2", async () => {
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--pre-sign", "--json"],
    2,
  );
  assert.equal(value.ok, false);
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /--out/);
});

test("CLI refuses a signed file without the FLEET format marker", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = writeSigned(directory, "signed.json", signedFixture({ format: "other" }));
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /format must be/);
});

test("CLI refuses a signed file whose method does not match the command", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = writeSigned(directory, "signed.json", signedFixture({ method: "unfreeze" }));
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /unfreeze/);
});

test("CLI refuses a signed file for another account", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = writeSigned(
    directory,
    "signed.json",
    signedFixture({ account_id: "other.testnet" }),
  );
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /other\.testnet/);
});

test("CLI refuses a signed file that carries key material", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = writeSigned(
    directory,
    "signed.json",
    signedFixture({ secret_key: "ed25519:11111111111111111111111111111111" }),
  );
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /key material/);
});

test("CLI refuses an unreadable signed file with exit code 2", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fleet-cli-test-"));
  const path = join(directory, "signed.json");
  writeFileSync(path, "not json", { mode: 0o600 });
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "FLEET_E_BAD_ARGS");
  assert.match(value.error.message, /cannot read signed transaction file/);
});
