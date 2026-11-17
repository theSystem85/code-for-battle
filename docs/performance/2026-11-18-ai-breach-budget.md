# Bound AI breach search per tick

Baseline commit `08c85cf8` compared with this change on a freshly started Vite server.

```sh
BENCHMARK_URL=http://127.0.0.1:4183 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-save-final node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4184 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-ai-after node scripts/benchmark-unit-heavy.mjs
```

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The route covered 2.94 laps from a 400-unit save. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 41.92 | 46.55 | 11.05% |
| Minimum FPS (1 s) | 2.00 | 2.00 | 0.00% |
| Frame p95 (ms) | 49.90 | 32.80 | -34.27% |
| Frame p99 (ms) | 199.60 | 182.70 | -8.47% |
| Frame max (ms) | 933.10 | 649.90 | -30.35% |
| Intervals above 1000/60 ms | 1517.00 | 1582.00 | 4.28% |
| Mean CPU update (ms) | 11.47 | 9.59 | -16.41% |
| Mean CPU render (ms) | 1.07 | 1.11 | 3.22% |
| Terrain GPU p95 (ms) | 12.45 | 7.08 | -43.16% |
| JS heap p95 (MiB) | 256.74 | 383.56 | 49.40% |
| Long tasks | 70.00 | 26.00 | -62.86% |
| Save readiness (ms) | 3700.00 | 3632.00 | -1.84% |
| Surviving units | 184.00 | 203.00 | 10.33% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

The planner runs at most 512 heap pops per eligible AI party update across all its squads, including stale heap entries. At 20 eligible ticks per second per active party, that caps it at 10,240 pops per party per second. Previous orders are available until a plan completes. Nearby threats and retreat branches skip breach planning, and an in-progress search uses a fixed mobile-danger snapshot. A changed map topology, structure surface revision, or replaced building list invalidates in-progress work. The original per-search expansion cap and weakest-breach ordering remain in use.

Inclusive V8 time in the breach planner fell from 2,604 ms to 443 ms (83.0%). Minimum-peak search time fell from 1,539 ms to 269 ms. GC rose from 262 ms to 273 ms. Sampled heap p95 increased from 257 MiB to 384 MiB. Pending plans can retain search state across ticks and a longer allocation and retention audit remains needed. The battle still misses the 60 FPS gate.

Full lint passed. The unit suite passed 5,893 cases including the multi-tick search regression, with the existing `U05433` sprite alpha mismatch.
