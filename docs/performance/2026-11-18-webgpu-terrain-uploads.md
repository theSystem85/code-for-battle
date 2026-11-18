# Retained WebGPU terrain uniform uploads

Prepared terrain submits one draw per visible page. Previously, it also sent a separate position uniform write for every page on every frame. The renderer now packs the visible slots in one reusable buffer and submits a single write when their values change. An unchanged viewport uses the existing GPU values. Texture contents, draw count, nearest-neighbor sampling, fractional camera positions and effective DPR are preserved.

The tested viewport drew nine pages. At 60 frames per second, that would previously require 540 terrain position writes per second. The new steady-state count is zero for a fixed camera and at most 60 writes per second while moving. CPU staging storage is 256 bytes per retained page (42.25 KiB for 169 pages). A moving viewport writes the aligned span, including padding. GPU buffer allocation is unchanged.

```sh
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_PROFILE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-terrain-before node scripts/benchmark-unit-heavy.mjs
# Repeat after applying the terrain change with BENCHMARK_OUTPUT=tmp/unit-heavy/gpu-terrain-after.
node scripts/performance/report-unit-heavy.mjs tmp/unit-heavy/gpu-terrain-before tmp/unit-heavy/gpu-terrain-after
```

Both 60-second runs used hardware-rasterized headed Chrome 157.0.8103.79 on the Apple M1 with WebGPU terrain and DPR 2. Each loaded the same 500-unit save with 47 selected tanks and a 950×739 CSS-pixel viewport. The camera stayed fixed, the tutorial was disabled through `?tutorial=0`, and the defeat guard maintained active combat. No page errors were reported.

| Metric | Before | After |
| --- | ---: | ---: |
| Average callback FPS | 2.127 | 2.108 |
| Minimum callback FPS over one second | 2 | 2 |
| Frame interval p95 / p99 / max (ms) | 965.1 / 983.6 / 984.5 | 967.3 / 984.4 / 999.5 |
| Intervals over 16.67 ms | 127 | 126 |
| Mean CPU update (ms) | 50.20 | 42.40 |
| Mean CPU render submission (ms) | 4.48 | 4.40 |
| Main terrain GPU p95 (ms) | 23.59 | 25.17 |
| Static ground GPU p95 (ms) | 20.64 | 17.30 |
| JS heap p95 (MiB) | 268.44 | 238.98 |
| Static ground draws per sample | 9 | 9 |
| Peak Apache rocket centers in viewport | 21 | 18 |
| Peak impact centers in viewport | 28 | 19 |

Average FPS moved by −0.87% and minimum by 0%. The sample shows fewer CPU submission calls by construction. It shows no measurable FPS gain and leaves physical-display acceptance open. The wide frame-time variation and different combat outcomes make it inappropriate to attribute changes in the sampled GPU percentiles to this one change.

Lint passed. Unit test `U07208` checked the batched upload, stationary reuse, fractional camera movement and display changes. The full suite passed 5,899 cases with the known baseline alpha assertion `U05433` still failing. Existing headed Chrome test `E00251` passed the WebGPU pixel comparison at DPR 1.5, 2, 2.5 and 3.
