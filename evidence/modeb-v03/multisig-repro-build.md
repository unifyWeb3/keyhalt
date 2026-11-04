# Pinned multisig2 source build

Generated: 2026-11-03T22:10:00Z

- Repository: `https://github.com/near/core-contracts`
- Commit: `1b0436c96379c63aee7d2429c6d5d24019031ab8`
- Subdirectory: `multisig2`
- Version: `0.4.0`
- License: `MIT OR Apache-2.0`
- Source tarball SHA-256: `7e6595a60e8cd4d7924408147768571af34483b4b8c54cd36e9c94dba28a7b3c`

Two builds were made from the same locked source in separate target
directories. The checked-in `res/multisig2.wasm` was **not** used.

```bash
CARGO_TARGET_DIR=<isolated-dir> CARGO_BUILD_JOBS=2 \
  RUSTFLAGS='-C link-arg=-s' \
  cargo build --locked --target wasm32-unknown-unknown --release
```

| Build | Bytes | SHA-256 |
| --- | ---: | --- |
| A | 293734 | `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f` |
| B | 293734 | `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f` |

- Byte-identical: **yes**
- Matches the multisig wasm deployed in `evidence/modeb-v03/run.json`: **yes**
- Toolchain: `rustc 1.93.0 (254b59607 2026-01-19)`, `cargo 1.93.0 (083ac5135 2025-12-15)`
- Lockfile: `Cargo.lock` (`--locked`)

The checked-in prebuilt wasm is a different artifact: 340613 bytes, sha256
`f3f9ee3e5e29d020dc73f581ff1490c03dff875ed01327dfebbe666724930a76`. It was
hashed for provenance only and was not deployed.

Reproduction is scoped to this commit, lockfile, toolchain, and release flags.
A different rustc or dependency resolution may change the hash.
