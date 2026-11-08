import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const HOUSE = {
  version: "fleet-controller-v0.3.0",
  mode: "A",
  paused: false,
  admin_pk: "ed25519:AdminKey111111111111111111111111111111111",
  recovery_pk: "ed25519:RecoveryKey111111111111111111111111111111",
  pending_admin_pk: null,
  pending_origin: null,
  inflight_admin_pk: null,
  operators: [
    {
      pk: "ed25519:OperatorKey1111111111111111111111111111",
      tag: "ops-a",
      active: true,
    },
  ],
  receiver: "ping.testnet",
  method: "ping",
  max_operators: 8,
  provisioned: true,
  provision_error: null,
  audit_head: {
    seq: 0,
    entry_hash: "0".repeat(64),
    block_height: 900,
    block_timestamp: "1700000000000000000",
  },
  audit_len: 0,
};

function fakeRpc() {
  let height = 1_000_000;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const request = JSON.parse(body);
      const params = request.params ?? {};
      let result;
      if (request.method === "status") {
        result = { chain_id: "testnet" };
      } else if (request.method === "block") {
        height += 1;
        result = {
          header: {
            height,
            hash: `Hash${height}`,
            timestamp: String(1_700_000_000_000_000_000 + height),
          },
        };
      } else if (request.method === "query" && params.request_type === "call_function") {
        const payload =
          params.method_name === "get_state"
            ? HOUSE
            : params.method_name === "get_audit"
              ? []
              : false;
        result = {
          result: Array.from(Buffer.from(JSON.stringify(payload))),
          block_height: height,
          block_hash: `Hash${height}`,
        };
      } else if (
        request.method === "query" &&
        params.request_type === "view_access_key_list"
      ) {
        result = {
          keys: [
            {
              public_key: "ed25519:OperatorKey1111111111111111111111111111",
              access_key: {
                permission: {
                  FunctionCall: {
                    allowance: "250000000000000000000000",
                    receiver_id: "ping.testnet",
                    method_names: ["ping"],
                  },
                },
              },
            },
          ],
          block_height: height,
          block_hash: `Hash${height}`,
        };
      } else {
        res.writeHead(400, { "content-type": "application/json" });
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

async function withMcp(run, argv = []) {
  const rpc = await fakeRpc();
  const child = spawn(
    process.execPath,
    [cli, "--rpc-url", rpc.url, ...argv],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    await run({ send, read });
  } finally {
    child.kill("SIGKILL");
    await once(child, "exit");
    await new Promise((resolveClose) => rpc.server.close(resolveClose));
  }

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function read() {
    const index = stdout.indexOf("\n");
    const line = index === -1 ? null : stdout.slice(0, index);
    if (line === null || line.trim() === "") {
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          const at = stdout.indexOf("\n");
          if (at !== -1) {
            clearInterval(timer);
            const value = stdout.slice(0, at);
            stdout = stdout.slice(at + 1);
            resolve(JSON.parse(value));
          }
        }, 10);
        timer.unref();
      });
    }
    stdout = stdout.slice(index + 1);
    return Promise.resolve(JSON.parse(line));
  }
}

test("MCP initialize handshake answers with the fleet server info", async () => {
  await withMcp(async ({ send, read }) => {
    send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const response = await read();
    assert.equal(response.id, 1);
    assert.equal(response.result.serverInfo.name, "fleet-mcp");
    assert.equal(response.result.protocolVersion, "2025-06-18");
    assert.deepEqual(response.result.capabilities, { tools: {} });
  });
});

test("tools/list exposes the three read-only fleet tools", async () => {
  await withMcp(async ({ send, read }) => {
    send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const response = await read();
    const names = response.result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ["fleet_audit", "fleet_inventory", "fleet_verify"]);
    for (const tool of response.result.tools) {
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
  });
});

test("fleet_inventory returns paused=false with one operator from the pinned chain read", async () => {
  await withMcp(async ({ send, read }) => {
    send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "fleet_inventory", arguments: { account: "agent.testnet" } },
    });
    const response = await read();
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 5);
    const payload = JSON.parse(response.result.content[0].text);
    assert.equal(payload.paused, false);
    assert.equal(payload.mode, "A");
    assert.equal(payload.operators.length, 1);
    assert.equal(payload.fullAccessKeys, 0);
    assert.equal(payload.auditLength, 0);
  });
});

test("fleet_audit returns the entries array from the controller", async () => {
  await withMcp(async ({ send, read }) => {
    send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "fleet_audit", arguments: { account: "agent.testnet" } },
    });
    const response = await read();
    const payload = JSON.parse(response.result.content[0].text);
    assert.deepEqual(payload.entries, []);
    assert.equal(payload.returned, 0);
  });
});

test("an unknown tool gets a -32601 JSON-RPC error", async () => {
  await withMcp(async ({ send, read }) => {
    send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "fleet_freeze", arguments: {} },
    });
    const response = await read();
    assert.equal(response.error.code, -32601);
  });
});

test("a non-account fails request validation before any chain read", async () => {
  await withMcp(async ({ send, read }) => {
    send({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "fleet_inventory", arguments: { account: "!!" } },
    });
    const response = await read();
    assert.equal(response.error.code, -32602);
  });
});

test("unknown methods are rejected", async () => {
  await withMcp(async ({ send, read }) => {
    send({ jsonrpc: "2.0", id: 9, method: "fleet_freeze" });
    const response = await read();
    assert.equal(response.error.code, -32601);
  });
});

test("the binary refuses a mainnet RPC URL at startup", async () => {
  const temp = mkdtempSync(join(tmpdir(), "fleet-mcp-test-"));
  try {
    const child = spawn(process.execPath, [cli, "--rpc-url", "https://rpc.mainnet.near.org"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FLEET_MCP_RPC_URL: "https://rpc.mainnet.near.org" },
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const [code] = await once(child, "exit");
    assert.notEqual(code, 0);
    assert.match(stderr, /testnet/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
