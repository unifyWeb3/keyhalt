import assert from "node:assert/strict";
import test from "node:test";

import { createReadOnlyApi, FLEET_API_VERSION } from "../dist/index.js";

const api = createReadOnlyApi();

test("API health is read-only and explicit about the scaffold", () => {
  const response = api.handle("GET", "/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "v03-scaffold",
    version: FLEET_API_VERSION,
    readOnly: true,
  });
});

test("API refuses every write method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.throws(() => api.handle(method, "/v1/accounts/x.testnet/inventory"), /read-only/);
  }
});

test("API returns 501 for planned read routes, not fake data", () => {
  const response = api.handle("GET", "/v1/accounts/x.testnet/inventory");
  assert.equal(response.status, 501);
  assert.match(JSON.stringify(response.body), /not implemented in the v0.3 scaffold/);
});
