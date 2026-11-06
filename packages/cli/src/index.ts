#!/usr/bin/env node
/**
 * FLEET CLI v0.3.
 *
 * Reads are public. Writes are signed locally with a mode-600 key file outside
 * any git repository. The CLI never prints, logs, or transmits a secret key.
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  DEFAULT_TESTNET_RPC,
  FLEET_SDK_VERSION,
  FleetError,
  buildAuditExport,
  createFleetClient,
  fleetExitCode,
  parseSignedTransaction,
  verifyAuditChain,
  verifyAuditExport,
  type FleetInventory,
  type FleetSignedTransaction,
  type FleetTxResult,
} from "@fleet/sdk";

const VERSION = FLEET_SDK_VERSION;

const VALUE_FLAGS = new Set([
  "rpc-url",
  "signer-key-file",
  "out",
  "key",
  "tag",
  "old",
  "new",
  "new-admin",
  "method",
  "args",
  "gas",
  "receiver",
  "submit-signed",
]);

const BOOLEAN_FLAGS = new Set(["json", "help", "pre-sign"]);

const HELP = `fleet ${VERSION}

FLEET is a native NEAR account-fleet key-lifecycle control plane.
Testnet only. Unaudited. Mode A is not non-custodial.

Usage:
  fleet inventory <account> [--rpc-url URL] [--json]
  fleet verify <account> [--rpc-url URL] [--json]
  fleet audit export <account> --out <file> [--json]
  fleet audit verify <file> [--json]
  fleet verify-audit <file> [--json]

  fleet freeze <account> --signer-key-file <path> [--json]
  fleet unfreeze <account> --signer-key-file <path> [--json]
  fleet grant <account> --key <public-key> --tag <tag> --signer-key-file <path> [--json]
  fleet rotate <account> --old <public-key> --new <public-key> --tag <tag> --signer-key-file <path> [--json]
  fleet revoke <account> --key <public-key> --signer-key-file <path> [--json]
  fleet revoke-tag <account> --tag <tag> --signer-key-file <path> [--json]
  fleet propose-admin <account> --new-admin <public-key> --signer-key-file <path> [--json]
  fleet accept-admin <account> --signer-key-file <path> [--json]
  fleet cancel-admin <account> --signer-key-file <path> [--json]
  fleet recover <account> --new-admin <public-key> --signer-key-file <path> [--json]
  fleet execute <account> --method <name> [--args '<json>'] [--gas <tgas>] [--receiver <account>] --signer-key-file <path> [--json]

Pre-signed freeze:
  fleet freeze <account> --signer-key-file <path> --pre-sign --out <file> [--json]
  fleet unfreeze <account> --signer-key-file <path> --pre-sign --out <file> [--json]
  fleet freeze <account> --submit-signed <file> [--json]
  fleet unfreeze <account> --submit-signed <file> [--json]

  --pre-sign signs the call locally and writes it to a file without sending
  it. --submit-signed broadcasts a file written by --pre-sign. A signed file
  holds a signature, not a secret key; treat it as a bearer artifact.

Signer key files must live outside a git repository and be mode 600.
Default RPC: ${DEFAULT_TESTNET_RPC}
`;

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf("=");
    const name = equals === -1 ? body : body.slice(0, equals);
    const inline = equals === -1 ? undefined : body.slice(equals + 1);
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", `--${name} does not take a value`);
      }
      flags.set(name, true);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new FleetError("FLEET_E_BAD_ARGS", `unknown flag --${name}`);
    }
    if (inline !== undefined) {
      flags.set(name, inline);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new FleetError("FLEET_E_BAD_ARGS", `--${name} requires a value`);
    }
    flags.set(name, value);
    index += 1;
  }
  return { positionals, flags };
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function requireFlag(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (value === undefined || value.length === 0) {
    throw new FleetError("FLEET_E_BAD_ARGS", `missing required --${name}`);
  }
  return value;
}

function gitRootFor(start: string): string | null {
  let directory = resolve(start);
  for (;;) {
    if (existsSync(join(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function readSignerSecret(path: string): string {
  const absolute = realpathSync(resolve(path));
  const stat = lstatSync(absolute);
  if (!stat.isFile()) {
    throw new FleetError("FLEET_E_BAD_ARGS", "signer key path is not a file");
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signer key file must be mode 600 (no group or world permissions)",
    );
  }
  const root = gitRootFor(dirname(absolute));
  if (root !== null) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signer key file must live outside a git repository",
    );
  }
  const text = readFileSync(absolute, "utf8").trim();
  let secret = text;
  if (text.startsWith("{")) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new FleetError("FLEET_E_BAD_ARGS", "signer key JSON is malformed");
    }
    const candidate = parsed.secret_key ?? parsed.private_key;
    secret = typeof candidate === "string" ? candidate : "";
  }
  if (!/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(secret)) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      "signer key file must contain a NEAR secret_key or private_key",
    );
  }
  return secret;
}

function signerPath(args: ParsedArgs): string {
  const fromFlag = flagString(args, "signer-key-file");
  const fromEnv = process.env.FLEET_SIGNER_KEY_FILE;
  const path = fromFlag ?? fromEnv;
  if (path === undefined || path.length === 0) {
    throw new FleetError(
      "FLEET_E_NO_SIGNER",
      "this command needs --signer-key-file (or FLEET_SIGNER_KEY_FILE)",
    );
  }
  return path;
}

function rpcUrl(args: ParsedArgs): string {
  if (process.env.NEAR_MAINNET) {
    throw new FleetError(
      "FLEET_E_MAINNET",
      "FLEET is testnet-only; NEAR_MAINNET is refused",
    );
  }
  const url =
    flagString(args, "rpc-url") ??
    process.env.FLEET_RPC_URL ??
    DEFAULT_TESTNET_RPC;
  if (/mainnet/i.test(url)) {
    throw new FleetError(
      "FLEET_E_MAINNET",
      "FLEET is testnet-only; mainnet RPC URLs are refused",
    );
  }
  return url;
}

function clientFor(
  args: ParsedArgs,
  accountId: string,
  needSigner: boolean,
): ReturnType<typeof createFleetClient> {
  const options = {
    rpcUrl: rpcUrl(args),
    accountId,
  };
  if (needSigner) {
    return createFleetClient({
      ...options,
      signer: readSignerSecret(signerPath(args)),
    });
  }
  return createFleetClient(options);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, jsonReplacer, 2)}\n`);
}

function human(value: string): void {
  process.stderr.write(`${value}\n`);
}

let currentCommand = "";
let currentAccount: string | null = null;
let jsonMode = false;

function printInventory(inventory: FleetInventory): void {
  const state = inventory.state;
  human(`account: ${inventory.accountId}`);
  human(`contract: ${state.contractVersion}`);
  human(`mode: ${state.mode}`);
  human(`paused: ${state.paused}`);
  human(`admin: ${state.adminPublicKey ?? state.adminAccount ?? "none"}`);
  human(`recovery: ${state.recoveryPublicKey ?? "none"}`);
  human(`pending admin: ${state.pendingAdminPublicKey ?? "none"}`);
  human(`receiver: ${state.receiverId}.${state.methodName}`);
  human(
    `operators: ${inventory.operators.length} (${inventory.operators.filter((operator) => operator.active).length} active)`,
  );
  for (const operator of inventory.operators) {
    human(
      `  - ${operator.publicKey} tag=${operator.tag} active=${operator.active}`,
    );
  }
  human(
    `native keys: ${inventory.nativeKeys.length} (${inventory.fullAccessKeys} FullAccess)`,
  );
  for (const key of inventory.nativeKeys) {
    human(
      `  - ${key.publicKey} ${key.permission}${
        key.methodNames.length > 0 ? ` [${key.methodNames.join(",")}]` : ""
      }`,
    );
  }
  human(
    `audit: ${state.auditLength} entries, head=${state.auditHead.entryHash} seq=${state.auditHead.seq}`,
  );
}

function printTx(command: string, result: FleetTxResult): void {
  human(
    `${command}: OK tx=${result.txHash} block=${result.blockHeight} gas=${result.gasBurnt}`,
  );
}

async function readInventory(accountId: string, args: ParsedArgs): Promise<FleetInventory> {
  return clientFor(args, accountId, false).getInventory();
}

async function commandInventory(args: ParsedArgs): Promise<void> {
  const accountId = args.positionals[1];
  if (accountId === undefined) {
    throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
  }
  currentAccount = accountId;
  const inventory = await readInventory(accountId, args);
  if (jsonMode) {
    emitJson({ ok: true, command: "inventory", ...inventory });
  } else {
    printInventory(inventory);
  }
}

async function commandVerify(args: ParsedArgs): Promise<void> {
  const accountId = args.positionals[1];
  if (accountId === undefined) {
    throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
  }
  currentAccount = accountId;
  const client = clientFor(args, accountId, false);
  const [inventory, entries, onChain] = await Promise.all([
    client.getInventory(),
    client.getAuditAll(),
    client.verifyAuditOnChain(),
  ]);
  const js = verifyAuditChain(entries);
  const verified = js.ok && onChain;
  if (jsonMode) {
    emitJson({
      ok: verified,
      command: "verify",
      accountId,
      verified,
      onChain,
      js,
      inventory,
    });
  } else {
    printInventory(inventory);
    human(`audit chain: ${js.ok ? "VERIFIED" : "FAILED"}`);
    for (const entry of entries) {
      human(
        `  #${entry.seq} ${entry.action} height=${entry.blockHeight} hash=${entry.entryHash}`,
      );
    }
    human(`on-chain verify_audit: ${onChain}`);
    human(`result: ${verified ? "PASS" : "FAIL"}`);
    if (js.error) human(`error: ${js.error}`);
  }
  if (!verified) {
    process.exitCode = fleetExitCode("FLEET_E_AUDIT");
  }
}

async function commandAuditExport(args: ParsedArgs): Promise<void> {
  currentCommand = "audit export";
  const accountId = args.positionals[2];
  if (accountId === undefined) {
    throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
  }
  const out = requireFlag(args, "out");
  currentAccount = accountId;
  const client = clientFor(args, accountId, false);
  const state = await client.getState();
  const entries = await client.getAuditAll();
  const verification = verifyAuditChain(entries);
  if (!verification.ok) {
    throw new FleetError(
      "FLEET_E_AUDIT",
      `refusing to export an invalid audit chain: ${verification.error}`,
    );
  }
  const exportValue = buildAuditExport(accountId, state, entries);
  const absolute = resolve(out);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, `${JSON.stringify(exportValue, jsonReplacer, 2)}\n`, {
    mode: 0o644,
  });
  if (jsonMode) {
    emitJson({
      ok: true,
      command: "audit export",
      accountId,
      out: absolute,
      entries: entries.length,
      head: exportValue.head,
      verified: true,
    });
  } else {
    human(
      `audit export: OK account=${accountId} entries=${entries.length} head=${exportValue.head.entryHash} out=${absolute}`,
    );
  }
}

function commandVerifyAuditFile(args: ParsedArgs): void {
  const file = args.positionals[1];
  if (file === undefined) {
    throw new FleetError("FLEET_E_BAD_ARGS", "missing audit file path");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  } catch (error) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      `cannot read audit file: ${String((error as Error).message ?? error)}`,
    );
  }
  const verification = verifyAuditExport(raw);
  if (jsonMode) {
    emitJson({
      ok: verification.ok,
      command: "verify-audit",
      file: resolve(file),
      verified: verification.ok,
      entries: verification.entries,
      head: verification.head,
      error: verification.error,
    });
  } else {
    human(`file: ${resolve(file)}`);
    human(`entries: ${verification.entries}`);
    human(`head: ${verification.head}`);
    human(`result: ${verification.ok ? "PASS" : "FAIL"}`);
    if (verification.error) human(`error: ${verification.error}`);
  }
  if (!verification.ok) {
    process.exitCode = fleetExitCode("FLEET_E_AUDIT");
  }
}

async function commandWrite(
  args: ParsedArgs,
  accountId: string,
  run: (client: ReturnType<typeof createFleetClient>) => Promise<FleetTxResult>,
): Promise<void> {
  currentAccount = accountId;
  const client = clientFor(args, accountId, true);
  const result = await run(client);
  if (jsonMode) {
    emitJson({
      ok: true,
      command: currentCommand,
      accountId,
      txHash: result.txHash,
      blockHeight: result.blockHeight,
      gasBurnt: result.gasBurnt,
      refusal: result.refusal,
    });
  } else {
    printTx(currentCommand, result);
  }
}

function readSignedFile(path: string): FleetSignedTransaction {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      `cannot read signed transaction file: ${String((error as Error).message ?? error)}`,
    );
  }
  return parseSignedTransaction(raw);
}

/**
 * Sign a freeze or unfreeze locally and write it out without broadcasting.
 */
async function commandPreSign(
  args: ParsedArgs,
  accountId: string,
  method: "freeze" | "unfreeze",
): Promise<void> {
  currentAccount = accountId;
  const out = requireFlag(args, "out");
  const client = clientFor(args, accountId, true);
  const signed =
    method === "freeze"
      ? await client.prepareFreeze()
      : await client.prepareUnfreeze();
  const absolute = resolve(out);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, `${JSON.stringify(signed, jsonReplacer, 2)}\n`, {
    mode: 0o600,
  });
  if (jsonMode) {
    emitJson({
      ok: true,
      command: currentCommand,
      phase: "pre-signed",
      accountId,
      method,
      out: absolute,
      txHash: signed.tx_hash,
      publicKey: signed.public_key,
      nonce: signed.nonce,
      createdAt: signed.created_at,
    });
  } else {
    human(
      `${currentCommand}: pre-signed tx=${signed.tx_hash} out=${absolute} (not sent)`,
    );
  }
}

/**
 * Broadcast a transaction that was signed earlier.
 */
async function commandSubmitSigned(
  args: ParsedArgs,
  accountId: string,
  method: "freeze" | "unfreeze",
): Promise<void> {
  currentAccount = accountId;
  const file = requireFlag(args, "submit-signed");
  const signed = readSignedFile(file);
  if (signed.method !== method) {
    throw new FleetError(
      "FLEET_E_BAD_ARGS",
      `signed transaction is for ${signed.method}, not ${method}`,
    );
  }
  const client = clientFor(args, accountId, false);
  const result = await client.submitSigned(signed);
  if (jsonMode) {
    emitJson({
      ok: true,
      command: currentCommand,
      phase: "submitted",
      accountId,
      txHash: result.txHash,
      blockHeight: result.blockHeight,
      gasBurnt: result.gasBurnt,
      refusal: result.refusal,
      signedFile: resolve(file),
    });
  } else {
    printTx(currentCommand, result);
  }
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  // Detect --json before parsing so that argument errors are reported as JSON
  // too.
  jsonMode = raw.includes("--json");
  if (raw.includes("--version")) {
    const asJson = jsonMode;
    if (asJson) emitJson({ ok: true, command: "version", version: VERSION });
    else process.stdout.write(`fleet ${VERSION}\n`);
    return;
  }
  const args = parseArgs(raw);
  jsonMode = args.flags.get("json") === true;
  const first = args.positionals[0];
  currentCommand = first ?? "";

  if (first === undefined || first === "help" || args.flags.get("help") === true) {
    if (jsonMode) {
      emitJson({ ok: true, command: "help", version: VERSION, help: HELP });
    } else {
      process.stdout.write(HELP);
    }
    return;
  }

  if (first === "--version" || first === "version") {
    if (jsonMode) emitJson({ ok: true, command: "version", version: VERSION });
    else process.stdout.write(`fleet ${VERSION}\n`);
    return;
  }

  if (process.env.NEAR_MAINNET) {
    throw new FleetError(
      "FLEET_E_MAINNET",
      "FLEET is testnet-only; NEAR_MAINNET is refused",
    );
  }

  switch (first) {
    case "inventory":
      return commandInventory(args);
    case "verify":
      return commandVerify(args);
    case "audit": {
      const sub = args.positionals[1];
      if (sub === "export") return commandAuditExport(args);
      if (sub === "verify") {
        const file = args.positionals[2];
        currentCommand = "verify-audit";
        return commandVerifyAuditFile({
          positionals: file === undefined ? ["verify-audit"] : ["verify-audit", file],
          flags: args.flags,
        });
      }
      throw new FleetError("FLEET_E_BAD_ARGS", "audit expects export or verify");
    }
    case "verify-audit":
      return commandVerifyAuditFile(args);
    case "freeze":
    case "unfreeze": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const method = first === "freeze" ? "freeze" : "unfreeze";
      const submitSigned = flagString(args, "submit-signed");
      if (submitSigned !== undefined) {
        return commandSubmitSigned(args, accountId, method);
      }
      if (args.flags.get("pre-sign") === true) {
        return commandPreSign(args, accountId, method);
      }
      return commandWrite(args, accountId, (client) =>
        first === "freeze" ? client.freeze() : client.unfreeze(),
      );
    }
    case "grant": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const publicKey = requireFlag(args, "key");
      const tag = requireFlag(args, "tag");
      return commandWrite(args, accountId, (client) =>
        client.grantOperator(publicKey, tag),
      );
    }
    case "rotate": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const oldKey = requireFlag(args, "old");
      const newKey = requireFlag(args, "new");
      const tag = requireFlag(args, "tag");
      return commandWrite(args, accountId, (client) =>
        client.rotateOperator(oldKey, newKey, tag),
      );
    }
    case "revoke": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const publicKey = requireFlag(args, "key");
      return commandWrite(args, accountId, (client) =>
        client.revokeOperator(publicKey),
      );
    }
    case "revoke-tag": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const tag = requireFlag(args, "tag");
      return commandWrite(args, accountId, (client) => client.revokeTag(tag));
    }
    case "propose-admin": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const newAdmin = requireFlag(args, "new-admin");
      return commandWrite(args, accountId, (client) =>
        client.proposeAdmin(newAdmin),
      );
    }
    case "accept-admin": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      return commandWrite(args, accountId, (client) => client.acceptAdmin());
    }
    case "cancel-admin": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      return commandWrite(args, accountId, (client) => client.cancelAdmin());
    }
    case "recover": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const newAdmin = requireFlag(args, "new-admin");
      return commandWrite(args, accountId, (client) =>
        client.recoverAdmin(newAdmin),
      );
    }
    case "execute": {
      const accountId = args.positionals[1];
      if (accountId === undefined) {
        throw new FleetError("FLEET_E_BAD_ARGS", "missing account id");
      }
      const method = requireFlag(args, "method");
      const payload = flagString(args, "args") ?? "{}";
      const gasText = flagString(args, "gas") ?? "10";
      const gas = Number(gasText);
      if (!Number.isSafeInteger(gas) || gas < 1 || gas > 100) {
        throw new FleetError("FLEET_E_BAD_ARGS", "--gas must be 1..100 Tgas");
      }
      const receiver = flagString(args, "receiver") ?? accountId;
      return commandWrite(args, accountId, (client) =>
        client.execute(receiver, method, payload, gas),
      );
    }
    default:
      throw new FleetError(
        "FLEET_E_BAD_ARGS",
        `unknown command: ${first} (run fleet --help)`,
      );
  }
}

main().catch((error: unknown) => {
  const fleetError =
    error instanceof FleetError
      ? error
      : new FleetError(
          "FLEET_E_UNSUPPORTED",
          String((error as Error)?.message ?? error),
        );
  if (jsonMode) {
    emitJson({
      ok: false,
      command: currentCommand,
      accountId: currentAccount,
      error: {
        code: fleetError.code,
        message: fleetError.message,
        txHash: fleetError.txHash,
        blockHeight: fleetError.blockHeight,
        refusal: fleetError.refusal,
      },
    });
  } else {
    human(`fleet: ${fleetError.code}: ${fleetError.message}`);
  }
  process.exit(fleetExitCode(fleetError.code));
});
