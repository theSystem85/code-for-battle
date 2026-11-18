# Fixed-tick CPU replay

This diagnostic imports the 500-unit battle save through the normal UI in a fresh headed Chrome browser, disables the tutorial at startup, and holds the game loop before import. After loading, it runs 150 fixed simulation updates synchronously with a seeded `Math.random`. It measures `updateGame` including simulation-time advancement, but excludes normal per-frame work outside that function, rendering, browser presentation, and the effects of a live frame schedule. It uses the development server because the diagnostic imports source modules. The Apple M1 hardware GPU and active display were verified before the runs.

The script hashes simulation time, unit IDs, types, owners, positions and health, and bullet positions and types at the start and end. This selected-state digest is useful for comparison but is not proof that all game state or external effects match. All three held-import runs had the same initial and final hashes and ended with 487 units.

| Run | Mean tick (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| D | 6.08 | 5.1 | 11.4 | 28.1 | 39.7 |
| E | 5.75 | 4.7 | 11.1 | 28.0 | 40.0 |
| F | 5.81 | 4.7 | 11.6 | 28.7 | 41.5 |

The initial hash was `062f2db98bde667fcc8432848461219520f5c371d4fd86d99b1d551d961b5f3d`, the final hash was `a40e68417c4c1459eeb081aaf5de3362c6fd4508f33cc2fac953471f51c9ed71`, and the save hash was `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce`. A first set without holding the game loop had mismatched initial hashes in one of three runs. Holding scheduling before import corrected the observed selected-state mismatch.

A separate instrumented replay had the same selected-state hashes and recorded 150 quadtree rebuilds, 131,703 ground queries, 6,868 air queries, 3,370,623 node visits, 2,541,848 candidate units and 190,874 returned units. Recursive node calls count as visits, and candidates are units in intersecting nodes before distance and self-exclusion checks. Instrumentation adds work, so its 5.98 ms mean and 11.8 ms p95 should not be compared as a clean speed measurement. It does not distinguish individual query callers. The repeated query volume supports profiling the collision and steering callers before choosing an index or worker strategy.

```sh
for run in d e f; do
  BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_FIXED_TICKS=150 BENCHMARK_OUTPUT=tmp/unit-heavy/fixed-tick-$run node scripts/performance/fixed-tick-replay.mjs
done
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_FIXED_TICKS=150 BENCHMARK_COUNT_SPATIAL=1 BENCHMARK_OUTPUT=tmp/unit-heavy/fixed-tick-spatial node scripts/performance/fixed-tick-replay.mjs
```

The replay is a baseline, not a performance fix or a complete deterministic-state verification. Matched cold/warm traversal, full state equivalence, query-caller attribution, frame-to-compositor linkage and an uninstrumented performance comparison after a fix remain open in the [checklist](2026-11-18-next-performance-checklist.md).

Lint and script syntax checks passed. The unit suite passed 5,903 cases and reproduced the previously documented `U05433` map-sprite alpha failure.
