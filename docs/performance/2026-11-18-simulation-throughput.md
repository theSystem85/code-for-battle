# Simulation throughput in the stationary battle

The harness now records the fixture SHA-256, simulation time at each reported game frame, camera drift frames and frames with a visible tutorial, defeat, pause, hidden page or lost focus. Counts start at the first benchmark callback and end with the last. The camera check samples game frame reports; it does not prove that the camera could not move between reports. Fixed-tick counts are inferred from the change in simulation time divided by the configured simulation step. This is a throughput estimate for the single-player fixture, not a direct measurement of individual tick duration.

The Apple M1 Metal GPU and internal display were active. Headed Chrome 157 observed 60 Hz blank-page callbacks in each run. The production build, 500-unit fixture, fixed camera, tutorial startup flag, defeat guard, 47 selected tanks and DPR 2 were used. Each 60-second capture had visible Apache rockets and impacts, no page errors, zero sampled camera drift and zero invalid sampled scene frames. The fixture SHA-256 was `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce`.

| Run order | Mode | Presented FPS avg / worst 1 s | Presentation p95 / p99 / max (ms) | Inferred ticks / wall s | Mean update ms / render frame | Starting / ending units |
| --- | --- | --- | --- | ---: | ---: | --- |
| A1 | normal | 2.205 / 0 | 983.3 / 1000.0 / 1016.6 | 9.87 | 40.92 | 500 / 481 |
| B1 | bounded shadow diagnostic | 27.986 / 16 | 83.3 / 100.0 / 116.7 | 59.82 | 19.13 | 500 / 247 |
| B2 | bounded shadow diagnostic | 27.467 / 18 | 83.3 / 100.0 / 116.7 | 59.87 | 18.74 | 500 / 260 |
| A2 | normal | 2.165 / 0 | 966.7 / 1000.0 / 1016.6 | 10.03 | 40.24 | 500 / 481 |

The normal run advances roughly 10 simulated seconds during a minute of wall time because frame delays interact with the capped foreground simulation delta. The bounded diagnostic advances roughly 60 simulated seconds. The much different battle progress changes the number and state of units, so frame update times are not a matched per-tick comparison. The fixture-specific rectangle has not passed visual parity and is not a production fix. The 60 FPS deadline is missed in both modes.

Reproduce with the [existing setup and fixture](2026-11-18-physical-display-acceptance.md). Run `BENCHMARK_HOLD_FOREGROUND=0` and `BENCHMARK_HOLD_FOREGROUND=crop-shadows` in A1/B1/B2/A2 order with `BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1`. Analyze each `compositor.json` with `node scripts/performance/report-unit-heavy-presentation.mjs`. Check `result.json` for the fixture hash, scene counters and `cpuFrames[].simulationDeltaMs`.

Remaining work includes validating sustained combat and tutorial suppression from startup, matching tick duration and state in a deterministic replay, correlating first-use preparation with a controlled cold and warm scrolling route, and measuring frame event linkage and instrumentation overhead. The [checklist](2026-11-18-next-performance-checklist.md) remains open for these tasks.

The unit suite passed 5,903 tests and reproduced the existing `U05433` map-sprite alpha failure. The gap reporter's focused tests passed.
