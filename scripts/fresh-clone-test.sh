#!/usr/bin/env bash
# Fresh-clone reproducibility test.
#
# This is the test a clean agent session must pass: clone the repository, run
# one setup command, run one verification command, and confirm that the claims
# checker rejects a malformed VERIFIED row. No key is read or created.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/keyhalt-fresh-clone.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

if ! git -C "$ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "FRESH CLONE: FAIL: repository has no commit; commit the baseline first" >&2
  exit 1
fi

echo "== Fresh clone into $TMP/keyhalt =="
git clone --quiet --no-hardlinks "$ROOT" "$TMP/keyhalt"
cd "$TMP/keyhalt"

echo "== make setup =="
make setup

echo "== make verify =="
make verify

echo "== Console starts read-only in the fresh clone =="
node scripts/console-smoke.mjs

echo "== Negative control: malformed VERIFIED row must be rejected =="
cp CLAIMS.md CLAIMS.md.bak
printf '| F-999 | Malformed row with no evidence | VERIFIED |: | 2026-11-03 |\n' >> CLAIMS.md
if node scripts/check-claims.mjs >/dev/null 2>&1; then
  echo "FRESH CLONE: FAIL: claims checker accepted a VERIFIED row without evidence" >&2
  exit 1
fi
mv CLAIMS.md.bak CLAIMS.md
echo "OK: malformed claim rejected"

echo "== Style gate (fresh clone) =="
node scripts/style-check.mjs

echo "== Negative control: mainnet RPC must be refused =="
if NEAR_RPC_URL=https://rpc.mainnet.near.org node scripts/rpc-check.mjs >/dev/null 2>&1; then
  echo "FRESH CLONE: FAIL: mainnet RPC was accepted" >&2
  exit 1
fi
echo "OK: mainnet RPC refused"

echo "== Repository hygiene =="
if find . -path ./.git -prune -o -type f \( -name '*.pem' -o -name '*.key' -o -name '.env' -o -name 'credentials.json' \) -print | grep -q .; then
  echo "FRESH CLONE: FAIL: credential-like file in clone" >&2
  exit 1
fi
if [ ! -x scripts/secret-scan.sh ] || [ ! -x scripts/fresh-clone-test.sh ]; then
  echo "FRESH CLONE: FAIL: scripts lost their executable bit" >&2
  exit 1
fi

echo
echo "Keyhalt fresh-clone test: PASS"
