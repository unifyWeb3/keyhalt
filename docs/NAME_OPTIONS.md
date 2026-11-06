# Product-name options (read-only clash check)

**Status:** three options prepared for the human's decision. **Nothing was
registered, reserved, claimed, or created.** Every check below is a read-only
lookup.

**Checked on:** 2026-11-06 UTC.

## How the check was done

| Axis | Method | Endpoint |
| --- | --- | --- |
| GitHub repository name | read-only search | `GET https://api.github.com/search/repositories?q=<name>+in:name` |
| GitHub account / org handle | read-only lookup | `GET https://api.github.com/users/<name>` |
| Public X handle | read-only profile probe | `GET https://publish.twitter.com/oembed?url=https://twitter.com/<name>` — HTTP 200 = the profile exists, HTTP 404 = it does not |
| NEAR root account | read-only explorer lookup | `GET https://api.nearblocks.io/v1/account/<name>.near` — an existing account returns `account_id` and `amount`; a free name returns only `block_height`/`block_hash` |

The X and NEAR probes were calibrated against controls in the same run:
`twitter.com/NEARProtocol` returned 200 and `twitter.com/zzzfleetcheck9x8q2`
returned 404; `near.near` returned a full account record and
`zzzfleetnamecheck999.near` returned none. No mainnet transaction was made and
no funds were involved — the NEAR check is a read-only explorer query, and the
X check is a public profile probe.

A general web search for each name alongside NEAR found no NEAR-ecosystem
project using them.

## The three options

### Option A — **Fleetgate**

> *The gate you close on a fleet.*

| Axis | Result |
| --- | --- |
| GitHub repo name | 7 unrelated repos use the word (`mhmood88hz-cloud/Fleetgate`, `R1cky04/FleetGate`, …), all with 0 stars and none in the NEAR space. The repo name **under the `unifyWeb3` org is free** (`GET /repos/unifyWeb3/fleetgate` → HTTP 404). |
| GitHub handle | **`github.com/fleetgate` is TAKEN** — it is an existing Organization. A dedicated org under this name is not available; use the existing `unifyWeb3` org or a different handle. |
| Public X handle | **Free.** `twitter.com/fleetgate` → HTTP 404. |
| NEAR root account | **Free.** `fleetgate.near` has no account record. |
| NEAR ecosystem | No NEAR project found under this name. |

**For:** strongest product fit — a freeze is literally closing a gate on the
fleet, and "gate" reads as access control rather than custody, which matches
the project's honest positioning.
**Against:** the GitHub org handle is taken, so the org would have to be
`unifyWeb3` or something else.

### Option B — **Keyhalt**

> *Halt a key without touching the account.*

| Axis | Result |
| --- | --- |
| GitHub repo name | **Free.** 0 repositories match the name. |
| GitHub handle | **Free.** `github.com/keyhalt` → HTTP 404. 0 matching users or organizations. |
| Public X handle | **Free.** `twitter.com/keyhalt` → HTTP 404. |
| NEAR root account | **Free.** `keyhalt.near` has no account record. |
| NEAR ecosystem | No NEAR project found under this name. |

**For:** cleanest of the three — no clash on any axis, so a dedicated GitHub
org and a matching X handle are both possible. The name says exactly what
the headline control does: stop the key from doing anything.
**Against:** narrower than the product. It covers the freeze and the revoke
path, but not the audit chain or the two admin modes, so it undersells the
scope.

### Option C — **Squadfence**

> *A fence around the squad of agent accounts.*

| Axis | Result |
| --- | --- |
| GitHub repo name | **Free.** 0 repositories match the name. |
| GitHub handle | **Free.** `github.com/squadfence` → HTTP 404. 0 matching users or organizations. |
| Public X handle | **Free.** `twitter.com/squadfence` → HTTP 404. |
| NEAR root account | **Free.** `squadfence.near` has no account record. |
| NEAR ecosystem | No NEAR project found under this name. |

**For:** clean on all three axes and the strongest fit for a **security**-track
submission — "fence" signals a security boundary, and "squad" signals the
multi-agent fleet that FLEET governs.
**Against:** "squad" is a human/military metaphor; some readers may expect a
consumer or gaming product from it. It says nothing about NEAR or about keys.

## Recommendation

**Option A, Fleetgate**, with the GitHub repository under the existing
`unifyWeb3` org (`unifyWeb3/fleetgate`) rather than a new org.

Reasons: it is the only one of the three whose name describes the product's
central mechanism (a gate you close) rather than a metaphor borrowed from
another domain; it is free on X and in the NEAR namespace; and the one clash —
the `github.com/fleetgate` organization handle — is avoidable by hosting under
the org the team already controls. If the human wants a dedicated org, then
**Option C, Squadfence**, is the pick, because it and Option B are both free
as an org name.

**If the human prefers the safest possible choice with zero caveats**, that is
**Option B, Keyhalt**.

## Rejected names, and why

| Name | Reason |
| --- | --- |
| `agentward` | Direct clash: `agentward-ai/agentward` is "Open-source permission control plane for AI agents" (19 stars) and `FIND-Lab/AgentWard` has 65 stars. Same product category. |
| `keyward` | Clash: `gateway-of-last-resort/keyward` (61 stars) manages SSH keys; `@keyward` is a taken X handle. |
| `keyline` | Heavy clash: 170 matching repositories, `@keyline` taken on X, `keyline-icons` has 189 stars. |
| `keylock`, `keyguard` | Heavy clash (256 and 288 matching repositories), and `keylock.near` / `keyguard.near` are taken NEAR root accounts. |
| `nearhold` | `nearhold.near` is an existing NEAR root account. The word "hold" also implies custody, which this product explicitly is not. |
| `holdfast` | `holdfast.near` is an existing NEAR root account; 235 matching repositories. |
| `squadlock` | `@SquadLock` is a taken X handle and 6 GitHub users match. |
| `squadgate` | Taken on X (`twitter.com/squadgate` → HTTP 200). |
| `fleetfence`, `neardeck`, `fleetward`, `fleetstop` | Free on GitHub but already taken on X. |
| `keyfence`, `agentgate`, `holdfast`, `fleetwarden`, `fleetguard` | Heavily used elsewhere; `agentgate` alone has 583 matching repositories. |

## What happens next

Nothing, until the human picks one. If a name is chosen, the registration
steps — creating the GitHub org or repository, claiming the X handle, and
claiming the NEAR root account — are **separate public actions that need the
human's explicit approval**, and each is a one-shot operation that cannot be
undone cleanly. The NEAR root account in particular needs a funded account to
create, which is a mainnet action and is therefore outside the current
testnet-only scope.
