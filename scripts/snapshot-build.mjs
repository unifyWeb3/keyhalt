#!/usr/bin/env node
/**
 * Build dist-snapshot/ deterministically and offline from the committed
 * capture in snapshot/. No network call is made at build time.
 *
 * The snapshot embeds the captured testnet payloads into the page, strips the
 * live block stream, and shows "Recorded data, not live" on every screen.
 * Every byte of the output derives from files tracked in this repository.
 *
 * Usage: node scripts/snapshot-build.mjs
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolveRepoRoot();
const snapshotDir = join(root, "snapshot");
const outDir = join(root, "dist-snapshot");

function resolveRepoRoot() {
  // This file lives in scripts/, the repo root is its parent.
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function fail(message) {
  console.error(`SNAPSHOT: FAIL: ${message}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

const captured = readJson(join(snapshotDir, "capture.json"));
for (const key of ["capturedAt", "network", "headBlock", "pinnedBlock", "health", "keyhalt", "timeline", "agents"]) {
  if (captured[key] === undefined) fail(`snapshot/capture.json is missing "${key}"`);
}
if (captured.network !== "testnet") fail("snapshot is not a testnet capture");

const health = readJson(join(snapshotDir, captured.health));
const keyhalt = readJson(join(snapshotDir, captured.keyhalt));
const timeline = readJson(join(snapshotDir, captured.timeline));
const agents = {};
for (const [accountId, file] of Object.entries(captured.agents)) {
  const agent = readJson(join(snapshotDir, file));
  if (agent.accountId !== accountId) {
    fail(`capture mismatch: ${file} holds account ${agent.accountId}, expected ${accountId}`);
  }
  agents[accountId] = agent;
}

const fleetAgents = keyhalt.agents.map((row) => row.accountId).sort();
const capturedAgents = Object.keys(agents).sort();
if (JSON.stringify(fleetAgents) !== JSON.stringify(capturedAgents)) {
  fail(`agent list mismatch: fleet payload [${fleetAgents}] vs capture [${capturedAgents}]`);
}
const claims = keyhalt.claims;
if (!claims || claims.verified !== claims.total) {
  fail(`snapshot must carry a complete claims count, got ${JSON.stringify(claims)}`);
}

// ---- deterministic output --------------------------------------------------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const BANNER = `Recorded data, not live · pinned capture · head block ${captured.headBlock} · captured ${captured.capturedAt} · testnet · unaudited`;

function writeOut(rel, content) {
  const dest = join(outDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

function copyTree(src, destRel) {
  mkdirSync(join(outDir, destRel), { recursive: true });
  const entries = readdirSync(src).sort();
  for (const name of entries) {
    const s = join(src, name);
    const d = join(destRel, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, join(outDir, d));
  }
}

// index.html: robots noindex kept, banner injected on every screen, snapshot
// data bundle loaded before the module app.
let html = readFileSync(join(root, "web/index.html"), "utf8");
if (!/<meta name="robots" content="noindex"\s*\/>/.test(html)) {
  fail("web/index.html lost its noindex meta; refusing to build the snapshot");
}
html = "<!-- Keyhalt dist-snapshot. Static capture, not a live service. See snapshot/capture.json. -->\n" + html;
html = html.replace(
  "</header>",
  `</header>\n<div class="snapshot-banner" role="status">${BANNER}</div>`,
);
if (!html.includes("<div class=\"snapshot-banner\"")) {
  // </header> may not exist in future layouts; inject right after <body> instead.
  html = html.replace(
    "<body>",
    `<body>\n<div class="snapshot-banner" role="status">${BANNER}</div>`,
  );
}
html = html.replace(
  '<script type="module" src="/app.js"></script>',
  '<script src="/snapshot-data.js"></script>\n<script type="module" src="/app.js"></script>',
);
writeOut("index.html", html);

// styles.css: the captured banner rule only; no other restyling.
let css = readFileSync(join(root, "web/styles.css"), "utf8");
css += `\n/* snapshot-only banner; the live console never renders it */\n.snapshot-banner {\n  padding: 8px 16px;\n  border-bottom: 1px solid var(--line, #2a2a2a);\n  background: #14100a;\n  color: #e0b76a;\n  font-family: var(--mono, ui-monospace, monospace);\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  text-align: center;\n}\n`;
writeOut("styles.css", css);

// favicon, brand, state machine, empty dir kept as-is
for (const rel of ["favicon.svg", "brand.js", "state.js"]) {
  copyFileSync(join(root, "web", rel), join(outDir, rel));
}
copyTree(join(root, "design/fonts"), "fonts");

// claims.md and threat-model.md keep the footer links working
copyFileSync(join(root, "CLAIMS.md"), join(outDir, "claims.md"));
copyFileSync(join(root, "docs/THREAT_MODEL.md"), join(outDir, "threat-model.md"));

// app.js: resolve the API surface from the embedded capture; disable the
// block stream (a static host has none) and leave the rest untouched.
let app = readFileSync(join(root, "web/app.js"), "utf8");
const oldGetJson = `async function getJSON(path) {
  const response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });`;
if (!app.includes(oldGetJson)) fail("getJSON in web/app.js changed shape; update the snapshot build");
const stub = `function lookupSnapshot(path) {
  const bundle = window.__KEYHALT_SNAPSHOT__;
  if (bundle === undefined) return undefined;
  if (path === "/api/health") return bundle.health;
  if (path === "/api/keyhalt") return bundle.keyhalt;
  if (path === "/api/timeline?limit=200") return bundle.timeline;
  const agentMatch = /^\\/api\\/agent\\?account=(.+)$/.exec(path);
  if (agentMatch) return bundle.agents[decodeURIComponent(agentMatch[1])];
  return undefined;
}

async function getJSON(path) {
  const payload = lookupSnapshot(path);
  if (payload === undefined) {
    const error = new Error(\`Recorded snapshot has no capture for \${path}\`);
    error.code = "KEYHALT_SNAPSHOT_MISSING";
    throw error;
  }
  return JSON.parse(JSON.stringify(payload));
}`;
const getJsonEnd = app.indexOf(oldGetJson);
const closing = app.indexOf("\n}\n", getJsonEnd);
if (closing === -1) fail("cannot locate the end of getJSON");
// Replace from `async function getJSON` through its closing brace.
const before = app.slice(0, getJsonEnd);
const after = app.slice(closing + 3);
app = before + stub + after;

const connectAnchor = "function connectStream() {\n  if (typeof EventSource === \"undefined\") return;";
if (!app.includes(connectAnchor)) fail("connectStream changed shape; update the snapshot build");
app = app.replace(
  connectAnchor,
  "function connectStream() {\n  return; // snapshot build: no block stream on a static host\n  if (typeof EventSource === \"undefined\") return;",
);
writeOut("app.js", app);

// snapshot-data.js: the single embed of the capture for anyone reading the page source
writeOut(
  "snapshot-data.js",
  `window.__KEYHALT_SNAPSHOT__ = ${JSON.stringify({ health, keyhalt, timeline, agents })};\n`,
);

// Assertions on the finished output
const outHtml = readFileSync(join(outDir, "index.html"), "utf8");
if (!outHtml.includes(BANNER)) fail("banner missing from output");
if (!/<meta name="robots" content="noindex"\s*\/>/.test(outHtml)) fail("noindex missing from output");
if (!/snapshot-data\.js/.test(outHtml)) fail("snapshot data bundle not referenced");
const outApp = readFileSync(join(outDir, "app.js"), "utf8");
if (!/function connectStream\(\) \{\s*\n\s*return; \/\/ snapshot build/.test(outApp)) {
  fail("block stream not disabled in output");
}
if (outApp.includes("window.fetch") || /[^a-zA-Z]fetch\(path/.test(outApp)) fail("network fetch still present in output app");

const files = [];
(function list(dir, rel) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) list(full, relPath);
    else files.push(relPath);
  }
})(outDir, "");
console.log("SNAPSHOT: OK");
for (const file of files) console.log(`  dist-snapshot/${file}`);
