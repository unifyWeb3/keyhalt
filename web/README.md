# Web

The read-only Keyhalt / Keyhalt console interface. Served by
`packages/console` from the same origin at `http://127.0.0.1:4173` via
`make console`.

- Real interface: Keyhalt, Agent, Timeline screens driven by explicit state
  machines in `state.js` (see `docs/UI_STATE_MACHINES.md`).
- Live finalized-block ticker in the header; SSE-driven refreshes; all
  numbers on screen are read live from testnet or counted from `CLAIMS.md`.
- No wallet, no key entry, no signing, no write path. Every write goes
  through the CLI with a local signer outside the repository.
- `noindex`. Recording and public use stay human-approval gates.
- Screenshots of the six states live in `screenshots/` (reference only,
  unapproved for public use).
