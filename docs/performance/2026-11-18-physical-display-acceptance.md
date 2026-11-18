# Production battle and physical-display acceptance

macOS reported the Apple M1 GPU with Metal support. CoreGraphics returned success with zero active displays and main display ID 0. Testing in this session can verify the hardware rendering adapter and animation callback cadence. The physical presented-frame gate requires an active display.

```sh
system_profiler SPDisplaysDataType
npm run build
npm run preview -- --host 127.0.0.1 --port 4193 --strictPort
```

In a separate shell, run the benchmark against the built app. It imports the same save through the game's native file input and verifies the tutorial flag, sustained combat, a fixed camera and the hardware GPU. To use the same fixture on another checkout, generate it once using the commands in the [CPU benchmark spec](../../specs/2026-11-17-unit-heavy-cpu-performance.md#reproduce) with `BENCHMARK_UNITS_PER_PARTY=125` and keep the generated save for repeat runs.

```sh
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-production-verification node scripts/benchmark-unit-heavy.mjs
```

For physical verification, run the stationary battle first on an active display at 60 Hz or faster. Set `BENCHMARK_COMPOSITOR_TRACE=1` to record the Chrome compositor trace with the callback timings, and check its presentation events for delivered frames. The cold and repeated full-map scrolling checks are separate runs using the same build and save with `BENCHMARK_BATTLE_ONLY` unset and a separate output directory.

Physical 60 FPS acceptance and the scrolling presentation check remain open.

## Compiled game results

Both runs used the 500-unit save, the fixed camera, DPR 2, Apache rocket combat, `?tutorial=0`, the defeat guard and verified hardware WebGPU terrain. Both finished with 481 units and zero page errors. The first production build inlined the atlas worker as a data URL, and sprite preparation fell back to the main thread. After correcting the Vite worker constructor, the build emitted a same-origin worker chunk and Chrome launched it during the benchmark. The final capture is in `tmp/unit-heavy/gpu-production-worker`.

| Metric | Production fallback | Production worker |
| --- | ---: | ---: |
| Average callback FPS | 2.097 | 2.097 |
| Minimum callback FPS over one second | 2 | 2 |
| Frame p95 / p99 / max (ms) | 967.0 / 982.4 / 983.4 | 966.8 / 981.8 / 984.0 |
| Intervals over 16.67 ms | 125 | 126 |
| Mean CPU update (ms) | 40.80 | 41.46 |
| Mean CPU rendering submission (ms) | 4.27 | 4.18 |
| CPU effects submission p95 (ms) | 0.70 | 0.70 |
| Main-thread V8 samples attributed to `createImageBitmap` (ms) | 918.30 | 0 |
| Main terrain GPU p95 (ms) | 14.55 | 23.46 |
| Static ground GPU p95 (ms) | 17.37 | 13.43 |
| JS heap p95 (MiB) | 137.38 | 137.89 |
| Peak Apache rockets in viewport | 18 | 18 |
| Peak impacts in viewport | 19 | 18 |

The worker removed the sampled main-thread bitmap work in the compiled app. Average callback FPS changed by +0.02% and minimum by 0%. The reported compositor issue and physical-display acceptance remain open.

The production build and lint passed. Headed Chromium test `E00264` verified crop parity and staging release. The unit suite passed 5,901 cases, with the existing map-sprite alpha test `U05433` still failing as on the unmodified dev baseline.
