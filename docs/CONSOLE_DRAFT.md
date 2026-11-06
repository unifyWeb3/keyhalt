# FLEET console draft (v0.3, amended)

**Status: DRAFT for human review — not approved, not shipped.** The pixel draft
in `design/index.html` is a static prototype served separately, not `web/`
code. Human approval is required before any recording or public use.
**Date:** 2026-11-04 UTC (screen sketches reconciled with the pixel draft on
2026-11-07, after the human approved the `unslop` direction).
**Design basis:** `docs/DESIGN_SYSTEM.md` (Inter + JetBrains Mono, sentence
case, three screens, fleet first, chain spine and scope tag).
**Data basis:** SDK reads (`getInventory`, `getAuditAll`, `verifyAuditOnChain`),
canonical Mode A `evidence/testnet-v03/run.json`, Mode B
`evidence/modeb-v03/run.json`. Every number below is a recorded block height,
key, hash or count from those files. No mock data is invented.

---

## Screen 1 — Fleet

```text
[FLEET key mark]  Fleet  Timeline                    testnet · block 276454237

  Fleet                  3 agents · 12 operator keys · 0 full-access keys
  name                              state    full-access keys   last event
  agent-1b.fleet-…testnet           Active   0                  Unfreeze · block 276090540 · ok ✓
  4 operator keys · 2 ops-a · 2 ops-b
  agent-2.fleet-…testnet            Active   0                  Operator execute · block 276090372 · pong ✓
  4 operator keys · 2 ops-a · 2 ops-b
  agent-3.fleet-…testnet            Active   0                  Operator execute · block 276090373 · pong ✓
  4 operator keys · 2 ops-a · 2 ops-b

  Timeline →

  Verified 37/37 · Threat model     Pixel draft · captured testnet evidence · the block counter is a stand-in
```

The table fills the viewport width. Each row carries the account, its state,
the full-access key count, the last event, and the key material inside it
(operator count and scope tags). Selecting a name opens the agent screen. A
Frozen state appears in the block it lands. Rows show the last event only;
detail lives on the agent and timeline screens. A check on any fact links to
its transaction.

---

## Screen 2 — Agent

```text
← Fleet              agent-b1.fleet-modeb-748d4372.testnet   Mode B · 2-of-2 admin · 3 audit entries

  Operator keys
  key                                                   scope     active
  ed25519:kB5fcDtfZA6Au6xmd8U2coeBiRg4dHpShADXCAybB2L   [ops-a]   Yes
  ed25519:4mvncf9kmFT4imDDqAC6CRxXTTfTnK4QjSHem2iHiRrV  [ops-a]   Yes
  ed25519:DjNFGrMdsB5UWcGiqXcERshD7JyyrX1kQTes5mSzv3dL  [ops-b]   Yes
  ed25519:HxuTueeDDxxoW5X4f53PEDYD9iGzfEDsnMine7YqyTcZ  [ops-b]   Yes

  Admin
  2 of 2 confirmations · both owners operated by one operator in this demo

  Recent audit entries
  head 82d6e41d…d39b · prev-hash linked · verified on chain and in the SDK
  ● seq 2  unfreeze  · block 276110652
    82d6e41d73db…96d39b  ✓ verified
    prev 39b615220a16…93e57a
  ○ seq 1  freeze    · block 276110500
    39b615220a16…93e57a  ✓ verified
    prev 445c311a628d…8d2777
  ○ seq 0  init      · block 276109053
    445c311a628d…8d2777  ✓ verified
    prev 000000000000…000000

  [ Export audit chain ]  [ Freeze ]

    fleet freeze agent-b1.fleet-modeb-748d4372.testnet --signer-key-file <key-file> --json   [ Copy ]
```

The audit entries are drawn as a chain spine: each entry hangs from the hash
above it, and the head node carries the one accent. Mode B appears only as the
admin row of data. No request button exists. The export is enabled only after
the chain verifies; a tampered file shows "History was altered at entry N" and
stays blocked. A Frozen agent offers Unfreeze instead.

---

## Screen 3 — Timeline

```text
← Fleet                                   Timeline        8 events · 3 refused · 160 blocks

  block       event                   result                          tx
  276090380   [lock] freeze           ok                              7tqiVYBosLg… ✓
  276090389   execute while frozen    [lock] refused · controller is frozen   FnEEzuhSRT… ✓
  276090396   [open lock] unfreeze    ok                              5LuCwM3Nv3W… ✓
  276090405   operator execute        pong                            5piMKPcwkEo… ✓
  276090413   execute, wrong method   refused · method not allowed    283uKM9bcWh… ✓
  276090418   execute, wrong receiver refused · receiver not allowed  4pCwwpqDRWz… ✓
  276090533   [lock] freeze           ok                              C17ztrDHeru… ✓
  276090540   [open lock] unfreeze    ok                              4ho3w5H3MQq… ✓
```

Block heights are the Mode A lifecycle in `evidence/testnet-v03/run.json`. Full
hashes are the links; the short forms above are layout shorthand. Refusals are
rows, not absences. The closed lock marks a freeze, the open lock an unfreeze,
and the frozen refusal carries the closed lock in the danger colour.

The Mode B confirmation timeline (request, `0 of 2`, `1 of 2`, `2 of 2`,
duplicate-confirm refusal) is **not** in the pixel draft; it is deferred as
recorded in `design/REVIEW.md` (decision 3). The agent screen carries the
Mode B state instead.

---

## What this draft intentionally omits

- Wallet connect, sign buttons, write forms, and any key entry.
- Charts, price feeds, fleet graph, search across accounts.
- A hosted demo URL or public link. `web/` stays a static placeholder with
  `noindex` until the human approves deployment.
- The Mode B multi-confirmation timeline, per `design/REVIEW.md` decision 3.

## Review checklist for the human

- [ ] Amended tokens (ink ramp, one accent, 4 px grid) acceptable?
- [ ] Three screens (Fleet, Agent, Timeline) cover the reviewer's questions?
- [ ] "2 of 2 confirmations · both owners operated by one operator in this
      demo" works as the Mode B row?
- [ ] The chain spine and the lock marks read as the product, not decoration?
- [ ] Command sheet is the only action surface, and it never signs?
- [ ] Proceed to recording, or amend first?
