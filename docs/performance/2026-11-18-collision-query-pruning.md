# Reduce work in repeated collision queries

The fixed-tick caller study attributed over 99% of sampled neighborhood queries to idle-unit collision resolution and movement contact checks. Both use the ordered snapshot quadtree, while the existing movement grid tracks live positions for separation. Replacing one with the other could change the first contact returned. The implementation keeps the snapshot tree and removes work common to both callers. [Caller study](2026-11-18-spatial-query-callers.md)

The quadtree skips empty leaves and bypasses child quadrants beyond the circle's horizontal or vertical extent. It retains the exact circular test and visits reachable children in the same order. Movement checks for units without naval hulls now query to the contact distance of 24 pixels instead of the 36-pixel force-field radius. Naval hull searches and force-field avoidance retain their own radii. Quadtree centers still derive from the unit center, and the querying unit is excluded by ID.

A 500-unit replay issued 138,571 queries over 150 ticks before the change, roughly 924 per tick. At 60 simulation ticks per second this is about 55,400 calls per second. Query work is CPU-side and independent of canvas DPR. The change performs no new allocations per query. An added test exercises tangent hits, result order and pruning of an unreachable quadrant. Lint passed. The unit suite passed 5,909 tests and reproduced the existing `U05433` map-sprite alpha failure.

## Reproduce

The production baseline is the bounded-shadow build from `2e233864` on port 4196. Build the collision candidate with `node node_modules/vite/bin/vite.js build --outDir tmp/unit-heavy/collision-fix-dist` and serve it with `node node_modules/vite/bin/vite.js preview --outDir tmp/unit-heavy/collision-fix-dist --host 127.0.0.1 --port 4197 --strictPort`. Served entry SHA-256 values were `b585145306ed5a4a9ff4fd5726318d7f2fd55f82915a5f77190cabcf33c15383` and `6643baacc0ae65873704aac999d328049a6d32de9e562374b5ed885834f7ceb0`, respectively.

For fixed ticks, serve each source version on port 4195. Use the same save and the commands in the [fixed-tick replay report](2026-11-18-fixed-tick-replay.md). Run three clean samples and one separate sample with `BENCHMARK_COUNT_SPATIAL=1` per version.

```sh
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_EXPECT_FIXTURE_SHA256=65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1
for run in a1 b1 b2 a2; do
  case "$run" in a*) port=4196 ;; b*) port=4197 ;; esac
  BENCHMARK_URL=http://127.0.0.1:$port BENCHMARK_OUTPUT=tmp/unit-heavy/collision-$run node scripts/benchmark-unit-heavy.mjs
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/collision-$run/compositor.json"
done
```

## Fixed-tick results

All six 150-tick replays used the same fixture and selected-state hashes and ended with 487 units. The digest compares simulation time and selected unit and bullet fields. Full-state equivalence remains open. Timing includes each simulation update and excludes the browser frame scheduler and rendering.

| Run | Mean tick (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline 1 | 6.094 | 5.0 | 12.0 | 29.6 | 42.0 |
| Baseline 2 | 5.805 | 4.8 | 11.4 | 27.9 | 39.7 |
| Baseline 3 | 5.821 | 4.8 | 11.0 | 28.2 | 37.6 |
| Candidate 1 | 5.465 | 4.5 | 10.9 | 27.4 | 37.0 |
| Candidate 2 | 5.505 | 4.4 | 11.0 | 27.8 | 39.1 |
| Candidate 3 | 5.534 | 4.5 | 11.9 | 28.0 | 40.8 |

The clean replay mean dropped from 5.907 to 5.501 ms per update, a reduction of 0.406 ms (6.9%). The p95 ranges overlap. The initial hash was `062f2db98bde667fcc8432848461219520f5c371d4fd86d99b1d551d961b5f3d` and the final hash was `a40e68417c4c1459eeb081aaf5de3362c6fd4508f33cc2fac953471f51c9ed71`.

With counters enabled, both versions rebuilt the tree 150 times and issued 131,703 ground and 6,868 air queries. Recursive node visits fell from **3,370,623 to 1,054,647 (68.7%)**. Candidate visits fell from 2,541,848 to 2,288,145 (10.0%). Returned neighbors fell from 190,874 to 1,737 as the contact search filtered out distant units. These counts cover all quadtree callers in the replay. Use a fresh development server after code changes. An initial candidate counter run on the hot-reloaded server attached wrappers to a different module instance and recorded zero queries. The table uses clean timings, with the candidate counter result taken from a fresh server on port 4198.

## Stationary hardware results

All four runs used the active M1 Retina display, Chrome 157.0.8103.79, WebGPU terrain, DPR 2 on a 950×739 CSS viewport, and about 60 Hz blank-page callback cadence. All started with 500 units and 47 selected tanks. The camera stayed fixed, the tutorial was disabled, defeat protection was active, and visible Apache rockets and impacts were present. The harness reported zero invalid scene samples or page errors.

| Run | Avg presented FPS | Worst 1 s FPS | First 10 s FPS | Presentation gap p95 / p99 / max (ms) | Intervals over 16.67 ms |
| --- | ---: | ---: | ---: | --- | ---: |
| A1 | 31.179 | 17 | 21.6 | 83.3 / 100.0 / 116.7 | 1,284 |
| B1 | 30.753 | 17 | 21.3 | 83.3 / 100.0 / 116.7 | 1,238 |
| B2 | 32.199 | 17 | 20.7 | 83.3 / 100.0 / 100.0 | 1,042 |
| A2 | 28.306 | 13 | 18.0 | 83.3 / 100.0 / 116.7 | 1,137 |

Mean presented FPS rose from 29.743 to 31.476 (+1.734 FPS, +5.8%). The worst one-second result across the two runs rose from 13 to 17 FPS. The paired changes were −0.43 and +3.89 FPS, so the presentation gain needs more repeats. Both builds missed 60 FPS.

| Run | Simulation ticks / wall s | Mean CPU update / render (ms per frame) | End units | Sampled terrain GPU p95 (ms) | Sampled JS heap p95 (MiB) |
| --- | ---: | --- | ---: | ---: | ---: |
| A1 | 59.88 | 16.45 / 2.84 | 257 | 12.26 | 121.14 |
| B1 | 59.94 | 14.30 / 2.73 | 254 | 12.78 | 133.57 |
| B2 | 59.94 | 12.95 / 2.64 | 251 | 13.24 | 188.99 |
| A2 | 59.82 | 14.61 / 2.79 | 257 | 13.63 | 131.66 |

Heap readings are sampled and there was no dedicated GC profile. The longest Chrome Core Animation backpressure span was about 93–98 ms in all four runs. Presentation stalls remain the next item on the [checklist](2026-11-18-next-performance-checklist.md).

## Scrolling regression check

One comparison used the same hardware and fixture with live simulation across about 2.94 full-map laps at 3,600 CSS pixels per second. To reproduce, run the same capture commands with `BENCHMARK_BATTLE_ONLY=0` on ports 4196 and 4197, using separate output directories. Both began with 500 units and 47 selected tanks and ended with 269 and 258 units respectively. There were no page errors.

| Build | Average presented FPS | Worst 1 s FPS | First lap FPS | Remaining laps FPS | Presentation gap p95 / p99 / max (ms) | Intervals over 16.67 ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Baseline | 57.879 | 36 | 55.076 | 59.324 | 16.667 / 33.332 / 116.662 | 472 |
| Candidate | 57.623 | 34 | 53.753 | 59.618 | 16.667 / 33.333 / 99.996 | 843 |

Average presented FPS changed by −0.26 in this single pair. The worst second was two frames lower, and the longest gap was 16.67 ms shorter. Both runs remained below the 60 FPS gate. Mean CPU update / render submission fell from 9.68 / 0.50 ms to 9.29 / 0.50 ms. Sampled terrain GPU p95 was 1.84 / 1.57 ms and JS heap p95 was 263.78 / 273.19 MiB. Deadline counts near 16.67 ms are sensitive to timestamp rounding at 60 Hz.
