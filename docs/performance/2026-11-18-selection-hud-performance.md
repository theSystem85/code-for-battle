# Selection HUD rendering with 100 tanks

The default donut HUD paints one radial glow and several status arcs per selected tank. Each filled arc uses up to eight gradient segment strokes in addition to its rail. At 100 visible selected tanks and 60 FPS, each per-tank operation runs up to 6,000 times per second. Three full status bars alone can issue up to 162,000 strokes per second. At DPR 2, a nominal 48×48 CSS-pixel glow spans about 9,216 backing pixels before clipping.

The selected rendering path now reuses one radial gradient per context, radius and party color. The draw translates the same vector ring to the unit position. The cache holds up to 64 gradients per context. Donut arcs calculate angles directly without rebuilding the four edge arrays, and crew badges reuse their offsets and set text state once per tank. Status fills keep their original vector painting. The existing Canvas2D status shapes and shadow draw order are preserved.

## Reproduce

The scene imports the [500-unit fixture](2026-11-18-physical-display-acceptance.md) and arranges 100 of its tanks in a 10×10 grid centered in the viewport. It holds simulation and camera position to isolate rendering. The tutorial stays disabled. The benchmark selects either all 100 or none. The primary runs retain shadows, sprites, terrain and the HUD. Separate diagnostics use `BENCHMARK_HOLD_FOREGROUND=shadow-size` to suppress the previously identified 276×276 shadow sources. That diagnostic isolates the selection penalty from a separate rendering bottleneck.

The M1 Retina display was active at DPR 2. Chrome 157.0.8103.79 used Metal and WebGPU terrain. The viewport was 950×739 CSS pixels and the blank-page cadence was approximately 60 Hz. The baseline is the `61e5a7d0` production build on port 4197. Runtime source was unchanged between that commit and the start of this task. The fixture SHA-256 was `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce`. The candidate was built with `node node_modules/vite/bin/vite.js build --outDir tmp/unit-heavy/hud-order-preserved-dist` and served on port 4202.

```sh
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_BATTLE_DURATION_MS=30000
BENCHMARK_URL=http://127.0.0.1:4202 BENCHMARK_HUD_SELECTION=selected BENCHMARK_OUTPUT=tmp/unit-heavy/hud-vector-only-selected-1 node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/hud-vector-only-selected-1/compositor.json
```

Repeat with port 4197 for baseline, set `BENCHMARK_HUD_SELECTION=unselected` for the no-selection control, and use a unique output directory for every run.

## Presented frame rates

Minimum FPS is the lowest rolling one-second frame count from the Chrome compositor trace. Frame times and misses use timestamps for presented frames and the 16.67 ms deadline. CPU render submission excludes asynchronous rasterization and presentation. The simulation used 0 ms in the stationary runs.

| Run | Avg FPS | Min FPS | P95 / P99 / max frame (ms) | Misses | CPU render (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Early baseline, unselected | 30.19 | 28 | 66.665 / 66.665 / 66.666 | 592 | 2.31 |
| Early baseline, selected 1 | 23.46 | 16 | 83.331 / 99.997 / 116.664 | 528 | 4.41 |
| Early baseline, selected 2 | 24.19 | 20 | 83.330 / 83.331 / 99.996 | 526 | 4.25 |
| Fresh baseline, selected | 16.84 | 12 | 99.996 / 99.996 / 99.996 | 356 | 4.36 |
| Candidate, selected 1 | 16.84 | 13 | 99.996 / 99.996 / 116.662 | 337 | 4.42 |
| Candidate, selected 2 | 17.84 | 14 | 99.995 / 99.996 / 99.996 | 351 | 4.68 |
| Candidate, unselected | 19.50 | 14 | 83.330 / 83.330 / 99.995 | 396 | 2.48 |
| Baseline, selected with shadow-source suppression | 59.85 | 57 | 16.666 / 16.666 / 33.332 | 4 | 3.27 |
| Candidate, selected with shadow-source suppression | 59.81 | 57 | 16.666 / 16.666 / 49.998 | 4 | 3.10 |

Against the fresh selected control, the two candidate runs averaged 17.34 FPS, up 0.50 FPS (+3.0%), and the lowest one-second result increased from 12 to 13 FPS. Earlier selected controls were 6.62–7.35 FPS faster than the fresh control, so this comparison does not establish a repeatable production FPS gain. In the shadow-suppressed runs, CPU submission fell by 0.17 ms (5.3%) with presentation already near the display limit. All runs held the camera and kept 100 tanks in the scene. The fixture reproduces a selection penalty, but the full-quality, unselected controls did not reach the 60 FPS observed in the reported match.

The fresh control and two selected candidates spent 23.97, 23.79 and 23.72 seconds respectively in the compositor backpressure trace slice across each 30-second sample. Sampled WebGPU terrain p95 timings were 12.98, 10.49 and 16.38 ms. They cover terrain only. CDP JS heap before/after was 102/67, 129/54 and 112/61 MB respectively. Two endpoint readings do not identify individual GC pauses. The results show that CPU submission alone cannot explain the measured frame intervals. Shadow suppression drops the candidate's measured backpressure to 0.05 seconds and is diagnostic only.

## Scrolling regression check

Unset `BENCHMARK_BATTLE_ONLY` and `BENCHMARK_HUD_SELECTION` and repeat with output directories `hud-vector-scroll-baseline` and `hud-vector-scroll-candidate`. Each run started with 500 units and 47 tanks selected, then followed 2.94 laps of the full-map route at 3,600 CSS pixels per second. The runs started immediately after preparation, with normal simulation, movement, weapons fire and procedural water. The tutorial stayed disabled and the defeat guard protected all four construction yards. Neither run captured on-screen Apache rockets or impacts, so this pair does not establish effects-heavy scrolling acceptance.

| Run | Avg FPS | Min FPS | P95 / P99 / max frame (ms) | Misses | CPU update / render (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 51.83 | 28 | 33.332 / 49.998 / 83.331 | 415 | 10.38 / 1.44 |
| Candidate | 53.19 | 28 | 33.332 / 49.998 / 99.995 | 335 | 10.59 / 1.39 |

The candidate averaged 1.36 FPS higher, with the same one-second minimum and a longer worst interval. The battle populations ended at 264 and 260 units respectively. One pair with a live battle does not establish a repeatable scrolling gain.

## Pixel verification

The hardware browser matched every channel in 24 captures of the glow, status arcs and crew badges, covering DPR 1 and 2, four fractional positions and three fill levels.

```sh
BENCHMARK_BASELINE_URL=http://127.0.0.1:4197 BENCHMARK_URL=http://127.0.0.1:4202 node scripts/performance/selection-hud-parity.mjs
```

## Experiments discarded after measurement

| Selected 100-tank path | Mean presented FPS across two full-quality runs | Mean render submission |
| --- | ---: | ---: |
| Initial baseline | 23.83 | 4.33 ms |
| Raster-cached donut glow and arc rails | 19.63 | 3.87 ms |
| Vector HUD changes plus compact canvas shadow sources | 16.94 | 4.33 ms |
| Vector HUD changes plus compact bitmap shadow sources | 17.42 | 4.44 ms |

The raster cache saved submission time and regressed actual presentation against the early baseline. A single conic-gradient arc changed the appearance of full status bars in pixel comparisons. Both experiments were removed. The compact canvas shadow matched the 168 sampled shadow pixel cases. Both compact formats fell below the early baseline and overlapped the range of the later controls and candidate, so there was no demonstrated gain. The final HUD change retains the original shadow source and segmented status painting.

In the separate shadow-suppressed diagnostic, the unselected baseline delivered 59.88 average and 58 minimum FPS with 1.64 ms CPU submission. Selecting the 100 tanks added 1.64 ms of CPU submission even when the display could still present nearly 60 FPS. The full-quality 60 FPS target remains open.

## Automated checks

`npm run lint:fix:changed` and `npm run lint` passed. `npm run test:unit` passed 5,910 tests, including the gradient-reuse assertion in U04799. The one failure was the existing U05433 check for the `woodland_lakes_stones_soil` WebP alpha channel. It reported 98 differing alpha values before and after this change.
