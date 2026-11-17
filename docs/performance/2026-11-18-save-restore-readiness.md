# Complete save preparation before gameplay

Baseline commit `e15f80a2` compared with this change, using the same saved battle and fresh Vite processes. The baseline is the preceding wreck sprite capture.

```sh
BENCHMARK_URL=http://127.0.0.1:4181 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-wreck-after node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4183 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-save-final node scripts/benchmark-unit-heavy.mjs
```

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The route covered 2.94 laps from a 400-unit save. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 44.79 | 41.92 | -6.40% |
| Minimum FPS (1 s) | 1.00 | 2.00 | 100.00% |
| Frame p95 (ms) | 32.70 | 49.90 | 52.60% |
| Frame p99 (ms) | 150.10 | 199.60 | 32.98% |
| Frame max (ms) | 1066.60 | 933.10 | -12.52% |
| Intervals above 1000/60 ms | 1541.00 | 1517.00 | -1.56% |
| Mean CPU update (ms) | 10.62 | 11.47 | 8.04% |
| Mean CPU render (ms) | 0.67 | 1.07 | 60.76% |
| Terrain GPU p95 (ms) | 18.48 | 12.45 | -32.62% |
| JS heap p95 (MiB) | 218.02 | 256.74 | 17.76% |
| Long tasks | 49.00 | 70.00 | 42.86% |
| Save readiness (ms) | 699.00 | 3700.00 | 429.33% |
| Surviving units | 193.00 | 184.00 | -4.66% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

The final capture measures gameplay from the restored map's actual readiness boundary. The 3.70 s save wait includes work that previously continued after the game was exposed. V8 gameplay samples in bitmap creation fell from 3,222 ms to 1,273 ms, decoration stone weighting went from 234 ms to zero, and sampled garbage collection went from 304 ms to 262 ms. The worst one-second FPS improved from 1 to 2. Average FPS and the p99 interval worsened.

A first capture of the graphics suspension alone measured 48.55 average FPS, 4 minimum FPS over one second, and a 483 ms maximum interval. The final change also waits to announce the load and snapshots import files before clearing the input. The two captures show variability in the remaining workload. Record the final code in the comparison table and retain the first capture under `tmp/unit-heavy/checklist-save-after`.

The load operation retains its synchronous state restore for replay and live-update callers. Normal save displays and boot wait for the graphics promise. A running loop stays stopped until the graphics and occupancy are coherent. Overlapping restores share the suspension and the newest load owns final publication. This work runs per save restore, independent of gameplay frame rate and entity render count.

Full lint and the save import/export Playwright check passed. The unit suite passed 5,892 cases and reproduced the existing `U05433` sprite-sheet alpha mismatch.
