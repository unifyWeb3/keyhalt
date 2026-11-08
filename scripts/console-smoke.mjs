#!/usr/bin/env node
/**
 * Deterministic console smoke test for `make verify`.
 *
 * Boots the real server process against a local fake testnet RPC, so a public
 * RPC outage cannot fail local verification. It proves the process starts, is
 * read-only, serves the built interface, and reports the empty state. The
 * richer pinned-read tests live in packages/console/test/console.test.mjs.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "packages/console/dist/cli.js");

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function fakeRpc() {
  let height = 500_000;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let request;
      try {
        request = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      let result;
      if (request.method === "status") {
        result = { chain_id: "testnet" };
      } else if (request.method === "block") {
        height += 1;
        result = {
          header: {
            height,
            hash: `SmokeHash${height}`,
            timestamp: String(1_700_000_000_000_000_000 + height),
          },
        };
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: `unexpected ${request.method}` },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
    });
  });
  return new Promise((resolveRpc) => {
    server.listen(0, "127.0.0.1", () => {
      resolveRpc({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function freePort() {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

async function main() {
  const rpc = await fakeRpc();
  const port = await freePort();
  const temp = mkdtempSync(join(tmpdir(), "keyhalt-console-smoke-"));
  const child = spawn(process.execPath, [CLI, "--port", String(port), "--json"], {
    cwd: ROOT,
    env: {
      ...process.env,
      KEYHALT_CONSOLE_ACCOUNTS: "",
      KEYHALT_CONSOLE_PROVIDERS: rpc.url,
      KEYHALT_CONSOLE_ARCHIVAL_PROVIDERS: rpc.url,
      KEYHALT_CONSOLE_SEED_TXS: "",
      KEYHALT_CONSOLE_WATCH_FILE: join(temp, "watch.json"),
      KEYHALT_CONSOLE_CACHE_DIR: join(temp, "cache"),
      KEYHALT_CONSOLE_BLOCK_POLL_MS: "250",
    },
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

  const base = `http://127.0.0.1:${port}`;
  try {
    let health = null;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`console exited ${child.exitCode}: ${stderr.trim()}`);
      }
      try {
        const response = await fetch(`${base}/api/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok) {
          health = await response.json();
          if (typeof health.headBlock === "number") break;
        }
      } catch {
        // Still starting.
      }
      await sleep(250);
    }
    if (health === null || typeof health.headBlock !== "number") {
      throw new Error("console health did not report a finalized block");
    }
    if (health.readOnly !== true || health.noSigner !== true) {
      throw new Error("console health does not declare read-only/no-signer");
    }
    if (health.chainId !== "testnet") {
      throw new Error(`console reported chain ${String(health.chainId)}`);
    }
    if (!stdout.includes('"readOnly":true')) {
      throw new Error("console startup JSON is missing readOnly:true");
    }

    const keyhaltResponse = await fetch(`${base}/api/keyhalt`);
    const keyhalt = await keyhaltResponse.json();
    if (keyhaltResponse.status !== 200 || keyhalt.status !== "empty") {
      throw new Error(`empty keyhalt state failed: ${keyhaltResponse.status} ${keyhalt.status}`);
    }

    const write = await fetch(`${base}/api/keyhalt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (write.status !== 405) throw new Error(`POST returned ${write.status}, expected 405`);
    if (write.headers.get("allow") !== "GET, HEAD") {
      throw new Error("405 did not advertise GET, HEAD");
    }

    const index = await fetch(`${base}/`);
    if (index.status !== 200) throw new Error(`index returned ${index.status}`);
    const html = await index.text();
    if (!html.includes("/app.js")) throw new Error("index does not load app.js");
    if (/<script(?![^>]*\bsrc=)/i.test(html)) {
      throw new Error("index contains an inline script");
    }
    if (/\son[a-z]+\s*=/i.test(html)) {
      throw new Error("index contains an inline event handler");
    }
    const csp = index.headers.get("content-security-policy") ?? "";
    if (!/script-src 'self'/.test(csp) || !/connect-src 'self'/.test(csp)) {
      throw new Error("CSP does not keep scripts and connections same-origin");
    }

    const app = await fetch(`${base}/app.js`);
    if (app.status !== 200) throw new Error(`app.js returned ${app.status}`);
    const script = await app.text();
    if (/https?:\/\/[^"'`\s]*rpc/i.test(script)) {
      throw new Error("app.js talks to an RPC directly");
    }
    if (/secret[_-]?key|seed[_-]?phrase|private[_-]?key/i.test(script)) {
      throw new Error("app.js references key material");
    }

    const claims = await fetch(`${base}/claims.md`);
    if (claims.status !== 200) throw new Error(`claims.md returned ${claims.status}`);

    console.log(
      `CONSOLE SMOKE: OK read-only process, empty state, block ${health.headBlock}, same-origin CSP`,
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolveExit();
      }, 3_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    await new Promise((resolveClose) => rpc.server.close(resolveClose));
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`CONSOLE SMOKE: FAIL: ${String(error?.message ?? error)}`);
  process.exit(1);
});
