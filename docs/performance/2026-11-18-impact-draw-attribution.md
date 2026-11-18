# Impact particle draw attribution

This diagnostic asks how much the impact-particle draw path contributes to the stationary battle's missed frame deadlines. The production game still uses its normal effects. The benchmark alone can bypass `ImpactVfx.render` after the existing impact emissions. The bypass removes the flash, sparks and pooled particle draw calls and leaves the battle simulation, rocket trajectories, real hits, sprite-sheet explosions, fires and other smoke effects running.

Each capture imports the same 500-unit save into a fresh headed Chrome profile on the active 60 Hz Retina display with Apple M1 Metal hardware rasterization and WebGPU terrain. The camera remains fixed, `?tutorial=0` is passed at startup, and construction yards are protected so defeat cannot interrupt combat. The benchmark requires active impact frames and visible Apache rocket and impact centers. Both modes count active impact frames through the same wrapper. The four runs use the order control, bypass, bypass, control to reduce run-order effects.

## Reproduce

Serve the production game from local Vite preview and use the existing save fixture. [Production setup and fixture instructions](2026-11-18-physical-display-acceptance.md)

```sh
export BENCHMARK_URL=http://127.0.0.1:4193
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1
export BENCHMARK_PROFILE=1 BENCHMARK_COMPOSITOR_TRACE=1
BENCHMARK_IMPACT_DRAW=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-particles-a1 node scripts/benchmark-unit-heavy.mjs
BENCHMARK_IMPACT_DRAW=0 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-particles-b1 node scripts/benchmark-unit-heavy.mjs
BENCHMARK_IMPACT_DRAW=0 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-particles-b2 node scripts/benchmark-unit-heavy.mjs
BENCHMARK_IMPACT_DRAW=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-particles-a2 node scripts/benchmark-unit-heavy.mjs
for run in a1 b1 b2 a2; do
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/gpu-particles-${run}/compositor.json"
done
```

Presentation FPS counts distinct Chrome presentation-feedback timestamps in the measured window. Callback FPS is recorded independently. CPU effects submission includes the other effects that remain enabled. Chrome raster duration is aggregate process timing and cannot isolate individual Canvas draw calls.

## Hardware results

All four 60-second captures used headed Chrome 157.0.8103.79 and the same 950×739 CSS-pixel viewport at DPR 2. Each started with 499 live units from the fixture, selected 47 tanks, and finished with 480 or 481 units. The game stayed foregrounded with WebGPU terrain in every sample. Across the four runs, peaks were 18–21 Apache rockets and 18–19 impacts with centers inside the viewport. No page errors occurred.

| Run | Impact particle draws | Active impact frames | Average presented FPS | Minimum presented FPS (1 s) | Average callback FPS | CPU effects p95 (ms) | Presentation p95 / p99 / max (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | Normal | 114 | 2.161 | 1 | 2.111 | 0.70 | 966.6 / 983.3 / 983.3 |
| B1 | Bypassed | 113 | 2.149 | 1 | 2.100 | 0.20 | 966.6 / 966.7 / 983.3 |
| B2 | Bypassed | 114 | 2.106 | 1 | 2.106 | 0.30 | 950.0 / 966.6 / 1,000.0 |
| A2 | Normal | 113 | 2.110 | 1 | 2.095 | 0.70 | 966.6 / 983.3 / 983.3 |

The two-run mean presentation FPS was **2.1356 with normal draws** and **2.1273 with draws bypassed** (−0.39%). Mean callback FPS was 2.1031 and 2.1028 respectively. The bypass reduced CPU effects submission by about 0.45 ms at p95. Mean total Chrome raster-command time fell from 373.8 to 345.0 ms per capture. That aggregate includes other page raster work and cannot be used as an impact-specific GPU timestamp. The longest Core Animation backpressure span ranged from 939.7 to 960.7 ms in controls and 954.4 to 973.9 ms with drawing bypassed.

Removing the entire draw path exposed some effects work and a persistent presentation stall. The measured FPS change is inside the spread between controls. This isolation test completes the conditional GPU-parallel particle assessment. The evidence does not justify replacing the game renderer's particle path to address the observed 60 FPS failure.

Lint passed. All four captures exercised the benchmark switch. The unit suite passed 5,901 cases and reproduced the existing map-sprite alpha failure `U05433`.
