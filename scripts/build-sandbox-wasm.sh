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
# The deployed testnet contract keeps the repository pin (near-sdk 5.29.1) and
# the repository source byte-for-byte: the release artifact deployed on
# testnet is 248644 bytes with sha256
# cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f, and
# `cargo build --locked` reproduces it. The sandbox build therefore never
# edits the contract source in the repository; it applies the three
# near-sdk-5.16 compatibility edits below to a temporary copy and restores
# every file afterwards.
#
# Sandbox-only source edits (all semantically neutral):
#   1. `near-sdk = "=5.29.1"` -> `=5.16.0` in the crate manifest.
#   2. `Promise::detach()` does not exist in near-sdk 5.16.0. The promise is
#      dropped instead, which is what `detach()` does in near-sdk 5.29.1 (it
#      is an empty function; the `Drop` impl schedules the promise).
#   3. `PublicKey` does not implement `Display` in near-sdk 5.16.0. The
#      signer key is built with `String::from(&public_key)`, which calls the
#      same `to_string()` in near-sdk 5.29.1
#      (`impl From<&PublicKey> for String` delegates to `to_string()`).
#
# The manifest, the lock file and the contract source are restored on exit, so
# the working tree is unchanged after a successful run.
set -euo pipefail
cd "$(dirname "$0")/.."

MANIFEST=contracts/fleet-controller/Cargo.toml
LOCK=Cargo.lock
SOURCE=contracts/fleet-controller/src/lib.rs
BACKUP_MANIFEST=$(mktemp)
BACKUP_LOCK=$(mktemp)
BACKUP_SOURCE=$(mktemp)
cp "$MANIFEST" "$BACKUP_MANIFEST"
cp "$LOCK" "$BACKUP_LOCK"
cp "$SOURCE" "$BACKUP_SOURCE"
restore() {
  cp "$BACKUP_MANIFEST" "$MANIFEST"
  cp "$BACKUP_LOCK" "$LOCK"
  cp "$BACKUP_SOURCE" "$SOURCE"
  rm -f "$BACKUP_MANIFEST" "$BACKUP_LOCK" "$BACKUP_SOURCE"
}
trap restore EXIT

python3 - "$MANIFEST" "$SOURCE" <<'PY'
import sys

manifest, source = sys.argv[1], sys.argv[2]

text = open(manifest).read()
text = text.replace('near-sdk = "=5.29.1"', 'near-sdk = "=5.16.0"')
text = text.replace('"=5.29.1"', '"=5.16.0"')
text = text.replace('near-sdk-env = "=0.1.6"\n', "")
open(manifest, "w").write(text)

code = open(source).read()
assert code.count(".detach()") == 6, code.count(".detach()")
code = code.replace(".detach()", "")
assert code.count("env::signer_account_pk().to_string()") == 1
code = code.replace(
    "env::signer_account_pk().to_string()",
    "String::from(&env::signer_account_pk())",
)
open(source, "w").write(code)
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
