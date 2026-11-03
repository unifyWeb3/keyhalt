#!/usr/bin/env bash
# One-command verification for FLEET v0.3.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Use the rustup toolchain when it is installed outside the default PATH.
if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

echo "== Rust format =="
cargo fmt --all -- --check

echo "== Rust clippy =="
cargo clippy --workspace --all-targets -- -D warnings

echo "== Rust tests =="
cargo test --workspace

echo "== Rust wasm release build =="
cargo build -p fleet-controller --target wasm32-unknown-unknown --release
sha256sum target/wasm32-unknown-unknown/release/fleet_controller.wasm

echo "== TypeScript build and tests =="
npm test

echo "== Claims table =="
node scripts/check-claims.mjs

echo "== Secret scan =="
./scripts/secret-scan.sh

echo "== Web placeholder =="
node - <<'NODE'
import { readFileSync } from "node:fs";
const html = readFileSync("web/index.html", "utf8");
if (/<script\b/i.test(html)) throw new Error("web placeholder must not contain a script tag");
if (/fetch\s*\(/i.test(html)) throw new Error("web placeholder must not make network calls");
if (/private[_-]?key\s*[:=]/i.test(html)) throw new Error("web placeholder must not contain key fields");
console.log("WEB CHECK: OK static placeholder, no script, no key field");
NODE

echo "== Read-only testnet RPC =="
# Best-effort by default; a public RPC outage must not make local reproduction
# fail. Set FLEET_REQUIRE_RPC=1 for a release gate that requires testnet.
node scripts/rpc-check.mjs

echo "== Optional sandbox harness (not installed on this host) =="
npm ls near-workspaces near-sandbox --depth=1 2>/dev/null || true

echo
echo "FLEET verification: PASS"
node scripts/check-claims.mjs
