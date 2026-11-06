# X post — draft for human approval

**Status: DRAFT. Not posted. Not scheduled. No account was created or claimed.**
The human edits, approves, and posts from their own account.

**Date:** 2026-11-06 UTC.
**Why this draft exists:** the live `HACKATHON.md` (re-fetched 2026-11-06)
requires the demo post to say the project was built at NEAR HACKATHON, to tag
`@NEARProtocol` and `#NEARHackathon`, and to carry the demo video or
screenshots. The same document now gives explicit guidance on the post, and
this draft follows it:

1. *Lead with the user problem.* The first line must make sense to someone
   who has never heard of FLEET.
2. *Show one complete moment.* From a real action to a visible result. No
   long intro, no architecture slides, no setup.
3. *Explain NEAR's role concretely.* Not "powered by NEAR".
4. *Give people a next step.* Link the demo and the public repository, and ask
   a genuine question.

**Before posting, the human must:** attach the demo video (or the four
screenshots in `design/screenshots/`), add the repository URL **after** the
repository is public, and confirm the wording below against `CLAIMS.md`.

---

## Post A — the single post (267 characters)

> One compromised NEAR agent account? FLEET freezes it in one admin
> transaction and revokes its keys by tag, using NEAR native access keys. The
> audit chain verifies on-chain and off-chain. Mode A is not non-custodial.
> Testnet only. Built at #NEARHackathon @NEARProtocol

**Character count:** 267. Fits one post. The repository URL goes in the first
reply, or use Post A-short.

## Post A-short — the single post with the repository URL inline (244 characters)

> One compromised NEAR agent account? FLEET freezes it in one admin
> transaction and revokes its keys by tag, using NEAR native access keys. The
> audit chain verifies on-chain. Mode A is not non-custodial. Testnet only.
> #NEARHackathon @NEARProtocol

**Character count:** 244. With the URL appended (1 newline + 23 characters as
X shortens it to `t.co/…`) = **268**, inside the limit.

---

## Post B — what NEAR specifically enables (272 characters)

Use as the first reply. This is the "explain NEAR's role concretely" reply.

> What NEAR gave us: the account's own access-key list. An operator is a
> FunctionCall key with a method ACL, so freezing is one admin transaction the
> chain enforces — no separate custody contract. A revoked key stops working
> at the protocol level. #NEARHackathon @NEARProtocol

## Post C — the complete moment, and a genuine question (two posts)

**C1 (181 characters):**

> We built FLEET at NEAR HACKATHON: a native key-lifecycle control plane for a
> fleet of agent accounts. One transaction freezes an agent; a tag-based
> revoke offboards a group of keys.

**C2 (162 characters):**

> Which would hurt more in production: freezing an agent in one transaction, or
> auditing who did it later? Demo and repo in the thread.
> #NEARHackathon @NEARProtocol

---

## Optional replies (after the main post)

Reply 1 — the evidence (**259 characters**):

> Every claim maps to a row in CLAIMS.md and to a test or a public testnet tx
> hash. 84 Rust tests, 41 TypeScript tests, 7/7 near-workspaces integration
> tests, 248/252 viable mutants caught, and a clean-session fresh clone that
> reproduces the deployed wasm hash.

Reply 2 — the measured latency (**split into two posts**):

> Measured on NEAR testnet, 20 runs per path:
>
> Mode A freeze (single admin transaction) — optimistic p50 5,567 ms / p95
> 13,227 ms; final p50 13,251 ms / p95 24,753 ms.
>
> Mode B freeze (2-of-2 multisig, 3 transactions) — optimistic p50 10,038 ms /
> p95 17,105 ms; final p50 13,682 ms, p95 32,946 ms.
>
> Submit-to-state, polling included. Measurements, not an SLA.
>
> #NEARHackathon @NEARProtocol

Reply 3 — the concurrency measurement, stated exactly (**246 characters**):

> The 12-call, 3-agent scenario was replayed 50 times on testnet: 572 of 600
> calls completed (95.33%). 560 succeeded first try, 12 after one retry, 28
> failed after three attempts — all public-RPC rate-limit or network errors,
> not policy rejections.

Reply 4 — the limits, before a judge asks (**243 characters**):

> What this is not: not mainnet, not audited, not non-custodial in Mode A.
> Mode B reduces single-admin-key trust but is not independently custodied in
> this evidence. A freeze blocks new executions; it does not cancel a receipt
> already in flight.

Reply 5 — the ask (**add the repository URL here**):

> Repo and demo: <REPO_URL> · <DEMO_URL>

---

## Compliance checklist

| Rule | How this draft satisfies it |
| --- | --- |
| Must tag `@NEARProtocol` | Present in Posts A, A-short, B, C2 and every reply |
| Must tag `#NEARHackathon` | Present in Posts A, A-short, B, C2 and Reply 2 |
| Must say it was built at NEAR HACKATHON | "Built at #NEARHackathon" in Post A; "We built FLEET at NEAR HACKATHON" in Post C1 |
| Must carry the demo video or screenshots | Human attaches; `design/screenshots/` holds the four recaptured screens |
| Lead with the user problem | Post A opens on "One compromised NEAR agent account?" |
| Show one complete moment | Post C1/C2: freeze → revoke → audit, in one thread |
| Explain NEAR's role concretely | Post B names the native access-key list, the FunctionCall method ACL, and protocol-level revocation |
| Give a next step and ask a genuine question | Post C2 asks the freeze-vs-audit question; Reply 5 carries the links |
| No "non-custodial" without the Mode A qualifier | "Mode A is not non-custodial"; Reply 4 adds "not independently custodied in this evidence" for Mode B |
| No "production-ready", "audited", "mainnet-ready", "trustless" | None appear; "Testnet only" and "not audited" are stated instead |
| No "20 parallel calls" / "16 parallel calls" | The only figure quoted is **12** concurrent calls across 3 agents, in Reply 3, with the measured 572/600 rate |
| No "top-up works", "two-step rotation works" | Neither appears |
| No "freeze cancels in-flight receipts" | Reply 4 states the opposite explicitly |
| Never "seconds" for Mode B | Every latency figure is in milliseconds |
| Every latency figure exists in `CLAIMS.md` | Mode A freeze → F-029; Mode B freeze → F-031; both quoted verbatim |
| No repository URL before publication | Left as `<REPO_URL>`; the human fills it in only after the repo is public |

## What has not been done

- No X account was created, claimed, or registered.
- No handle was reserved for the product (see `docs/NAME_OPTIONS.md`).
- Nothing was posted, scheduled, drafted into X, or sent to anyone.
- No hackathon submission was made.
