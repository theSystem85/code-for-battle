# Reuse live movement lookups

Baseline commit `3192d2ba` compared with this change at two army sizes. The 400-unit baseline is the preceding AI capture. The 500-unit baseline generated a separate save on the baseline revision and both 500-unit captures loaded that exact save.

```sh
BENCHMARK_URL=http://127.0.0.1:4185 BENCHMARK_CREATE_FIXTURE=1 BENCHMARK_UNITS_PER_PARTY=125 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-movement-500-before node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4186 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-movement-400-after node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4187 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-movement-500-final node scripts/benchmark-unit-heavy.mjs
```

## 400 starting units

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The route covered 2.94 laps from a 400-unit save. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 46.55 | 45.34 | -2.60% |
| Minimum FPS (1 s) | 2.00 | 2.00 | 0.00% |
| Frame p95 (ms) | 32.80 | 33.10 | 0.91% |
| Frame p99 (ms) | 182.70 | 199.10 | 8.98% |
| Frame max (ms) | 649.90 | 783.30 | 20.53% |
| Intervals above 1000/60 ms | 1582.00 | 1551.00 | -1.96% |
| Mean CPU update (ms) | 9.59 | 8.91 | -7.10% |
| Mean CPU render (ms) | 1.11 | 1.07 | -3.25% |
| Terrain GPU p95 (ms) | 7.08 | 6.49 | -8.33% |
| JS heap p95 (MiB) | 383.56 | 280.20 | -26.95% |
| Long tasks | 26.00 | 33.00 | 26.92% |
| Save readiness (ms) | 3632.00 | 3653.00 | 0.58% |
| Surviving units | 203.00 | 192.00 | -5.42% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

## 500 starting units

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The route covered 2.94 laps from a 500-unit save. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 51.69 | 45.57 | -11.83% |
| Minimum FPS (1 s) | 2.00 | 2.00 | 0.00% |
| Frame p95 (ms) | 17.70 | 33.30 | 88.14% |
| Frame p99 (ms) | 50.20 | 166.70 | 232.07% |
| Frame max (ms) | 582.60 | 650.10 | 11.59% |
| Intervals above 1000/60 ms | 1712.00 | 1533.00 | -10.46% |
| Mean CPU update (ms) | 11.33 | 11.76 | 3.79% |
| Mean CPU render (ms) | 0.47 | 1.08 | 127.06% |
| Terrain GPU p95 (ms) | 1.31 | 8.52 | 550.00% |
| JS heap p95 (MiB) | 331.91 | 253.83 | -23.53% |
| Long tasks | 30.00 | 52.00 | 73.33% |
| Save readiness (ms) | 3569.00 | 3771.00 | 5.66% |
| Surviving units | 264.00 | 262.00 | -0.76% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

## Movement CPU attribution

| Inclusive V8 sample time | 400 before → after | 500 before → first after |
| --- | ---: | ---: |
| Friendly waypoint checks | 599 → 108 ms | 645 → 138 ms |
| Air avoidance | 404 → 23 ms | 670 → 45 ms |
| Unit movement | 11,273 → 9,088 ms | 14,654 → 10,928 ms |
| Entire simulation update | 26,220 → 23,830 ms | 34,311 → 29,218 ms |
| Garbage collection | 273 → 283 ms | 323 → 374 ms |

The optimized movement functions took less sampled CPU time at both army sizes. Average callback FPS fell in both pairs, especially the 500-unit pair, where render time and long tasks also rose. The first 500-unit run measured 40.77 average FPS, 1 minimum FPS over one second, and 75 long tasks. The final capture, after restoring the standalone owner-index compatibility path, measured 45.57 average FPS and 2 minimum FPS over one second. The final capture appears in the table above. End-to-end frame pacing remains a separate problem.

Waypoint checks use the existing live collision index and retain the exact center tile, friendly ownership, ground eligibility and self-exclusion tests. Air avoidance reads only aircraft candidates in the original array order, including grounded aircraft in case they take off during the tick. The aircraft list is reused and filled during the existing index pass. At 60 simulation ticks/s the 500-unit case performs up to 30,000 inexpensive aircraft classification checks per second. The query work runs at simulation cadence and is independent of canvas DPR.

All three focused browser checks and full lint passed. The final unit suite passed 5,894 cases, including the owner lookup compatibility checks, with the existing `U05433` alpha mismatch.
