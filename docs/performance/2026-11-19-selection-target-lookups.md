# Selection target lookups with 100 tanks

Unit overlays used to fall back to scanning the selection when the frame index was unnecessary. At 100 selected units and 100 visible units that can mean up to 10,000 selection entries per scan per frame. Target and service overlays now read the existing cleared index when there is no target to look up. Direct repair, tow, healing and refuel assignments count as targets when deciding whether to populate the index.

## Hardware measurements

The fixed-camera fixture imported the same 500-unit save and displayed the same 100 tanks each run. Simulation was held to isolate rendering. The tutorial was disabled. Chrome 157 used the Apple M1 Metal GPU and WebGPU terrain at 950×739 CSS pixels, DPR 2 and about 60 Hz. Timings use 15-second captures on the local Vite server. FPS and frame intervals come from Chrome presentation events. GPU terrain timing excludes the 2D foreground.

| Run | Avg FPS | Lowest one-second FPS | CPU render (ms) |
| --- | ---: | ---: | ---: |
| dev baseline, shadows on, unselected | 26.81 | 25 | 2.53 |
| dev baseline, shadows on, selected | 24.21 | 22 | 4.58 |
| Lookup change, shadows on, unselected | 59.89 | 59 | 1.66 |
| Lookup change, shadows on, selected | 24.21 | 22 | 4.39 |
| Lookup and donut path experiment, shadows on, selected | 24.05 | 22 | 4.90 |
| Lookup and donut path experiment, shadows off, selected | 59.91 | 59 | 2.95 |
| Lookup and donut path experiment, shadows off, unselected | 59.91 | 59 | 1.49 |

The lookup change lowered mean selected render submission by 0.19 ms in this pair. Selected p95 and p99 presentation intervals held at 83.331 ms. Maximum fell from 116.663 ms to 83.331 ms and intervals over 16.67 ms fell from 281 to 278. Presented FPS held steady. The donut path experiment was removed after it increased CPU submission. Unselected performance varied widely with shadows enabled. The final pair reproduced a large selection drop and full-quality 60 FPS acceptance remains open.

The selected baseline and lookup runs accumulated 11.25 s and 11.28 s of compositor backpressure respectively. The highest sampled terrain GPU time was 11.40 ms and 10.68 ms. JS heap endpoints were 159→182 MB and 154→92 MB. The heap endpoints do not identify individual collection pauses.

Three separate ten-second diagnostic runs suppressed one HUD component each while leaving the tanks selected and shadows enabled. Suppressing the glow yielded 24.38 average and 22 minimum FPS, suppressing the arcs yielded 25.85 and 24, and suppressing crew badges yielded 24.52 and 23. Removing the arcs reduced CPU render submission to 3.61 ms. Each omission leaves a substantial presentation bottleneck.

## Reproduce

```sh
export BENCHMARK_URL=http://127.0.0.1:4213
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_BATTLE_DURATION_MS=15000
BENCHMARK_UNIT_SHADOWS=1 BENCHMARK_HUD_SELECTION=selected BENCHMARK_OUTPUT=tmp/unit-heavy/nov19-final-selected node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/nov19-final-selected/compositor.json
```

Use a fresh output directory for each run. Set `BENCHMARK_HUD_SELECTION=unselected` for the matched control and `BENCHMARK_UNIT_SHADOWS=0` for the settings-based diagnostic. In selected mode, set `BENCHMARK_OMIT_HUD` to `glow`, `arcs` or `crew` for the individual probes.

Lint and script syntax checks passed. The unit and integration suite passed 5,996 tests and reproduced the existing U05433 terrain alpha failure. The full Chromium attempt stopped on a startup resource 404 in E00001. The focused retry passed E00001, E00264 and E00049.
