# FLEET console — 90-second demo shot list (v0.3)

**Status: rehearsed against the built console on 2026-11-07. It passes in
~30 s of chain time plus waits; a 90-second cut is comfortable.**
Recording, publication, or any public use still requires explicit human
approval. Recording identifiers (names, handles, URLs) must not be invented.

**Final rehearsal evidence:** `evidence/console-v03/demo-rehearsal.json`
(freeze `DzRWt8t1w…` @ 276610241, refusal `2ZEPJHPCJ…` @ 276610256,
unfreeze `Eby39vSha6…` @ 276610269). Screenshot states:
`evidence/console-v03/screenshots/` (1280×900 and 390×844).

## Hard setup (before any take)

```bash
make console          # terminal 1: http://127.0.0.1:4173 (Fleet screen)
```

- agent-1b must be **active** (the rehearsal freezes and unfreezes it).
- dRPC is the witness RPC by default (`FLEET_DEMO_RPC_URL`); FastNEAR and
  the archival endpoints share per-IP rate limits — a 429 means *no* read and
  *no* write happened, not a broken demo. The harness retries pre-broadcast
  RPC failures up to 3 times and the failed-step rescue path unfreezes.
- Browser at 1280×900 for the desktop take; a 390×844 pass exists as
  evidence (`evidence/console-v03/screenshots/`).
- Operator keys live outside the repository, mode 600.

## The 90-second run — two panes

Left pane: terminal. Right pane: `http://127.0.0.1:4173/#/fleet`.

| Time | Left: terminal | Right: console | Expected CLI output (real, from `demo-rehearsal.json`) |
| --- | --- | --- | --- |
| 0:00–0:05 | — | Fleet: 3 agents · 10 operator keys · 0 full-access keys. Header block ticking on each finalized block. Footer `Verified 37/37` | — |
| 0:05–0:15 | `node packages/cli/dist/index.js inventory agent-1b.fleet-v03-5cff9e99.testnet --json` | Click agent-1b: state @ pinned block, 2 operator keys (ops-b × 2), 4 FunctionCall keys · 0 full-access keys, admin + recovery keys shown, audit chain `verified on chain and in the SDK` | JSON with `"paused": false`, `auditLength: 25+` |
| 0:15–0:30 | `node scripts/console-demo.mjs --hold-frozen 20` (or freeze/unfreeze manually) | Within one or two finalized blocks the agent-1b row flips to **Frozen**; Agent chip reads Frozen, status line shows the freeze block | `{"ok": true, "command": "freeze", "txHash": "DzRWt8t…", "blockHeight": 276610241}` |
| 0:30–0:40 | (harness runs the refusal) | Recent events add the frozen freeze; nothing else moves | `{"ok": false, "error": {"code": "FLEET_E_REJECTED", "message": "controller is frozen", "txHash": "2ZEPJHPCJ…", "blockHeight": 276610256}}` |
| 0:40–0:55 | — | Timeline: the refusal row appears from the real receipt (`execute while frozen` · refused · block 276610256) | Timeline header: 5 refused, newest refusal at the pinned block |
| 0:55–1:05 | — | Agent screen → **Show freeze command** is now labelled unfreeze context: toggle the command sheet, copy button copies `unfreeze … --signer-key-file "$FLEET_ADMIN_KEY_FILE" --json` | Sheet shows the command; `Copied` status appears |
| 1:05–1:15 | `node packages/cli/dist/index.js unfreeze agent-1b.fleet-v03-5cff9e99.testnet --signer-key-file "$FLEET_ADMIN_KEY_FILE" --json` | Row flips back to **Active**; footer snapshot block advances; audit head now includes the unfreeze entry | `{"ok": true, "command": "unfreeze", "txHash": "Eby39vSha6…", "blockHeight": 276610269}` |
| 1:15–1:25 | — | Timeline footer/`Verified` link; click → `CLAIMS.md` served same-origin with the count visible | — |

Alternative narration at 0:30–0:55: the refusal happens with the **operator**
key only (no admin input) — that is the product's core promise.

## Shot list (if recording is approved)

1. Fleet row hover → `Frozen` (from `evidence/console-v03/screenshots/frozen-fleet-1280.png`).
2. Agent screen state chip + status line.
3. Timeline row: `execute while frozen` · refused · `FLEET_REFUSAL: controller is frozen`.
4. Command sheet open + `Copied`.
5. Export audit chain button (downloads `fleet-audit-v1`, verifiable with `fleet verify-audit`).
6. Stale banner frame (from `stale-fleet-1280.png`) — only if the take shows the failure path.
7. Mobile pass at 390×844 — one take, scrolls Fleet → Agent → Timeline.

## Honesty rules for narration

- "The console does not sign, does not hold a key, cannot freeze or unfreeze.
  Everything you see is a read from testnet at a finalized block."
- "Mode A is not non-custodial. Mode B reduces admin-key trust and is not
  independently custodied in this evidence."
- "The concurrency figure is 572 of 600 on a throttled public RPC — not a
  throughput guarantee."
- Never say the freeze cancels in-flight receipts — it blocks new `execute`
  calls only.
- Numbers on screen are either read live from testnet or counted from
  `CLAIMS.md` — say which.
- Recording and publication require human approval; this doc is not approval.

## Known limits to state if asked

- Free public RPC providers rate-limit; the console paces and fails over, and
  a full read outage shows the last good block with a stale marker rather
  than invented data.
- The Timeline merges chain reads and a local watch file of tx hashes; a
  receipt row appears only after an archival RPC returns it.
- 390×844 layout is functional but the Agent screen is long; desktop is the
  reference framing.
