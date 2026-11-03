#!/usr/bin/env node
/**
 * FLEET mutation test.
 *
 * Applies a small, fixed set of semantic mutants to the pure controller state
 * machine, runs one targeted test per mutant, and requires every mutant to be
 * killed. The source file is restored after every run and on exit.
 *
 * Output: evidence/mutation/mutation-report.{json,md}
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = `${root}/contracts/fleet-controller/src/model.rs`;
const outDir = `${root}/evidence/mutation`;
const original = readFileSync(sourcePath, "utf8");

const cargo = "/root/.cargo/bin/cargo";
const env = {
  ...process.env,
  PATH: `/root/.cargo/bin:${process.env.PATH ?? ""}`,
};

const mutants = [
  {
    id: "M-01",
    name: "frozen-check inversion",
    find: "        if self.paused {\n            return Err(Error::Frozen);\n        }\n        let Some(op) = self.operator_for(&actor.signer_pk) else {",
    replace: "        if !self.paused {\n            return Err(Error::Frozen);\n        }\n        let Some(op) = self.operator_for(&actor.signer_pk) else {",
    test: "model::tests::freeze_blocks_operator_and_unfreeze_restores_positive_control",
  },
  {
    id: "M-02",
    name: "tag-revoke partition inversion",
    find: "        self.operators.retain(|op| op.tag != tag);",
    replace: "        self.operators.retain(|op| op.tag == tag);",
    test: "model::tests::revoke_tag_is_an_exact_partition",
  },
  {
    id: "M-03",
    name: "admin check OR -> AND",
    find: "        if actor.account != current || &actor.signer_pk != admin_pk {",
    replace: "        if actor.account != current && &actor.signer_pk != admin_pk {",
    test: "model::tests::operator_cannot_freeze_but_admin_can",
  },
  {
    id: "M-04",
    name: "key-collision OR -> AND",
    find: "        if Some(pk) == self.admin_pk() || Some(pk) == self.recovery_pk() {",
    replace: "        if Some(pk) == self.admin_pk() && Some(pk) == self.recovery_pk() {",
    test: "model::tests::grant_and_propose_reject_keys_that_already_have_a_role",
  },
  {
    id: "M-05",
    name: "accept-signer check inversion",
    find: "        if matches!(self.mode, Mode::A { .. }) && actor.signer_pk != pending.pk {",
    replace: "        if matches!(self.mode, Mode::A { .. }) && actor.signer_pk == pending.pk {",
    test: "model::tests::recovery_proposes_but_cannot_accept_itself",
  },
  {
    id: "M-06",
    name: "cancel authorization OR -> AND",
    find: "        let allowed = self.require_admin(actor, current).is_ok()\n            || self.require_recovery(actor, current).is_ok();",
    replace: "        let allowed = self.require_admin(actor, current).is_ok()\n            && self.require_recovery(actor, current).is_ok();",
    test: "model::tests::cancel_admin_is_allowed_for_admin_or_recovery_and_clears_pending",
  },
  {
    id: "M-07",
    name: "audit entry-hash check inversion",
    find: "            if entry.entry_hash != expected {\n                return false;\n            }",
    replace: "            if entry.entry_hash == expected {\n                return false;\n            }",
    test: "model::tests::audit_chain_verifies_and_tamper_fails",
  },
  {
    id: "M-08",
    name: "rotate retains only the new key",
    find: "            .retain(|op| op.pk != old_pk || op.pk == new_pk);",
    replace: "            .retain(|op| op.pk != old_pk && op.pk == new_pk);",
    test: "model::tests::rotate_is_fresh_key_first_and_keeps_old_until_confirmed",
  },
];

function restore() {
  writeFileSync(sourcePath, original);
}

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});
process.on("exit", () => {
  restore();
});

function runTest(testName) {
  const started = Date.now();
  const result = spawnSync(
    cargo,
    ["test", "-p", "fleet-controller", "--lib", testName, "--", "--exact"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    status: result.status,
    duration_ms: Date.now() - started,
    compiled: !/could not compile|error\[E\d+\]/.test(output),
    passed:
      result.status === 0 &&
      /\btest result: ok\. 1 passed\b/.test(output),
    tail: output.trim().split(/\r?\n/).slice(-6).join("\n"),
  };
}

mkdirSync(outDir, { recursive: true });

console.log(`[mutation] source=${sourcePath}`);
console.log(`[mutation] ${mutants.length} mutants`);

const baselines = new Map();
for (const mutant of mutants) {
  if (!baselines.has(mutant.test)) {
    baselines.set(mutant.test, runTest(mutant.test));
  }
  const baseline = baselines.get(mutant.test);
  if (!baseline?.passed) {
    console.error(
      `[mutation] BASELINE FAILED for ${mutant.test}:\n${baseline?.tail}`,
    );
    restore();
    process.exit(2);
  }
}
console.log(`[mutation] baseline green for ${baselines.size} target tests`);

const results = [];
for (const mutant of mutants) {
  if (!original.includes(mutant.find)) {
    results.push({
      ...mutant,
      outcome: "INVALID",
      reason: "mutation anchor not found",
      duration_ms: 0,
      tail: "",
    });
    console.log(`[mutation] ${mutant.id} INVALID (anchor not found)`);
    continue;
  }
  const mutated = original.replace(mutant.find, mutant.replace);
  if (mutated === original) {
    results.push({
      ...mutant,
      outcome: "INVALID",
      reason: "mutation did not change source",
      duration_ms: 0,
      tail: "",
    });
    console.log(`[mutation] ${mutant.id} INVALID (no change)`);
    continue;
  }
  writeFileSync(sourcePath, mutated);
  let run;
  try {
    run = runTest(mutant.test);
  } finally {
    restore();
  }
  let outcome;
  let reason;
  if (!run.compiled) {
    outcome = "INVALID";
    reason = "mutant did not compile";
  } else if (run.passed) {
    outcome = "SURVIVED";
    reason = "target test still passed";
  } else {
    outcome = "KILLED";
    reason = "target test failed";
  }
  results.push({ ...mutant, outcome, reason, ...run });
  console.log(
    `[mutation] ${mutant.id} ${outcome} (${run.duration_ms} ms) ${mutant.name}`,
  );
}

// Sanity: byte-identical restoration.
const restored = readFileSync(sourcePath, "utf8") === original;
if (!restored) {
  console.error("[mutation] FATAL: source restoration mismatch");
  process.exit(3);
}

const killed = results.filter((result) => result.outcome === "KILLED").length;
const survived = results.filter((result) => result.outcome === "SURVIVED").length;
const invalid = results.filter((result) => result.outcome === "INVALID").length;
const report = {
  generated_at: new Date().toISOString(),
  source: "contracts/fleet-controller/src/model.rs",
  command:
    "cargo test -p fleet-controller --lib <test> -- --exact (one target test per mutant)",
  total: results.length,
  killed,
  survived,
  invalid,
  score: results.length === 0 ? 0 : killed / results.length,
  restored_byte_identical: restored,
  results: results.map((result) => ({
    id: result.id,
    name: result.name,
    test: result.test,
    outcome: result.outcome,
    reason: result.reason,
    duration_ms: result.duration_ms,
    find: result.find,
    replace: result.replace,
    tail: result.tail,
  })),
};
writeFileSync(
  `${outDir}/mutation-report.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);

const lines = [
  "# FLEET mutation test report",
  "",
  `Generated: ${report.generated_at}`,
  `Source: \`${report.source}\``,
  `Score: **${killed}/${results.length}** mutants killed (${(report.score * 100).toFixed(1)}%)`,
  `Source restored byte-identical: ${restored}`,
  "",
  "| ID | Mutant | Target test | Outcome | Time |",
  "| --- | --- | --- | --- | --- |",
  ...results.map(
    (result) =>
      `| ${result.id} | ${result.name} | \`${result.test}\` | **${result.outcome}** | ${result.duration_ms} ms |`,
  ),
  "",
  "A mutant is KILLED when the targeted test fails after the mutation. A",
  "SURVIVED mutant would mean the test suite does not constrain that behavior.",
  "",
];
writeFileSync(`${outDir}/mutation-report.md`, lines.join("\n"));

console.log(
  `[mutation] killed=${killed} survived=${survived} invalid=${invalid} total=${results.length}`,
);
console.log(`[mutation] report=${outDir}/mutation-report.md`);
if (survived > 0 || invalid > 0) process.exit(1);
