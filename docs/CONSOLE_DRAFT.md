# FLEET console draft (v0.3)

**Status: DRAFT for human review — not approved, not built.** ASCII layout and
copy only. No pixel UI, no Figma file, no code, no recording. Human approval is
required before any UI is generated.
**Date:** 2026-11-04 UTC.
**Design basis:** `docs/DESIGN_SYSTEM.md` (tokens, panels, error states).
**Data basis:** SDK reads (`getInventory`, `getAuditAll`, `verifyAuditOnChain`),
canonical Mode A `evidence/testnet-v03/run.json`, Mode B `evidence/modeb-v03/run.json`.

---

## Screen 1 — Inventory + header (default view)

Purpose: answer "what is on this account?" in the first viewport.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ FLEET   [testnet] [rpc.testnet.near.org · h 276151157 ✓] [28/28 ✓] [RO]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ACCOUNT   agent-b1.fleet-modeb-748d4372.testnet        [Mode B]           │
│ STATE     [ PAUSED ]   provisioned: true    provision_error: —            │
│ GATE      receiver: ping.controller · method: ping                      │
├──────────────────────────────┬───────────────────────────────────────────┤
│ ADMIN                                                       [copy]      │
│ admin_account               fleet-modeb-748d4372.testnet                │
│ admin_pk / recovery_pk      — (none)                                      │
│ pending                     —                                             │
│                                                              F-021 ✓      │
├──────────────────────────────┴───────────────────────────────────────────┤
│ OPERATORS (4)                                native FullAccess keys: 0     │
│ public key (short)                 tag     active    permission  allow.  │
│ ed25519:CyKE…n                 ops-a      ✓         FunctionCall  —     │
│ ed25519:83Jq…dZ                ops-a      ✓         FunctionCall  —     │
│ ed25519:9jDn…oX                ops-b      ✓         FunctionCall  —     │
│ ed25519:799W…ZSw               ops-b      ✓         FunctionCall  —     │
│                                                              F-001 ✓ F-009 ✓ │
├────────────────────────────────────────────────────────────────────────────┤
│ AUDIT HEAD  seq 2 · 82d6e41d…b8796d39b · h 276110650 · verify [VERIFIED] │
└────────────────────────────────────────────────────────────────────────────┘
```

Sample data shown: the Mode B agent (`agent-b1.fleet-modeb-748d4372.testnet`).
Header chips are pinned on every screen. `RO` means read-only; there is no
control that clears it. A mainnet RPC replaces panels with the
`FLEET_E_MAINNET` banner and dims everything else.

Required states on this screen: paused/unpaused, Mode A admin key vs Mode B
`admin_account`, `provision_error` non-null, `FullAccess > 0` danger treatment.
Empty account input shows the testnet guard, not an empty panel.

---

## Screen 2 — Audit & integrity

Purpose: answer "is the history intact, and can I take it with me?"

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ AUDIT & INTEGRITY                                    #audit  [ refresh ]  │
├────────────────────────────────────────────────────────────────────────────┤
│ chain status   [ VERIFIED — 3 entries ]   on-chain verify_audit: true     │
│ independent JS recompute: true            head 82d6e41d…b8796d39b         │
│ formula: SHA256(prev|seq|action|actor|signer|subject|height|time)         │
│ seq  action   actor                          signer        subject  block  │
│ 0    init     fleet-modeb-748d4372.testnet   ed25519:…    agent-b1  27610… │
│ 1    freeze   fleet-modeb-748d4372.testnet   ed25519:…    agent-b1  27611… │
│ 2    unfreeze fleet-modeb-748d4372.testnet   ed25519:…    agent-b1  27611… │
│                                                                            │
│ [ download fleet-audit-v1 export ]   (enabled only after VERIFIED)        │
│ tampered export ⇒ FLEET_E_AUDIT · entry_hash mismatch at seq N (exit 6)   │
└────────────────────────────────────────────────────────────────────────────┘
```

Behavior: the download button is disabled until both on-chain and JS
verification pass. A failed chain names the exact seq and mismatch; there is
no generic "error" state. Timestamps render as decimal strings; block heights
as integers.

---

## Screen 3 — Lifecycle timeline (Mode B run)

Purpose: show the 2-of-2 mechanism happening, including refusals.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ LIFECYCLE TIMELINE                                    #timeline             │
├────────────────────────────────────────────────────────────────────────────┤
│ block           step                        tx hash (short)   result    │
│ 276110253       member calls freeze direct  6pYC2CBP…         REFUSED   │
│                   "active admin required"                     F-024 ✓     │
│ 276110304       non-member add_request       B1ZBWv9u…         REFUSED   │
│ 276110352       freeze add_request req 0     dEjn26Nb…         ok · 0/2  │
│ 276110400       freeze confirm #1            E9GSJFVX…         ok · 1/2  │
│ 276110498       freeze confirm #2            3GY9rkAW…         ok · 2/2  │
│                   → agent PAUSED in 20,884 ms (finality+polling)   F-023 ✓ │
│ 276110538       operator execute             An7vQH16…         REFUSED   │
│                   "controller is frozen"                        F-023 ✓     │
│ 276110566–650   unfreeze req 1 → confirm → confirm … 27,064 ms  F-023 ✓  │
│ 276110695       operator execute             GR69FWJU…         pong ✓    │
│                                                                            │
│ wall times are submit → observed state, not execution-only latency.        │
└────────────────────────────────────────────────────────────────────────────┘
```

Each row links its full hash to NearBlocks. Confirmations 1 and 2 are distinct
rows; the one-confirmation no-op is labeled `· 1/2`, never silently merged.
The Mode A equivalent timeline (freeze → refusal → unfreeze → rotation →
tamper rejection) is the 90-second demo flow in `docs/DEMO_SCRIPT.md`.

---

## Screen 4 — Mode B administration

Purpose: show the multisig honestly, with its limits in the same view.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ MODE B — 2-of-2 ADMINISTRATION                          #mode-b           │
├────────────────────────────────────────────────────────────────────────────┤
│ parent / multisig    fleet-modeb-748d4372.testnet      contract ✓        │
│ code hash            G3GUfe8ZJ2RLe2XphKiKA7YXB4iyjBjUK8knd6T8X1jC         │
│ members (account)    fleet-v03-5cff9e99.testnet      confirmed ✓         │
│                      fleet-v03-fund2-8b91351d.testnet  confirmed ✓         │
│ threshold            2 of 2          parent access keys: 0                 │
│                                                                    F-022 ✓ │
│ open requests       none                          [ previous: req 1 ✓ ] │
│                                                                            │
│ scope: mechanism verified on testnet; both owners were operated by the     │
│ same test harness, so this page claims nothing about independent custody.  │
│ multisig is third-party and unaudited (see docs/PROVENANCE.md §6).        │
└────────────────────────────────────────────────────────────────────────────┘
```

The scope caption is part of the screen, not a footnote. No "request freeze"
button exists: SDK/CLI v0.3 do not submit multisig requests, and the console is
read-only regardless.

---

## Screen 5 — Evidence & claims

Purpose: let a reviewer click from any statement to its proof.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE & CLAIMS                                       #claims           │
│ filter: [ all ] [ Mode A ] [ Mode B ] [ shared ]                          │
├────────────────────────────────────────────────────────────────────────────┤
│ id    claim (short)                       status   evidence        date   │
│ F-001 inventory, 0 FullAccess             VERIFIED run.json        11-03  │
│ F-003 freeze blocks execute               VERIFIED 3kkxz3t…      11-03  │
│ F-013 35 Rust tests                       VERIFIED local-tests.txt 11-03  │
│ F-021 Mode B provisioning                 VERIFIED run.json        11-03  │
│ F-023 2-of-2 freeze / unfreeze            VERIFIED 3GY9rkA… et al  11-03  │
│ F-025 multisig repro build                VERIFIED repro *.md      11-03  │
│ …                                                                 F-028   │
│ total: 28 / 28 VERIFIED · checker: `node scripts/check-claims.mjs`         │
└────────────────────────────────────────────────────────────────────────────┘
```

This is the only screen that names `CLAIMS.md` row IDs. Screen 1–4 badges
(`F-001 ✓` etc.) point here. An evidence gap would render `NOT RUN` in amber;
there is no such row today.

---

## What this draft intentionally omits

- Wallet connect, sign buttons, write forms, and any key entry.
- Charts, price feeds, fleet graph, search across accounts.
- A hosted demo URL or public link. `web/` remains a static placeholder with
  `noindex` until the human approves deployment.

## Review checklist for the human

- [ ] Design system tokens and principles acceptable?
- [ ] Five screens cover the questions a reviewer will ask?
- [ ] Mode B scope caption wording acceptable?
- [ ] Any screen that implies a write, custody, or audit claim we cannot support?
- [ ] Proceed to pixel draft, or amend first?

Until this checklist is returned, there is no console code, no video, and no
public URL — only this draft and the CLI/SDK product.
