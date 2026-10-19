- [x] **Improvement: M2 impacts leave no decals**
  Exclude M2 rounds from shared impact-decal creation for hits and misses, keeping their impact flash and direct damage. Update the existing cadence assertion to the previously requested 66.7% rate.
  Spec: none

The decal eligibility check runs once per impact, not per frame. At 500 M2s firing every 1.5 seconds it adds at most about 667 string comparisons per second, independent of DPR, with no new allocations; excluded impacts skip decal work. Hardware performance validation remains pending per the repository GPU policy.

Validation: 5,427 unit/integration tests passed across 323 files; the real-firing browser regression E00206 passed (15.4 seconds), and lint plus whitespace checks passed. Only the covering browser test was run; other E2E files and hardware GPU benchmarks were not run.
