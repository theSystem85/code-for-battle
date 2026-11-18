# Apache atlas preparation worker

The prepared Apache body atlas contains 240 distinct poses. One bounded worker decodes the selected atlas once, crops each requested pose at its final pixel size and transfers the resulting bitmap to the active sprite registry. The browser fallback uses the same crop and resize options. Crop jobs now use distinct per-entry keys, so same-sized rectangles from one atlas cannot share an in-flight result. Drawing still consumes the prepared bitmaps with the existing rotation, tilt, anchoring and DPR.

The worker reserves 24 MiB in the shared staging budget while active. It holds one decoded atlas and releases the reservation on idle shutdown, preparation failure or registry disposal. Queue concurrency remains limited by the existing preparation scheduler. The render loop does no new work.

```sh
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-atlas-worker-before node scripts/benchmark-unit-heavy.mjs
# Repeat with BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-atlas-worker-after.
node scripts/performance/report-unit-heavy.mjs tmp/unit-heavy/gpu-atlas-worker-before tmp/unit-heavy/gpu-atlas-worker-after
```

Both 60-second captures used headed Chrome 157.0.8103.79 on the verified Apple M1 Metal GPU, with WebGPU terrain, DPR 2 and the same 950×739 CSS-pixel viewport. They loaded the same 500-unit save and rendered 47 selected tanks with fixed camera, `?tutorial=0` and the defeat guard active. Both ended with 481 units and recorded zero page errors.

| Metric | Before | After |
| --- | ---: | ---: |
| Average callback FPS | 2.097 | 2.078 |
| Minimum callback FPS over one second | 2 | 2 |
| Frame p95 / p99 / max (ms) | 966.1 / 966.8 / 983.1 | 966.7 / 967.6 / 982.8 |
| Intervals over 16.67 ms | 124 | 125 |
| Mean CPU update (ms) | 41.91 | 40.91 |
| Mean CPU render submission (ms) | 4.26 | 4.23 |
| Main-thread V8 samples attributed to `createImageBitmap` (ms) | 605.93 | 0 |
| Terrain GPU p95 (ms) | 26.48 | 16.12 |
| Static ground GPU p95 (ms) | 12.52 | 11.53 |
| JS heap p95 (MiB) | 189.43 | 254.84 |
| Long tasks | 73 | 64 |
| Peak Apache rockets in viewport | 21 | 20 |
| Peak impacts in viewport | 18 | 18 |

Average callback FPS changed by −0.90% and minimum by 0%. The sampled atlas work left the main thread. The page CPU profiler does not measure worker time, and the FPS results show no gain in this session. Heap samples vary with browser collection and omit native bitmap allocations. The render and terrain metrics do not isolate the worker's contribution.

The headed Chromium regression test compared two different Apache poses cropped to 72×72 pixels, reported zero changed channels versus the original crop, and verified staging memory returned to zero after disposal.

The [compiled-game follow-up](2026-11-18-physical-display-acceptance.md#compiled-game-results) verified that Chrome loaded the same-origin worker chunk and no main-thread `createImageBitmap` samples remained in the production capture.
