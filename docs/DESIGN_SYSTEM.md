# Keyhalt console design system (v0.3 draft, amended)

**Status: BUILT (read-only): not approved for recording or public use.** The
design system has been applied in `web/` + `packages/console/`; this document
remains the authority for type, colour, layout and copy. No Figma file and no
recording exist. Recording and public use happen only after written human
approval of this build.
**Date:** 2026-11-04 UTC (amended after the 2026-11-04 design review; type,
colour, layout and copy amended 2026-11-07 after the human approved the
`unslop` direction: see `design/UNSLOP_AUDIT.md`; console built and
rehearsed 2026-11-07, see `evidence/console-v03/` and
`docs/CONSOLE_SHOT_LIST.md`).
**Scope:** read-only console for NEAR **testnet** only. The console never signs,
never stores a key, and never calls a write method. Every write stays in the
SDK/CLI (local signing) per `docs/INTERFACES.md` §1.

**Out of scope:** wallet-signed writes, hosted demo, paymaster.

The console answers one question: is this keyhalt behaving the way the evidence
says it should? Everything else is secondary.

---

## 1. Principles

1. **Simple purpose, simple architecture, simple design, simple implementation.**
   If a line of text does not change what someone does next, it does not ship.
2. **Evidence before color.** Every number is a block height, a tx hash, or a
   verified mark. No bare metrics.
3. **Red is only for danger or failure.** Red = frozen, refused, or a verified
   `false`. Green = verified true / executed. Amber = pending or unverified.
4. **Testnet discipline is visible.** The header always shows the network and
   the latest block. If the network is not testnet, the console stops with a
   plain-language message and shows no data.
5. **Quiet layout.** No taglines, no helper text, no secondary labels.
6. **Fail closed.** Missing evidence renders as a gap, never as fake success.
7. **The pixel draft is built by the agent** after this approval. The agent
   builds it from captured `evidence/` data with no live calls, then stops for
   human approval.

---

## 2. Type

**One sans for interface and headings. One monospace for identifiers only.**

| Role | Face | Size / weight |
| --- | --- | --- |
| Wordmark | Inter, 600 | 18 px |
| Screen and panel headings | Inter, sentence case, 500 | 14 px |
| Agent ID (one screen title) | JetBrains Mono, 500 | 15 px |
| Group headings | Inter, 500 | 13 px |
| Column headers and meta | Inter, 400 | 12 px |
| Body and table cells | Inter, 400 | 14 px |
| Identifiers (account IDs, keys, hashes, block heights) | JetBrains Mono, 400, `tabular-nums` | 13 px |
| Scope tag | JetBrains Mono, 400 | 11 px |

Only weights 400, 500 and 600 are loaded. Hierarchy comes from size and colour,
not weight. No uppercase tracked labels, no italic, no negative tracking.

**License and hosting:** Inter is OFL 1.1 (SIL Open Font License), JetBrains
Mono is OFL 1.1. Both are self-hosted as variable TrueType files in
`design/fonts/` (`Inter.ttf`, `JetBrainsMono.ttf`) with their OFL texts. No
web-font CDN. No other face is loaded.

---

## 3. Color

Dark-first. Contrast checked on every token below against its background.

Ink ramp: the console is a security desk at night. Surfaces stay neutral
blue-grey; colour carries meaning and the one signature. Contrast is measured
against `--bg` and, for cells, `--panel`.

| Token | Hex | Contrast on `--bg` / `--panel` | Use |
| --- | --- | --- | --- |
| `--bg` | `#0b0d14` |: | page background, sheet |
| `--panel` | `#11141c` |: | card surface |
| `--raised` | `#1a1e28` |: | active nav, row hover |
| `--hairline` | `rgba(238,240,245,0.08)` |: | borders, table rules |
| `--hairline-strong` | `rgba(238,240,245,0.16)` |: | control borders, chain spine |
| `--text` | `#eef0f5` | 17.0 : 1 / 16.2 : 1 | primary text |
| `--text-2` | `#a3a9b8` | 8.3 : 1 / 7.8 : 1 | secondary text |
| `--text-3` | `#828a9e` | 5.6 : 1 / 5.3 : 1 | meta, column headers |
| `--accent` | `#7cb7ff` | 9.3 : 1 / 8.8 : 1 | scope tag, block figure, focus |
| `--ok` | `#4cc38a` | 8.8 : 1 / 8.3 : 1 | verified true, executed |
| `--warn` | `#e0a100` | 8.6 : 1 / 8.1 : 1 | pending, unverified |
| `--danger` | `#e85d61` | 5.7 : 1 / 5.4 : 1 | frozen, refused, tamper |

Identifiers are distinguished by **mono and tabular figures, not a second
hue**. Links are primary text with a hairline underline; they are not a fourth
colour. The accent is used rarely: the scope tag, the chain-head node, the
block figure in the header and the focus ring.

Light mode is deferred.

### 3.1 Spacing and layout

- Grid: 4 px. Page max width 90 rem (1440 px), fluid below that, page padding
  32 px (24 px at the bottom edge, 16 px under 900 px wide).
- Panels: 20 px padding, 14 px radius. Controls: 8 px radius. Chips: 4 px.
  Borders are 1 px hairlines, never a solid mid-grey.
- Top bar (56 px, pinned): `Keyhalt` wordmark with a key mark, the two routes
  (`Keyhalt`, `Timeline`), and the testnet chip. Footer: 44 px.
- The layout fills the viewport width. It is never a narrow centred column.

---

## 4. Components

### 4.1 Header

Wordmark with a key mark, the routes `Keyhalt` and `Timeline`, and the chip
`testnet · block 276454237`. The block number ticks as new blocks arrive; in
the static draft the counter is a labelled stand-in (footer note and `title`),
and the real console reads it from the RPC. The active route is a small
surface step with a hairline, not a coloured pill. No other header content.

### 4.2 Keyhalt

One row per agent (three) and, on the Mode B demo fleet, the same row shape
for its agent. Columns: name, state (`Active` or `Frozen`), full-access key
count, and the last event with its block. Each name carries a second quiet
line with the key material that makes the keyhalt a fleet: `4 operator keys ·
2 ops-a · 2 ops-b`. The panel header carries the real aggregate: `3 agents ·
12 operator keys · 0 full-access keys`. Selecting a name opens the agent
screen. Keyhalt membership comes from a config file or a URL hash
(`#agent=agent-2.…`), never a text box.

### 4.3 Agent

Close button to return to the keyhalt. Below it, three groups:

- Operator keys and scopes (table: key, scope tag, active). The scope tag is
  the signature detail: a small mono chip, the one accent on the row.
- Admin. Mode A: admin key. Mode B, as data: **2 of 2 confirmations · both
  owners operated by one operator in this demo**. The threat prose stays in
  `docs/THREAT_MODEL.md`.
- Recent audit entries: the chain spine. Each entry hangs from the hash above
  it on a continuous rail: sequence, action, block, entry hash, `prev` hash,
  and the verified mark. The head node carries the accent. The export action
  is `Export audit chain`, enabled only after verification passes.

### 4.4 Timeline

One row per lifecycle event, including refusals. A refused call is a row with
its refusal text in plain language and its tx hash. Freeze and unfreeze rows
carry a closed or open lock so the state transition is visible as a shape, not
only as a word; the frozen refusal carries the closed lock in the danger
colour. Confirmation rows for Mode B mark the count (`0 of 2`, `1 of 2`,
`2 of 2`). The panel header carries the real counts: `8 events · 3 refused ·
160 blocks`.

### 4.5 Command sheet (the only action surface)

Each agent has Freeze or Unfreeze. Selecting it opens a sheet showing the exact
CLI command and a copy button:

```text
keyhalt freeze agent-b1.fleet-modeb-748d4372.testnet --signer-key-file <key-file>
```

The console never signs, never stores a key, and never calls a write method.
See `design/DEVIATIONS.md`.

### 4.6 Footer

One line: `Verified 41/41` linking to `CLAIMS.md`, and `Threat model`.
Individual facts carry a check mark that links to their transaction. A quiet
right-hand note states that the draft renders captured testnet evidence and
that the block counter is a stand-in.

### 4.7 Errors (plain language in the UI)

| Situation | Render |
| --- | --- |
| Network is not testnet | Banner: "Mainnet is not supported." No data shown. |
| RPC unreachable | "Can't reach testnet." with Retry. Last block shown as stale. |
| History was altered | "History was altered at entry 4." Export blocked. |
| Contract refused | Red row with the plain-language refusal and its tx hash. |

`KEYHALT_E_*` codes stay in the CLI and JSON only.

---

## 5. Information architecture

Three screens. No other routes.

```
Keyhalt → Agent → Timeline
```

- Keyhalt is the default screen. Agent opens from a keyhalt row. Timeline is the
  keyhalt-wide event list, reachable from the keyhalt and from an agent.
- Live updates on every new block. The header block number ticks. A Frozen
  state appears in the block it lands. A refused call appears as an event row.
- Demo format is a split screen: terminal command on one side, console on the
  other. The ticking block is the visible timer.

---

## 6. Motion and interaction

- One easing curve, `cubic-bezier(0.22, 1, 0.36, 1)`. Hover is a 140 ms
  colour or surface change; the command sheet fades and rises 4 px in 180 ms.
  No looping animation except the block tick, no `transition-all`.
- Focus ring: 2 px `--accent` outline on every interactive element.
- `prefers-reduced-motion` turns transitions off.
- Refresh is the block tick itself; there is no manual refresh control.

---

## 7. Accessibility and 1920×1080 fit

- Status is conveyed by text, never color alone.
- Tables are semantic tables; tx hashes are real links to NearBlocks.
- Header + keyhalt visible without scroll at 1920×1080. The agent screen and its
  open command sheet also fit 1080 px without scrolling (verified 2026-11-07).
- No private key, seed phrase, signer path, or wallet UI appears, even as a mock.
- `web/` carries `<meta name="robots" content="noindex">` until the human
  approves a public URL.

---

## 8. Explicitly deferred

- Wallet-signed writes, hosted demo, paymaster.
- Light mode, charts, cross-account graphs.
- i18n. English only.

---

## 9. Approval gate

1. Human reviews this amended draft.
2. The agent builds the pixel draft from captured evidence data.
3. Human approves the pixel draft in `design/REVIEW.md`.
4. Only then: demo recording and any Figma work.

**This is the shipped direction.** The screens in `web/` implement it
(Keyhalt, Agent, Timeline) and are the live product today together with the
controller, SDK, and CLI. `design/index.html` remains the approval-gated
pixel reference; recording and public use still require written human
approval.
