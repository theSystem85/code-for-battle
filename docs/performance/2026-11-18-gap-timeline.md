# Stationary battle presentation gap timeline

The report tool `scripts/performance/report-unit-heavy-gaps.mjs` aligns game-frame samples with the marked Chrome trace clock, finds distinct presentation timestamps from the marked renderer, and lists the ten longest intervals. It reports the game frames and Chrome span intersections during each interval. The clock alignment uses the start mark's performance-clock value and trace timestamp. Overlap is a timing correlation; the trace does not link these spans to individual game frames.

This table analyzes the A1 normal capture in the [simulation throughput report](2026-11-18-simulation-throughput.md), collected on the active Apple M1 display at a measured 60 Hz blank-page cadence. The trace and game timestamps use different units and are aligned by the benchmark mark.

| Gap start (s) | Gap (ms) | Game frame reports | Longest update (ms) | Longest overlapping backpressure span (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 32.800 | 1016.6 | 2 | 45.3 | 984.5 |
| 28.234 | 1000.0 | 1 | 48.1 | 974.3 |
| 29.767 | 1000.0 | 1 | 48.7 | 971.1 |
| 3.467 | 983.3 | 1 | 58.4 | 956.8 |
| 56.784 | 983.3 | 1 | 80.5 | 962.3 |
| 5.951 | 983.3 | 2 | 29.1 | 948.5 |
| 31.800 | 983.3 | 1 | 37.7 | 944.4 |
| 9.384 | 966.7 | 1 | 44.7 | 909.9 |
| 18.034 | 966.7 | 1 | 52.9 | 922.0 |
| 4.984 | 966.6 | 2 | 52.2 | 942.1 |

The first delayed stage is still unknown. The current trace lacks per-frame scheduler, submission and compositor identifiers. Some timestamps occur in bursts and cannot be safely matched based only on adjacency. The tool records absent overlap as null and rejects missing marks or insufficient feedback. It does not establish whether a zero-feedback interval reflects a missed presentation or missing telemetry. A positive-control animation and tracing-overhead comparison are still needed.

Reproduce after obtaining the same hardware capture.

```sh
node scripts/performance/report-unit-heavy-gaps.mjs tmp/unit-heavy/tick-measure-0/compositor.json tmp/unit-heavy/tick-measure-0/result.json
```

## Positive control and profiler overhead

A 15-second headed Chrome positive control drew a moving square into an 800×600 CSS-pixel 2D canvas at DPR 2 on the active M1 Retina display. The hardware adapter was verified. It averaged 60.00 animation callbacks and 59.935 compositor-reported presentations per second. Its worst one-second window contained 59 feedback timestamps, and p95 / p99 / maximum presentation intervals were 16.667 / 16.667 / 16.668 ms. The current analyzer uses a strict 16.6667 ms threshold, so timestamp quantization counts many 16.667 ms intervals as missed; deadline counts in this control should not be interpreted without that precision caveat. The control does not reproduce the game's layered scene.

```sh
node scripts/performance/benchmark-canvas-control.mjs tmp/unit-heavy/positive-control
node scripts/performance/report-unit-heavy-presentation.mjs tmp/unit-heavy/positive-control/compositor.json
```

Four 15-second stationary battle captures used the same M1 adapter, fixed camera, tutorial flag, defeat guard and compositor tracing. The two middle runs enabled CPU sampling. Every run had visible Apache rockets and impacts, zero sampled invalid scene or camera drift frames, and no page errors. Starts were 500, 499, 499 and 500 units respectively.

| Run | CPU profiling | Average presented FPS | Worst 1 s FPS | p95 / p99 / max presentation interval (ms) |
| --- | --- | ---: | ---: | --- |
| A1 | off | 2.115 | 1 | 983.3 / 983.3 / 983.3 |
| B1 | on | 2.175 | 1 | 983.3 / 983.3 / 983.3 |
| B2 | on | 2.181 | 1 | 983.3 / 1000.0 / 1000.0 |
| A2 | off | 2.234 | 1 | 983.3 / 983.3 / 983.3 |

The two-run averages were 2.174 FPS with profiling off and 2.178 on. The difference is smaller than the control spread, and the short captures do not establish a precise overhead bound. Compositor tracing was enabled in every run, so these results isolate the effect of adding CPU sampling only.

```sh
for run in a1 b1 b2 a2; do
  case "$run" in b*) profile=1 ;; *) profile=0 ;; esac
  BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_BATTLE_DURATION_MS=15000 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_PROFILE=$profile BENCHMARK_OUTPUT=tmp/unit-heavy/profiler-overhead-$run node scripts/benchmark-unit-heavy.mjs
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/profiler-overhead-$run/compositor.json"
done
```
