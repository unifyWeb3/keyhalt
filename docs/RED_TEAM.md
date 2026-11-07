# FLEET red-team cases

**Status:** v0.3 — response plan. Many covering tests are now green and listed in
`docs/TEST_PLAN.md`; Mode B, latency, cross-agent isolation, and the console are
still open. Where a test is not green, the response is to downgrade or remove the
claim, not to argue.
**Date:** 2026-11-03 UTC.
**Rule:** evidence beats rhetoric. If the evidence is missing, say “not claimed.”

---

## 1. Product and evidence

### RT-01 — The screener cannot reproduce a claim

**Scenario:** A judge or automated screener clones the repo, runs the documented
commands, and a `CLAIMS.md` row does not reproduce (wrong account, missing key,
network assumption, stale tx).
**Why it hurts:** The event explicitly screens for reproducibility; a single
unreproducible headline claim can invalidate the submission.
**Response:** The claim is marked `UNKNOWN`, removed from the README/demo, and
the row is corrected with a dated note. The fresh-clone test must pass before the
submission tag. Transactions are re-checked by a read-only script, not only by a
screenshot.
**Evidence/test:** T-SC-01, T-SC-05, `scripts/fresh-clone-test.sh`.
**Owner/date:** builder, before every release candidate; final on Nov 13.

### RT-02 — A judge says “OutLayer does this”

**Scenario:** The judge compares FLEET to OutLayer and asks what is new.
**Why it hurts:** Originality is a judging criterion; a “me-too custody app”
answer loses.
**Response:** One defensible sentence: “FLEET controls the **native NEAR access
keys** on accounts the team already owns; it is not a custody contract and does
not move assets into a new trust boundary.” Show the native-key inventory and
the exact tag revoke. Do not claim OutLayer is bad or insecure.
**Evidence/test:** T-I-09 (inventory vs native keys), T-I-08 (tag revoke);
`research/FLEET_EDGE.md` in the separate research workspace.
**Owner/date:** builder, in README and demo; Nov 13.

### RT-03 — The admin design is called custodial

**Scenario:** A reviewer says Mode A is just a team-held key, so FLEET is
custodial.
**Why it hurts:** It attacks the trust claim; overclaiming “non-custodial” would
be worse.
**Response:** Agree with the label: “Mode A is **not non-custodial**; the team
holds the admin and recovery keys. Mode B replaces one admin key with a 2-of-2
multisig, which is still not trustless and is unaudited.” Show the trust table.
**Evidence/test:** README trust table, `docs/THREAT_MODEL.md` §5, T-I-06.
**Owner/date:** builder, README and demo; Nov 13.

### RT-04 — Testnet RPC outage during judging

**Scenario:** The public testnet RPC is down, rate-limits, or returns stale data
while a judge runs the demo or the hosted console.
**Why it hurts:** The demo appears broken; claims cannot be re-checked live.
**Response:** The repo contains a recorded demo, saved tx hashes, and a
read-only console that shows the last good block with a stale banner while
failing over across providers (paced, bounded at 120 s of retries, never
synthesizes state), and renders an explicit error box only when no good read
exists.
The verifier retries and never invents state. A local sandbox path is documented
where possible. The demo script has a labelled sandbox fallback.
**Evidence/test:** T-S-003, T-I-09, `scripts/rpc-check.mjs`; hosted console
monitoring.
**Owner/date:** builder, Nov 9–12.

### RT-05 — A demo step relies on an untested claim

**Scenario:** The 90-second video shows a capability that has no `VERIFIED` row
or no test.
**Why it hurts:** It violates the event evidence standard and the project’s own
rule; one fake step discredits the rest.
**Response:** Every step is gated by `T-E-07`. If a step is not green, cut it or
label it “not claimed.” The claims panel on screen lists exactly what is
verified, what is hypothesis, and what is not claimed.
**Evidence/test:** T-E-07, `docs/DEMO_SCRIPT.md` pre-recording checklist.
**Owner/date:** builder, Nov 11–12.

### RT-06 — Q-001 goes against us

**Scenario:** The organizers say code must be written after 2026-11-01, or that
the pre-existing v0.2 research code is disallowed.
**Why it hurts:** The baseline tag is dated 2026-11-03; product code starts after
it. If the rule is stricter, even the scaffold could be questioned.
**Response:** The submission repository is new and contains no v0.2 controller or
multisig code. The baseline tag contains only scaffold/docs/harness. Product code
is written after the tag, and the README diff shows it. The actual tag date
(2026-11-03) is disclosed; it is not backdated to 2026-10-31. If the organizers
reject the baseline, the fallback is to treat the whole repository as
post-2026-11-01 work and show the commit timestamps; no claim of pre-existing
product code is made.
**Evidence/test:** `docs/PROVENANCE.md`, git history, tag message.
**Owner/date:** human asks organizers Nov 3–4; builder updates README if needed.

### RT-07 — “You claimed 20 lanes”

**Scenario:** A judge remembers the earlier 20-parallel-call target and says the
demo shows fewer.
**Why it hurts:** It looks like a bait-and-switch.
**Response:** State the verified number: **12 concurrent calls across 3 agents ×
4 lanes** in v0.2 research; the v0.3 target must be re-measured. Never say “20
parallel calls” or “16 lanes.” Update `CLAIMS.md` with the actual v0.3 number.
**Evidence/test:** T-E-02, T-I-12, S5 evidence in the research workspace.
**Owner/date:** builder, Nov 9–11.

### RT-08 — “Freeze cancels in-flight work”

**Scenario:** A judge sees a call land after the freeze and says the freeze
failed.
**Why it hurts:** The freeze claim is central; overclaiming cancellation would be
false.
**Response:** Show the measured `paused=true` time and the next-execute refusal;
state plainly that a receipt already accepted by the chain can still land. The
demo says “blocks new executes, does not cancel in-flight receipts.” Report the
race test result separately.
**Evidence/test:** T-L-01, T-L-02, T-I-05.
**Owner/date:** builder, Nov 12.

### RT-09 — Mode B multisig is unaudited / an owner key is lost

**Scenario:** A judge asks for the multisig audit, or one of the two owner keys is
lost during the demo.
**Why it hurts:** The demo default depends on `multisig2`; losing one key makes
2-of-2 stuck.
**Response:** Say “no audit statement was found; the README disclaims
guarantees.” Use throwaway testnet accounts and do not put real value in them.
Document that there is no tested recovery for a lost owner key. If the reuse
gate fails, fall back to Mode A with the “not non-custodial” label.
**Evidence/test:** T-I-06, T-R-07, Mode B reuse gate.
**Owner/date:** builder, Nov 8.

### RT-10 — Audit history is not anchored

**Scenario:** A judge says the hash chain is useless because a malicious upgrade
can rewrite it.
**Why it hurts:** It attacks the audit claim.
**Response:** Agree: “The export is tamper-evident only with a trusted head; v0.3
does not anchor the head on-chain.” Show the verifier and the tamper test. An
optional `anchor_audit` is a post-core item, not a demo claim.
**Evidence/test:** T-I-10, T-I-11; `docs/SPEC_v0.3.md` §6.
**Owner/date:** builder, Nov 9.

---

## 2. Security and operations

### RT-11 — The admin key leaks

**Scenario:** The Mode A admin key is stolen; an attacker freezes or grants a
scoped key.
**Why it hurts:** The attacker can deny service and add keys within the
allowlist.
**Response:** Freeze/rotation is visible in the audit; recovery proposes a fresh
admin; operator keys can be rotated/revoked. The attacker cannot add full access,
deploy, or transfer through the controller. State the residual risk; do not claim
the design survives a leaked admin.
**Evidence/test:** T-R-06, T-I-07, TH-02.
**Owner/date:** builder, threat model; Nov 8.

### RT-12 — A compromised agent key

**Scenario:** One agent key is stolen and the attacker calls the allowlisted
method or tries admin calls.
**Why it hurts:** The agent can abuse its permitted method or spend gas.
**Response:** The key is a FunctionCall key with a fixed receiver/method; admin
calls are refused; tag revoke removes it; other agents are isolated. State that
the allowlisted method itself is outside FLEET’s boundary.
**Evidence/test:** T-I-04, T-R-01, T-R-02, T-I-08.
**Owner/date:** builder, Nov 9.

### RT-13 — Admin allowance runs out / no top-up

**Scenario:** The Mode A admin allowance is exhausted; freeze or rotation fails.
**Why it hurts:** The stop switch is unavailable.
**Response:** Mode B has no admin allowance. Mode A refreshes by rotating to a
fresh key with a configured allowance; there is no in-place top-up. The default
0.1 NEAR is `INFERRED` until T-G-02 measures the budget. Keep an emergency
recovery key funded.
**Evidence/test:** T-G-02, T-I-03, T-E-05.
**Owner/date:** builder, Nov 9.

### RT-14 — Mainnet / real funds question

**Scenario:** A judge asks whether this can be used on mainnet or with real
money.
**Why it hurts:** The event accepts testnet-only; overclaiming mainnet readiness
is unsafe and false.
**Response:** “Testnet reference implementation, unaudited, no mainnet
deployment, no real funds.” The RPC guard refuses mainnet. The payout account is
a human-created mainnet account only for the event, not part of FLEET.
**Evidence/test:** T-S-005 (mainnet refusal), README/UI disclosures.
**Owner/date:** builder, every release; human on Nov 14.

### RT-15 — Testnet is reset or accounts disappear

**Scenario:** Testnet resets, the demo accounts are gone, or the RPC returns an
unknown account during judging.
**Why it hurts:** Live reproduction fails.
**Response:** The recorded video and saved evidence remain. The fresh-clone test
creates its own throwaway accounts and does not depend on the demo accounts. A
read-only console shows the last known state. Re-run the E2E on a fresh testnet
account if possible.
**Evidence/test:** T-E-01, T-SC-01, evidence directory.
**Owner/date:** builder, Nov 12–13.

### RT-16 — Claims table mismatch

**Scenario:** The README says one thing, `CLAIMS.md` says another, or a claim has
no evidence.
**Why it hurts:** The event screens for feature verification; inconsistencies are
easy to catch.
**Response:** `scripts/check-claims.mjs` fails on a malformed row or a missing
surface reference. The README and demo are generated/checked against the table
before the tag. A claim without a test is removed, not softened.
**Evidence/test:** T-S-003, T-SC-02, T-SC-03.
**Owner/date:** builder, every commit; final Nov 13.

### RT-17 — Repository is private, unlicensed, or AI use is undisclosed

**Scenario:** The repo is still private at the deadline, has no LICENSE, or the
README omits AI assistance and reused libraries.
**Why it hurts:** It is a hard eligibility failure.
**Response:** Human makes the repo public before 2026-11-14 23:59 UTC; LICENSE is
in the baseline; README lists AI assistance, `multisig2` if reused, and all
runtime dependencies with versions/licenses. The human approves publicity.
**Evidence/test:** `LICENSE`, README §AI assistance, `docs/PROVENANCE.md`.
**Owner/date:** human, Nov 13–14; builder prepares the text.

### RT-18 — Dependency or build compromise

**Scenario:** A malicious `near-sdk`, npm package, or CI runner changes the wasm
or signs a transaction.
**Why it hurts:** The deployed contract or demo may not match the source.
**Response:** Pin versions, commit the lockfile, review dependency changes, use
a clean CI, and disclose that no supply-chain audit was performed. The baseline
has only TypeScript and the Rust scaffold; product dependencies are added
deliberately.
**Evidence/test:** T-S-005, T-D-05; lockfile review.
**Owner/date:** builder, feature freeze Nov 10.

### RT-19 — Hosted demo is down

**Scenario:** The optional hosted read-only console is unavailable during
judging.
**Why it hurts:** A hosted demo is a plus, not a requirement; a broken link looks
bad.
**Response:** The repo and recorded video are the source of truth. The console is
static/read-only, monitored, and has a status note. If it cannot stay up through
2026-11-18, remove the link rather than ship a dead one.
**Evidence/test:** Hosted console smoke test; README link check.
**Owner/date:** builder, Nov 12–18 (ideally Nov 25).

### RT-20 — Track/scope challenge

**Scenario:** A judge says FLEET claims `swarms`, `agents`, `business`, or `defi`,
or does not fit `security`.
**Why it hurts:** The event has track-specific judging; an unsupported track claim
is a credibility loss.
**Response:** The submission claims **`security` only**. Say “account key
lifecycle security on native NEAR accounts.” Do not use the words `swarms`,
`agents` as a track, `business`, or `defi`. The product definition is one line.
**Evidence/test:** README, submission JSON, claims panel.
**Owner/date:** builder, Nov 13; human on submission.

---

## 3. Response discipline

1. **Do not argue with a judge about a fact you cannot show.** Show the test or
   downgrade the claim.
2. **Do not add a new feature to answer a question during judging.** Freeze is
   the freeze.
3. **Keep a failure log.** Every failed test, rejected tx, and correction goes in
   `research/FLEET_LOG.md` / `research/BUILD_STATUS.md`; do not rewrite history.
4. **The human owns public communication.** The agent drafts, the human posts.
5. **If a claim is disproved after submission, disclose it** in the repo and to
   the organizers; do not silently edit the claim.
