# Product-name options (read-only clash check)

**Status:** three options prepared for the human's decision. **Nothing was
registered, reserved, claimed, or created.** Every check below is a read-only
lookup.

**Checked on:** 2026-11-06 UTC; re-verified 2026-11-07 UTC against live
GitHub, X and nearblocks APIs with fresh 404/301/200 controls.

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

---

## Re-verification (2026-11-07 UTC)

| Axis | Fleetgate | Keyhalt | Squadfence |
| --- | --- | --- | --- |
| GitHub repos matching name | 5, all 0 stars, none NEAR | 0 | 0 |
| GitHub account/org | **TAKEN** (HTTP 200) | free (404) | free (404) |
| `unifyWeb3/<name>` repo | free (404) | free (404) | free (404) |
| Public X handle (after `-L`) | free (404) | free (404) | free (404) |
| NEAR root account (`<name>.near`) | free (no account record) | free | free |
| NEAR ecosystem clash | none found | none found | none found |
| Trademark-looking conflict | one small unrelated UK company (FleetGate Hardware Ltd, higher education) | none found | none found; phonetic adjacency to SCADAfence (Honeywell OT security, acquired 2023) |
| X OAuth `oembed` calibration | 301→follows to 404 (free); `NEARProtocol` = 200, `zzzfleetcheck9x8` = 404 | same | same |
| Recommended label | strongest product story | safest all-clean | weakest story |

## Recommendation

**Fleetgate**, with the repository kept under the existing `unifyWeb3` org.

Why: in a security-track product, the name should say the action. "Fleetgate"
is what the freeze is: you close a gate on the fleet. It carries the audit
story (the gate's own log), the Mode A/Mode B honesty (a gate is not a
guarantee), and it presents well in a demo title. The GitHub org being taken
is cosmetic — the repository lives under `unifyWeb3/fleetgate` (free), the X
handle is free, and `fleetgate.near` is free. The one trademark-looking hit
(a 4-person UK education-sector company) has no software, crypto, or security
footprint and no evidence of actual registration or enforcement; it is
recorded here so the human can judge it.

**Alternate:** **Keyhalt** — 100% clean on every axis. If any collision
question makes the human uneasy, pick Keyhalt instead: zero disambiguation
burden, full honesty about the tradeoff (narrower name, undersells audit and
the two admin modes).

**Third:** **Squadfence** — clean on all axes, but reads as a derivative of
Honeywell's SCADAfence in a security audience and dilutes the product story.

## Blast radius if the human picks a rename

153 files contain a case-insensitive `fleet`; 17 reference `FLEET_E_*`; 4
packages are `@fleet/*`; the CLI binary is `fleet`; the root package is
`fleet`; the wordmark/brand lives in web/. A rename in one commit touches:
repository name and `git remote` URL; `packages/*/package.json` names;
`package-lock.json` workspace entries; `@fleet/*` imports and build scripts;
the CLI bin name and its docs; `README.md` (title, claim sections, repository
layout); `web/` wordmark/favicon; `Makefile` / scripts / harness command
strings (`console-demo`, `fresh-clone-test`); `CLAIMS.md` row text that names
packages (`@fleet/sdk` etc.); `docs/*` references. Evidence files and audit
exports are historical and stay verbatim; `FLEET_E_*` error codes stay unless
the human explicitly wants the SDK wire format broken (all tests and the SDK
test matrix would move with it). Screenshots regenerate after approval.
No wasm change: the controller source is out of scope of the display name.

**No rename happens until the human picks.** The dry run itself lists every
affected file and string before anything is applied.
