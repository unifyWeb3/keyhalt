#!/usr/bin/env bash
# One-command setup: check tools, install JavaScript dependencies, build.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Use the rustup toolchain when it is installed outside the default PATH.
if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "SETUP: FAIL: missing $1" >&2
    exit 1
  }
}

need node
need npm
need cargo
need rustc
need git

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "SETUP: FAIL: Node.js 22+ required, found $(node --version)" >&2
  exit 1
fi

if command -v rustup >/dev/null 2>&1; then
  if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
    echo "SETUP: installing wasm32-unknown-unknown"
    rustup target add wasm32-unknown-unknown
  fi
else
  test -d "$(rustc --print sysroot)/lib/rustlib/wasm32-unknown-unknown" || {
    echo "SETUP: FAIL: wasm32-unknown-unknown target is not installed" >&2
    exit 1
  }
fi

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

npm run build
cargo test --workspace --no-run

echo "SETUP: OK"
echo "  node    $(node --version)"
echo "  npm     $(npm --version)"
echo "  rustc   $(rustc --version)"
echo "  cargo   $(cargo --version)"
if command -v cargo-near >/dev/null 2>&1; then
  echo "  cargo-near $(cargo near --version 2>/dev/null || echo present)"
else
  echo "  cargo-near not installed (not required for Phase 1)"
fi
