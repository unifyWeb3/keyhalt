import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { KEYHALT_EXIT_CODES, keyhaltExitCode } from "../../sdk/dist/index.js";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const evidence = fileURLToPath(
  new URL("../../../evidence/testnet-v03/audit-agent-1.json", import.meta.url),
);
const tampered = fileURLToPath(
  new URL("../../../evidence/cli-v03/tampered-audit.json", import.meta.url),
);
const interfacesDoc = fileURLToPath(
  new URL("../../../docs/INTERFACES.md", import.meta.url),
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
  assert.equal(stdout, "keyhalt 0.3.0\n");
});

test("CLI version supports --json", async () => {
  const value = await runJson(["--version", "--json"]);
  assert.deepEqual(value, { ok: true, command: "version", version: "0.3.0" });
});

test("CLI help lists implemented product commands", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  assert.match(stdout, /keyhalt freeze <account>/);
  assert.match(stdout, /keyhalt verify-audit <file>/);
  assert.doesNotMatch(stdout, /not implemented in Phase 1/);
});

test("CLI refuses an unknown command with exit code 2", async () => {
  const value = await runJsonFailure(["nope", "--json"], 2);
  assert.equal(value.ok, false);
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
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
  assert.equal(value.error.code, "KEYHALT_E_MAINNET");
});

test("CLI refuses a write without a signer with exit code 3", async () => {
  const value = await runJsonFailure(["freeze", "agent.testnet", "--json"], 3);
  assert.equal(value.error.code, "KEYHALT_E_NO_SIGNER");
});

test("CLI refuses a group-readable signer key file with exit code 2", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
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
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
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

const SIGNED_TX_FORMAT = "keyhalt-signed-tx-v1";

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
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /--out/);
});

test("CLI refuses a signed file without the Keyhalt format marker", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
  const path = writeSigned(directory, "signed.json", signedFixture({ format: "other" }));
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /format must be/);
});

test("CLI refuses a signed file whose method does not match the command", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
  const path = writeSigned(directory, "signed.json", signedFixture({ method: "unfreeze" }));
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /unfreeze/);
});

test("CLI refuses a signed file for another account", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
  const path = writeSigned(
    directory,
    "signed.json",
    signedFixture({ account_id: "other.testnet" }),
  );
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /other\.testnet/);
});

test("CLI refuses a signed file that carries key material", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
  const path = writeSigned(
    directory,
    "signed.json",
    signedFixture({ secret_key: "ed25519:11111111111111111111111111111111" }),
  );
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /key material/);
});

test("CLI refuses an unreadable signed file with exit code 2", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keyhalt-cli-test-"));
  const path = join(directory, "signed.json");
  writeFileSync(path, "not json", { mode: 0o600 });
  const value = await runJsonFailure(
    ["freeze", "agent.testnet", "--submit-signed", path, "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
  assert.match(value.error.message, /cannot read signed transaction file/);
});

// ---------------------------------------------------------------------------
// --json and stable exit codes on every product command
// ---------------------------------------------------------------------------

const PRODUCT_COMMANDS = [
  "inventory",
  "verify",
  "audit export",
  "audit verify",
  "verify-audit",
  "freeze",
  "unfreeze",
  "grant",
  "rotate",
  "revoke",
  "revoke-tag",
  "propose-admin",
  "accept-admin",
  "cancel-admin",
  "recover",
  "execute",
];

// Minimal invocations that fail before any network call: missing input
// (exit 2) or a missing signer (exit 3).
const PK = "ed25519:11111111111111111111111111111111";
const PK2 = "ed25519:22222222222222222222222222222222";
const FAILURE_INVOCATIONS = {
  inventory: [["inventory", "--json"], "KEYHALT_E_BAD_ARGS", 2],
  verify: [["verify", "--json"], "KEYHALT_E_BAD_ARGS", 2],
  "audit export": [
    ["audit", "export", "agent.testnet", "--json"],
    "KEYHALT_E_BAD_ARGS",
    2,
  ],
  "audit verify": [
    ["audit", "verify", "/nonexistent/keyhalt-audit.json", "--json"],
    "KEYHALT_E_BAD_ARGS",
    2,
  ],
  "verify-audit": [
    ["verify-audit", "/nonexistent/keyhalt-audit.json", "--json"],
    "KEYHALT_E_BAD_ARGS",
    2,
  ],
  freeze: [["freeze", "agent.testnet", "--json"], "KEYHALT_E_NO_SIGNER", 3],
  unfreeze: [["unfreeze", "agent.testnet", "--json"], "KEYHALT_E_NO_SIGNER", 3],
  grant: [
    ["grant", "agent.testnet", "--key", PK, "--tag", "ops", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  rotate: [
    ["rotate", "agent.testnet", "--old", PK, "--new", PK2, "--tag", "ops", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  revoke: [
    ["revoke", "agent.testnet", "--key", PK, "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  "revoke-tag": [
    ["revoke-tag", "agent.testnet", "--tag", "ops", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  "propose-admin": [
    ["propose-admin", "agent.testnet", "--new-admin", PK, "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  "accept-admin": [
    ["accept-admin", "agent.testnet", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  "cancel-admin": [
    ["cancel-admin", "agent.testnet", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  recover: [
    ["recover", "agent.testnet", "--new-admin", PK, "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
  execute: [
    ["execute", "agent.testnet", "--method", "ping", "--json"],
    "KEYHALT_E_NO_SIGNER",
    3,
  ],
};

test("every CLI product command accepts --json and returns its documented exit code", async () => {
  for (const name of PRODUCT_COMMANDS) {
    const [argv, expectedCode, expectedExit] = FAILURE_INVOCATIONS[name];
    const value = await runJsonFailure(argv, expectedExit);
    assert.equal(value.ok, false, `${name}: ok must be false`);
    assert.equal(value.error.code, expectedCode, `${name}: error code`);
    assert.equal(
      value.command,
      name === "audit verify" || name === "verify-audit" ? "verify-audit" : name,
      `${name}: command field`,
    );
    assert.deepEqual(
      Object.keys(value).sort(),
      ["accountId", "command", "error", "ok"],
      `${name}: error envelope shape`,
    );
    assert.equal(
      keyhaltExitCode(expectedCode),
      expectedExit,
      `${name}: SDK mapping must agree with the observed exit code`,
    );
  }
});

test("CLI help documents --json for every product command", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  const usageLines = stdout
    .split("\n")
    .filter((line) => line.trimStart().startsWith("keyhalt "));
  for (const name of PRODUCT_COMMANDS) {
    const lines = usageLines.filter((line) => line.includes(`keyhalt ${name} `));
    assert.ok(lines.length > 0, `help has no usage line for ${name}`);
    for (const line of lines) {
      assert.match(line, /--json/, `usage for ${name} must document --json`);
    }
  }
});

test("the documented exit-code table matches the SDK mapping", () => {
  const text = readFileSync(interfacesDoc, "utf8");
  const documented = new Map();
  for (const match of text.matchAll(/\| `(KEYHALT_E_[A-Z_]+)` \| (\d+) \|/g)) {
    documented.set(match[1], Number(match[2]));
  }
  assert.ok(documented.size >= 8, "exit-code table must list every code");
  for (const [code, exit] of documented) {
    assert.equal(
      keyhaltExitCode(code),
      exit,
      `${code} documented as ${exit} but the SDK returns ${keyhaltExitCode(code)}`,
    );
  }
  for (const code of Object.keys(KEYHALT_EXIT_CODES)) {
    assert.ok(documented.has(code), `${code} missing from docs/INTERFACES.md`);
  }
  assert.equal(keyhaltExitCode("KEYHALT_E_NOT_A_CODE"), 2, "unknown codes fall back to 2");
});

test("CLI help lists the Mode B multisig admin commands", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  assert.match(stdout, /keyhalt admin request freeze <agent>/);
  assert.match(stdout, /keyhalt admin confirm <agent> <request-id>/);
  assert.match(stdout, /keyhalt admin status <agent>/);
});

test("keyhalt admin request without an agent is a bad-args exit", async () => {
  const value = await runJsonFailure(["admin", "request", "freeze", "--json"], 2);
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
});

test("keyhalt admin request without a member signer exits 3 before any RPC", async () => {
  const value = await runJsonFailure(
    ["admin", "request", "freeze", "agent.testnet", "--rpc-url", "http://127.0.0.1:9", "--json"],
    3,
  );
  assert.equal(value.error.code, "KEYHALT_E_NO_SIGNER");
});

test("keyhalt admin confirm without a request-id is a bad-args exit", async () => {
  const value = await runJsonFailure(
    ["admin", "confirm", "agent.testnet", "--signer-key-file", "/tmp/does-not-exist.json", "--json"],
    2,
  );
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
});

test("keyhalt admin confirm requires a member signer before any RPC", async () => {
  const value = await runJsonFailure(
    ["admin", "confirm", "agent.testnet", "7", "--rpc-url", "http://127.0.0.1:9", "--json"],
    3,
  );
  assert.equal(value.error.code, "KEYHALT_E_NO_SIGNER");
});

test("keyhalt admin with an unknown subcommand is a bad-args exit", async () => {
  const value = await runJsonFailure(["admin", "bogus", "--json"], 2);
  assert.equal(value.error.code, "KEYHALT_E_BAD_ARGS");
});
