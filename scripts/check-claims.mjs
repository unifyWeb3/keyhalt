#!/usr/bin/env node
/**
 * Validate CLAIMS.md.
 *
 * Rules:
 *  - every row ID is F-NNN and unique;
 *  - status is one of VERIFIED, INFERRED, HYPOTHESIS, UNKNOWN;
 *  - a VERIFIED row has a non-empty evidence cell and a YYYY-MM-DD date;
 *  - every F-NNN referenced by README, the demo script, or the web UI exists.
 *
 * The Phase 1 table is allowed to contain zero product claims.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const claimsPath = `${root}/CLAIMS.md`;

const STATUSES = new Set(["VERIFIED", "INFERRED", "HYPOTHESIS", "UNKNOWN"]);
const ID_RE = /^F-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(`CLAIMS CHECK: FAIL: ${message}`);
  process.exit(1);
}

function cellsOf(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

if (!existsSync(claimsPath)) fail("CLAIMS.md is missing");

const text = readFileSync(claimsPath, "utf8");
const lines = text.split(/\r?\n/);

const rows = new Map();
let inFence = false;
for (const [index, line] of lines.entries()) {
  if (line.trimStart().startsWith("```")) {
    inFence = !inFence;
    continue;
  }
  if (inFence) continue;
  if (!line.startsWith("|")) continue;
  if (!/^\|\s*F-\d{3}\s*\|/.test(line)) continue;

  const cells = cellsOf(line);
  if (cells.length !== 5) {
    fail(`line ${index + 1}: expected 5 cells, got ${cells.length}`);
  }
  const [id, claim, status, evidence, lastVerified] = cells;
  if (!ID_RE.test(id)) fail(`line ${index + 1}: bad claim ID ${id}`);
  if (rows.has(id)) fail(`line ${index + 1}: duplicate claim ID ${id}`);
  if (!claim || claim.length < 8) fail(`${id}: claim text is too short`);
  if (!STATUSES.has(status)) fail(`${id}: bad status ${status}`);
  if (status === "VERIFIED") {
    if (!evidence || evidence === "—" || /^n\/?a$/i.test(evidence)) {
      fail(`${id}: VERIFIED requires a test path or tx hash`);
    }
    if (!DATE_RE.test(lastVerified)) {
      fail(`${id}: VERIFIED requires a YYYY-MM-DD last-verified date`);
    }
  }
  rows.set(id, { claim, status, evidence, lastVerified });
}

const surfaces = ["README.md", "docs/DEMO_SCRIPT.md", "web/index.html"];
const referenced = new Set();
for (const relative of surfaces) {
  const path = `${root}/${relative}`;
  if (!existsSync(path)) continue;
  const body = readFileSync(path, "utf8");
  for (const match of body.matchAll(/\bF-\d{3}\b/g)) referenced.add(match[0]);
}
for (const id of referenced) {
  if (!rows.has(id)) fail(`${id} is referenced by a claim surface but is not in CLAIMS.md`);
}

const verified = [...rows.values()].filter((row) => row.status === "VERIFIED").length;
if (rows.size === 0) {
  console.log("CLAIMS 0/0 (no claims recorded yet)");
} else {
  console.log(`CLAIMS ${verified}/${rows.size} verified (${rows.size} rows)`);
}
