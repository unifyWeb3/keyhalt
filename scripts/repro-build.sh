#!/usr/bin/env bash
# Reproducible wasm build.
#
# Builds the controller twice in separate empty target directories with the
# locked dependency graph, then compares the two artifacts byte-for-byte.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keyhalt-repro.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

for label in a b; do
  echo "== clean build $label =="
  CARGO_TARGET_DIR="$TMP/$label" \
    cargo build --locked -p fleet-controller \
    --target wasm32-unknown-unknown --release
done

A="$TMP/a/wasm32-unknown-unknown/release/fleet_controller.wasm"
B="$TMP/b/wasm32-unknown-unknown/release/fleet_controller.wasm"

HASH_A="$(sha256sum "$A" | cut -d' ' -f1)"
HASH_B="$(sha256sum "$B" | cut -d' ' -f1)"
SIZE_A="$(stat -c '%s' "$A")"
SIZE_B="$(stat -c '%s' "$B")"

echo
echo "build A: ${SIZE_A} bytes ${HASH_A}"
echo "build B: ${SIZE_B} bytes ${HASH_B}"

if ! cmp -s "$A" "$B"; then
  echo "REPRODUCIBLE: FAIL: builds differ" >&2
  exit 1
fi

if [ -f evidence/testnet-v03/run.json ]; then
  EXPECTED="$(node -p "require('./evidence/testnet-v03/run.json').run.wasm_sha256")"
  if [ "$HASH_A" != "$EXPECTED" ]; then
    echo "REPRODUCIBLE: FAIL: hash does not match canonical run ($EXPECTED)" >&2
    exit 1
  fi
  echo "canonical run hash: $EXPECTED (match)"
fi

echo "REPRODUCIBLE: PASS (byte-identical, $(rustc --version))"
