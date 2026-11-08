#!/usr/bin/env node
/**
 * Style gate for README.md, AGENTS.md, docs/, and web/ copy.
 *
 * Rules enforced
 *   - No U+2014 (em dash) or U+2013 (en dash) anywhere between word
 *     characters in prose, in any tracked text file.
 *   - No banned phrases in prose: see BANNED_PHRASES. Inside code identifiers
 *     the phrases are ignored.
 *   - No "not just X, but Y", "whether you're", "In today's" constructions.
 *
 * A lone U+2014 standing as a placeholder glyph (no letter on either side) is
 * allowed; sentence separators are not.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const TEXT_EXTS = new Set([".md", ".js", ".mjs", ".ts", ".html", ".css"]);

const BANNED_PHRASES = [
  "seamless",
  "robust",
  "powerful",
  "cutting-edge",
  "leverage",
  "empower",
  "revolutionary",
  "game-changing",
  "unlock",
  "elevate",
  "delve",
];
const NOT_JUST_BUT = /\bnot just [^.;]*,\s*but\b/i;
const WHETHER_YOU_RE = /\bwhether you're\b/i;
const IN_TODAYS = /\bin today's\b/i;
// U+2014/U+2013 must be flanked by letters or digits on at least one side to
// qualify as a separator between word characters.
const EM_DASH_SEP = /[A-Za-z0-9]\s*—|—\s*[A-Za-z0-9]/;
const EN_DASH_SEP = /[A-Za-z0-9]\s*–|–\s*[A-Za-z0-9]/;

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "target" ||
      name === "evidence" ||
      name === "screenshots"
    ) {
      continue;
    }
    const full = join(directory, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (TEXT_EXTS.has(extname(name).toLowerCase())) {
      yield full;
    }
  }
}

function isCommentLine(line) {
  return /^\s*(\/\/|\/\*|\*)/.test(line);
}

function checkFile(path) {
  const failures = [];
  const text = readFileSync(path, "utf8");
  for (const [index, line] of text.split("\n").entries()) {
    if (EM_DASH_SEP.test(line) && /[A-Za-z][^A-Za-z]*—[^A-Za-z]*[A-Za-z]/.test(line)) {
      failures.push({ line: index + 1, issue: "U+2014 separator", content: line.trim() });
    }
    if (EN_DASH_SEP.test(line) && /[A-Za-z][^A-Za-z]*–[^A-Za-z]*[A-Za-z]/.test(line)) {
      failures.push({ line: index + 1, issue: "U+2013 separator", content: line.trim() });
    }
    if (isCommentLine(line)) continue; // comments may name the rule being banned
    for (const phrase of BANNED_PHRASES) {
      if (new RegExp(`\\b${phrase}`, "i").test(line)) {
        failures.push({ line: index + 1, issue: `banned phrase: ${phrase}`, content: line.trim() });
      }
    }
    if (NOT_JUST_BUT.test(line)) {
      failures.push({ line: index + 1, issue: 'rhetorical "not just X, but Y"', content: line.trim() });
    }
    if (WHETHER_YOU_RE.test(line)) {
      failures.push({ line: index + 1, issue: 'rhetorical "whether you\'re"', content: line.trim() });
    }
    if (IN_TODAYS.test(line)) {
      failures.push({ line: index + 1, issue: '"In today\'s"', content: line.trim() });
    }
  }
  return failures;
}

const targets = ["README.md", "AGENTS.md", "docs", "web"];
let failed = 0;
for (const target of targets) {
  if (!existsSync(target)) continue;
  const stat = statSync(target);
  const files = stat.isDirectory() ? [...walk(target)] : [target];
  for (const file of files) {
    for (const failure of checkFile(file)) {
      console.log(`${file}:${failure.line}: ${failure.issue}`);
      console.log(`    ${failure.content}`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`\nSTYLE: FAIL (${failed} issue${failed === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log("STYLE: OK");
