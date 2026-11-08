# Console UI state machines (v0.3, 2026-11-09)

`web/state.js` is the only place transitions live. `web/app.js` never
branches on load/SSE/sheet/agent state ad hoc; it calls the reducers and
renders from the result. Every machine below lists states, events,
transitions, and the impossible combinations the UI must never produce.

---

## 1. dataLoad: the keyhalt/agent/timeline data path

| State | Meaning | Block on screen |
| --- | --- | --- |
| `loading` | no read complete yet | skeleton; no numbers |
| `live` | reads working, fresh | latest pinned block |
| `partial` | reads working, but one agent behind | latest pinned block |
| `stale` | reads failing, cached data still good | last good block + banner |
| `error` | reads failing, nothing good yet | error box; no numbers shown |
| `empty` | zero configured agents | empty box; nothing to show |

| Event | From \u2192 To |
| --- | --- |
| `fetch-ok` (agents>0, not partial) | any \u2192 `live` |
| `fetch-ok` (agents>0, partial) | any \u2192 `partial` |
| `fetch-ok` (0 agents) | any \u2192 `empty` |
| `fetch-fail` with usable cache | `live|partial` \u2192 `stale` |
| `fetch-fail` without cache | `loading|live` \u2192 `error` |
| stale recheck tick | `live|partial` \u2192 `stale` if block stopped advancing |

Impossible / forbidden: `live`+`stale` on one screen; `error` when a last good
block exists (must be `stale`); `empty` values mixed with agents \u2014 the UI
must never show numbers in `empty`.

## 2. sseStream: the header block feed

| State | Meaning |
| --- | --- |
| `connecting` | `EventSource` opened, no frames yet |
| `live` | frames arriving (init/block/snapshot) |
| `reconnecting` | errored/frame lost; browser retrying with `retry: 3000` |
| `stopped` | page left / stream intentionally closed |

| Event | From \u2192 To |
| --- | --- |
| `open` | `connecting|reconnecting` \u2192 `live` |
| `message` (any frame) | `connecting` stays `connecting`; `live` stays `live` |
| `error` | `live|connecting` \u2192 `reconnecting` |
| `stop` | any \u2192 `stopped` |
| `message` while `stopped` | `stopped` (terminal) |

Impossible: `live` without frames (message is the only proof); offering block
increments that never arrive.

## 3. agentState: the chain read

| State | Meaning |
| --- | --- |
| `unknown` | no read or read failed; render "-", no chip guess |
| `active` | `paused=false` at the read block |
| `frozen` | `paused=true` at the read block |

Events: `paused true` at block B \u2192 `frozen` at B; `paused false` \u2192 `active`;
read failure \u2192 `unknown` (not frozen).

## 4. timelineResult: one row's outcome language

| State | Source |
| --- | --- |
| `ok` | audit row, or a receipt whose outcome status is success |
| `refused` | receipt whose logs contain `FLEET_REFUSAL:` |
| `pending` | receipt watched but not yet resolvable; the row is omitted until it resolves: nothing is rendered as ok or refused without a chain source |

Events: `receipt(success)` \u2192 `ok`; `receipt(refusal)` \u2192 `refused`;
`receipt(failure-preflight, no refusal string)` \u2192 `refused` family labelled
`failed`; `no receipt yet` \u2192 `pending` and the row never appears.

## 5. viewport: layout by breakpoint

| State | Breakpoint |
| --- | --- |
| `compact` | \u2264 680 px |
| `medium` | 681-900 px |
| `wide` | > 900 px |

Derived from `window.innerWidth` on resize; drives table-\u2192card layout via
CSS classes only.

## 6. actionOffered: commands the UI may offer (Mode A and Mode B)

| Agent | `paused=false` | `paused=true` | `unknown` |
| --- | --- | --- | --- |
| Mode A | `freeze` | `unfreeze` | both (no chain input to reject either way) |
| Mode B | `request freeze`, `confirm freeze`, `status` | `request unfreeze`, `confirm unfreeze`, `status` | `request*`, `confirm*`, `status` |
| Unknown mode | none | none | none |

Impossible to offer: `freeze` when frozen (contract would reject \u2014 audit
test pins the freeze revert path), `unfreeze` when unfrozen. The UI offers no
write path in either case; the commands open the sheet with local signing
instructions. The console never signs.

## 7. bannerOf: banner is derived, never a separate state

`banner(dataLoad, sse)` returns at most one banner: `stale|error` \u2192
`Reads are failing.`; `partial` \u2192 `Partial snapshot.`; SSE reconnecting
\u2192 `Reconnecting to the block stream.` Otherwise null \u2014 no banner is a
valid and common state.

## 8. Reducers and tests

`web/state.js` holds `dataLoadReducer`, `sseReducer`, `agentStateRead`,
`sheetReducer`, `timelineResultOf`, `viewportOf`, `actionForAgent`,
`bannerOf`. Every transition and every impossible row in these tables is
exercised exactly once in `packages/console/test/console.test.mjs` (UI cases
alongside the still-intact server suite).
