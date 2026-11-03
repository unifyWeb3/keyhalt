#!/usr/bin/env bash
# Secret scan for the FLEET repository.
#
# Usage: ./scripts/secret-scan.sh [--staged]
#
# Scans the working tree for common private-key material, credential files, and
# large base58 secrets. With --staged, also scans the staged diff. It also
# verifies that the known NEAR key directories outside the tree are mode 700
# (directories) and 600 (files) when present.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-working}"
fail() {
  echo "SECRET SCAN: FAIL: $*" >&2
  exit 1
}

# 1. Known credential-file names must not exist in the repository tree.
BAD_FILES="$(
  find . \
    -path ./.git -prune -o \
    -path ./node_modules -prune -o \
    -path '*/target' -prune -o \
    -path '*/dist' -prune -o \
    -type f \( \
      -name '*.pem' -o -name '*.key' -o -name '*.seed' -o \
      -name '.env' -o -name '.env.*' -o \
      -name 'credentials.json' -o -name 'accounts.json' -o \
      -name '*.mnemonic' \
    \) -print
)"
if [ -n "$BAD_FILES" ]; then
  fail "credential-like file(s) in tree: $BAD_FILES"
fi

# 2. Private-key content patterns. Public keys are ~44 base58 chars; 80+ is a
#    private-key-sized value, so this does not flag normal public keys.
PATTERNS='-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"[[:space:]]*:|"secret_key"[[:space:]]*:|"seed_phrase"[[:space:]]*:|ed25519:[1-9A-HJ-NP-Za-km-z]{80,}'

if grep -RInE \
  --binary-files=without-match \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=target \
  --exclude-dir=dist \
  -e "$PATTERNS" . >/tmp/fleet-secret-scan.$$ 2>/dev/null; then
  cat /tmp/fleet-secret-scan.$$ >&2
  rm -f /tmp/fleet-secret-scan.$$
  fail "private-key pattern found in the working tree"
fi
rm -f /tmp/fleet-secret-scan.$$

# 3. Staged diff scan, for the pre-commit hook.
if [ "$MODE" = "--staged" ]; then
  if git diff --cached --unified=0 -- . ':(exclude)package-lock.json' \
    | grep -E -e '^\+.*('"$PATTERNS"')' >/tmp/fleet-secret-staged.$$ 2>/dev/null; then
    cat /tmp/fleet-secret-staged.$$ >&2
    rm -f /tmp/fleet-secret-staged.$$
    fail "private-key pattern found in the staged diff"
  fi
  rm -f /tmp/fleet-secret-staged.$$
fi

# 4. Key directories outside the tree must be 700/600. These are host paths, not
#    repository content; the scan is skipped if they are absent.
for dir in /root/.near-fallback-keys /root/.near-credentials; do
  if [ -d "$dir" ]; then
    DIR_MODE="$(stat -c '%a' "$dir")"
    [ "$DIR_MODE" = "700" ] || fail "$dir has mode $DIR_MODE, expected 700"
    BAD_MODES="$(find "$dir" -type f ! -perm 600 -print)"
    if [ -n "$BAD_MODES" ]; then
      fail "key file(s) outside 600: $BAD_MODES"
    fi
  fi
done

# 5. No world-writable files in the repository.
WW="$(find . -path ./.git -prune -o -type f -perm -002 -print)"
if [ -n "$WW" ]; then
  fail "world-writable file(s): $WW"
fi

echo "SECRET SCAN: OK (no credential file or private-key pattern found)"
