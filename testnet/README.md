# Testnet workspace

This directory is a placeholder for **documented throwaway testnet account
metadata** produced by the harness. It must never contain a private key, seed
phrase, credential JSON, or `.env` file.

Phase 1 has no testnet accounts. Phase 2 E2E runs write only public data here:
account IDs, public keys, transaction hashes, block heights, and receipt
summaries. Key files stay outside the tracked tree under
`/root/.near-fallback-keys/` (mode 700/600) or the host keychain.
