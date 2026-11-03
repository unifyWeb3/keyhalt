# CLAIMS

**Status:** Phase 1 — **empty**. No product capability is claimed yet.

Every claim in the README, UI, demo, or submission must have one row here and
must map to a test that was actually run or to a public testnet transaction
hash. A claim without evidence is removed, not softened.

## Table

| ID | Claim | Status | Evidence (test path or tx hash) | Last verified (UTC) |
| --- | --- | --- | --- | --- |
| — | *(no claims recorded)* | — | — | — |

## Required format

```text
| F-001 | One-sentence claim, no adjectives that are not tested. | VERIFIED | `test path` or `tx hash` + block height | YYYY-MM-DD |
```

Allowed statuses:

- `VERIFIED` — ran it, with a saved command and real output, or a public testnet
  transaction hash + block height that a read-only script re-checks.
- `INFERRED` — reasoned from a verified observation; not used in the demo as a
  headline.
- `HYPOTHESIS` — planned or expected; not shown as working.
- `UNKNOWN` — not tested; shown as untested if mentioned at all.

## Rules

1. A row with `VERIFIED` must contain a non-empty evidence field that points to a
   file in `evidence/` or a public testnet tx hash.
2. A row with `HYPOTHESIS` or `UNKNOWN` must say so in the claim text; it cannot
   be presented as a demo step.
3. The screener test (`scripts/check-claims.mjs`) fails on a malformed row, a
   missing evidence field for `VERIFIED`, or a duplicate ID.
4. The claim table is append-only per release candidate; corrections keep the old
   row and add a dated note rather than rewriting history.
5. Prohibited wording: “non-custodial” without the Mode A qualifier,
   “production-ready”, “audited”, “mainnet-ready”, “trustless”, “20 parallel
   calls”, “16 parallel calls”, “top-up works”, “two-step rotation works”,
   “freeze cancels in-flight receipts”.
