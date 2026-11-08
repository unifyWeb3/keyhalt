# Live research log — 2026-11-08 UTC

**Scope requested:** re-fetch `https://nearhackathon.com/HACKATHON.md`;
diff against the saved copy; check the two referenced-track competitors
(nothing registered, nothing contacted); check NEAR release notes for gas keys,
function-call keys, and sub-account effects; log results. No accounts were
created, no one was contacted, no post or submission was made.

## 1. HACKATHON.md — live re-fetch and diff

Fetched `https://nearhackathon.com/HACKATHON.md` (22,199 bytes) and diffed
against the saved fetch of 2026-10-27 (`/tmp/opencode/HACKATHON_2026-10-27.md`,
12,588 bytes). The 2026-11-06 copy was not preserved; its content is included
in this diff implicitly. Material changes:

- **New “request changes” flow** — submissions cannot be edited after sending;
  the human requests changes at `https://nearhackathon.com/request-changes`,
  answered by hand, optionally changing several fields. Submitting again is
  rejected with 409.
- **X post requirements** — must tag `@NEARProtocol` and `#NEARHackathon`
  (our draft does).
- **Project/email rules** — projectName no longer unique; **email now limited
  to at most 2 submissions** (independent projects only, per Q-015).
- **409 semantics** — the error is about the repository already submitted, or
  the email limit; repository links replace email as the uniqueness anchor for
  the 1-per-repo rule.
- **Tracks** — table now includes per-track example prompts and explicit
  "Hints ... not requirements" Q-011 wording; `security` track = "AI Security
  & Defense", hint: AGENT SECURITY, FUNCTION CALL KEYS, TEE ATTESTATION.
- **Q-017** — "Claude Code and Codex screen every project; humans decide;
  reproducibility check + feature verification + preliminary score. A low AI
  score alone cannot reject." This is exactly what `docs/HOSTILE_REVIEW.md`
  and `make verify` are built for.
- **Q-012** — "Local-only demo OK — public repo + reproducible README must do;
  hosted demo is a plus through 2026-11-18."
- **Submission API contract** — unchanged in shape from before; our draft in
  `docs/SUBMISSION_PACKAGE.md` was written against this same contract.
- **Q-006** — `1Click` JWT never required for tracks; 0.2% fee without it.
- Name decisions still the human's call — agent never registers anything.

**Takeaway:** the previous `docs/SUBMISSION_PACKAGE.md` is consistent with the
current rules (tracks `["security"]`, consent `false`, 20–2000 char idea =
734 correct, requestId stored). Nothing was sent.

## 2. OutLayer

`github.com/out-layer/outlayer` re-checked. Status: **active and public**;
14 stars, 7 forks, 744 commits, TDX attestation, Vault contract, multi-chain
wallets, part of the HACKATHON.md public partner table. Key qualitative facts:

- Coordinator is private; the full stack cannot be built from the repository.
- Stage caveats in its own `NON_CUSTODIAL.md`: governance still runs on single
  keys held by OutLayer; in its current form it is not non-custodial either.
- Honest positioning vs FLEET: FLEET governs the **native FunctionCall keys**
  on accounts the team already owns, one at a time, freezing one agent without
  moving assets or changing custody architecture. No overlap with TEE-enclave
  custody for execution; both are agents-on-NEAR answers at different layers.

No engagement: not contacted, not starred/followed, not referenced in any
public material, name absent from the repository (removed per the literal
grep rule in this repo's pre-publication audit).

## 3. "SpactVault" (referenced name)

No public project, organization, repository, account, or press coverage found
under any spelling of this name as of 2026-11-07/08. It is treated as the
hard-custody class: enclave/MPC vaults for agent keys. **This is a genuine
gap in our knowledge, not evidence of anything.** If the human can supply the
correct URL, the comparison can be re-run; until then no claim references it,
and the judge-facing answer is worked only against the known class.

## 4. NEAR release notes affecting keys / sub-accounts (scanner + docs)

- **NEP-611 Gas keys** (GA nearcore 2.13.0, protocol version 85; mainnet
  observed at protocol 86): new access-key types `GasKeyFullAccess` /
  `GasKeyFunctionCall` carrying a prepaid balance and up to 1024 nonce lanes.
  **Impact on FLEET:** the controller stores only account-controlled native
  FunctionCall keys with a receiver/method ACL; no gas key semantics. The
  inventory path decodes `FullAccess` and `FunctionCall` permissions only, so
  any gas key surfacing in a key list is rendered as `Unknown` rather than
  mislabelled. Honest gap: (a) no evidence was gathered against GasKey-typed
  permission lists; (b) the frozen controller does not whitelist/reject them
  and its pause/ACL logic is unaffected at the protocol level
  (GasKeyFunctionCall ≈ FunctionCall). Recorded; not claimed.
- **NEP-642 account-creation cost increase**: ~0.0008 → ~0.007 NEAR per
  sub-account (protocol-level, gas-funded with refund). **Impact:** provisioning
  cost is unchanged to FLEET users (the parent pays, gas burned; mode A local
  evidence paid full rental anyway). No claim affected.
- **HSP-027 gas burn change**: 30% contract-reward gas scrapping is
  approved but **not on mainnet yet**. No effect on testnet evidence.
- **TLAs / recovery keys (Sep 21)**: new account namespace types; irrelevant
  to FLEET's named sub-account design; no claim affected.

## 5. What changed for the submission package

- `idea` draft in `docs/SUBMISSION_PACKAGE.md` (734 chars) stands as-is.
- `$NEAR` payout: recorded as **mainnet** account (as the contract requires),
  human-supplied only.
- `demoUrl`: the X post tags must cover `@NEARProtocol` and `#NEARHackathon`
  — already the shape of `docs/X_POST_DRAFT.md`.

**Nothing public happened as part of this research.** No account, handle,
registration, submission, or public push — all gated on the human.
