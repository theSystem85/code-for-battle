# Stationary battle canvas source attribution

The active Apple M1 Metal GPU and internal Retina display were verified using `system_profiler SPDisplaysDataType`. Headed Chrome 157.0.8103.79 observed approximately 30 animation callbacks per second on a blank page in this session, so it cannot certify 60 FPS. These measurements use production preview on port 4193, the same 500-unit save, fixed camera, `?tutorial=0`, defeat protection, 47 selected tanks, DPR 2 and a 1900×1478 foreground backing canvas. All captures showed Apache rockets and impacts and no page errors. Diagnostic drawing suppression changes visual output and is used only for attribution.

| Capture | Duration (s) | Diagnostic | Avg presented FPS | Minimum 1 s FPS | Presentation p95 / p99 / max (ms) |
| --- | ---: | --- | ---: | ---: | --- |
| minimap A1 | 60 | normal | 2.098 | 1 | 966.6 / 983.3 / 983.3 |
| minimap B1 | 60 | minimap held | 2.135 | 1 | 950.0 / 983.3 / 983.3 |
| minimap B2 | 60 | minimap held | 2.109 | 1 | 966.6 / 983.3 / 983.3 |
| minimap A2 | 60 | normal | 2.082 | 1 | 966.6 / 966.7 / 983.3 |
| foreground B1 | 60 | all foreground pixel writes suppressed | 29.939 | 28 | 33.3 / 50.0 / 83.3 |
| foreground B2 | 60 | all foreground pixel writes suppressed | 29.936 | 26 | 33.3 / 50.0 / 133.3 |
| foreground A2 | 60 | normal | 2.093 | 1 | 966.6 / 966.7 / 983.3 |
| image B1 | 60 | all foreground drawImage calls suppressed | 30.012 | 29 | 33.3 / 33.3 / 66.7 |
| image B2 | 60 | all foreground drawImage calls suppressed | 29.907 | 28 | 33.3 / 50.0 / 100.0 |
| canvas | 20 | HTML and offscreen canvas sources suppressed | 29.954 | 28 | 33.3 / 50.0 / 83.3 |
| HTML canvas | 20 | HTML canvas sources suppressed | 2.213 | 1 | 966.7 / 983.3 / 983.3 |
| offscreen | 20 | offscreen canvas sources suppressed | 29.859 | 28 | 33.3 / 66.7 / 83.3 |
| shadow size | 60 | 276×276 offscreen sources suppressed | 29.983 | 29 | 33.3 / 33.3 / 83.3 |

The foreground run followed the minimap comparison, so its preceding normal control is minimap A2. Suppressing all foreground image draws changed simulation progress and surviving unit counts, limiting comparability. Mean control presented FPS across minimap A2 and foreground A2 was 2.088. The two image-suppressed runs averaged 29.960. This is an attribution experiment and cannot be claimed as a visual-preserving FPS improvement.

A 20-second production inventory found 42,541 foreground image draws, including 11,542 HTML canvas and 9,918 offscreen canvas draws. A separate 15-second development-server stack sample identified seven distinct offscreen sources, all 276×276 cached shadows drawn by `drawCachedUnitShadow` in `src/rendering/unitShadow.js`. This development sample is a lead about the production sources. The production size filter provides corroborating evidence, although size alone does not prove identity. The control's maximum Core Animation backpressure span was 952.8 ms in foreground A2, while the size-filter capture's maximum was 3.8 ms.

Reproduce from the graphical session with the existing fixture and production preview. Each run creates a separate output directory. Set the mode to `0`, `1`, `images`, `canvas`, `html-canvas`, `offscreen`, `shadow-size`, `inventory`, or `stacks`. The last two collect source names or up to 30 unique offscreen source stacks. A source-size filter is diagnostic and should not become a production policy.

```sh
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_HOLD_FOREGROUND=shadow-size BENCHMARK_OUTPUT=tmp/unit-heavy/foreground-shadow-size node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/foreground-shadow-size/compositor.json
```

Follow-up measurements found that bitmap and HTML canvas copies did not remove the stall. A bounded shadow draw is now the stronger candidate. See the [follow-up report](2026-11-18-shadow-bounds-followup.md). Confirm source identity and parity, support invalidation and fallback, and avoid per-frame conversions. The 60 FPS acceptance gate remains unverified. Benchmark resilience, frame-level linkage, matched per-tick CPU replay, matched cold traversal, and the conditional parallel-compute investigation remain open in the [checklist](2026-11-18-next-performance-checklist.md).

Verification for the diagnostic harness included lint and the full unit suite. Lint passed. The unit suite passed 5,901 tests and reproduced the previously documented `U05433` map-sprite alpha failure.
