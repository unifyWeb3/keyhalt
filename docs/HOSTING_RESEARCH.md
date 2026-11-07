# FLEET console — free hosting research (v0.3, 2026-11-07)

**Status: research only. No accounts have been created, nothing is deployed,
no DNS, name, or handle is registered.** Any hosting step beyond this table
requires explicit human approval, same as any other public artifact.

The question this doc answers: could the built, read-only console ever be
published without paying? The answer: **a static snapshot, yes, with limits;
the live console, not for free and not safely.**

## What actually needs hosting

| Piece | Needs | Free hosting fit |
| --- | --- | --- |
| `web/` (HTML/CSS/JS, same-origin) | static files | good |
| `packages/console` (block feed, SSE, RPC failover) | a Node process with outbound RPC and long-lived SSE connections | poor |
| Live data path to testnet RPC | unauthenticated, rate-limited third-party RPC from a shared IP | poor |

Serving a stale-looking live console from a free tier is worse than a clearly
labelled snapshot: it shows a frozen block and invites "is it broken?"
questions, and it leaks nothing but wastes everyone's rate limit budget.

## Free tier limits (researched 2026-11-07, always re-verify before use)

| Host | What it hosts for free | Free limits (published) | Fit |
| --- | --- | --- | --- |
| **Cloudflare Pages** | static files | 500 builds/month, unlimited static requests/bandwidth, 20k files, 100 custom domains | static snapshot |
| **GitHub Pages** | static files | 1 GB site, 100 GB/month soft bandwidth, 10 builds/hour soft, HTTPS, no server execution | static snapshot |
| **Netlify** | static + functions | small credit-based free allowance (credits hard-limited); verify current terms | static snapshot, small |
| **Vercel** | static + functions | Hobby: 100 GB fast-data-transfer hard cap (site pauses past it), 1M function invocations, personal/non-commercial use only | static snapshot or small API |
| **Cloudflare Workers** | dynamic | generous but capped invocations and no free persistent daemons; SSE needs care | not recommended |
| **Free VPS / tradecraft tiers** | anything | typically trial/credit cards required | out of scope ($0 rule, reliability) |

## Recommended sequence if the human approves hosting

1. **Local only** — the default. `make console` on the demo machine. $0, zero
   exposure, honest.
2. **Labelled static snapshot** (if a public link is ever approved) — one
   approved screenshot state plus the evidence JSON, clearly labelled
   `snapshot @ block N · not live · testnet · unaudited`, published to
   Cloudflare Pages **or** GitHub Pages, after approval.
3. **Never** the reverse — do not publish a "live" link backed by a free tier
   that blocks or truncates SSE, rate-limits at random, and expires under
   load. A dead console is worse than a screenshot.

## What this research already rules out

- No account creation, no DNS/handle/name registration, no deployment, no
  git push to any remote beyond the configured private one, no repository
  publication — all still blocked pending human approval.
- No hosting that would make an RPC call from a shared egress IP on behalf of
  arbitrary visitors without a human decision on abuse, rate limits, and
  uptime honesty.
- No "free tier with a time bomb" deployment before the hackathon decision.

## To act on this doc, the human must decide

1. Snapshot-approved-for-publication? (yes/no)
2. Which host? (Cloudflare Pages | GitHub Pages | other)
3. What exactly is labelled on the page, and who is allowed to see it?

Until then: local console, no accounts, nothing public.
