import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));

test("CLI prints its version", async () => {
  const { stdout } = await run(process.execPath, [cli, "--version"]);
  assert.match(stdout, /^fleet 0\.0\.0-phase1\n$/);
});

test("CLI help lists the planned commands", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"]);
  assert.match(stdout, /Planned commands \(not implemented in Phase 1\)/);
  assert.match(stdout, /fleet inventory/);
});

test("CLI refuses a product command with exit code 2", async () => {
  await assert.rejects(
    run(process.execPath, [cli, "freeze", "x.testnet"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(String(error.stderr), /not implemented in Phase 1/);
      return true;
    },
  );
});
