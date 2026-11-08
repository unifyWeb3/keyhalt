# Keyhalt controller mutation testing

**Status:** final v0.3 score from the x64 CI run on commit `81325ed`,
2026-11-06 UTC. This document is the written record of the automated mutation
run, the score definition, and the disposition of every surviving mutant.

**Tool:** [`cargo-mutants`](https://mutants.rs/) 27.1.0, official
`x86_64-unknown-linux-gnu` release tarball, sha256
`dfe6dc37d0342c891d2829b5a695aa57c2d0edecef7e7d0399a30cc6e206411e`, installed
by `.github/workflows/mutation.yml`.

**Why x64 CI is the score source:** the local host is arm64. The workflow runs
on `ubuntu-latest` so the score is produced on a clean, reproducible x64
runner, not on the development machine.

## Command

```bash
cargo mutants -p fleet-controller \
  --jobs 4 \
  --timeout-multiplier 4 \
  --minimum-test-timeout 30
```

The workflow sets `FLEET_PROPERTY_STEPS=20` and `FLEET_PROPERTY_SEEDS=1` for
the mutation run only. Every mutant re-runs the whole Rust suite, so the
differential reference-model property test is shortened from the published
3 seeds × 5,000 steps (15,000 comparisons) to 1 seed × 20 steps. This is a
documented deviation, not a different test: the same invariant is checked, at
a lower step count, to keep one mutant's test cycle practical. The full
15,000-comparison run is executed by `cargo test --workspace` and by the `ci`
workflow.

Each mutant is built in its own temporary copy of the tree. The workflow sets
no shared `CARGO_TARGET_DIR`: an earlier attempt shared one, and cargo then
reported the mutant source as `Fresh` and reused the unmutated artifact, so no
mutant was actually compiled. That run is not used as evidence.

## Score definition

```
score = caught / (generated - unviable - timeouts)
```

- **generated**: every mutation cargo-mutants proposed in `contracts/fleet-controller`.
- **caught**: at least one test failed against the mutant.
- **missed**: every test passed against the mutant; the mutation survives.
- **unviable**: the mutated crate did not compile; carries no signal about the tests.
- **timeout**: the test run exceeded the timeout; counted as neither caught nor missed.

## Results

| Run | Commit | Generated | Caught | Missed | Unviable | Timeouts | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `41957974958` | `f11854a` | 275 | 243 | 9 | 23 | 0 | 243/252 = **96.43%** |
| `41964211806` | `9155db9` | 275 | 247 | 5 | 23 | 0 | 247/252 = **98.02%** |
| `42172689910` | `81325ed` | 275 | 248 | 4 | 23 | 0 | 248/252 = **98.41%** |

Run `41957974958` is kept for the audit trail: it is the first automated run,
made before the targeted mutant-killing tests were added. Run `41964211806`
adds those tests. Run `42172689910` is the final source and is the score
quoted in `CLAIMS.md` and the README.

The 23 unviable mutants are mutations that make the crate fail to compile
(for example, a mutation that breaks a type annotation or removes a value that
a later expression uses). They say nothing about test strength and are
excluded from the denominator.

## Survivors and their disposition

`tests/mutation` keeps the targeted regression set (F-017), but the score
above is from cargo-mutants, not from the hand-written set.

All four surviving mutants are **provably equivalent**: for every possible
input, the mutated function returns exactly the same value as the original.
No test can kill them. The controller source is frozen because the deployed
wasm embeds panic-location line numbers and a source edit changes the
deployed bytes (F-012, F-019); removing the redundant checks to make the
mutants non-equivalent would invalidate the deployed-artifact evidence. The
mutants are justified here instead of killed.

| # | Mutant | Verdict | Proof |
| --- | --- | --- | --- |
| 1 | `lib.rs:587:5` replace `assert_private` with `()` | **killed** in `42172689910` | The 83-test suite only asserted that a foreign predecessor makes the callback panic. Both the `#[private]` wrapper and the body's `assert_private()` trap, so the mutant survived. Test `tests::private_callback_refusal_is_logged_with_its_reason` added in `81325ed` pins the refusal reason: the body must log `FLEET_REFUSAL:private callback` before trapping. With that assertion the mutant is caught. |
| 2 | `model.rs:170:20` replace `<` with `==` in `valid_account` | equivalent | `valid_account` requires `value.contains('.')` at the same condition. The mutant differs from the original only for lengths 0, 1 and 2. Lengths 0 and 1 have no `'.'` and are rejected by both. Every length-2 string containing `'.'` is `"a."`, `".a"` or `".."`: the first ends with `'.'`, the second starts with `'.'`, the third contains `".."`, so the second check rejects all three in both versions. Identical result for every input. |
| 3 | `model.rs:170:20` replace `<` with `<=` in `valid_account` | equivalent | The mutant differs from the original only for lengths 0, 1 and 2, where it returns `false` at the first check. Lengths 0 and 1 are rejected by the original at the same check (`!contains('.')`), and every length-2 string containing `'.'` is rejected by the following check (see #2). Identical result for every input. |
| 4 | `model.rs:183:40` replace `>` with `==` in `valid_public_key` | equivalent | The mutant differs only at length 80, where it returns `false` at the first check. In the original, the final check requires `rest.len() <= 64`; with `curve` of length 7 (`"ed25519"`) or 9 (`"secp256k1"`), a length-80 value has `rest.len()` 72 or 70, so the original also returns `false`. Identical result for every input. |
| 5 | `model.rs:183:40` replace `>` with `>=` in `valid_public_key` | equivalent | The mutant differs only at length 80, where it returns `false` at the first check. The original also returns `false` at length 80 (see #4). Identical result for every input. |

### Why these are still safe

The redundant comparisons are a defence-in-depth style choice in a validator
that is already double-guarded by the other conditions. The contract accepts
exactly the same account IDs and public keys with or without the mutants,
which is what the equivalence proofs above establish case by case. The
adversarial value of the mutants is nil: none of them can be triggered by any
input.

## Reproduction

```bash
# Local (any architecture): the tool is the same, the score source is CI.
cargo mutants -p fleet-controller --jobs 4 --timeout-multiplier 4 --minimum-test-timeout 30

# CI: manual dispatch of .github/workflows/mutation.yml
gh workflow run mutation.yml --ref main
gh run download <run-id> -n cargo-mutants-report
cat mutants.out/missed.txt
```

The workflow uploads `mutants.out/` (including `outcomes.json`, `caught.txt`,
`missed.txt`, `unviable.txt`, `timeout.txt` and the per-mutant `diff/`) as the
`cargo-mutants-report` artifact on every run, pass or fail.
