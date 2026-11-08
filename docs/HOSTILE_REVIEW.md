# Keyhalt: hostile review (v0.3, 2026-11-07)

**Rule:** every weakness gets a severity and either a **fix** (with the commit)
or a **written justification** (why it is accepted). Nothing hides. This
document does not soften a finding to make a submission pass.

**Reviewer stance:** (1) a screening agent with no context that clones the
repo and tries to verify everything; (2) a sceptical security judge who knows
NEAR-key products and the hard-custody competitors.

**Tree under review:** `9c68961` (and `ba1b65b`).

---

## A. Screening-agent pass (clone → README → verify)

| Step | Result |
| --- | --- |
| Clone, read README top 30 | **Was missing the first command.** Fixed 2026-11-07 (`README.md` adds the problem line and the `make setup` / `make verify` / `make console` start block). |
| `make setup` style dep install | Runs clean (`npm ci` + build) in a fresh clone; console builds. |
| `npm test` | 51/51 pass in the fresh clone. |
| `node scripts/check-claims.mjs` | `CLAIMS 41/41 verified (41 rows)`: exits 0. |
| `./scripts/secret-scan.sh` | `SECRET SCAN: OK`. |
| `git ls-files` for key material | none (see §D.1). |
| Relative links in README | all resolve. |
| Cargo fmt/clippy/tests + wasm hash | Evidenced by fresh-clone PASS at the same code tree (`ba1b65b`); the delta to `9c68961` is `web/README.md` wording only. |
| Every referenced `F-NNN` exists in CLAIMS.md | validator exit 0 on the three surfaces it checks; manual sweep of console/X draft/demo-script wording rules found no orphaned claim (see §D.4). |

## B. Skeptical security judge pass

### B.1 What would make me reject Keyhalt, judged line by line

**B1-1: "The console lies about chain state if an RPC does." (Medium, accepted with
itigation documented)**
Every read: including `verify_audit`: travels the same RPC trust domain. A
malicious or stale endpoint can render a pass/fail that is false. The console
is honest about this in `docs/THREAT_MODEL.md` §4/§10 (RPC is P-4, untrusted)
and the UI says "read-only · no key stored" and shows the finalized block.
*Mitigation, not solution:* failover across four providers + pacing + 120 s
cap + stale banner + last-good block; every number is either live from chain
or counted from `CLAIMS.md`.* A cryptographic fix (client-side proof
verification of every RPC response) is out of scope for the window and is
recorded as accepted here, not hidden.

**B1-2: "Mode A is custodial; calling Keyhalt anything else is dishonest."
(Info: agree)** The README and this document say Mode A is **not
non-custodial**. Mode B (2-of-2 multisig) is still not trustless, not
independently custodied in this evidence, and unaudited: and it is
**documented** this way on the README screen and in the X draft. No claim
elsewhere contradicts it.

**B1-3: "A hostile judge spots a hard-custody competitor and asks what is new."
(Info: one-sentence answer, already in `docs/RED_TEAM.md` RT-02)** Keyhalt
changes no custody: it governs the **native FunctionCall keys** on accounts
the team already owns; freeze revokes execution authority in one
transaction without moving funds. Enclave-based competitors (TDX computing,
multi-chain wallets, MPC-backed keys) target agent execution; Keyhalt targets
the account’s native key lifecycle and the freeze stop switch.
They are complementary, not substitutes. **No repository or name is copied or
traded on.** No wording in this repo names a competitor negatively.

**B1-4: "Unknown hard-custody project?" (Info: unverifiable; do not
fabricate)** A hard-custody project the judge references cannot be found by
its given name as of 2026-11-07. It is treated as belonging to the
enclave/MPC vault class that the known comparator exemplifies. The honest answer to a judge is: position against the
class on the mechanism (native keys, one-tx freeze, tag revoke, hash-chained
audit), never against a specific unseen competitor. If the judge has its URL,
the comparison tightens; nothing in this review changes if it does not.

**B1-5: "Anyone can write to the watch file and waste archival RPC budget."
(Low, fixed by bound)** `tmp/console-watch.json` is base58-validated,
base58-length-checked, and capped at 60 entries; fetches are paced and
cool down. No execution follows from a receipt. Accepted.

**B1-6: "The console binds to the network if misconfigured." (Low, fixed by
default + loud escape hatch)** The server refuses non-loopback binds unless
`KEYHALT_CONSOLE_ALLOW_REMOTE=1` is set; the README never asks for that. The
SSE stream is intentionally unauthenticated (the data is public), so binding
externally would also expose block polling to arbitrary clients: the env
guard exists precisely so setting it is a conscious decision. Recorded in
`docs/THREAT_MODEL.md` §10.

**B1-7: "Audit chain is unbounded; a compromised operator bloats state."
(Low, accepted and documented)** Every control execute writes one audit entry;
`max_operators` bounds the operator set, not the log. Griefing via execute is
bounded by the operator's allowance and gas cost; the chain stores bytes, not
state machine complexity. Growth cost is linear and priced. Documented in
`docs/TEST_PLAN.md` / `CLAIMS.md` F-027 (storage per entry) and
`docs/THREAT_MODEL.md` §9. Not a blocker.

**B1-8: "Who can freeze/unfreeze in Mode B today?" (Medium, real gap:
closed)** The product path now exists: `keyhalt admin request freeze|unfreeze`,
`keyhalt admin confirm`, `keyhalt admin status`, verified on testnet 2026-11-07
(F-038…F-040). One confirmation is recorded without effect; the second
executes; a non-member is refused before any broadcast. The remaining honesty
line: the two owner keys are still operated by the same harness, and fresh
explicit out-of-band approval for production use remains out of scope.

**B1-9: "The console is an XSS-and-exfil gift if someone embeds it." (Low,
mitigated)** CSP is `default-src 'self'` with `script-src 'self'`, no inline
script/style/handlers; all rendered chain data passes `esc()`; same-origin
only; `noindex`; the page ships no analytics. Embedding exfil would need a
control plane change outside this repo. Accepted: not "safe," bounded.

**B1-10: "Frozen in-flight receipts" (habit danger).** Keyhalt never says a
freeze cancels in-flight receipts (it can't; receipts are scheduled before
`paused` is read by the admission check). Docs and the X draft state the
opposite explicitly. The freeze blocks **new** `execute` calls.

**B1-11: "Testnet-only claim is narrow." (Info)** This is recorded as a
product decision, not an apology: the event is testnet; mainnet guards are
enforced in code (`ensureTestnet`, `KEYHALT_E_MAINNET`), enforced in CI
(`fresh-clone-test` refuses a mainnet RPC URL), and the console would refuse
mainnet RPC URLs too.

**B1-12: "No external audit." (Info, by policy)** Nothing claims one. The
README, X draft, DEMO_SCRIPT and CLAIMS say `Unaudited`. The only time
trouble arises is if a screenshot or the hosted console were labelled
production: recorded as forbidden in the submission checklist (Item 6) and
the demo gate.

### B.2 Source spot checks performed

- Controller: no `#[payable]` anywhere; admin-only methods gate predecessor ≠
  current account correctly (`lib.rs:587`); Mode B predecessor path present.
- SDK/CLI: no mainnet URL in code paths; exit-code map exists in the SDK
  (`keyhaltExitCode`); refuse-mainnet used in the negative controls of both
  test suites.
- Console: every write method → 405; unknown account → 404; audit export
  filename derived only from the validated config account list; watch file
  validated and bounded; claims footer reads the file; no signer in memory.
- Secret scan across the tree **and** across git history (Item 7 runs it):
  the only key-shaped strings are the documented public keys and test
  fixtures (`sdk.test.mjs:250`, `cli.test.mjs:86`), all `ed25519:1111…`
  placeholders.

## C. Top-30-lines README verdict

**Before (2026-11-07 morning):** said what Keyhalt is, the track, testnet-only,
unaudited, Mode A honesty: **but not the problem and not the first command.**
**After:** the top 30 now carry a one-line problem statement and the
`make setup` / `make verify` / `make console` start block. The full check in
this section was re-run after the fix.

## D. Claim coverage outside the three validator surfaces

1. **Git sight for key material across history:** Item 7 (`git log -p` scan).
2. **Console on-screen numbers:** from chain or CLAIMS only (footer 41/41,
   snapshot block live, agent/audit numbers live). Verified visually in
   `evidence/console-v03/screenshots/` against `make claims`.
3. **X draft / posts:** wording rules checked line by line in
   `docs/X_POST_DRAFT.md`: no prohibited string, latency quoted in ms with
   F-029..F-032, "12/600, 95.33%" only for the concurrency figure.
4. **Demo script:** reduces to the rehearsed steps; every show maps to a
   `VERIFIED` row (`docs/DEMO_SCRIPT.md`, updated 2026-11-07 to point at the
   built console and `docs/CONSOLE_SHOT_LIST.md`).
5. **The hostile review itself:** this file introduces no product claim and no
   new `VERIFIED` row; it fails safe.

## E. Fixes committed in this pass

| Finding | Severity | Fix |
| --- | --- | --- |
| README top 30 missing first command | Medium | `README.md` start block |
| THREAT_MODEL said "console not built" | Medium | header revised; new §10 console section |
| SPEC_v0.3 said "console not implemented" | Low | revised to reference `INTERFACES.md` §4.2 |
| RED_TEAM RT-04 described 503 state instead of built behaviour | Low | revised to last-good + stale + failover behaviour |

## F. Residual risks NOT fixed (accepted, with reasons)

| Risk | Why accepted |
| --- | --- |
| RPC truthfulness (B1-1) | No cryptographic proof exists in v0.3 scope; accepted with failover and honesty labels; any full node can re-verify |
| Mode B same-harness custody | Both owner keys operated by the same harness; 2-of-2 reduces single-key risk but is not independently custodied: unaudited, unreviewed |
| Free public RPC rate limits | Provider failover + pacing + bounded retry; a full outage degrades the UI to last-good + stale, never to invented data |
| Unaudited controller | By policy; no claim of audit anywhere; submission must repeat this |

**Sign-off for the screening-agent pass:** reproduction of the documented
flow passes at `9c68961`.
**Sign-off for the judge pass:** the positioning survives; one real product
gap (Mode B CLI/SDK write path) is owned by Item 2 and documented, not waved
away.
