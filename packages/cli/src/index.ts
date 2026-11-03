#!/usr/bin/env node
/**
 * FLEET CLI — Phase 1 scaffold.
 *
 * Only `--version` and `--help` work. Every product command exits 2 with a
 * clear message. No key is read, written, or printed.
 */

const VERSION = "0.0.0-phase1";

const HELP = `fleet ${VERSION}

FLEET is a native NEAR account-fleet key-lifecycle control plane.
Phase 1 scaffold: product commands are not implemented.

Usage:
  fleet --version
  fleet --help

Planned commands (not implemented in Phase 1):
  fleet inventory <account>
  fleet audit export <account> --out <file>
  fleet verify-audit <file>
  fleet freeze <account>
  fleet unfreeze <account>
  fleet grant <account> --key <public-key> --tag <tag>
  fleet rotate <account> --old <public-key> --new <public-key> --tag <tag>
  fleet revoke <account> --key <public-key>
  fleet revoke-tag <account> --tag <tag>
  fleet recover <account> --new-admin <public-key>

No command reads a private key from a file or environment variable in Phase 1.
See docs/INTERFACES.md and docs/PLAN.md.
`;

const args = process.argv.slice(2);
const first = args[0];

if (first === "--version" || first === "version") {
  process.stdout.write(`fleet ${VERSION}\n`);
  process.exit(0);
}

if (first === undefined || first === "--help" || first === "help" || first === "-h") {
  process.stdout.write(HELP);
  process.exit(0);
}

process.stderr.write(
  `fleet: command not implemented in Phase 1: ${first}\nRun "fleet --help" for the planned command list.\n`,
);
process.exit(2);
