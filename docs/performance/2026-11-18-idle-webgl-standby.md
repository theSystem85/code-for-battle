# WebGL standby canvas clears

The active-display trace identified presentation delays during dense combat. While WebGPU rendered the terrain, each game frame also set the viewport and clear color on the hidden WebGL fallback context and cleared its color buffer. Avoid the standby operation while WebGPU owns the frame. The existing CPU terrain path still clears the WebGL canvas when needed, and WebGL is retained for device recovery.

At 60 FPS the previous path submitted up to 60 redundant clears per second at the canvas backing size of 1,900×1,478 pixels. This is a command count, because drivers can implement a clear as a fast metadata operation. The fix changes no pixel density, graphics setting, animation cadence, particle logic or layer order. The runtime adds no object allocations or per-entity work.

## Reproduce

Build each runtime revision and serve its production bundle on a local Vite preview. Keep the same benchmark harness in both comparisons. The baseline used the equivalent WebGL 2 clear probe before it was added to the harness.

```sh
export BENCHMARK_URL=http://127.0.0.1:4193
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_COMPOSITOR_TRACE=1
export BENCHMARK_COUNT_STANDBY_CLEARS=1
BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-standby-clear-before node scripts/benchmark-unit-heavy.mjs
# Build the patched revision, then repeat.
BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-standby-clear-after node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy.mjs tmp/unit-heavy/gpu-standby-clear-before tmp/unit-heavy/gpu-standby-clear-after
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/gpu-standby-clear-before/compositor.json
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/gpu-standby-clear-after/compositor.json
```

## Stationary battle results

Both production captures used headed Chrome 157.0.8103.79 on the Apple M1 with hardware WebGPU and the built-in 60 Hz Retina display. The 500-unit save had 499 live units at the first measured frame and 480 at the end of each run. The camera remained stationary, the tutorial was disabled through `?tutorial=0`, and the defeat guard remained active. Both runs sampled a foreground WebGPU page throughout and reached 21 Apache rockets and 18 impacts in the viewport. Neither logged a page error.

| Metric | Before | After |
| --- | ---: | ---: |
| Standby WebGL clears | 126 | 0 |
| Average callback FPS | 2.077 | 2.111 |
| Minimum callback FPS over one second | 2 | 2 |
| Average Chrome-reported presentation FPS | 2.125 | 2.094 |
| Minimum presentation FPS over one second | 1 | 1 |
| Presentation p95 / p99 / max (ms) | 966.6 / 966.7 / 983.3 | 966.6 / 983.3 / 983.3 |
| Presentation intervals over 16.67 ms | 115 | 111 |
| Mean CPU update (ms) | 40.65 | 39.66 |
| Mean CPU render submission (ms) | 4.33 | 4.25 |
| CPU effects submission p95 (ms) | 0.70 | 0.70 |
| Main terrain GPU p95 (ms) | 17.83 | 17.63 |
| Static ground GPU p95 (ms) | 18.02 | 16.19 |
| JS heap p95 (MiB) | 166.04 | 144.95 |
| Longest Core Animation backpressure (ms) | 961.81 | 943.35 |

The callback average rose 1.66%. The presentation average fell 1.50%, and both minimums remained unchanged. The pair demonstrates removal of all standby clears and no presentation FPS gain. The nearly one-second presentation stalls persisted, and the scene still misses the 60 FPS gate.

The production build and lint passed. Headed Chromium test `E00249` verified zero clears on the hidden canvas during active WebGPU frames, then exercised real device loss, hardware WebGL fallback and WebGPU recovery. The existing CPU-only terrain case `U03718` passed. The full unit suite passed 5,901 cases and reproduced the existing map-sprite alpha failure `U05433`.
