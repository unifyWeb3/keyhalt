# FLEET console draft (v0.3, amended)

**Status: DRAFT for human review — not approved, not built.** No pixel UI has
been generated from this draft yet. Human approval is required first.
**Date:** 2026-11-04 UTC (amended after the 2026-11-04 design review).
**Design basis:** `docs/DESIGN_SYSTEM.md` (Inter + JetBrains Mono, sentence case,
three screens, fleet first).
**Data basis:** SDK reads (`getInventory`, `getAuditAll`, `verifyAuditOnChain`),
canonical Mode A `evidence/testnet-v03/run.json`, Mode B `evidence/modeb-v03/run.json`.
Mock times are used only where the evidence carries block heights; where a wall
time exists it is a measured run value, never a label.

---

## Screen 1 — Fleet

```text
FLEET                              testnet · block 276151157 (ticking)

  name                                      state    full-access  last event
  agent-1b.fleet-…testnet                   Active   0            unfreeze ·
                                                  block 276090540 · ok
  agent-2.fleet-…testnet                    Active   0            operator execute ·
                                                  block 276090372 · pong
  agent-3.fleet-…testnet                    Active   0            operator execute ·
                                                  block 276090373 · pong

Verified 37/37 → CLAIMS.md
```

Selecting a name opens the agent screen. The header block number ticks as
blocks arrive; a Frozen state appears in the block it lands. Rows show the
last event only; detail lives on the agent and timeline screens. A `✓` on any
fact links to its transaction.

---

## Screen 2 — Agent

```text
← Fleet                      agent-b1.fleet-modeb-748d4372.testnet

  Operator keys                                    scope     active
  ed25519:CyKE…n                                   ops-a     yes
  ed25519:83Jq…dZ                                  ops-a     yes
  ed25519:9jDn…oX                                  ops-b     yes
  ed25519:799W…ZSw                                 ops-b     yes

  Admin
  2 of 2 · 2 owners · demo: same operator

  Audit tail        [ Export verified export ]
  seq 2 · unfreeze · block 276110650 · ✓ verified
  seq 1 · freeze   · block 276110498 · ✓ verified

  [ Freeze ]   opens the command sheet:

    fleet freeze agent-b1.fleet-modeb-748d4372.testnet \
      --signer-key-file <key-file>                       [ Copy ]
```

Mode B appears only as that admin row of data. No request button exists. The
export is enabled only after the chain verifies; a tampered file shows
"History was altered at entry N" and stays blocked. A Frozen agent offers
Unfreeze instead.

---

## Screen 3 — Timeline

```text
Timeline

  block       event                     result        tx
  276110253   freeze (direct call)      refused       6pYC2CBP… ✓
              "active admin required"
  276110304   add request               refused       B1ZBWv9u… ✓
  276110352   freeze · request 0        0 of 2 · ok   dEjn26Nb… ✓
  276110400   freeze · confirm 1        1 of 2 · ok   E9GSJFVX… ✓
  276110498   freeze · confirm 2        2 of 2 · ok   3GY9rkAW… ✓
  276110538   execute                   refused       An7vQH16… ✓
              "controller is frozen"
  276110566   unfreeze · request 1      0 of 2 · ok   BM5Xcw17… ✓
  276110600   unfreeze · confirm 1      1 of 2 · ok   EUHXnabo… ✓
  276110650   unfreeze · confirm 2      2 of 2 · ok   GFvHeSRb… ✓
  276110695   execute                   pong ✓        GR69FWJU… ✓

                      Verified 37/37 → CLAIMS.md
```

Block heights are the Mode B run (`evidence/modeb-v03/RUN.md`). Full hashes
are the links; the short forms above are layout shorthand. Widths are
measured to the real hashes, not truncated text: 44-character base58 in
JetBrains Mono. Refusals are rows, not absences. The duplicate-confirm and
positive-control rows follow in the same table at their real blocks.

---

## What this draft intentionally omits

- Wallet connect, sign buttons, write forms, and any key entry.
- Charts, price feeds, fleet graph, search across accounts.
- A hosted demo URL or public link. `web/` stays a static placeholder with
  `noindex` until the human approves deployment.

## Review checklist for the human

- [ ] Amended tokens, Inter + JetBrains Mono, sentence case acceptable?
- [ ] Three screens (Fleet, Agent, Timeline) cover the reviewer's questions?
- [ ] "2 of 2 · 2 owners · demo: same operator" works as the Mode B row?
- [ ] Command sheet is the only action surface, and it never signs?
- [ ] Proceed to pixel draft, or amend first?
