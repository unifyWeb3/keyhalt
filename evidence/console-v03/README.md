# FLEET console v0.3 — screenshots and demo rehearsal evidence

**Date:** 2026-11-07 UTC
**Scope:** the built, read-only FLEET console (`packages/console` + `web/`).

## What this captures

- `screenshots/` — the six console states at 1280×900 and 390×844:
  `loading` (API delayed by the browser), `empty` (console started with
  `FLEET_CONSOLE_ACCOUNTS=`), `error` (API 503 with retry), `stale` (first
  read succeeds, later reads abort; banner reads "Live updates stopped"),
  `frozen` and `active` (real chain freeze/unfreeze via the CLI).
- `demo-rehearsal.json` — the final timed rehearsal of the 90-second demo
  (~30 s of script + block waits). All rows passed: real freeze receipt,
  real refused receipt, real unfreeze receipt, and a console timeline row for
  the refusal sourced from the real receipt.

## State-changing runs behind the frozen/active captures

All writes used the admin key file `…__admin3.json` (public key
`ed25519:CeYS7gkYLL3umiiJFMXb9uRdAtBPBRcN3bZXsGEBzaJL`, current agent-1b
admin). Key files are outside the repository and are never printed or stored
here. One failed preflight is recorded because it left the controller frozen
and the rescue path mattered.

| Date (UTC) | Action | Tx hash | Block |
| --- | --- | --- | --- |
| 2026-11-07 | freeze (FastNEAR run; CLI preflight hit rate limits before the refusal step; controller rescued with the next row) | `FfSoC1xtHqBc3q5SPU63vXcrpBXSnfFYTeLUozyKCqKt` | 276593705 |
| 2026-11-07 | unfreeze via dRPC (rescue) | `4LVKkAFU3Whxtgabri2SYiDKzfnYXkQgrR9cbEzHTDTx` | 276593766 |
| 2026-11-07 | freeze (`console-demo`, dRPC) | `CzN8ncNTSL6ggwwnxPZht7ketSozdp3Ha8dFsHEvsj3M` | 276593968 |
| 2026-11-07 | refused execute (operator3, dRPC) | `7jv7fJsSpDrKj83kcT9ThY4j1Aybeu6hGFMkAB5uvDEu` | 276594012 |
| 2026-11-07 | unfreeze | `JAgwzKfDfoHFvfZMC94vuaY3xiigfFmoHNitGCguTzqK` | 276594023 |
| 2026-11-07 | freeze (frozen screenshots) | `2XYWLLLAtvdn7H2EMeRuzZGBapCbbtKK5UV5gT2C7Qdd` | 276602056 |
| 2026-11-07 | unfreeze | `HhjMNaLk91oXmfLhdfgd8fq8YsCoNLnvZ78W9TSpDUG1` | 276602327 |
| 2026-11-07 | freeze (final rehearsal; see `demo-rehearsal.json`) | `DzRWt8t1wDQMjE6rhiv3MYxvDNy1kuBcsdvjadEG9JSi` | 276610241 |
| 2026-11-07 | refused execute (operator3) | `2ZEPJHPCJQTBkvcz9G1oqwpWGiTYzk7YJC9Khequ7Nhs` | 276610256 |
| 2026-11-07 | unfreeze | `Eby39vSha6WUv3WgLoGSUEmST8Ngr66yuXcpzxGpMsDW` | 276610269 |
| 2026-11-07 | freeze (final screenshot pass, after the claims-count reconciliation) | `7swVKY4u4xnwHVnCXEXCb3sDS5HiqkTUhpZcx6oue7n1` | 276612801 |
| 2026-11-07 | unfreeze | `Fxn8tswi6un73iMJAWBJXbjPAWikGc3ztyjyeEerL7XP` | 276612902 |

The agent-1b controller was returned to the **active** state after each run.

## How each state was produced

| State | Production |
| --- | --- |
| loading | Playwright intercepts `/api/fleet` and delays it; skeleton persists |
| error | `/api/fleet` returns 503; the screen renders the error box with retry |
| stale | first `/api/fleet` succeeds, later ones abort; data banner reads "Live updates stopped" |
| empty | `FLEET_CONSOLE_ACCOUNTS= FLEET_CONSOLE_PORT=4182 node packages/console/dist/cli.js` |
| frozen | CLI `freeze` via dRPC; waited for `paused=true` at a finalized block; SSE refresh picked it up within one or two blocks |
| active | after `unfreeze`, same polling path |

## Chain verification of what the console renders

- Agent-1b agent snapshot at the frozen block read `paused: true` live from
  testnet and returned to `paused: false` at the unfreeze block; the Agent
  screen chip and status line followed the same data.
- The refused execute row in Timeline is parsed from the real receipt
  (`FLEET_REFUSAL: controller is frozen` in the receipt logs); no row is
  synthesised from CLI output.
- `CLAIMS.md` count in the footer is read from the file on every snapshot.

**Recording, publication, or any public use of these screenshots remains
unapproved.** Two capture artifacts noteworthy for review:

- `stale-fleet-1280.png` was re-captured after the client stale detector was
  split from the SSE block feed (a data fetch failure no longer disappears
  under SSE traffic).
- Every screenshot was re-captured with the final build, which counts claim
  rows the same way `make claims` does (fenced `F-001` template row excluded,
  37/37); earlier captures used a build whose footer read 38/38.
- Design-pixel screenshots in `design/screenshots/` are separate and still
  approval-gated.
