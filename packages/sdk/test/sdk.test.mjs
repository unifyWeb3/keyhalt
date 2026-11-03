import assert from "node:assert/strict";
import test from "node:test";

import { createFleetClient, FLEET_SDK_VERSION } from "../dist/index.js";

test("SDK scaffold exposes a version marker", () => {
  assert.equal(FLEET_SDK_VERSION, "0.0.0-phase1");
});

test("SDK scaffold refuses to pretend the client exists", () => {
  assert.throws(
    () => createFleetClient({ rpcUrl: "https://rpc.testnet.near.org", accountId: "x.testnet" }),
    /not implemented in Phase 1/,
  );
});
