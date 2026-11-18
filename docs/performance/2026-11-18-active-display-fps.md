# Production FPS on the active Retina display

The Apple M1 and built-in 2560×1600 Retina display were confirmed from the same unsandboxed launch context as headed Chrome. CoreGraphics reported one active display, ID 1, with a 60 Hz mode. The sandboxed shell reported zero displays in the same session. Earlier zero-display checks established the sandbox's lack of display visibility.

The production build used the game code at `a2a2cc41` and the existing 500-unit fixture, hardware WebGPU terrain and a 950×739 CSS-pixel canvas at DPR 2. The stationary capture began with 499 live units, one fewer than the save fixture. It finished with 480 units and 47 selected tanks. The tutorial was disabled at startup by `?tutorial=0`. The camera stayed fixed, defeat was prevented, and all sampled windows reported foreground focus. At the busiest points there were 20 Apache rockets and 18 impacts with centers in the viewport.

## Reproduce

From the graphical login session, verify the display in System Information, run `npm run build`, and start `npm run preview -- --host 127.0.0.1 --port 4193 --strictPort`. Use the fixture linked from the [production setup report](2026-11-18-physical-display-acceptance.md).

```sh
export BENCHMARK_URL=http://127.0.0.1:4193
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1
export BENCHMARK_PROFILE=1
export BENCHMARK_COMPOSITOR_TRACE=1
BENCHMARK_BATTLE_ONLY=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-active-display-marked node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/gpu-active-display-marked/compositor.json
BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-active-display-scroll node scripts/benchmark-unit-heavy.mjs
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/gpu-active-display-scroll/compositor.json
```

The analyzer selects the game tab's renderer PID from the start and end marks and counts distinct Chrome presentation-feedback timestamps within that window. Chrome can record multiple compositor reporters for one displayed frame. Chromium reports platform presentation feedback and may estimate the physical presentation timestamp, so these figures are compositor-reported measurements on a verified display. [Chromium compositor source](https://chromium.googlesource.com/chromium/src/+/HEAD/cc/metrics/compositor_frame_reporter.cc) · [Chromium frame lifecycle](https://chromium.googlesource.com/chromium/src/+/main/docs/life_of_a_frame.md)

## Stationary battle

| Metric | Animation callbacks | Chrome presentation feedback |
| --- | ---: | ---: |
| Average FPS | 2.116 | 2.149 |
| Minimum FPS over one second | 2 | 1 |
| Frame interval p95 / p99 / max (ms) | 966.4 / 983.4 / 984.2 | 950.0 / 966.7 / 983.3 |
| Intervals above 16.67 ms | 127 | 110 |

The trace recorded 130 distinct presentation-feedback timestamps in 60.49 seconds. The previous production comparison measured 2.097 callback FPS. This capture's callback average was 0.019 FPS higher (+0.9%) with tracing enabled and one fewer unit at the start. This verification made no runtime changes and demonstrates no optimization gain. A separate preliminary active-display run measured 2.108 callback FPS.

Mean update was 39.64 ms and mean render submission was 4.22 ms. The effects phase was 0.70 ms at p95. The longest Chrome GPU-process swap lasted 976.67 ms. Core Animation backpressure reached 954.97 ms and accounted for 54.27 seconds of the 59.15 seconds recorded inside swaps. The longest individual Chrome raster command was 5.71 ms. GPU-process spans may be nested.

## Cold and repeated scrolling

The separate scrolling capture began with 499 live units, traveled 2.94 laps at 3,600 logical pixels/s, reached 53 simultaneous projectiles anywhere in the match, and finished with 261 units. The tutorial was disabled, the browser remained foregrounded, and no page errors were recorded.

| Metric | Animation callbacks | Chrome presentation feedback |
| --- | ---: | ---: |
| Average FPS | 50.819 | 49.519 |
| Minimum FPS over one second | 1 | 0 |
| Frame interval p95 / p99 / max (ms) | 17.6 / 50.0 / 1,099.8 | 33.3 / 50.0 / 1,116.6 |
| Intervals above 16.67 ms | 1,689 | 1,575 |

The callback harness reports its worst trailing window ending on a callback. The presentation analyzer also checks complete windows just before feedback, which captures a full second without a frame during the longest scrolling gap. The first traversal averaged 35.28 presented FPS over 20.41 seconds. The remaining 1.94 laps averaged 56.86 over 39.61 seconds. Mean CPU update was 10.03 ms and mean render submission was 0.50 ms.

Both active-display scenarios missed the 60 FPS gate. The stationary battle continued to spend most of its observed swap time in Core Animation backpressure, and simulation also exceeded the whole 16.67 ms budget. The capture did not identify impact rasterization as a material source of the worst stalls. The trace provides no basis for preferring a particle shader over investigation of presentation and CPU simulation in the dense scene.

The trace analyzer was checked against both full hardware captures. Lint passed. The full unit suite passed 5,901 cases and reproduced the existing map-sprite alpha failure `U05433`.
