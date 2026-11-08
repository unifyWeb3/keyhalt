# FLEET — 90-second recording plan (v0.3)

**Status: rehearsed twice against the built console on 2026-11-08 UTC.**
Recording, publication, or any public use still requires explicit human
approval. Identifiers (names, handles, URLs) must not be invented. This
document is not approval.

**Last two rehearsals:** `evidence/console-v03/demo-rehearsal-2.json`
(freeze `GiXcyZLG…`→`8R1T89…` refusal→`Car4…` unfreeze) and
`evidence/console-v03/demo-rehearsal-3.json`
(freeze `GiXcyZLG…`→`Anr9247…` refusal→`Hpkfhsz…` unfreeze), both 2026-11-08,
both exit 0, both ~26–27 s end to end (frozen visible ~7 s, restored visible
~25 s). An interrupted earlier rehearsal ( console down mid-run) is recorded
as rehearsal 2's predecessor in git history: the chain side executed fully,
the console check is what failed.

---

## A. Recording layout — 1920×1080, one take

| Pane | Size | Content |
| --- | --- | --- |
| Left (960×1080) | terminal, 960 px | `zsh`/`bash` with **JetBrains Mono 16 px** (min 15), background `#0b0d14`, foreground `#eef0f5`, 40-44 line height |
| Right (960×1080) | Chromium | `http://127.0.0.1:4173/#/fleet` maximized to the half-screen |

- Recording resolution **1920×1080**, H.264, 30 fps minimum; no scaling up.
- Desktop clean: no icons, no other windows, no IDE overlays.
- Browser chrome hidden when the tooling allows (presentation mode /
  `F11`-style full width split at 50/50), zoom 100%.
- Terminal prompt: `fleet-console` style `$ `, no hostname that reveals
  anything beyond `fleet`; `export FLEET_ADMIN_KEY_FILE=...` appears **once**
  at the top of the visible pane as a prompt prefix command or is implied —
  never typed and never shown in the output.
- Mouse pointer default arrow, visible; no click-highlight overlays.

## B. What to have open before recording

| # | Pre-flight | How to check |
| --- | --- | --- |
| 1 | Agent-1b is **active** | `node packages/cli/dist/index.js inventory agent-1b.fleet-v03-5cff9e99.testnet --json` → `"paused": false` |
| 2 | Agent-1b operators intact | Same inventory → `operators`: 2, both `ops-b` |
| 3 | Audit chain verified | `fleet verify agent-1b.fleet-v03-5cff9e99.testnet --json` → `onChain: true` for a pre-take baseline |
| 4 | Console running and healthy | `curl -sS http://127.0.0.1:4173/api/health` → `status: live`, `stale: false`, claims count visible (currently 41/41) |
| 5 | RPC for the demo set to **dRPC** | `FLEET_DEMO_RPC_URL=https://near-testnet.drpc.org`; verify `node scripts/rpc-check.mjs` |
| 6 | dRPC responsive right now | `curl -sS --max-time 10 -X POST https://near-testnet.drpc.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":"x","method":"status","params":[]}'` |
| 7 | Watch file acknowledged | `tmp/console-watch.json` is append-only; the demo harness adds freeze/refusal/unfreeze tx hashes to it — that is how the refusal row appears live |
| 8 | Notifications **off** | macOS Focus / Linux Do-Not-Disturb; browser password-manager popover suppressed even if it fires |
| 9 | Fresh state, clean takes | `unfreeze agent-1b …` rerun until `paused: false`, restart `make console`, wait for `"status": "live"` |
| 10 | Key files outside the repo | admin + operator files mode 600 under `/root/.near-fallback-keys/`, paths never printed in the recording |
| 11 | Account hygiene | The Mode A admin key is authorized; nothing else in the window — no faucets, no funds, no additional accounts |

Rehearsal ritual: do it once from a **fresh terminal** with the checklist
signs on screen (run it with `--json` and screenshot the output), then do the
real take.

## C. The 90-second run

Left pane commands; right pane console at `http://127.0.0.1:4173/#/fleet`.

| Time | Left: terminal | Right: console | Expected CLI output |
| --- | --- | --- | --- |
| 0:00–0:05 | — | Fleet: 3 agents · 10 operator keys · 0 full-access keys. Header block ticking every finalized block. Footer `Verified 41/41` | — |
| 0:05–0:15 | `node packages/cli/dist/index.js inventory agent-1b.fleet-v03-5cff9e99.testnet --json` | Click agent-1b. Audit head `blockHeight` matches chain; chain `verified on chain and in the SDK` | `"paused": false`, `operators: 2` (ops-b × 2), `fullAccessKeys: 0` |
| 0:15–0:25 | `node scripts/console-demo.mjs --hold-frozen 15 --console-url http://127.0.0.1:4173` | Agent-1b row flips to **Frozen** within one or two blocks; chip + status line show the freeze | `{"ok": true, "command": "freeze", "txHash": "<rehearsed hash>", "blockHeight": N}` |
| 0:25–0:35 | (harness continues; narrate: "this call is refused — with the operator key") | Recent events show the frozen freeze | `{"ok": false, "error": {"code": "FLEET_E_REJECTED", "message": "controller is frozen", "txHash": "<hash>", "blockHeight": N}}` |
| 0:35–0:50 | — | Timeline: the refusal row — `execute while frozen` · `FLEET_E_REJECTED` · refused — with tx hash linked to the testnet explorer | Timeline header: 5 refused; the refusal is the newest row |
| 0:50–1:00 | — | Scroll Timeline up to the frozen row; back to the agent screen | Freeze/unfreeze rows visible with blocks |
| 1:00–1:10 | — | Click **Show freeze command** (label now context-switches to unfreeze); the command sheet copies `node packages/cli/dist/index.js unfreeze … --json` | Sheet path shows `Copied` for two seconds |
| 1:10–1:15 | — | Export audit chain — browser saves `agent-1b.fleet-v03-5cff9e99.testnet-audit.json` | Download completes (also independently verifiable with `fleet verify-audit`) |
| 1:15–1:20 | harness prints PASS | Row flips back to **Active**; footer snapshot block advances; audit row for unfreeze lands | `"result": "PASS"` with the Console checks block |
| 1:20–1:25 | — | `Verified` link → `/claims.md` rendered same-origin | Not required to end the take |

Voiceover per step is optional; on-screen text must stay truthful to what is
on screen: live reads, and the refusal is real — zoom on it at 0:35.

## D. RPC to set

- **Writes (freeze/refusal/unfreeze):** dRPC `https://near-testnet.drpc.org`
  set via `FLEET_DEMO_RPC_URL`. FastNEAR shares per-IP rate limits and has
  been the least reliable this week; Intear worked as fallback.
- **Console reads:** the console's own provider chain (FastNEAR → dRPC); no
  change needed, the console fails over itself.
- **Never:** mainnet. There is no switch for it.
- The refusal receipt appears in the Timeline via archival RPC; if it has not
  landed within ~30 s rehearse time, refresh `#/timeline` and take it from
  recorded rows rather than inventing one.

## E. If a command fails — recovery

1. **429 / fetch-failed on a CLI write:** nothing executed. Verify with
   `inventory … paused`; retry once after ~10 s. Do not force it.
2. **`console-demo` cannot reach the console:** check `curl http://127.0.0.1:4173/api/health`;
   restart `make console`; rerun
   `node scripts/console-demo.mjs --hold-frozen 15 --console-url http://127.0.0.1:4173`.
3. **Refusal row never appears in Timeline:** screenshot the Timeline with
   the frozen row visible and the CLI refusal JSON; that pair is evidence
   enough; note the archival lag in the take's description. Do not claim a
   row exists when it does not.
4. **Exchange went stale mid-take:** the console shows the last good block
   with the banner; take another frame only after it recovers or label the
   take as showing the stale path (`evidence/console-v03/screenshots/stale-fleet-1280.png`).
5. **Command sheet does not open / copy fails:** the button is visible in
   the fallback paths (execCommand); check browser clipboard permission;
   worst case the command is visible and can be read aloud.
6. **agent-1b frozen at end of take:** run
   `node packages/cli/dist/index.js unfreeze agent-1b.fleet-v03-5cff9e99.testnet --rpc-url https://near-testnet.drpc.org --signer-key-file "$FLEET_ADMIN_KEY_FILE" --json`
   to reset, and confirm `paused: false` before any further take.

## F. Pre-recording checklist (print, tick, then record)

- [ ] agent-1b active (inventory; `"paused": false`)
- [ ] Operators present: 2 (ops-b × 2)
- [ ] `make verify` record from this morning attached; `make claims` → 41/41
- [ ] Console `api/health` → live, not stale
- [ ] dRPC responds (cold status call), FLEET_DEMO_RPC_URL set
- [ ] Watch file accepted as append-only; watcher resolves it (9/9)
- [ ] Notifications off; Do Not Disturb on; clipboard clear
- [ ] Browser zoom 100%; only the split window is visible
- [ ] Key files reachable; paths not on screen; terminal history clean
- [ ] Timer at 0:00; take counts reset between takes
- [ ] Same window arrangement as B; same RPC as D

## G. Honesty rules for any voiceover

- "The console does not sign, store a key, or call a write method;
  everything you see is a read of testnet at a finalized block."
- "Mode A is not non-custodial; Mode B reduces admin-key trust and is not
  independently custodied in this evidence."
- "12 calls / 95.33% on a throttled public RPC, not a throughput guarantee."
- "Freeze blocks new `execute` calls; it does not cancel in-flight receipts."
- "Unaudited; testnet only."
- No identifiers, URLs, or handles that have not been human-approved.

## H. Shot list (if the human approves a take)

1. Frozen frame — `frozen-fleet-1280.png` / 2. Frozen Agent chip
3. Timeline refusal row — `execute while frozen`
4. Command sheet + `Copied` status — the freeze/unfreeze command swap
5. Export audit chain download — `fleet-audit-v1`
6. Stale frame — `stale-fleet-1280.png` (if showing the failure path)
7. Mobile pass — `*-390.png` (rapid scroll Fleet → Agent → Timeline)

## Known limits to say aloud if asked

- Free public RPC providers rate-limit; the console fails over and shows the
  last-good block with a stale marker if reads fail entirely.
- The Timeline merges chain reads and a watch file; a refusal row appears
  only after an archival RPC returns it.
- The console is read-only: no signing, no keys, no write path.
