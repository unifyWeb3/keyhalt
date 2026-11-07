#!/usr/bin/env node
/**
 * Rehearse the FLEET console demo against real testnet state.
 *
 *   FLEET_DEMO_ADMIN_KEY_FILE=... FLEET_DEMO_OPERATOR_KEY_FILE=... \
 *     node scripts/console-demo.mjs --hold-frozen 30
 *
 * The script drives the CLI, never the console, for writes. It freezes the
 * canonical agent, records the refusal of an operator execute while frozen,
 * appends both transaction hashes to the console watch file, and unfreezes in
 * a finally block. Key files must live outside the repository and be mode 600.
 * No key material is read by this script beyond handing the path to the CLI.
 */

import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(REPO_ROOT, "packages/cli/dist/index.js");
const TX_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function parseArgs(argv) {
  const options = {
    account: env("FLEET_DEMO_ACCOUNT", "agent-1b.fleet-v03-5cff9e99.testnet"),
    adminKeyFile: env("FLEET_DEMO_ADMIN_KEY_FILE", ""),
    operatorKeyFile: env("FLEET_DEMO_OPERATOR_KEY_FILE", ""),
    rpcUrl: env("FLEET_DEMO_RPC_URL", "https://near-testnet.drpc.org"),
    consoleUrl: env("FLEET_CONSOLE_URL", "http://127.0.0.1:4173"),
    watchFile: env("FLEET_CONSOLE_WATCH_FILE", resolve(REPO_ROOT, "tmp/console-watch.json")),
    holdFrozen: 0,
    json: false,
    skipConsole: false,
    rescueRpcs: env(
      "FLEET_DEMO_RESCUE_RPCS",
      "https://near-testnet.drpc.org,https://testnet-rpc.intea.rs,https://rpc.testnet.near.org",
    )
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--account") options.account = argv[++index];
    else if (arg === "--admin-key-file") options.adminKeyFile = argv[++index];
    else if (arg === "--operator-key-file") options.operatorKeyFile = argv[++index];
    else if (arg === "--rpc-url") options.rpcUrl = argv[++index];
    else if (arg === "--console-url") options.consoleUrl = argv[++index];
    else if (arg === "--watch-file") options.watchFile = argv[++index];
    else if (arg === "--hold-frozen") options.holdFrozen = Number(argv[++index]);
    else if (arg === "--json") options.json = true;
    else if (arg === "--skip-console") options.skipConsole = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`FLEET console demo rehearsal

Usage:
  node scripts/console-demo.mjs [options]

Options:
  --account ID                Controller to freeze (default: canonical agent-1b)
  --admin-key-file PATH       Mode-600 admin key file (outside the repository)
  --operator-key-file PATH    Mode-600 operator key file for the refused execute
  --rpc-url URL               Testnet RPC for writes (default: dRPC testnet)
  --console-url URL           Running console (default: http://127.0.0.1:4173)
  --watch-file PATH           Console receipt watch list (default: tmp/console-watch.json)
  --hold-frozen SECONDS       Keep the controller frozen before unfreezing
  --skip-console              Do not wait for console assertions
  --json                      Print one summary object on stdout

Environment equivalents: FLEET_DEMO_ACCOUNT, FLEET_DEMO_ADMIN_KEY_FILE,
FLEET_DEMO_OPERATOR_KEY_FILE, FLEET_DEMO_RPC_URL, FLEET_CONSOLE_URL,
FLEET_CONSOLE_WATCH_FILE, FLEET_DEMO_RESCUE_RPCS.

Writes use dRPC by default so the console's read polling and the CLI writes do
not share one free public rate limit. If a step fails after the freeze, the
harness tries the rescue RPC list in order to unfreeze.
`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.holdFrozen) || options.holdFrozen < 0) {
    throw new Error("--hold-frozen must be a non-negative number of seconds");
  }
  return options;
}

function checkKeyFile(path, label) {
  if (path === "") {
    throw new Error(
      `${label} is required; set it to a mode-600 key file outside the repository`,
    );
  }
  const full = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(full)) throw new Error(`${label} does not exist: ${full}`);
  if (full.startsWith(`${REPO_ROOT}/`)) {
    throw new Error(`${label} must live outside the repository`);
  }
  const mode = statSync(full).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(`${label} must be mode 600, found ${mode.toString(8)}`);
  }
  return full;
}

function runCli(args, { allowFailure = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [CLI, ...args, "--json"], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        // A failed CLI invocation can still print a JSON object; a crash may not.
      }
      if (code !== 0 && !allowFailure && parsed === null) {
        reject(
          new Error(
            `CLI ${args[0]} exited ${code}: ${(stderr || stdout).trim().slice(0, 500)}`,
          ),
        );
        return;
      }
      resolveRun({ code, parsed, stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function readWatch(path) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(raw)) return raw;
    if (raw !== null && typeof raw === "object" && Array.isArray(raw.txs)) {
      return raw.txs;
    }
  } catch {
    // No watch file yet.
  }
  return [];
}

function writeWatch(path, txs) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ txs }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}

function addWatch(path, txHash) {
  if (!TX_RE.test(txHash)) throw new Error(`refusing malformed tx hash: ${txHash}`);
  const txs = readWatch(path);
  if (!txs.includes(txHash)) txs.push(txHash);
  writeWatch(path, txs);
  return txs;
}

async function waitForPaused({ account, rpcUrl, expected, timeoutMs = 75_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runCli(
      ["inventory", account, "--rpc-url", rpcUrl],
      { allowFailure: true },
    );
    if (
      result.parsed?.ok === true &&
      result.parsed.state?.paused === expected
    ) {
      return result.parsed.state;
    }
    await sleep(1_500);
  }
  throw new Error(
    `controller did not become ${expected ? "frozen" : "active"} within ${timeoutMs} ms`,
  );
}

async function runExecuteWithRetry(args, attempts = 3) {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await runCli(args, { allowFailure: true });
    const error = result.parsed?.error;
    // Safe to retry only when nothing reached the chain: a RPC error with no
    // transaction hash means no broadcast happened.
    if (
      result.parsed?.ok === false &&
      error?.code === "FLEET_E_RPC" &&
      (error.txHash === null || error.txHash === undefined) &&
      attempt < attempts
    ) {
      await sleep(5_000);
      continue;
    }
    return result;
  }
  return result;
}

async function rescueUnfreeze({ account, adminKeyFile, rpcUrls }) {
  const errors = [];
  for (const rpcUrl of rpcUrls) {
    const result = await runCli(
      [
        "unfreeze",
        account,
        "--rpc-url",
        rpcUrl,
        "--signer-key-file",
        adminKeyFile,
      ],
      { allowFailure: true },
    );
    if (result.parsed?.ok === true) {
      return { rpcUrl, result: result.parsed };
    }
    errors.push(
      `${rpcUrl}: ${result.parsed?.error?.message ?? result.stderr.trim().slice(0, 160)}`,
    );
    await sleep(2_000);
  }
  throw new Error(`all rescue RPCs refused: ${errors.join(" | ")}`);
}

async function waitForConsole({ consoleUrl, account, txHashes, timeoutMs = 90_000 }) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${consoleUrl}/api/timeline?limit=200`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        last = await response.json();
        const found = new Set(
          (last.events ?? []).map((event) => event.txHash).filter(Boolean),
        );
        if (txHashes.every((tx) => found.has(tx))) return last;
      }
    } catch {
      // The console may still be starting.
    }
    await sleep(2_000);
  }
  throw new Error(
    `console did not resolve watched receipts within ${timeoutMs} ms; last counts ${JSON.stringify(
      last?.counts ?? null,
    )}`,
  );
}

function sanitize(value) {
  // Defensive: CLI JSON never contains key material, but never print it if it does.
  const text = JSON.stringify(value);
  if (/secret_key|private_key|seed_phrase/i.test(text)) {
    return "[redacted: CLI output contained key material]";
  }
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(CLI)) {
    throw new Error(`CLI build is missing at ${CLI}; run npm run build`);
  }
  const adminKeyFile = checkKeyFile(options.adminKeyFile, "admin key file");
  const operatorKeyFile = checkKeyFile(
    options.operatorKeyFile,
    "operator key file",
  );

  const summary = {
    ok: false,
    accountId: options.account,
    rpcUrl: options.rpcUrl,
    consoleUrl: options.skipConsole ? null : options.consoleUrl,
    watchFile: options.watchFile,
    freeze: null,
    refusedExecute: null,
    unfreeze: null,
    console: null,
    error: null,
  };
  let froze = false;
  let finalError = null;

  try {
    const before = await runCli(
      ["inventory", options.account, "--rpc-url", options.rpcUrl],
      { allowFailure: true },
    );
    if (before.parsed?.ok !== true) {
      throw new Error(`inventory failed before freeze: ${before.stdout.trim()}`);
    }
    if (before.parsed.state.paused !== false) {
      throw new Error("controller is already frozen; run unfreeze before the demo");
    }
    const receiver = before.parsed.state.receiverId;
    const method = before.parsed.state.methodName;
    const operatorActive = before.parsed.state.operators.some(
      (operator) => operator.active,
    );
    if (!operatorActive) throw new Error("no active operator key on the controller");

    const frozen = await runCli(
      [
        "freeze",
        options.account,
        "--rpc-url",
        options.rpcUrl,
        "--signer-key-file",
        adminKeyFile,
      ],
      { allowFailure: true },
    );
    if (frozen.parsed?.ok !== true || typeof frozen.parsed.txHash !== "string") {
      throw new Error(`freeze failed: ${frozen.stdout.trim().slice(0, 500)}`);
    }
    froze = true;
    summary.freeze = {
      txHash: frozen.parsed.txHash,
      blockHeight: frozen.parsed.blockHeight,
      gasBurnt: frozen.parsed.gasBurnt ?? null,
    };
    addWatch(options.watchFile, frozen.parsed.txHash);
    await waitForPaused({
      account: options.account,
      rpcUrl: options.rpcUrl,
      expected: true,
    });

    await sleep(1_000);
    const refused = await runExecuteWithRetry([
      "execute",
      options.account,
      "--method",
      method,
      "--receiver",
      receiver,
      "--rpc-url",
      options.rpcUrl,
      "--signer-key-file",
      operatorKeyFile,
    ]);
    if (refused.parsed?.ok !== false || refused.parsed.error?.code !== "FLEET_E_REJECTED") {
      throw new Error(
        `execute was not refused as expected: ${refused.stdout.trim().slice(0, 500)}`,
      );
    }
    if (!String(refused.parsed.error.message).includes("frozen")) {
      throw new Error(
        `refusal did not name the freeze: ${refused.parsed.error.message}`,
      );
    }
    const refusalTx = refused.parsed.error.txHash;
    if (typeof refusalTx !== "string") {
      throw new Error("refused execute returned no transaction hash");
    }
    summary.refusedExecute = {
      txHash: refusalTx,
      blockHeight: refused.parsed.error.blockHeight ?? null,
      code: refused.parsed.error.code,
      message: refused.parsed.error.message,
    };
    addWatch(options.watchFile, refusalTx);
    await waitForPaused({
      account: options.account,
      rpcUrl: options.rpcUrl,
      expected: true,
    });

    const watched = readWatch(options.watchFile);
    if (options.holdFrozen > 0) {
      if (!options.json) console.error(`HOLDING_FROZEN ${options.holdFrozen}s`);
      await sleep(options.holdFrozen * 1_000);
    }

    const unfrozen = await runCli(
      [
        "unfreeze",
        options.account,
        "--rpc-url",
        options.rpcUrl,
        "--signer-key-file",
        adminKeyFile,
      ],
      { allowFailure: true },
    );
    if (unfrozen.parsed?.ok !== true || typeof unfrozen.parsed.txHash !== "string") {
      throw new Error(`unfreeze failed: ${unfrozen.stdout.trim().slice(0, 500)}`);
    }
    froze = false;
    summary.unfreeze = {
      txHash: unfrozen.parsed.txHash,
      blockHeight: unfrozen.parsed.blockHeight,
      gasBurnt: unfrozen.parsed.gasBurnt ?? null,
    };
    addWatch(options.watchFile, unfrozen.parsed.txHash);
    await waitForPaused({
      account: options.account,
      rpcUrl: options.rpcUrl,
      expected: false,
    });

    if (!options.skipConsole) {
      const timeline = await waitForConsole({
        consoleUrl: options.consoleUrl,
        account: options.account,
        txHashes: [summary.freeze.txHash, summary.refusedExecute.txHash, summary.unfreeze.txHash],
      });
      const refusedRow = (timeline.events ?? []).find(
        (event) => event.txHash === summary.refusedExecute.txHash,
      );
      if (refusedRow === undefined) {
        throw new Error("console timeline has no row for the refused execute");
      }
      if (refusedRow.result !== "refused") {
        throw new Error(
          `console rendered the refusal as ${String(refusedRow.result)}`,
        );
      }
      summary.console = {
        headBlock: timeline.headBlock ?? null,
        events: timeline.counts?.events ?? null,
        refused: timeline.counts?.refused ?? null,
        blocks: timeline.counts?.blocks ?? null,
        refusedRow: {
          event: refusedRow.event,
          result: refusedRow.result,
          blockHeight: refusedRow.blockHeight,
          source: refusedRow.source,
        },
      };
    }
    summary.watched = readWatch(options.watchFile).length;
    summary.ok = true;
  } catch (error) {
    finalError = error;
    summary.error = String(error?.message ?? error);
  } finally {
    if (froze) {
      try {
        const rescue = await rescueUnfreeze({
          account: options.account,
          adminKeyFile,
          rpcUrls: options.rescueRpcs,
        });
        summary.unfreeze = summary.unfreeze ?? {
          txHash: rescue.result.txHash,
          blockHeight: rescue.result.blockHeight,
          gasBurnt: rescue.result.gasBurnt ?? null,
          rescue: true,
          rpcUrl: rescue.rpcUrl,
        };
        addWatch(options.watchFile, rescue.result.txHash);
      } catch (rescueError) {
        summary.error = `${summary.error ?? ""} | RESCUE UNFREEZE FAILED: ${String(
          rescueError?.message ?? rescueError,
        )}`;
      }
    }
    summary.watched = readWatch(options.watchFile).length;
    const clean = sanitize(summary);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(clean, null, 2)}\n`);
    } else {
      const line = (label, value) => console.log(`${label.padEnd(16)} ${value}`);
      console.log(`FLEET console demo — ${options.account}`);
      if (summary.freeze) {
        line("freeze", `${summary.freeze.txHash} @ ${summary.freeze.blockHeight}`);
      }
      if (summary.refusedExecute) {
        line(
          "refused execute",
          `${summary.refusedExecute.txHash} @ ${summary.refusedExecute.blockHeight} · ${summary.refusedExecute.message}`,
        );
      }
      if (summary.unfreeze) {
        line(
          "unfreeze",
          `${summary.unfreeze.txHash} @ ${summary.unfreeze.blockHeight}${summary.unfreeze.rescue ? " (rescue)" : ""}`,
        );
      }
      if (summary.console) {
        line(
          "console",
          `${summary.console.events} events · ${summary.console.refused} refused · row ${summary.console.refusedRow.event} → ${summary.console.refusedRow.result}`,
        );
      }
      line("watch file", `${summary.watched} tx hashes`);
      line("result", summary.ok ? "PASS" : `FAIL — ${summary.error}`);
    }
    process.exit(summary.ok ? 0 : 1);
  }
  if (finalError !== null) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`demo failed: ${String(error?.message ?? error)}`);
  process.exit(1);
});
