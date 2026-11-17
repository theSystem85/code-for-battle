# Prepare wreck sprites before gameplay

Baseline commit `b1e21a5c` compared with this change. The benchmark loaded the same benchmark save in two fresh Vite processes. The pre-change server used port 4180 and the changed server used port 4181.

```sh
BENCHMARK_URL=http://127.0.0.1:4180 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-wreck-before node scripts/benchmark-unit-heavy.mjs
BENCHMARK_URL=http://127.0.0.1:4181 BENCHMARK_FIXTURE=tmp/unit-heavy/baseline/fixture.cfb BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-wreck-after node scripts/benchmark-unit-heavy.mjs
```

Both captures used headed Chrome 157.0.8103.79, hardware ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.7.3 (Build 25G342)), webgpu terrain, DPR 2, and a 950×739 CSS-pixel viewport. The route covered 2.94 laps from a 400-unit save. V8 sampling was enabled for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Average FPS | 45.45 | 44.79 | -1.46% |
| Minimum FPS (1 s) | 1.00 | 1.00 | 0.00% |
| Frame p95 (ms) | 32.90 | 32.70 | -0.61% |
| Frame p99 (ms) | 133.80 | 150.10 | 12.18% |
| Frame max (ms) | 1016.40 | 1066.60 | 4.94% |
| Intervals above 1000/60 ms | 1555.00 | 1541.00 | -0.90% |
| Mean CPU update (ms) | 10.31 | 10.62 | 3.03% |
| Mean CPU render (ms) | 0.88 | 0.67 | -24.02% |
| Terrain GPU p95 (ms) | 17.83 | 18.48 | 3.68% |
| JS heap p95 (MiB) | 240.93 | 218.02 | -9.51% |
| Long tasks | 48.00 | 49.00 | 2.08% |
| Save readiness (ms) | 599.00 | 699.00 | 16.69% |
| Surviving units | 195.00 | 193.00 | -1.03% |

Browser page errors were 0 before and 0 after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.

## Impact

In the V8 profile, `getImageData` under wreck preparation accumulated 379 ms across 307 gameplay samples before the change and zero samples after it. Sampled garbage collection was 302 ms before and 304 ms after. Mean render submission cost dropped 24%. The full battle still ran below target, with a slightly lower average FPS in this pair. Map-restore preparation and AI search remained in the measurement window.

The work now happens during sprite generation before publication. Tank layers use their existing density-specific sources, hulls keep their sinking geometry, and standalone wrecks use the same luminance and noise formula. Original sources fall back to the already prepared density assets when unavailable offline. Final canvases are registered with their generation and the registry byte budget, with an additional 16 MiB wreck cap. The save-readiness metric starts after initial asset boot, so it does not measure the cost moved to boot.

Preparation adds zero grayscale work for each visible wreck at render cadence. At 60 FPS and 100 visible wrecks that leaves up to 6,000 sprite lookups per second. At DPR 2, final canvases remain at four backing pixels per logical pixel. Legacy numeric noise seeds retain the existing bounded overlay cache.

Changed-file lint and full lint passed. The unit suite passed 5,891 cases and reproduced the existing woodland soil sprite-sheet alpha mismatch, `U05433`.
