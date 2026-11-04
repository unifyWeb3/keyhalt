# Pixel draft review (v0.3, DRAFT — awaiting approval)

**Status: DRAFT. No Figma file was provided, so no Figma work was done. No
recording was made.** This companion collects the pixel draft for the human's
approval. Nothing here ships as `web/` code; `design/index.html` is a static
prototype served separately.
**Date:** 2026-11-04 UTC.

Backend stands as recorded in `research/BUILD_STATUS.md` §12 — 35/35 Rust,
21/21 TypeScript, mutation 8/8, Mode A 63 checks and Mode B 52 checks
deployed, 28/28 claims. UI work does not displace the latency measurement;
no latency number from this draft is a claim (see "Known gaps").

---

## What was delivered

| File | What |
| --- | --- |
| `../docs/DESIGN_SYSTEM.md` | Amended system (Inter + JetBrains Mono, three screens, fleet first) |
| `../docs/CONSOLE_DRAFT.md` | Amended five→three-screen draft; Mode B folded into the admin row |
| `DEVIATIONS.md` | D-01: actions without keys (command sheet, no signing) |
| `index.html` | Pixel draft, one file, no live calls |
| `fonts/` | Self-hosted Inter + JetBrains Mono with OFL 1.1 texts |
| `screenshots/*.png` | 1920×1080 captures from the draft |

## Screens (screenshots)

### Fleet (`#`)

![Fleet](screenshots/fleet.png)

Three Mode A agents (`evidence/testnet-v03/run.json`): state, full-access key
count (0 everywhere), and last event with its block and verified tx link. Last
events are honest: agent-1b's final unfreeze (block 276090540), the 12-way
concurrent operator executes for the other two (blocks 276090372–73). The
header chip shows network and the latest block from the verify log
(`276149637`); the ticking script advances it every 1.2 seconds.

### Agent (`#agent=…`)

![Agent](screenshots/agent.png)

One agent at a time. Shown: `agent-b1.fleet-modeb-748d4372.testnet`
(`evidence/modeb-v03/run.json`) — four operator keys (`native_keys`), the
admin row `2 of 2 · 2 owners · demo: same operator`, and the 3-entry audit
tail, all verified.

![Agent with command sheet](screenshots/agent-sheet.png)

The only action surface: Freeze opens the sheet with the exact CLI command
and Copy. The console still signs nothing.

### Timeline (`#timeline`)

![Timeline](screenshots/timeline.png)

Mode A lifecycle rows (`evidence/testnet-v03/run.json` lifecycle): freeze,
frozen refusal (`controller is frozen`), unfreeze, `pong` positive control,
wrong-method and wrong-receiver refusals, and the final freeze/unfreeze. Every
row links its full hash to NearBlocks.

## Decisions to be challenged

1. **Command sheet instead of wallet-signed writes.** Freeze/Unfreeze open a
   copyable CLI command; the page never signs. This keeps the browser out of
   key handling entirely, at the cost of UX friction (copy, switch terminal,
   run). Challenge: is the friction acceptable for the "make the demo live"
   goal, or should a later gate add wallet signing behind its own design and
   threat review (DEVIATIONS.md D-01)?
2. **Static prototype vs. live RPC.** The draft renders captured `evidence/`
   data and a ticking block counter, with no RPC calls. It shows exactly what
   the demo will show, but the ticker is a counter, not a subscription, and
   screenshots pin one block height. Challenge: should the next step wire the
   header to a real block subscription first, or keep the mock for the
   split-screen demo and wire calls only after approval?
3. **Mode B trimmed to one admin row.** The draft folds the entire Mode B
   story into `2 of 2 · 2 owners · demo: same operator` and drops the Mode B
   timeline (confirmations, duplicate-confirm refusal) from the pixel draft.
   Challenge: is that the right trim, or does the reviewer need the
   confirmation rows visible to understand the 2-of-2 mechanism?

## Known gaps (not solved by this draft)

- **Latency.** The review asks for a 20-run optimistic-inclusion remeasure
  with p50/p95 and claims first. The recorded 20,884 ms / 27,064 ms cover
  three transactions, finality, and polling; no draft metric repeats them as
  "seconds," and no new number is claimed until `CLAIMS.md` carries it. The
  backend run is still pending.
- **Frozen fleet row.** The fleet screenshot shows three `Active` rows because
  the captured final states are all `Active`. A `Frozen` row will appear in
  live use the block it lands; there is no frozen-state screenshot today.
- **Mainnet guard and tamper banner** are specified (plain language) but are
  not rendered in the draft; they need a captured failing state before anyone
  screenshots them.
- **unslop skill.** No skill named `unslop` is installed on this host, so no
  unslop pass was applied; language was kept plain manually.
- **Figma.** None. No file link was provided; nothing was generated.

## Approve or amend?

Reply with approve, or the amendments you want. Until then: no further UI
work, no recording, no Figma.
