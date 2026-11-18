# GPU unit-shadow batch and protected scrolling

The benchmark-only prototype intercepts the cached 276×276 OffscreenCanvas sources identified by the [source inventory](2026-11-18-shadow-source-attribution.md). It copies each encountered source rectangle into a bounded 1024×1024 RGBA atlas and batches its position, UVs and opacity into one WebGL 2 instanced draw per frame with eligible shadows. The prototype uses a transparent canvas below the foreground. It preserves each instance's placement, scale and opacity, but moves all batched shadows below foreground content. The selector is fixture-specific. A source outside its size filter stays on the regular path.

The atlas allocates 4 MiB. The instance buffer is 36 KiB for up to 1,024 shadows. The extra 1900×1478 backing canvas has about 10.7 MiB of pixels per color buffer at DPR 2. Browser buffering may add memory. The extra canvas clears its full surface each frame. The GPU and compositor cost of that surface is included in the hardware measurements.

## Defeat protection

Both benchmark modes now protect construction yards from lethal damage and sale. The harness requires a local yard before measuring and fails if the match ends, the local player is defeated, or the game pauses. Four construction yards were protected in each run, including the local yard. Unit damage, simulation and combat continued. Both scrolling captures completed the 60-second route of 2.94 laps with no game-over or pause. The control and prototype finished with 264 and 262 units respectively.

## Hardware measurements

Each pair used the same production bundle from `61e5a7d0`, 500-unit fixture, 47 selected tanks, active Apple M1 Metal GPU, Chrome 157.0.8103.79, WebGPU terrain, 950×739 CSS pixels at DPR 2 and approximately 60 Hz blank-page cadence. The tutorial was disabled. The battle camera stayed fixed and recorded visible Apache rockets and impacts. Each mode was measured once for 60 seconds, control first. All four runs completed without page errors.

| Workload | Mode | Avg presented FPS | Worst 1 s FPS | p95 / p99 / max gap (ms) | Intervals over 16.67 ms | Max compositor backpressure (ms) |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| Stationary battle | Canvas2D control | 35.295 | 18 | 83.330 / 99.997 / 99.998 | 1,330 | 90.9 |
| Stationary battle | WebGL underlay | 57.276 | 44 | 33.332 / 33.333 / 83.331 | 1,086 | 12.5 |
| Scrolling | Canvas2D control | 56.061 | 33 | 33.332 / 49.998 / 83.331 | 1,025 | 78.4 |
| Scrolling | WebGL underlay | 55.824 | 39 | 33.332 / 33.333 / 99.998 | 1,103 | 3.8 |

The change in average presentation was +21.98 FPS in battle and −0.24 FPS in scrolling. The first ten seconds of battle ran at 23.2 and 57.0 FPS, respectively. The first scrolling lap ran at 53.26 and 57.58 FPS and the remaining laps at 57.50 and 54.92 FPS. Each pair is a single comparison. The 60 FPS gate remains open.

| Workload | Prototype uploads | Batched draws | Batched instances | Atlas setup CPU (total) | Batch submission CPU (total) | Mean update / render (ms), control → prototype |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Stationary battle | 7 | 3,526 | 428,335 | 0.70 ms | 82.20 ms | 14.18 / 2.74 → 8.94 / 2.92 |
| Scrolling | 8 | 1,196 | 33,425 | 1.10 ms | 55.40 ms | 9.62 / 1.27 → 9.49 / 1.33 |

The CPU totals include issuing uploads and drawing commands, with no fence wait or GPU execution timer. Presented cadence and compositor trace spans include the cross-surface cost. Sampled terrain GPU p95 was 10.94 → 3.21 ms in battle and 3.60 → 1.70 ms in scrolling. Sampled JS heap p95 was 132.02 → 128.46 MiB and 134.32 → 129.75 MiB respectively. These readings do not isolate the shadow GPU time or include native graphics memory. There was no dedicated GC capture.

## Visual decision

The hardware overlap probe composited the actual prototype with a synthetic opaque unit and half-alpha shadow at DPR 2. The exposed shadow pixel matched `[0, 0, 0, 128]` in both modes. When the shadow preceded the unit, both overlap pixels were `[200, 100, 50, 255]`. When the original draw put the shadow after the unit, Canvas2D produced `[100, 50, 25, 255]` and the underlay still produced `[200, 100, 50, 255]`. A single separate layer therefore fails the production visual gate. It also cannot carry individual factory-exit clips. The prototype remains available only in the benchmark. A production batched path would need to render shadows and foreground content in their original order or prove that a given reorder leaves all affected pixels unchanged.

## Reproduce

Use the active hardware display and the production preview described in the [collision report](2026-11-18-collision-query-pruning.md).

```sh
export BENCHMARK_URL=http://127.0.0.1:4197
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_EXPECT_FIXTURE_SHA256=65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_COMPOSITOR_TRACE=1
for run in battle-control battle-batch scroll-control scroll-batch; do
  case "$run" in battle-*) battle=1 ;; *) battle=0 ;; esac
  case "$run" in *-batch) batch=1 ;; *) batch=0 ;; esac
  BENCHMARK_BATTLE_ONLY=$battle BENCHMARK_GPU_SHADOW_BATCH=$batch BENCHMARK_OUTPUT=tmp/unit-heavy/shadow-prototype-$run node scripts/benchmark-unit-heavy.mjs
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/shadow-prototype-$run/compositor.json"
done
node scripts/performance/gpu-shadow-order-parity.mjs
```

Lint and script syntax checks passed. The full unit suite passed 5,910 tests and reproduced the existing `U05433` map-sprite alpha failure.
