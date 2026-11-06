# FLEET mutation report — final x64 run

**Run:** GitHub Actions `mutation` workflow, run `42172689910`, commit
`81325ed`, 2026-11-06 06:09–06:41 UTC, x64 `ubuntu-latest`.

**Tool:** cargo-mutants 27.1.0, sha256 of the release tarball
`dfe6dc37d0342c891d2829b5a695aa57c2d0edecef7e7d0399a30cc6e206411e`.

## Result

| Generated | Caught | Missed | Unviable | Timeouts | Score |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 275 | 248 | 4 | 23 | 0 | 248/252 = **98.41%** |

Score = caught / (generated − unviable − timeouts).

## Files

- `outcomes.json` — cargo-mutants result summary and per-mutant outcomes.
- `caught.txt` — the 248 mutants a test killed.
- `missed.txt` — the 4 surviving mutants (all provably equivalent; see
  `docs/MUTATION.md` for the proof of each).
- `unviable.txt` — the 23 mutants that did not compile; excluded from the
  denominator.
- `timeout.txt` — empty (0 timeouts).

## Command

```bash
FLEET_PROPERTY_STEPS=20 FLEET_PROPERTY_SEEDS=1 cargo mutants -p fleet-controller \
  --jobs 4 --timeout-multiplier 4 --minimum-test-timeout 30
```

Each mutant is built in its own temporary copy of the tree; the workflow sets
no shared `CARGO_TARGET_DIR`. See `docs/MUTATION.md` for why the property test
is shortened for this run only, and for the equivalence proof of each of the
four survivors.
