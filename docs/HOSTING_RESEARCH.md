# Keyhalt hosting memo: the live console needs a server, not a static host (2026-11-07)

**Status: research only. No account has been created, nothing is deployed,
no DNS/handle/name is registered. Deployment or registration of anything
requires explicit human approval of the specific option and page.**

The built console is not a static site: `packages/console` is a long-lived
Node process serving same-origin JSON, an SSE block feed (`/api/stream`), and
per-finalized-block reads of NEAR testnet RPC through failover
(FastNEAR → dRPC → NEAR Foundation → Intear). Static hosts cannot run it.
The open question this memo answers: which $0/low-trust hosts can, and what
breaks first.

## What must be true to host it honestly

1. Long-lived outbound HTTP from every viewer's browser session is fine:
   the browser never calls an RPC (CSP `connect-src 'self'`).
2. The server holds **no signer** and no secrets; the blast radius of a
   hostile visitor is CPU, connections, and RPC requests.
3. The server keeps working without sleeping mid-session (SSE stayed clean in
   testing for days), or the page shows the stale/error state honestly.
4. Shared egress IPs must not get Keyhalt's free testnet RPC endpoints banned
   for every Keyhalt user. This is the real constraint, see below.

## Free options that can run it (researched 2026-11-07; re-verify before relying)

| Option | Free limits (published) | Account needed | Fit for the live console |
| --- | --- | --- | --- |
| **Render free web service** | 750 instance-hours/month (≈ a month); 512 MB / 0.1 CPU; spins down after 15 min without inbound traffic; ~1 minute wake; no persistent disk | Render account, no card | The closest thing to always-on. SSE helps keep awake only if it counts as inbound traffic: unclear, and cold wakes must be labelled |
| **Koyeb free Instance** | 512 MB / 0.1 vCPU / 2 GB SSD, one instance/org; Frankfurt or Washington only; scales to zero after 1 h, 200 ms-5 s cold start | Koyeb account + card hold since Feb 2026 ($29 pre-auth; effective card) | Works mechanically; the card requirement disqualifies it for $0-strict hands-off |
| **Deno Deploy (free)** | 1M requests/month, 20 GiB egress, 5 custom domains, no SLA; SSE/streaming supported | Deno Deploy account, no card | Good technically; every visitor's browser session holds an SSE connection; shared Deno egress IPs will hit free testnet RPC limits fast |
| **Cloudflare Workers (free)** | 100,000 requests/day; 10 ms CPU/request; 50 subrequests/request; **streaming HTTP has no hard duration limit while the client stays connected** | Cloudflare account, no card | Structurally perfect for SSE; subrequests per SSE session is bounded (one block poll per second fan-out per client). Shared Cloudflare egress IPs hammer FastNEAR from every Workers user on earth |
| **Netlify (free)** | 125,000 function invocations/month; 100 GB bandwidth; 300 build minutes | Netlify account, no card | Wrong shape for SSE: functions time out; not recommended |
| **GitHub Pages** | 1 GB site, 100 GB/month soft bandwidth, static only, no server execution | GitHub account (existing), no card | Static fallback only |
| **Cloudflare Pages** | 500 builds/month, unlimited static requests/bandwidth | Cloudflare account, no card | Static fallback only |

## The constraint that actually decides it

**Shared-IP free testnet RPC rate limits.** FastNEAR (testnet) delivered at
most ~90 requests before 429s during this very demo session on an unshared
residential/VM egress; the failover chain survived it. A hosted console with
real users: (a) polls every ~1 s per client, (b) does failover queries on
top, (c) all come from one shared egress IP (Workers/Deno) or a handful of
datacenter IPs (Render/Koyeb). The free endpoints do not guarantee delivery
at that scale, and every other Workers user also shares those IPs. Result:
the hosted console would intermittently fail over to `stall` states for
everyone, correctly labelled stale, on a page reachable by strangers. That
honesty is the only correct public posture.

## Fallback: the labelled static snapshot (recommended)

Pre-render one honest state snapshot of the console: Keyhalt + Agent + Timeline
HTML with the captured numbers baked in: served from GitHub Pages or
Cloudflare Pages, labelled on every page:

> `snapshot @ block N · not live · testnet · unaudited · Mode A not non-custodial`

- $0 forever on both hosts; no server; no SSE problem; no shared-IP problem.
- Every on-screen number is still either chain-read (`get_state`/audit/
  `CLAIMS.md`) at the pinned block: generate the snapshot programmatically
  from `/api/keyhalt` and `/api/timeline` JSON and embed it, never hand-type it.
- The live console you already built stays the source of truth locally; the
  public page is a frozen sample with the block height visible.
- No auth, no secrets, no data that is not already public on testnet.

## Recommendation

**Ship the labelled static snapshot** (GitHub Pages or Cloudflare Pages); it
is the only option that is $0, honest about staleness, predictable under load
from strangers, and reproducible today without touching the code. If the human
wants a live server anyway, **Render free** is the least-bad choice, with SSE
connectivity as the risk item, a `free instance` badge visible, and a stated
cold-wake expectation: but it must still be approved explicitly before any
account or deployment exists. Deno Deploy/Workers require a human decision
on shared-IP RPC limits before either is sane to propose publicly.

**This memo creates no account, deploys nothing, registers nothing. The
decision belongs to the human.**

## What the human must decide

1. Static snapshot approved? (yes/no): if yes, which host?
2. Snapshot content and block height; wording reviewed against the recording
   approval.
3. If a live server is preferred over a snapshot: which service, for whom,
   rate-limit disclosure text, and what happens when it sleeps.

Until then: local console only; the public internet remains untouched.
