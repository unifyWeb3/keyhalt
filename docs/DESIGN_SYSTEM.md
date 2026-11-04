# FLEET console design system (v0.3 draft)

**Status: DRAFT for human review — not approved, not built.** No console code,
no Figma file, and no recording exist. Do not present this document as a
finished UI. UI generation and recording happen only after written human
approval of this draft.
**Date:** 2026-11-04 UTC.
**Scope:** read-only console for NEAR **testnet** only. The console never signs,
never stores a key, and never calls a write method. Every write stays in the
SDK/CLI (local signing) per `docs/INTERFACES.md` §1.

**Out of scope for the demo:** wallet-signed writes, hosted demo, paymaster.
This draft covers read-only evidence resolution only.

---

## 1. Purpose and non-goals

---

## 1. Purpose and non-goals

The console answers three questions for a reviewer standing in front of a
terminal:

1. **What is on this account?** — controller state, operator keys, native
   `view_access_key_list`, FullAccess count.
2. **What happened, in order?** — the SHA-256 audit hash chain, verifiable
   on-chain and in JS.
3. **Can I check a claim?** — each badge and number maps to a `VERIFIED` row in
   `CLAIMS.md` and a public testnet transaction hash.

Non-goals: signing, wallet connect, key input, write buttons, price feeds,
historical charts, mainnet. Any future wallet-signed surface is a separate
design gate and is not named here.

---

## 2. Design principles

1. **Evidence before color.** Every number carries its source: block height,
   tx hash, or `CLAIMS.md` row. No bare metrics.
2. **Monospace for identifiers.** Account IDs, public keys, tx hashes, and
   block heights render in monospace; prose in a humanist sans.
3. **Red is only for danger or failure.** Red = frozen, refused, tamper, or a
   verified `false`. Green = verified true / executed. Amber = pending,
   stale, or unverified.
4. **Testnet discipline is visible.** The network chip is pinned in the header.
   If the RPC is not `testnet`, the console shows `FLEET_E_MAINNET` and stops.
5. **Static until proven dynamic.** The draft ships as text and ASCII layout.
   Pixel work follows approval and human direction.
6. **Fail closed.** Missing evidence renders as a gap, never as a fake success.

---

## 3. Visual language

### 3.1 Color (dark-first, operational terminal)

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0b0f14` | page background |
| `--panel` | `#111925` | card / panel surface |
| `--border` | `#263544` | hairlines, table rules |
| `--text` | `#d7e0ea` | primary text |
| `--muted` | `#8fa1b3` | secondary labels, units |
| `--code` | `#9fd0ff` | account IDs, keys, hashes |
| `--ok` | `#3fb970` | verified true, executed |
| `--warn` | `#c08a2e` | pending, stale, unverified |
| `--danger` | `#e06c5c` | frozen, refused, tamper |
| `--link` | `#7fc4ff` | tx hash links |

Light mode is deferred; dark operational surfaces match the demo terminal and
reduce glare during recording. Contrast target: 7:1 for body text on `--bg`.

### 3.2 Type

| Role | Face | Size / weight |
| --- | --- | --- |
| Display | ui-monospace stack | 28 px, 600 |
| Heading | ui-monospace stack | 15 px, 600, uppercase, 0.06 em tracking |
| Body | system sans | 14 px, 400 |
| Caption | system sans | 12 px, `--muted` |
| Code / values | ui-monospace stack | 13 px, 400 |

### 3.3 Spacing and layout

- Baseline grid: 8 px. Page max width 72 rem; reading column 52 rem.
- Radius: 4 px panels, 2 px chips. Border 1 px `--border`.
- Header (pinned): `FLEET` wordmark, environment chip, RPC chip, block chip,
  claims chip. Sticky; never overlaps content.
- Panels: one question per panel. Each panel header shows its claim/evidence
  reference in caption style.

---

## 4. Components (text draft)

### 4.1 Header

- `FLEET` + `testnet` chip (`--link` text, bordered).
- RPC chip: URL host + last block height + OK / `FLEET_E_RPC` / `FLEET_E_MAINNET`.
- Claims chip: `28/28 VERIFIED` linking to `CLAIMS.md`.
- Console state chip: `READ-ONLY` (constant). There is no control that can
  clear it.

### 4.2 Inventory panel

Source: `get_state()` + `get_native_keys()` (SDK `getInventory()`).

- Account ID (monospace), mode chip (`Mode A` / `Mode B`).
- State: `paused` bool rendered as a chip (`PAUSED` red / `ACTIVE` green),
  `provisioned`, `provision_error` (red when non-null), receiver + method.
- Admin: `admin_pk` (public) or, in Mode B, `admin_account`; recovery and
  pending states listed; pending shows `pending_origin`.
- Operators: table of `publicKey`, `tag`, `active` — max 4 in v0.3 evidence.
- Native keys: table of permission, allowance, receiver, methods.
  `FullAccess` count rendered with the same danger treatment as paused.
- Copy actions: copy account ID, public key, hash. No key import.

### 4.3 Audit & integrity panel

Source: `get_audit` pages + `verify_audit` + JS `verifyAuditChain()`.

- Head: `seq`, `entry_hash` (truncated with full on hover/copy), block height,
  u64 timestamp as decimal string (never a JS number).
- Chain status chip: `VERIFIED` (green) or the exact failure string, e.g.
  `entry_hash mismatch at seq 4` (red). Never a vague "error".
- Export: `fleet-audit-v1` JSON preview and download. Download requires the
  chain to verify first; a tampered file shows exit-style `FLEET_E_AUDIT`.
- Hash formula caption: `SHA256(prev_hash|seq|action|actor|signer|subject|height|time)`.

### 4.4 Lifecycle timeline

Source: audit entries in seq order; Mode B evidence from `run.json`.

- One row per entry: seq, action, actor (`actor_account`), signer
  (`signer_pk` — public), subject, block, tx hash link.
- Mode B rows mark confirmations 1 and 2; the executed predecessor row is
  highlighted. The one-confirmation no-op is shown as such.
- Refusals render as red rows carrying the exact refusal text
  (`controller is frozen`, `active admin required`, …).

### 4.5 Evidence & claims panel

- Table of `CLAIMS.md` rows F-001…F-028 with status chip, evidence path, and
  date. Filter by mode (A / B / shared).
- Each row's tx hash links to `https://testnet.nearblocks.io/txns/<hash>`.
- Missing or unrun evidence renders as an amber `NOT RUN` — the draft never
  invents a hash.

### 4.6 Mode B administration panel

- Shows the parent/multisig account, two account members, `2-of-2`, and code
  hash `G3GUfe8ZJ2RLe2XphKiKA7YXB4iyjBjUK8knd6T8X1jC`.
- Request viewer: request id, confirmations, status (`pending` / `executed`).
- A direct `freeze` attempt row shows the `active admin required` refusal.
- Scope caption, verbatim in meaning: both owners were operated by the same
  test harness; this panel does not claim independent custody.

### 4.7 Error states

| State | Render |
| --- | --- |
| `FLEET_E_MAINNET` | full-width danger banner; all panels dimmed; no retry loop |
| `FLEET_E_RPC` | amber banner with retry; last good block shown as stale |
| `FLEET_E_AUDIT` | red chip naming the failing seq; export blocked |
| `FLEET_E_REJECTED` | red row with refusal text + tx hash |
| Method 501 / scaffold | caption: read-only API exposes `/health` only in v0.3 |

---

## 5. Information architecture

Single page, five panels, anchored navigation:

```
Inventory | Audit & integrity | Timeline | Mode B | Evidence & claims
```

- Deep links: `#inventory`, `#audit`, `#timeline`, `#mode-b`, `#claims`.
- Identity switcher: text input for account ID (testnet only; rejected input
  shows the mainnet guard). No wallet button.
- Estimated first paint: static shell first, panels fill from RPC. No panel
  hides behind a control.

---

## 6. Motion and interaction

- No animation beyond opacity 120 ms on panel fill. No autoplay, no parallax.
- Polling is manual refresh + stale chip; no invisible timers in the draft.
- Keyboard: `1–5` jump to panels, `r` refresh current account, `?` help.
  Focus ring 2 px `--link` on every interactive element.

---

## 7. Accessibility and recording constraints

- All status is conveyed by text + icon, never color alone.
- Tables are semantic tables with captions; tx hashes are real links.
- 1920×1080 recording fit: header + inventory visible without scroll.
- No private key, seed phrase, signer path, or wallet UI appears, even as a
  mock.
- `web/` ships with `<meta name="robots" content="noindex">` until the human
  approves a public URL.

---

## 8. Explicitly deferred

- Wallet-signed writes, hosted demo URL, paymaster/relayer display.
- Light mode, charts, multi-account fleet graph (Mode B isolation is a table, not a graph).
- i18n. All shipped strings are English and ASCII-safe except the `→`/`≈`/`·` glyphs above.

---

## 9. Approval gate

1. Human reviews this draft (no Figma, no code).
2. Human approves or amends the design system.
3. Draft screens are drawn from this system.
4. Human approves the draft screens.
5. Only then, code generation and demo recording.

**Do not confuse this draft with a working UI.** The live product today is the
controller, SDK, and CLI; `web/index.html` remains a static placeholder.
