#!/usr/bin/env bash
#
# Build the controller wasm for the near-workspaces integration sandbox.
#
# Why this is a separate build:
#   * The bundled sandbox (near-sandbox 0.1.5, nearcore 2.6.2) does not enable
#     the bulk-memory wasm proposal, while the current Rust toolchain emits
#     `memory.copy`/`memory.fill` by default. The instructions are lowered to
#     loops after the build (see scripts/lower-wasm-bulk-memory.mjs).
#   * nearcore 2.6.2 also predates the global-contract and gas-key host
#     functions that near-sdk 5.29.1 imports unconditionally, so the sandbox
#     rejects the module at instantiation. This script builds the same source
#     against near-sdk 5.16.0 (near-sys 0.2.4), the newest near-sdk whose
#     imports all exist in nearcore 2.6.2 (verified against
#     runtime/near-vm-runner/src/imports.rs at tag 2.6.2).
#
# The deployed testnet contract keeps the repository pin (near-sdk 5.29.1).
# The integration build exercises the same contract logic; the wasm is not
# byte-identical to the deployed artifact. See docs/INVARIANTS.md.
#
# The manifest and lock file are restored on exit, so the working tree is
# unchanged after a successful run.
set -euo pipefail
cd "$(dirname "$0")/.."

MANIFEST=contracts/fleet-controller/Cargo.toml
LOCK=Cargo.lock
BACKUP_MANIFEST=$(mktemp)
BACKUP_LOCK=$(mktemp)
cp "$MANIFEST" "$BACKUP_MANIFEST"
cp "$LOCK" "$BACKUP_LOCK"
restore() {
  cp "$BACKUP_MANIFEST" "$MANIFEST"
  cp "$BACKUP_LOCK" "$LOCK"
  rm -f "$BACKUP_MANIFEST" "$BACKUP_LOCK"
}
trap restore EXIT

python3 - "$MANIFEST" <<'PY'
import sys

path = sys.argv[1]
text = open(path).read()
text = text.replace('near-sdk = "=5.29.1"', 'near-sdk = "=5.16.0"')
text = text.replace('"=5.29.1"', '"=5.16.0"')
text = text.replace('near-sdk-env = "=0.1.6"\n', "")
open(path, "w").write(text)
PY

if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

# near-sys 0.2.4 declares the host functions in a plain `extern "C"` block
# without the wasm import-module attribute (added in near-sys 0.2.9+). Current
# rustc no longer passes --allow-undefined for wasm32-unknown-unknown, so the
# link step needs it explicitly to turn those declarations into "env" imports.
export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=--allow-undefined"

cargo update -p near-sdk --precise 5.16.0 --quiet
cargo update -p near-sys --precise 0.2.4 --quiet
cargo build -p fleet-controller --target wasm32-unknown-unknown --release

node scripts/lower-wasm-bulk-memory.mjs \
  target/wasm32-unknown-unknown/release/fleet_controller.wasm \
  target/wasm32-unknown-unknown/release/fleet_controller.sandbox.wasm
