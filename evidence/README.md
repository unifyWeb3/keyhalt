# Evidence

This directory holds machine-readable evidence for FLEET v0.3.

| Directory | Contents |
| --- | --- |
| `phase1/` | Baseline harness logs from before the `pre-hackathon` tag; historical, not product evidence |
| `testnet-v03/` | Canonical 3-agent testnet run, audit export, human-readable run report, gas profile |
| `cli-v03/` | Live CLI freeze/refusal/unfreeze, inventory/verify, audit export and tamper rejection |
| `mutation/` | Mutation-test report (8 mutants, 8 killed) |
| `repro-build/` | Two isolated clean wasm builds and hash comparison |
| `local-tests.txt` | Local fmt/clippy/Rust/TypeScript/repro/mutation/gas log |
| `fresh-clone-v03.log` | Clean-clone setup/verify pass, malformed-claim and mainnet negative controls |
| `verify-v03.log` | Full `FLEET_REQUIRE_RPC=1 make verify` pass |

Rules:

1. No private key, seed phrase, credential file, or `.env` file.
2. Every file names the command that produced it and the UTC timestamp.
3. A screenshot alone is not evidence; include the command output and tx hash.
4. Evidence is append-only; corrections add a dated note, they do not rewrite
   the file.
5. A claim without a file here or a public tx hash is not `VERIFIED`.

The canonical run is `testnet-v03/run.json` (63 checks). Its wasm hash and audit
head are quoted in `CLAIMS.md`; the tx hashes are public testnet transactions.
Key files used for the run live outside this repository under
`/root/.near-fallback-keys/` with mode 600 and are never copied here.

`fresh-clone-v03-attempt1-host-abort.log` is the first clone attempt, aborted by a
host-level futex/fork failure during compilation; the retry passed and is the
file used as evidence.

`phase1/` remains as the historical baseline. It records the harness before any
product code existed and must not be used to support a v0.3 product claim.
