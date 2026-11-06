#!/usr/bin/env bash
#
# Clean-session fresh-clone test.
#
# This is the test a clean agent session must pass: a session that starts
# with no FLEET_* or NEAR_* environment variables, no credentials in the
# environment, and no access to the private key store, must be able to clone
# the repository, run one setup command, run one verification command, and
# confirm that the safety rails still refuse a malformed claim, a mainnet
# RPC, and a mainnet SDK client.
#
# The clone lands outside the repository, in a temporary directory, and every
# command runs with a sanitized environment (`env -i`), so the test fails if
# any step secretly depends on an inherited secret or on a network key.
#
# No key is read, created, or sent. The test never touches testnet.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fleet-clean-session.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

if ! git -C "$ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "CLEAN SESSION: FAIL: repository has no commit; commit the baseline first" >&2
  exit 1
fi

# A sanitized environment: no FLEET_*, NEAR_*, or credential variables, and no
# inherited dotfile configuration.
#
# HOME points at an empty directory, so no ~/.netrc, ~/.npmrc, ~/.ssh or shell
# profile can smuggle a credential into the run. The Rust toolchain is not a
# secret: CARGO_HOME and RUSTUP_HOME are set explicitly so that the pinned
# rustc 1.93.0 toolchain (the one that reproduces the deployed wasm bytes) and
# the crate cache are found without inheriting the operator's HOME.
#
# The private key store under /root/.near-fallback-keys is never referenced by
# this script and is not on any code path that setup.sh or verify.sh takes.
CLEAN_HOME="$TMP/home"
mkdir -p "$CLEAN_HOME"
CARGO_HOME_DIR="${CARGO_HOME:-/root/.cargo}"
RUSTUP_HOME_DIR="${RUSTUP_HOME:-/root/.rustup}"
clean() {
  env -i \
    HOME="$CLEAN_HOME" \
    CARGO_HOME="$CARGO_HOME_DIR" \
    RUSTUP_HOME="$RUSTUP_HOME_DIR" \
    PATH="$CARGO_HOME_DIR/bin:/usr/local/bin:/usr/bin:/bin" \
    TMPDIR="$TMP" \
    LANG=C \
    "$@"
}

echo "== Clone into $TMP/fleet (outside the repository) =="
git clone --quiet --no-hardlinks "$ROOT" "$TMP/fleet"
cd "$TMP/fleet"

echo "== The clone starts clean =="
if [ -n "$(git status --porcelain)" ]; then
  echo "CLEAN SESSION: FAIL: the clone is not clean" >&2
  git status --porcelain >&2
  exit 1
fi

echo "== The session inherits no FLEET_*, NEAR_* or credential variable =="
if clean env | grep -E '^(FLEET_|NEAR_|AWS_|GITHUB_|GH_|GITLAB_|npm_)' ; then
  echo "CLEAN SESSION: FAIL: a credential-like variable is set" >&2
  exit 1
fi
echo "OK: no credential-like variable is set"

echo "== No inherited secret is needed: make setup =="
clean make setup

echo "== No inherited secret is needed: make verify =="
VERIFY_LOG="$TMP/verify.log"
clean make verify 2>&1 | tee "$VERIFY_LOG"

echo "== The clean clone reproduces the deployed wasm bytes =="
CANONICAL_SHA="cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f"
if ! grep -q "$CANONICAL_SHA" "$VERIFY_LOG"; then
  echo "CLEAN SESSION: FAIL: the clean clone did not reproduce the deployed wasm" >&2
  grep -E 'fleet_controller\.wasm' "$VERIFY_LOG" >&2 || true
  exit 1
fi
echo "OK: wasm sha256 $CANONICAL_SHA"

echo "== Negative control: a malformed VERIFIED row must be rejected =="
cp CLAIMS.md CLAIMS.md.bak
printf '| F-999 | Malformed row with no evidence | VERIFIED | — | 2026-11-03 |\n' >> CLAIMS.md
if clean node scripts/check-claims.mjs >/dev/null 2>&1; then
  echo "CLEAN SESSION: FAIL: the claims checker accepted a VERIFIED row without evidence" >&2
  exit 1
fi
mv CLAIMS.md.bak CLAIMS.md
echo "OK: malformed claim rejected"

echo "== Negative control: a mainnet RPC must be refused =="
if clean env NEAR_RPC_URL=https://rpc.mainnet.near.org node scripts/rpc-check.mjs >/dev/null 2>&1; then
  echo "CLEAN SESSION: FAIL: a mainnet RPC was accepted" >&2
  exit 1
fi
echo "OK: mainnet RPC refused"

echo "== Negative control: the SDK must refuse a mainnet client =="
if clean node -e '
  import("./packages/sdk/dist/index.js").then(({ createFleetClient }) => {
    createFleetClient({
      rpcUrl: "https://rpc.mainnet.near.org",
      accountId: "agent.testnet",
    });
    process.exit(0);
  }).catch((error) => {
    if (error.code === "FLEET_E_MAINNET") process.exit(1);
    process.exit(0);
  });
' >/dev/null 2>&1; then
  echo "CLEAN SESSION: FAIL: the SDK accepted a mainnet RPC" >&2
  exit 1
fi
echo "OK: mainnet client refused"

echo "== The tree is still clean after the checks =="
if [ -n "$(git status --porcelain)" ]; then
  echo "CLEAN SESSION: FAIL: the checks left the tree dirty" >&2
  git status --porcelain >&2
  exit 1
fi

echo "== No credential-like file in the clone =="
if find . -path ./.git -prune -o -type f \( -name '*.pem' -o -name '*.key' -o -name '.env' -o -name 'credentials.json' \) -print | grep -q .; then
  echo "CLEAN SESSION: FAIL: credential-like file in the clone" >&2
  exit 1
fi

echo
echo "FLEET clean-session fresh-clone test: PASS"
