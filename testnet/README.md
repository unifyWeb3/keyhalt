# Testnet workspace

This directory holds **public** metadata for documented throwaway testnet
accounts. It must never contain a private key, seed phrase, credential JSON, or
`.env` file.

v0.3 writes account IDs, public keys, transaction hashes, block heights, and
receipt summaries here. Signer key files stay outside the tracked tree under
`/root/.near-fallback-keys/` (mode 700/600) or the host keychain.

Files:

- `run-v03.json`: canonical parent, three agents (`agent-1b`, `agent-2`,
  `agent-3`), public keys, and create/init tx hashes. The earlier pilot
  `agent-1` is retained under `pilot_agents`.

The canonical run itself is under `evidence/testnet-v03/`. Testnet accounts are
disposable; do not reuse these keys for anything of value, and do not use
mainnet.
