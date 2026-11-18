# Chrome presentation trace in the stationary battle

The trace used the same Apple M1 hardware adapter, headed Chrome 157.0.8103.79, WebGPU terrain, 500-unit save, fixed camera, DPR 2, explicit tutorial startup flag, and defeat guard as the two optimization comparisons. This diagnostic ran for 15 seconds without the two WebGPU timestamp probes, and with Chrome compositor tracing enabled. The 60-second capture with only the static-ground timestamp probe off was a separate test.

```sh
export BENCHMARK_URL=http://127.0.0.1:4192
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_BATTLE_ONLY=1
BENCHMARK_STATIC_GROUND_TIMING=0 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-no-timestamps node scripts/benchmark-unit-heavy.mjs
BENCHMARK_STATIC_GROUND_TIMING=0 BENCHMARK_WEBGPU_TERRAIN_TIMING=0 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_BATTLE_DURATION_MS=15000 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-compositor-trace node scripts/benchmark-unit-heavy.mjs
BENCHMARK_BACKEND=webgl BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-webgl-stationary node scripts/benchmark-unit-heavy.mjs
```

Inspect `compositor.json` in Chrome's trace viewer. The GPU process records Metal and Core Animation wait durations. Nested trace durations overlap and should never be summed into a frame total.

| Chrome trace event | Events | Total (ms) | Longest (ms) |
| --- | ---: | ---: | ---: |
| Skia GPU swap buffers | 42 | 15,288.8 | 989.3 |
| Core Animation layer tree backpressure | 41 | 11,459.1 | 948.2 |
| Dawn IOSurface wait before scheduling overlays | 42 | 3,813.0 | 503.6 |
| Renderer main frame | 35 | 1,595.1 | 82.3 |
| Raster decode command | 239 | 113.7 | 5.7 |

The browser compositor received 950 macOS display-link callbacks during tracing and marked 33 swaps throttled. The trace identifies compositor and GPU-process waiting as the dominant observed delay in this session. It does not establish whether the same delay occurs on the physical display, or whether WebGPU combat effects would help there. The game's CPU update averaged 37.99 ms in the traced sample, also above the 16.67 ms total frame budget.

| Diagnostic | Seconds | Average callback FPS | Minimum FPS over one second |
| --- | ---: | ---: | ---: |
| WebGPU control with normal timestamp probes | 60 | 2.108 | 2 |
| WebGPU with static ground timestamps disabled | 60 | 2.096 | 2 |
| WebGPU with both probes disabled, compositor trace enabled | 15 | 2.170 | 1 |
| Hardware WebGL at the same DPR | 60 | 2.077 | 2 |

The callback slowdown persisted with both probes disabled and on the alternate hardware backend. Keep the current automatic backend policy. The next decision on rendering changes depends on a capture with physical presentation active, including actual compositor presentation timing, and on an independent CPU profile at realistic frame cadence.

The checked-in trace command was rerun on the same machine. It wrote a valid Chrome trace with 46,991 events and measured 2.234 callback FPS on average and 1 FPS minimum. The 15-second trace runs are diagnostic and separate from the 60-second optimization comparisons.
