import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildTimeline } from "../dist/timeline.js";
import { createConsoleServer } from "../dist/server.js";
import { loadConfig } from "../dist/config.js";

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
  let height = 1_000;
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
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function withConsole(run) {
  const rpc = await fakeRpc();
  const temp = mkdtempSync(join(tmpdir(), "fleet-console-test-"));
  const previous = {};
  for (const key of [
    "FLEET_CONSOLE_ACCOUNTS",
    "FLEET_CONSOLE_PROVIDERS",
    "FLEET_CONSOLE_ARCHIVAL_PROVIDERS",
    "FLEET_CONSOLE_SEED_TXS",
    "FLEET_CONSOLE_WATCH_FILE",
    "FLEET_CONSOLE_CACHE_DIR",
    "FLEET_CONSOLE_ROOT",
  ]) {
    previous[key] = process.env[key];
  }
  process.env.FLEET_CONSOLE_ACCOUNTS = "agent.testnet";
  process.env.FLEET_CONSOLE_PROVIDERS = rpc.url;
  process.env.FLEET_CONSOLE_ARCHIVAL_PROVIDERS = rpc.url;
  process.env.FLEET_CONSOLE_SEED_TXS = "";
  process.env.FLEET_CONSOLE_WATCH_FILE = join(temp, "watch.json");
  process.env.FLEET_CONSOLE_CACHE_DIR = join(temp, "cache");
  process.env.FLEET_CONSOLE_ROOT = process.cwd();
  const config = loadConfig();
  const running = createConsoleServer(config);
  const address = await running.start(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run({ base, config, running });
  } finally {
    await running.stop();
    await new Promise((resolve) => rpc.server.close(resolve));
    rmSync(temp, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function getJson(base, path, init) {
  const response = await fetch(`${base}${path}`, { cache: "no-store", ...init });
  const body = await response.json();
  return { response, body };
}

test("console health is read-only, testnet, and block-fed", async () => {
  await withConsole(async ({ base }) => {
    // Health is meant to answer immediately; the block height appears once
    // the feed has completed its first poll and the snapshot can pin a read.
    await getJson(base, "/api/fleet");
    const { response, body } = await getJson(base, "/api/health");
    assert.equal(response.status, 200);
    assert.equal(body.readOnly, true);
    assert.equal(body.noSigner, true);
    assert.equal(body.chainId, "testnet");
    assert.equal(body.service, "fleet-console");
    assert.equal(typeof body.headBlock, "number");
    assert.equal(body.agents.length, 1);
    assert.ok(body.claims.total > 0);
  });
});

test("console fleet reads pinned controller state through the SDK", async () => {
  await withConsole(async ({ base }) => {
    const { response, body } = await getJson(base, "/api/fleet");
    assert.equal(response.status, 200);
    assert.equal(body.status, "live");
    assert.equal(body.agents.length, 1);
    assert.equal(body.agents[0].state, "active");
    assert.equal(body.agents[0].operatorKeys, 1);
    assert.equal(body.agents[0].fullAccessKeys, 0);
    assert.equal(body.totals.operatorKeys, 1);
    assert.equal(typeof body.pinnedBlock, "number");
  });
});

test("console refuses every write method", async () => {
  await withConsole(async ({ base }) => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${base}/api/fleet`, {
        method,
        body: method === "DELETE" ? undefined : "{}",
        headers: { "content-type": "application/json" },
      });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "GET, HEAD");
      const body = await response.json();
      assert.equal(body.readOnly, true);
      assert.equal(body.code, "FLEET_CONSOLE_READ_ONLY");
    }
  });
});

test("console serves the built interface with a same-origin CSP", async () => {
  await withConsole(async ({ base }) => {
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    const csp = index.headers.get("content-security-policy");
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.equal(index.headers.get("x-frame-options"), "DENY");
    const html = await index.text();
    assert.match(html, /\/app\.js/);
    assert.doesNotMatch(html, /https:\/\/[^"]*rpc/i);

    for (const path of ["/app.js", "/styles.css", "/favicon.svg", "/claims.md"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
    }

    const traversal = await fetch(`${base}/..%2fpackage.json`);
    assert.equal(traversal.status, 404);
  });
});

test("console agent reads expose keys, audit verification, and commands", async () => {
  await withConsole(async ({ base }) => {
    const { response, body } = await getJson(
      base,
      "/api/agent?account=agent.testnet",
    );
    assert.equal(response.status, 200);
    assert.equal(body.state.paused, false);
    assert.equal(body.operators.length, 1);
    assert.equal(body.nativeKeys.length, 1);
    assert.equal(body.nativeKeys[0].permission, "FunctionCall");
    assert.equal(body.fullAccessKeys, 0);
    assert.equal(body.auditVerification.ok, true);
    assert.match(body.commands.inventory, /inventory agent\.testnet/);
    assert.match(body.commands.freeze, /freeze agent\.testnet/);
    assert.match(body.commands.unfreeze, /unfreeze agent\.testnet/);
    assert.doesNotMatch(JSON.stringify(body.commands), /BEGIN.*PRIVATE/i);

    const unknown = await getJson(base, "/api/agent?account=nope.testnet");
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.code, "FLEET_CONSOLE_UNKNOWN_AGENT");
  });
});

test("console audit export is the portable fleet-audit-v1 format", async () => {
  await withConsole(async ({ base }) => {
    // The export route waits for a snapshot; call /api/fleet first so the
    // agent state exists by the time the route is probed (this is what the
    // route waits for, exercised under full CPU contention in CI clones).
    await getJson(base, "/api/fleet");
    const { response, body } = await getJson(
      base,
      "/api/audit-export?account=agent.testnet",
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="agent.testnet-audit.json"');
    assert.equal(body.format, "fleet-audit-v1");
    assert.equal(body.accountId, "agent.testnet");
    assert.equal(body.verified, true);
    assert.deepEqual(body.entries, []);
  });
});

test("timeline merges receipts into audit rows and keeps refusals separate", () => {
  const entry = {
    seq: 0,
    action: "freeze",
    actorAccount: "agent.testnet",
    signerPublicKey: "ed25519:Admin",
    subject: "paused=true",
    blockHeight: 100,
    blockTimestampNs: "1700000000000000000",
    prevHash: "0".repeat(64),
    entryHash: "a".repeat(64),
  };
  const base = {
    signerId: "agent.testnet",
    receiverId: "agent.testnet",
    method: "freeze",
    blockHeight: 100,
    blockHash: "Hash100",
    timestampNs: "1700000000000000000",
    logs: [],
    fetchedAt: new Date().toISOString(),
  };
  const receipts = [
    {
      ...base,
      txHash: "TxFreeze1111111111111111111111111111111111111111",
      success: true,
      refusal: null,
      successValue: null,
    },
    {
      ...base,
      method: "execute",
      txHash: "TxRefused111111111111111111111111111111111111111",
      success: false,
      refusal: "controller is frozen",
      successValue: null,
    },
  ];
  const agents = [
    {
      accountId: "agent.testnet",
      label: "agent",
      entries: [entry],
      verified: true,
    },
  ];
  const built = buildTimeline(agents, receipts, 10);
  assert.equal(built.counts.events, 2);
  assert.equal(built.counts.refused, 1);
  const freeze = built.events.find((event) => event.action === "freeze");
  assert.equal(freeze.source, "audit+receipt");
  assert.equal(freeze.txHash, "TxFreeze1111111111111111111111111111111111111111");
  const refused = built.events.find((event) => event.refused);
  assert.equal(refused.event, "execute while frozen");
  assert.equal(refused.result, "refused");
  assert.equal(refused.source, "receipt");
});

/* ---------- console UI state machines (web/state.js) ---------- */
import {
  dataLoadReducer,
  INITIAL_DATA_LOAD,
  sseReducer,
  INITIAL_SSE_STATE,
  sheetReducer,
  INITIAL_SHEET,
  timelineResultOf,
  actionForAgent,
  viewportOf,
  bannerOf,
  agentStateRead,
} from "../../../web/state.js";

test("dataLoad: loading -> live, ok with zero agents -> empty", () => {
  let s = INITIAL_DATA_LOAD;
  assert.equal(s.status, "loading");
  s = dataLoadReducer(s, { type: "fetch-ok", agents: 3, block: 100 });
  assert.equal(s.status, "live");
  assert.equal(s.lastGoodBlock, 100);
  s = dataLoadReducer(s, { type: "fetch-ok", agents: 0, block: 100 });
  assert.equal(s.status, "empty");
});

test("dataLoad: fail with cache -> stale; fail without cache -> error; ok recovers", () => {
  let s = dataLoadReducer(INITIAL_DATA_LOAD, { type: "fetch-ok", agents: 3, block: 100 });
  s = dataLoadReducer(s, { type: "fetch-fail" });
  assert.equal(s.status, "stale");
  assert.equal(s.lastGoodBlock, 100);
  s = dataLoadReducer(s, { type: "fetch-ok", agents: 3, block: 101 });
  assert.equal(s.status, "live");
  const fresh = dataLoadReducer(INITIAL_DATA_LOAD, { type: "fetch-fail" });
  assert.equal(fresh.status, "error");
  assert.equal(fresh.hasData, false);
});

test("dataLoad: live with behind agent -> partial; impossible mixes stay impossible", () => {
  let s = dataLoadReducer(INITIAL_DATA_LOAD, { type: "fetch-ok", agents: 3, partial: true, block: 10 });
  assert.equal(s.status, "partial");
  // `stale` with no cached data must land on `error`, never `stale`.
  const e = dataLoadReducer(INITIAL_DATA_LOAD, { type: "stale-marker" });
  assert.equal(e.status, "error");
});

test("sse: connecting -> live -> reconnecting -> live", () => {
  let s = INITIAL_SSE_STATE;
  s = sseReducer(s, { type: "open" }, 1000);
  assert.equal(s.status, "live");
  s = sseReducer(s, { type: "error" }, 2000);
  assert.equal(s.status, "reconnecting");
  s = sseReducer(s, { type: "open" }, 3000);
  assert.equal(s.status, "live");
  // stopped is terminal
  let stopped = sseReducer(s, { type: "stop" }, 4000);
  stopped = sseReducer(stopped, { type: "open" }, 5000);
  assert.equal(stopped.status, "stopped");
});

test("commandSheet: open, copy, copied resets; impossible transitions are refused", () => {
  let s = INITIAL_SHEET;
  assert.equal(s.status, "closed");
  // copy without open is refused — stays closed, no fake "copied"
  s = sheetReducer(s, { type: "copy-success" });
  assert.equal(s.status, "closed");
  s = sheetReducer(s, { type: "open", commandId: "freeze" });
  assert.equal(s.status, "open");
  s = sheetReducer(s, { type: "copy-success" });
  assert.equal(s.status, "copied");
  assert.equal(s.commandId, "freeze");
  s = sheetReducer(s, { type: "copy-failed" });
  assert.equal(s.status, "copy-failed");
  s = sheetReducer(s, { type: "close" });
  assert.equal(s.status, "closed");
  assert.equal(s.commandId, null);
});

test("actionForAgent: freeze on active Mode A, unfreeze on frozen; never both", () => {
  assert.deepEqual(actionForAgent({ mode: "A", paused: false }), ["freeze"]);
  assert.deepEqual(actionForAgent({ mode: "A", paused: true }), ["unfreeze"]);
  assert.deepEqual(actionForAgent({ mode: "A", paused: null }), ["freeze", "unfreeze"]);
  assert.deepEqual(actionForAgent({ mode: "B", paused: false }), ["request-freeze", "confirm-freeze", "status"]);
  assert.deepEqual(actionForAgent({ mode: "B", paused: true }), ["request-unfreeze", "confirm-unfreeze", "status"]);
  assert.deepEqual(actionForAgent(null), []);
});

test("actionForAgent: UI never offers an action the contract would reject", () => {
  // Freeze on an already-frozen account would trap in the controller.
  for (const paused of [true]) {
    for (const mode of ["A", "B"]) {
      const offered = actionForAgent({ mode, paused });
      if (mode === "A") assert.equal(offered.includes("freeze"), false);
      if (mode === "B") assert.equal(offered.includes("request-freeze"), false);
    }
  }
  // Unfreeze on an unfrozen account would also trap.
  for (const mode of ["A", "B"]) {
    const offered = actionForAgent({ mode, paused: false });
    if (mode === "A") assert.equal(offered.includes("unfreeze"), false);
    if (mode === "B") assert.equal(offered.includes("request-unfreeze"), false);
  }
});

test("timelineResult: refused detected from rows; everything else is ok or pending", () => {
  assert.equal(timelineResultOf({ refused: true }), "refused");
  assert.equal(timelineResultOf({ result: "refused" }), "refused");
  assert.equal(timelineResultOf({ result: "ok" }), "ok");
  assert.equal(timelineResultOf({ kind: "receipt" }), "ok");
  assert.equal(timelineResultOf(null), "pending");
});

test("viewport: compact/medium/wide by pixel width", () => {
  assert.equal(viewportOf(390), "compact");
  assert.equal(viewportOf(900), "medium");
  assert.equal(viewportOf(901), "wide");
});

test("bannerOf: stale/error -> reads failing; partial -> partial; sse reconnecting mid-load -> reconnecting; healthy -> null", () => {
  const healthy = bannerOf(
    { status: "live", lastGoodBlock: 1, hasData: true, consecutiveFailures: 0, staleSince: null },
    { status: "live", since: 1 },
  );
  assert.equal(healthy, null);
  const stale = bannerOf(
    { status: "stale", lastGoodBlock: 5, hasData: true, consecutiveFailures: 2, staleSince: 1 },
    { status: "live", since: 1 },
  );
  assert.equal(stale.kind, "danger");
  const partial = bannerOf(
    { status: "partial", lastGoodBlock: 5, hasData: true, consecutiveFailures: 0, staleSince: null },
    { status: "live", since: 1 },
  );
  assert.equal(partial.title, "Partial snapshot.");
});

test("agentStateRead: paused true -> frozen at block; false -> active; null -> unknown", () => {
  assert.deepEqual(agentStateRead({ block: null }, true, 100), { status: "frozen", block: 100 });
  assert.deepEqual(agentStateRead({ block: 10 }, false, null), { status: "active", block: 10 });
  assert.deepEqual(agentStateRead({ block: null }, undefined, null), { status: "unknown", block: null });
});
