# Selected units and shadow compositing

Work on dev. The user authorized committing and pushing after resolving the measured 100-tank selection slowdown.

## Plan and measured decisions

1. Correct the fixture to find 100 unobstructed land tiles, center the tank images inside them, and record the positions and camera. The harness rejects tanks on water, rock, buildings or seed crystals. Tutorial startup remains disabled and construction yards retain defeat protection.
2. Measure selected and unselected controls with identical shadows and terrain.
3. Group selection rendering after unit bodies. This produced 25.78 average and 24 minimum FPS against the initial land selected control's 25.89 and 24. The experiment was removed.
4. Composite ground shadows into a reused native-DPR surface, then copy that surface once into the foreground before entity bodies. This restored nearly 60 FPS in the selected fixture. The candidate retains the existing shadow cache, mask generation and per-unit draws. It changes their destination surface.
5. Verify pixels, repeat the land measurements, and check live combat and scrolling.

## Why this change

At 100 units and 60 frames per second, direct ground shadows issue 6,000 source draws per second into the foreground. The foreground also receives all selection glow, segmented status arcs and crew badges. The compositor trace showed substantial backpressure in this combination even though JavaScript submission took under 5 ms per frame. Moving the shadow draws to one retained surface cuts the foreground shadow submissions to one per frame. The trace establishes the benefit of this routing change. It does not identify Chrome's internal driver synchronization mechanism.

The surface uses the foreground's backing dimensions and transform. At DPR 2 in this capture it is 1900×1478, about 10.7 MiB of RGBA pixels, plus browser-managed buffering. The byte budget is 64 MiB. Larger backing surfaces use the direct destination. Each frame clears the retained surface, renders shadow opacity per unit, and composites with alpha 1 before all buildings and unit bodies. Factory-exit visibility participates in the individual shadow draw. Aircraft keep their existing shadow behavior. No source-image resizing occurs in this pass.

## Final centered-land captures

Active built-in Retina display, Apple M1 Metal GPU, Chrome 157.0.8103.79, WebGPU terrain, 950×739 CSS pixels and DPR 2. The blank-page cadence was about 60 Hz. The save SHA-256 is `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce`. Each selected run has 100 tanks and the camera remains fixed. Simulation is held to isolate rendering. Controls lasted ten seconds and final candidate repeats lasted fifteen seconds. These are browser presentation measurements from compositor feedback, with the lowest rolling one-second count used for minimum FPS.

| Run | Avg FPS | Min FPS | P95 / P99 / max gap (ms) | CPU render (ms) |
| --- | ---: | ---: | ---: | ---: |
| Original, unselected | 29.49 | 28 | 66.665 / 66.665 / 99.997 | 2.48 |
| Original, selected | 26.58 | 25 | 66.665 / 83.330 / 83.330 | 4.75 |
| Composite, selected 1 | 59.93 | 59 | 16.667 / 16.668 / 33.333 | 3.18 |
| Composite, unselected | 59.98 | 60 | 16.667 / 16.668 / 16.668 | 1.98 |
| Composite, selected 2 | 59.97 | 60 | 16.667 / 16.667 / 16.668 | 3.15 |

Mean selected FPS increased from 26.58 to 59.95, about 126%. The lowest one-second count increased from 25 to 59. Selected CPU render submission fell about 33%. The selected and unselected candidate runs differed by about 0.03 FPS. A doubled presentation interval occurred in one selected repeat, so these measurements establish near-60 behavior for the fixture while the strict every-frame deadline remains open. Hundreds of intervals round to 16.667 or 16.668 ms, exceeding the mathematical 16.666667 ms budget by microseconds. The raw reporter counts those as deadline misses as well.

The original selected trace accumulated 7.46 s of backpressure over its ten-second capture. Final selected traces accumulated 15.15 ms and 3.85 ms across fifteen seconds each. JS heap endpoints were 175→191 MB for the original and 162→88 MB and 132→88 MB for the selected candidate repeats. Those endpoints do not identify individual collection pauses or native graphics memory.

## Visual and larger-workload checks

The shadow composite pixel probe matched every channel in twelve cases covering DPR 1/2, full/half opacity, overlapping shadows, factory-style partial visibility and integer/fractional positions. It uses the production cached shadow draw routine and default shadow settings. Layering coverage checks that the composite precedes the exiting unit and buildings. Hardware parity does not cover every possible sprite, graphics setting or backdrop.

A separate thirty-second live battle started with 500 units and 47 selected tanks and finished with 327 units. It presented 53.59 average and 43 minimum FPS, with p95/p99/max gaps of 33.333/33.333/83.333 ms. Mean CPU update/render was 8.81/3.48 ms. It recorded 21 on-screen Apache rockets and 28 impacts, with zero camera drift or invalid scene frames.

The sixty-second scrolling check completed 2.94 full-map laps and finished with 244 of 500 units. It presented 59.04 average and 45 minimum FPS, with p95/p99/max gaps of 16.667/33.333/83.332 ms. Mean CPU update/render was 9.55/1.37 ms. These larger workloads still miss individual 60 FPS deadlines.

## Reproduce locally

```sh
npm run dev -- --host 127.0.0.1 --port 4213 --strictPort
export BENCHMARK_URL=http://127.0.0.1:4213
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_BATTLE_DURATION_MS=15000
BENCHMARK_HUD_SELECTION=selected BENCHMARK_OUTPUT=tmp/unit-heavy/local-land-selected node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/local-land-selected/compositor.json
node scripts/performance/shadow-composite-parity.mjs
```

Repeat with `BENCHMARK_HUD_SELECTION=unselected` and a fresh output directory. The captured `hudLandPositions` and `hudCamera` must match. Actual local final captures are under `tmp/unit-heavy/nov19-land-centered-*`. Live battle and scrolling captures are under `tmp/unit-heavy/nov19-shadow-composite-*`.

## Automated validation

`npm run lint:fix:changed` and `npm run lint` passed. `npm run test:unit` passed 5,910 tests and reproduced the existing U05433 terrain alpha failure. The final `npm run test` passed 5,996 unit and integration tests with that same single failure. The focused Chromium run passed E00001, E00049 and E00264. A full Chromium attempt stopped at E00002 after two passes, reporting the previously observed camera-demand cancellation and missing `first_apache.mp4` and `helipad.mp4` milestone videos. The remaining 228 cases did not run in that attempt.
