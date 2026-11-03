# Evidence

Phase 1 has **no product evidence**. This directory is reserved for
machine-readable evidence produced by the harness and, after Phase 2, by
testnet runs:

- `evidence/phase1/` — fresh-clone and `make verify` logs (created at the
  baseline tag, no keys);
- `evidence/testnet/` — transaction hashes, block heights, receipt summaries,
  and audit exports from documented throwaway accounts;
- `evidence/claims/` — one file per `VERIFIED` claim, named by claim ID.

Rules:

1. No private key, seed phrase, credential file, or `.env` file.
2. Every file names the command that produced it and the UTC timestamp.
3. A screenshot alone is not evidence; include the command output and tx hash.
4. Evidence is append-only; corrections add a dated note, they do not rewrite
   the file.
5. A claim without a file here or a public tx hash is not `VERIFIED`.
