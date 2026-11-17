# Reset only cells revealed by the previous visibility pass

Baseline commit `692700d3` compared with this change. Both runs use the stationary 500-unit battle with construction yards protected against defeat. These captures seeded local tutorial preferences without an explicit startup flag. Both reached 26 concurrent bullets and finished with 481 surviving units.

```sh
BENCHMARK_URL=http://127.0.0.1:4189 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-service-after node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4190 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-fog-after node scripts/benchmark-unit-heavy.mjs
```

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The stationary battle scenario loaded a 500-unit save with the camera held on the battle. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 2.08 | 2.08 | -0.38% |
| Minimum FPS (1 s) | 1.00 | 2.00 | 100.00% |
| Frame p95 (ms) | 967.40 | 966.80 | -0.06% |
| Frame p99 (ms) | 983.70 | 983.30 | -0.04% |
| Frame max (ms) | 1000.30 | 984.00 | -1.63% |
| Intervals above 1000/60 ms | 126.00 | 125.00 | -0.79% |
| Mean CPU update (ms) | 41.12 | 43.31 | 5.31% |
| Mean CPU render (ms) | 4.19 | 4.43 | 5.58% |
| Terrain GPU p95 (ms) | 20.91 | 16.58 | -20.69% |
| JS heap p95 (MiB) | 242.72 | 228.13 | -6.01% |
| Long tasks | 71.00 | 84.00 | 18.31% |
| Save readiness (ms) | 3674.00 | 3760.00 | 2.34% |
| Surviving units | 481.00 | 481.00 | 0.00% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

Inclusive V8 time in `resetVisibility` fell from 72.35 ms to 2.57 ms. The entire visibility pass fell from 255 ms to 202 ms. GC samples fell from 79 ms to 76 ms. Frame cadence was effectively flat, and mean simulation update time rose in this sample.

A 200×200 map previously cleared 40,000 flags each tick, up to 2.4 million writes per second at 60 ticks/s. After the first pass on a new or restored map, the reset uses the deduplicated list of cells revealed in the preceding pass. The tracker and structure set are reused, cover the existing center-based reveal and rectangular footprints, and follow the lifetime of the visibility map. The reveal-all API invalidates the sparse tracker. Rendering DPR has no effect on the number of fog cells.

Full lint passed. The unit suite passed 5,896 cases and reproduced the existing `U05433` sprite alpha mismatch.
