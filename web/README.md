# Web

The read-only FLEET console interface. Served by `packages/console` from the
same origin at `http://127.0.0.1:4173` via `make console`.

- Real interface, not a mock: Fleet, Agent, Timeline screens with a live
  finalized-block ticker, states for loading / empty / error / stale /
  frozen / active, and a copyable command sheet for the CLI write path.
- Talks only to the same-origin console API (`/api/*`); the browser never
  calls an RPC directly and has no key.
- No wallet, no key entry, no signing, no write route. Every write goes
  through the CLI with a local signer outside the repository.
- `noindex`; every screen renders live finalized-testnet reads or `CLAIMS.md`
  numbers. Recording and public use stay human-approval gates.
