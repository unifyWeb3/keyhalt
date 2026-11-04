# FLEET console design system (v0.3 draft, amended)

**Status: DRAFT for human review — not approved, not built.** No console code,
no Figma file, and no recording exist. Do not present this document as a
finished UI. UI generation and recording happen only after written human
approval of this draft.
**Date:** 2026-11-04 UTC (amended after the 2026-11-04 design review).
**Scope:** read-only console for NEAR **testnet** only. The console never signs,
never stores a key, and never calls a write method. Every write stays in the
SDK/CLI (local signing) per `docs/INTERFACES.md` §1.

**Out of scope:** wallet-signed writes, hosted demo, paymaster.

The console answers one question: is this fleet behaving the way the evidence
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
| Display and headings | Inter, sentence case, 600 | 28 / 15 px |
| Body | Inter, 400 | 14 px |
| Identifiers (account IDs, keys, hashes, block heights) | JetBrains Mono, 400 | 13 px |

**License and hosting:** Inter is OFL 1.1 (SIL Open Font License), JetBrains
Mono is OFL 1.1. Both are self-hosted as subset WOFF2 in `design/fonts/` with
licenses included. No web-font CDN. No other face is loaded.

---

## 3. Color

Dark-first. Contrast checked on every token below against its background.

| Token | Hex | Contrast on `--bg` | Use |
| --- | --- | --- | --- |
| `--bg` | `#0b0f14` | — | page background |
| `--panel` | `#121a26` | — | card surface |
| `--border` | `#2a3948` | — | hairlines, table rules |
| `--text` | `#e6edf3` | 16.3 : 1 | primary text |
| `--muted` | `#9aa9b8` | 8.0 : 1 | secondary text |
| `--code` | `#a8d8ff` | 12.7 : 1 | identifiers at 13 px |
| `--ok` | `#4cc38a` | 8.7 : 1 | verified true, executed |
| `--warn` | `#e0a100` | 8.5 : 1 | pending, unverified |
| `--danger` | `#ff7b72` | 7.6 : 1 | frozen, refused, tamper |
| `--link` | `#79c0ff` | 9.9 : 1 | tx hash links |

Light mode is deferred.

### 3.1 Spacing and layout

- Baseline grid: 8 px. Page max width 72 rem; reading column 52 rem.
- Radius: 4 px panels, 2 px chips. Border 1 px `--border`.
- Header (pinned): `FLEET` wordmark, one chip with network and latest block.
  Nothing else.

---

## 4. Components

### 4.1 Header

Wordmark and one chip: `testnet · block 276151157`. The block number ticks as
new blocks arrive. No other header content.

### 4.2 Fleet

One row per agent (three) and, on the Mode B demo fleet, the same row shape
for its agent. Columns: name, state (`Active` or `Frozen`), full-access key
count, and the last event with its time. Selecting a name opens the agent
screen. Fleet membership comes from a config file or a URL hash
(`#agent=agent-2.…`), never a text box.

### 4.3 Agent

Close button to return to the fleet. Below it, three groups:

- Operator keys and scopes (table: key, tag, active).
- Admin. Mode A: admin key. Mode B, as data: **2 of 2 · 2 owners · demo: same
  operator**. The threat prose stays in `docs/THREAT_MODEL.md`.
- Audit tail: the last entries with the verified chip, and the export action.
  Export is enabled only after verification passes.

### 4.4 Timeline

One row per lifecycle event, including refusals. A refused call is a row with
its refusal text in plain language and its tx hash. Confirmation rows for
Mode B mark the count (`0 of 2`, `1 of 2`, `2 of 2`).

### 4.5 Command sheet (the only action surface)

Each agent has Freeze or Unfreeze. Selecting it opens a sheet showing the exact
CLI command and a copy button:

```text
fleet freeze agent-b1.fleet-modeb-748d4372.testnet --signer-key-file <key-file>
```

The console never signs, never stores a key, and never calls a write method.
See `design/DEVIATIONS.md`.

### 4.6 Footer

One line: `Verified 28/28` linking to `CLAIMS.md`. Individual facts carry a
✓ mark that links to their transaction.

### 4.7 Errors (plain language in the UI)

| Situation | Render |
| --- | --- |
| Network is not testnet | Banner: "Mainnet is not supported." No data shown. |
| RPC unreachable | "Can't reach testnet." with Retry. Last block shown as stale. |
| History was altered | "History was altered at entry 4." Export blocked. |
| Contract refused | Red row with the plain-language refusal and its tx hash. |

`FLEET_E_*` codes stay in the CLI and JSON only.

---

## 5. Information architecture

Three screens. No other routes.

```
Fleet → Agent → Timeline
```

- Fleet is the default screen. Agent opens from a fleet row. Timeline is the
  fleet-wide event list, reachable from the fleet and from an agent.
- Live updates on every new block. The header block number ticks. A Frozen
  state appears in the block it lands. A refused call appears as an event row.
- Demo format is a split screen: terminal command on one side, console on the
  other. The ticking block is the visible timer.

---

## 6. Motion and interaction

- No animation beyond a 120 ms opacity change on panel fill.
- Focus ring: 2 px `--link` outline on every interactive element.
- Refresh is the block tick itself; there is no manual refresh control.

---

## 7. Accessibility and 1920×1080 fit

- Status is conveyed by text, never color alone.
- Tables are semantic tables; tx hashes are real links to NearBlocks.
- Header + fleet visible without scroll at 1920×1080.
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

**This is a draft, not a working UI.** The live product today is the
controller, SDK, and CLI; `web/index.html` remains a static placeholder.
