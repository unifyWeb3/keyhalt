# FLEET reproducible wasm build

Generated: 2026-11-03T19:52:35Z

Two builds were made from the same locked source in separate empty target
directories. No shared incremental artifacts were used.

```bash
CARGO_TARGET_DIR=<dir> cargo build --locked -p fleet-controller \
  --target wasm32-unknown-unknown --release
```

| Build | Bytes | SHA-256 |
| --- | ---: | --- |
| A | 248644 | `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f` |
| B | 248644 | `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f` |

- Byte-identical: **yes**
- Matches the wasm deployed and recorded in `evidence/testnet-v03/run.json`: **yes**
- Toolchain: `rustc 1.93.0 (254b59607 2026-01-19)`, `cargo 1.93.0 (083ac5135 2025-12-15)`
- Lockfile: `Cargo.lock` (`--locked`)

Reproduction is scoped to this toolchain and lockfile. A different rustc or
dependency resolution may change the hash.
