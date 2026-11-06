#!/usr/bin/env node
/**
 * Recapture the FLEET pixel-draft screenshots at 1920×1080.
 *
 * The draft is a static prototype: it renders captured evidence/ data and a
 * ticking block counter, with no RPC calls. This script opens design/index.html
 * in headless Chromium from the local Playwright browser cache and writes the
 * four review screenshots into design/screenshots/.
 *
 * It also asserts the freshness rule the human asked for: every screen shows
 * the current claims footer (37/37), and no screen contains a stale claims
 * count (28/28, 35/35, 21/21).
 *
 * Usage:
 *   node design/capture-screenshots.mjs
 *
 * Environment (optional):
 *   PLAYWRIGHT_CORE   path to a playwright-core package directory
 *   PLAYWRIGHT_CHROMIUM  path to a Chromium executable
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

function findPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    "/root/browser-tool/node_modules/playwright-core",
    "/tmp/opencode/audit/plaque-baseline/web/node_modules/playwright-core",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  throw new Error("playwright-core not found; set PLAYWRIGHT_CORE");
}

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const candidates = [
    "/root/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome",
    "/root/.cache/ms-playwright/chromium-1148/chrome-linux-arm64/chrome",
    "/root/.cache/ms-playwright/chromium-1248/chrome-linux/chrome",
    "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Chromium executable not found; set PLAYWRIGHT_CHROMIUM");
}

const { chromium } = require(findPlaywright());
const executablePath = findChromium();
const pageUrl = `file://${resolve(here, "index.html")}`;
const shotsDir = resolve(here, "screenshots");
mkdirSync(shotsDir, { recursive: true, mode: 0o755 });

const SHOTS = [
  { file: "fleet.png", hash: "", label: "Fleet" },
  { file: "agent.png", hash: "#agent=agent-b1.fleet-modeb-748d4372.testnet", label: "Agent" },
  {
    file: "agent-sheet.png",
    hash: "#agent=agent-b1.fleet-modeb-748d4372.testnet",
    label: "Agent with command sheet",
    openSheet: true,
  },
  { file: "timeline.png", hash: "#timeline", label: "Timeline" },
];

const STALE = [/28\/28/, /35\/35/, /21\/21/];

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

for (const shot of SHOTS) {
  const page = await context.newPage();
  await page.goto(`${pageUrl}${shot.hash}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (shot.openSheet) {
    await page.click("#freeze-btn");
    await page.waitForSelector("#sheet:not([hidden])");
  }
  const body = await page.innerText("body");
  if (!body.includes("37/37")) {
    throw new Error(`${shot.file}: footer does not show 37/37`);
  }
  for (const pattern of STALE) {
    if (pattern.test(body)) {
      throw new Error(`${shot.file}: stale claims count ${pattern} on screen`);
    }
  }
  const target = join(shotsDir, shot.file);
  await page.screenshot({ path: target });
  console.log(`captured ${shot.label} -> design/screenshots/${shot.file}`);
  await page.close();
}

await browser.close();
console.log("all screenshots captured; freshness assertions passed");
