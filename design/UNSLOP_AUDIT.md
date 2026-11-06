# Unslop audit — FLEET console pixel draft

**Status: audit of the draft as it stood on 2026-11-06.** Sections 2–5 describe
that before-state and the direction; section 6 records the approved build that
followed. The `unslop` skill (Damir Sokolovsky, `@heydamir`, CC BY 4.0 —
`https://github.com/heydamir/unslop`, pinned at commit
`a6f121eee5f29c2f74976b75456feae8b66afb3a`) was reviewed and applied as an
**audit** to `design/index.html`. The skill's own step 4 says to show the audit
and the direction and wait for an answer before editing, and this repository's
`AGENTS.md` gates all console work on human approval. Both agree: the edits
wait.

**Audited:** 2026-11-06 UTC.
**Screens audited:** all four — Fleet, Agent, Agent with the command sheet,
Timeline (`design/screenshots/`).
**Input:** `design/index.html` (279 lines) and the four recaptured PNGs.

---

## 1. Verdict

**Light slop, with one structural finding.**

The draft is not vibecoded. There are no purple gradients, no glows, no
emoji, no glass cards, no stock robots, no gradient text, no `transition-all`,
no fake data, no hype copy. The palette is a deliberate dark cool-grey, the
type is two real families, the mock data is real recorded testnet hashes and
block heights, and the accessibility basics (semantic tables, focus rings,
status never by color alone) are already right.

That is why the skill says **polish mode**: fix what the audit found, keep the
palette, type, layout, and visual, and take the direction from the existing
product instead of inventing a new one. Bigger ideas go in this report as
suggestions, not as changes.

The one finding that is more than polish is **§2.8 Template look**: the screen
is a generic dark data-table console. Swapping the wordmark for another
product's would still fit. That is the thing the skill most wants fixed, and
it is a direction problem rather than a craft problem.

---

## 2. Audit — every sign found, with where it lives

Line numbers are `design/index.html`.

### 2.1 Surfaces and color

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| C1 | **Border is not a quiet hairline.** `--border: #2a3948` (line 25) on `--bg: #0b0f14` (line 23) is a blue-grey line at roughly 30% of the text colour's strength. The skill wants the text colour at 6–10% opacity. Every table row, panel, button, sheet and chip sits on it, so the border is the loudest thing on the screen. | lines 25, 57, 65, 77, 87, 107, 116, 126, 144 | Fix: `rgba(230, 237, 243, 0.08)` for the hairline, keep a slightly stronger one only where a border carries meaning. |
| C2 | **Four text roles, two of them near-identical light blues.** `--code: #a8d8ff` (line 28) and `--link: #79c0ff` (line 32) are two tints of the same blue doing different jobs, on top of `--text` and `--muted`. This is the "many near identical tints of the same hue for text" sign. | lines 26–32, and every use at 72, 83, 92–98, 112, 132, 137, 139 | Fix: three roles from one ramp — primary `--text`, secondary `--muted`, muted (one step dimmer). Identifiers keep their distinction through **mono**, not through a fourth hue. |
| C3 | **The accent is used everywhere instead of rarely.** `--link` marks links, the focus ring, the button hover border, and the tx-hash links in the Timeline. The skill: "In the chrome, one accent, used rarely." | lines 46, 49, 98, 112, 122 | Fix: accent on the primary action and one signature element per screen; links get the secondary role. |
| C4 | **Nothing is *the* bright element.** Every coloured thing is a semantic status (`--ok` `--warn` `--danger`) or a link. No single element carries the craft. | whole file | Fix: see the **Moments** line in §3. |

### 2.2 Type

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| T1 | **Weight 600 is the default, not the exception.** `--wordmark` (63), `header .chip b` (71), `.panel h2` (82), `.panel h2.id` (83), `.state` (99) are all 600. The skill allows 400/500 with 600 only for rare emphasis. | lines 63, 71, 82, 83, 99 | Fix: hierarchy from size and colour. 600 only where it is genuinely rare. |
| T2 | **No `font-variant-numeric: tabular-nums`.** Every block height, tx hash, and key string is a figure in a mono face; the skill asks for tabular figures explicitly so columns do not shimmer as the ticker runs. | lines 72, 92–97 | Fix: `font-variant-numeric: tabular-nums` on the mono roles. |
| T3 | **The font weights are declared as a 400–700 range** in both `@font-face` blocks (lines 12, 20), so the draft can reach 700 without anyone deciding to. | lines 9–20 | Fix: declare only the weights actually used. |

### 2.3 Icons

No finding. There is **no emoji** anywhere, the `✓` mark is a single consistent
text glyph used with one meaning (verified), and it inherits a semantic colour
rather than a decorative one. Nothing needs a line-icon set.

### 2.4 Spacing

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| S1 | **Off-grid value.** `th, td { padding: 10px 8px; }` (line 88) — 10px is not a multiple of 4. Everything else in the file is on the 4px grid. | line 88 | Fix: `12px 8px` (or `8px 8px`). |
| S2 | **Groups are not separated from items.** Every section heading on the Agent screen uses the same `margin: 0 0 12px` (line 82), so *Operator keys*, *Admin*, and *Audit tail* sit at the same distance from their own content as from each other. The skill: "Space inside a group is smaller than space between groups." | lines 82, 196–227 | Fix: a larger gap above each section than below its heading. |
| S3 | **`vertical-align: top` on every cell** (line 89) lets row heights vary with wrapped content, so the Fleet and Timeline tables do not share one row height. | line 89 | Fix: one row height; baseline-align single-line cells. |
| S4 | **Controls are flatter than the skill's range.** `button { border-radius: 4px }` (line 118) and `.panel { border-radius: 4px }` (line 78) put panels and buttons on the same radius, so nesting does not read. | lines 78, 118, 126 | Fix: radius by size — controls 8, panels 12 — and keep the nested-radius rule (inner = outer − padding, never below 4). |
| S5 | **The header chip is a bordered box around two words** (lines 64–70) at `border-radius: 2px`. Counts and meta are supposed to be quiet text, not boxes. | lines 64–70 | Fix: the chip is quiet already; losing the border would lose the one place the network is declared, so keep the box but drop the bold on `testnet` (see T1) and let the mono block number carry the emphasis. |

### 2.5 Copy

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| P1 | **"Export verified export"** (line 228) is a tautology and reads badly. It is also the one label a judge will read first on the Agent screen. | line 228 | Fix: `Export audit chain`. The gate stays — the button only enables once the chain verifies — but the label says what the button does. |
| P2 | **"Audit tail"** (line 222) is jargon. A judge does not know that a tail is the last few entries. | line 222 | Fix: `Recent audit entries`. |
| P3 | **"2 of 2 · 2 owners · demo: same operator"** (line 220) is honest and important, but cryptic. This is the single most load-bearing string in the whole console: it is the Mode B disclosure. | line 220 | Fix: `2 of 2 confirmations · both owners operated by one operator in this demo`. Honest *and* readable. |
| P4 | The Fleet screen's section heading is **"Agents"** (line 163) while the screen is called "Fleet" in the design system and the wordmark. | line 163 | Fix: `Fleet`, to match the product's own noun. |
| P5 | No exclamation marks, no greeting headline, no hype words, no trailing periods on labels, no unverified claims, no fake data. | — | **No finding.** This is the strongest part of the draft. |

### 2.6 Components

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| M1 | The "Full-access keys" column is a bare `0` (lines 166, 171, 176) — exactly the "counts and meta become quiet text" rule. | — | **No finding.** |
| M2 | There are no charts, no stat cards, no badges, no pills. | — | **No finding.** The skill would rather a dashboard had none than have decorative ones. |

### 2.7 Motion

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| X1 | **The block counter increments on a timer, not from the chain.** `setInterval(tick, 1200)` with `height += 1` (lines 249–251) makes a fabricated number climb forever. This is the "motion that loops for no reason … on things that are not live" sign. | lines 249–251 | Context matters: in the **real** console the ticker is driven by the RPC, and `docs/DESIGN_SYSTEM.md` §5 makes the ticking block the demo's visible timer. So the fix is not to delete the ticker but to label it honestly in the mock-up and make the real one read the chain. |
| X2 | The command sheet appears and disappears with no transition (line 281). | line 281 | Fix (suggestion): a short fade and rise of a few pixels, matching the one-easing-curve rule. |

### 2.8 Template look — the structural finding

| # | Sign | Where | Note |
| --- | --- | --- | --- |
| L1 | **Swap the wordmark for another product's and the screen still fits.** Three tables of accounts, keys, and audit rows on a dark background is the generic AI-console shape. The skill's template check: "If you swapped the product name for another product's, would the screen still fit? If yes, push the direction harder in the copy, the visual and the signature detail." | whole file | This is the finding the skill most wants fixed, and it is the one that needs a decision from the human, not a craft pass. |
| L2 | **The app is a narrow centred column.** `main { max-width: 72rem; margin: 0 auto; }` (line 73) centres a 1,152px column in a 1,920px viewport. The skill: apps "keep real app proportions … Never shrink an app into a narrow centered column." | line 73 | This also matters for the demo: in the approved split screen the console gets **960px**, so a 1,152px centred column would be clipped or cramped in its half. |
| L3 | **No signature detail.** Nothing on screen could only belong to FLEET. | whole file | See §3. |

---

## 3. The direction

Five lines, as the skill requires. Derived from what the product does and who
it is for — not from what is trending.

- **Product.** A read-only console that shows a team of NEAR agent accounts,
  the native access keys on each one, and the audit chain that records every
  lifecycle action — so a compromised agent can be frozen and its keys
  revoked, and the team can prove afterwards who did it.
- **Character.** `calm, exact, night-shift`.
- **World.** A security desk at night, and the two objects that world is made
  of: a **key cabinet** and a **ledger**. The material of this product is the
  key itself — a public-key string, a scope tag, a hash that links to the
  hash above it.
- **Moments.** (1) The **chain spine** — the audit chain drawn as a continuous
  linked column where each entry visibly hangs from the hash above it, so it
  reads as a chain and not as a table. (2) The **agent's hold** — the frozen
  state rendered as a physical thing (a closed padlock on the key cabinet)
  instead of a red word in a cell.
- **Signature.** The **scope tag** — a small mono chip reading `ops-a` or
  `ops-b`. It is the one element allowed to carry the accent colour, because
  a scope tag is exactly what bulk revocation turns on, and it appears
  wherever a key's role matters. One detail, used consistently.

---

## 4. What would change if the human approves

Ordered as the skill's nine passes. Every change is craft; none changes what
the product is, and none invents a feature or a claim.

| Pass | What it touches | Summary |
| --- | --- | --- |
| 1 Spacing | lines 82, 88, 89, 196–227 | `10px 8px` → `12px 8px`; separate groups from items; one row height; baseline-align cells |
| 2 Color | lines 21–33 and every use | Border to a real 6–10% hairline; collapse to three text roles; ration the accent to the tag chip and the primary action |
| 3 Icons | — | No change. No emoji, no icon set needed |
| 4 Copy | lines 163, 220, 222, 228 | "Export verified export" → "Export audit chain"; "Audit tail" → "Recent audit entries"; the Mode B admin row made readable; "Agents" → "Fleet" |
| 5 Type | lines 9–20, 63, 71, 82, 83, 99, 72, 92–97 | Declare only the weights used; hierarchy from size and colour; `tabular-nums` on the mono roles |
| 6 Layout | lines 73, 75–81 | Stop the narrow centred column; fill the viewport so the console works in its half of the split screen |
| 7 Details | lines 78, 118, 126, 228 | Radius by size with the nested-radius rule; the export button's state gate made legible |
| 8 Visuals | new markup in the Timeline and Agent screens | The chain spine and the hold — the two moments from the direction, built in code, no generated images, no new data |
| 9 Motion | lines 249–251, 281 | Ticker sourced from the chain in the real console; one short transition on the command sheet |

**Not changing:** the three screens, their order, their content, the real
recorded hashes and block heights, the `noindex` meta tag, the accessibility
work (semantic tables, focus rings, status never by colour alone), the
`Verified 37/37 → CLAIMS.md` footer, or the honesty of the Mode B row.

**Explicitly not in scope:** the story video the skill can produce. It needs
Playwright and ffmpeg and is a separate deliverable the human has to ask for.

---

## 5. The decision this needs

The audit is **light slop**. The craft findings (C1–C5, T1–T3, S1–S5, P1–P4,
X2) can be applied as a polish pass without changing the design's character.

**L1–L3 are a different question.** They ask whether the console should stop
being a generic dark data table and become unmistakably FLEET — which means
the chain spine and the hold. That is a visible design change to a screen the
human has not approved yet, and the skill is explicit that changing the
direction later means redoing everything.

So the human is asked to choose:

- **A — Polish only.** Apply the craft findings; keep the generic-console
  shape. Lowest risk, smallest diff.
- **B — Polish plus the direction.** Apply the craft findings *and* build the
  chain spine, the hold, and the scope-tag signature, and let the layout fill
  the viewport. Bigger diff, and the console stops being swappable with any
  other product's.
- **C — Hold the console as it is.** The draft stays as the approval artefact
  exactly as it is now; nothing is touched until the human has reviewed it.

Recommendation: **B**, because the console is the thing a judge will look at
for thirty seconds, and a generic data table does not say "key lifecycle" in
that time. But **A** is defensible if the human would rather keep the current
shape, and **C** is correct if the human wants to review the draft as it
stands before any of it changes.

**Decision (2026-11-07): the human approved scope B — polish plus the
direction.** Section 6 records what was applied.

---

## 6. Applied — 2026-11-07

Scope B was applied to `design/index.html` in the skill's nine passes, in
order. The four screenshots were recaptured at 1920×1080 from the same real
evidence. No number, hash, key, block height, screen or route changed.

| Pass | What changed |
| --- | --- |
| 1 Spacing | 4 px rhythm throughout: page padding 32/24, panel padding 20, table cell 12×16, group gaps 24–32, one row height per table. `10px 8px` is gone. |
| 2 Color | Surfaces moved to the ink ramp (`#0b0d14`, `#11141c`, `#1a1e28`). Border is a real 8% hairline. Two identifier blues collapsed into three text roles plus one mono treatment. The accent (`#7cb7ff`) is rationed to the scope tag, the chain-head node, the header block figure and the focus ring. Danger was lightened to `#e85d61` so a refused row keeps 4.5:1 on hover. |
| 3 Icons | The `✓` and `←`/`→` text glyphs became one inline lucide-style set at 16 px / 1.5 stroke: check, arrow-left, arrow-right, lock, lock-open, and a key mark for the wordmark. No emoji, no external icon request. |
| 4 Copy | "Agents" → "Fleet". "Export verified export" → "Export audit chain". "Audit tail" → "Recent audit entries". The admin row reads "2 of 2 confirmations · both owners operated by one operator in this demo". |
| 5 Type | Only 400/500/600 Inter and 400/500 JetBrains Mono are declared. Hierarchy from size and colour. `tabular-nums` on every figure. Mono identifiers, not a fourth hue. |
| 6 Layout | The 72 rem centred column became a 1440 px fluid shell with a 56 px top bar (brand, routes, network chip) and a 44 px footer. The Fleet table carries a second quiet key line per agent; the header carries the real aggregate. |
| 7 Details | Radius by size: panels 14, controls 8, chips 4. Quiet mono meta instead of boxes. One primary action (off-white) and one secondary. |
| 8 Visuals | The two moments from the direction, built in code from recorded data: the **chain spine** on the Agent screen (entry hash, `prev` hash, verified mark, head node in accent) and the **hold** on the Timeline (closed lock on freeze and on the frozen refusal, open lock on unfreeze). The **scope tag** is the signature. |
| 9 Motion | 140 ms hover, 180 ms sheet fade and 4 px rise, one easing curve, no `transition-all`. The block ticker now carries a `title` and a footer note saying it is a stand-in for the live RPC. `prefers-reduced-motion` disables transitions. |

**Verified after the passes:** the four screens were re-rendered and compared
with this audit; no sign from §2 remains. All three screens fit 1920×1080, and
the Agent screen with the command sheet open fits as well (1081 px before the
final 8 px trim, 1073 px after). No external request was added; fonts and SVGs
stay local.

**Still not done, by decision:** the skill's story video (§4.8) was not built.
It needs Playwright and ffmpeg and is a separate deliverable.

**Attribution.** The design follows `unslop` by Damir Sokolovsky
([@heydamir](https://x.com/heydamir)), CC BY 4.0,
`https://github.com/heydamir/unslop`, pinned at
`a6f121eee5f29c2f74976b75456feae8b66afb3a`.
