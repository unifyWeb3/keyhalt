# Contracts

This directory is a Rust workspace member for the FLEET controller.

**Phase 1 status:** scaffold only. `contracts/fleet-controller/src/lib.rs` contains
no contract logic, no storage, no methods, and no NEAR SDK dependency. It must
not be deployed or described as a working contract.

The v0.3 design target is in [`../docs/SPEC_v0.3.md`](../docs/SPEC_v0.3.md).
Product implementation starts only after the `pre-hackathon` baseline tag and
human approval.

## Local commands

From the repository root:

```bash
cargo test --workspace
cargo check --workspace --target wasm32-unknown-unknown
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```
