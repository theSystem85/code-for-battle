# Bound cached ground-unit shadow draws

The reassessment ranked shadow bounds first, followed by repeated collision queries and attribution of the remaining presentation and traversal stalls. The earlier fixture-specific crop improved presentation by more than an order of magnitude, and replacing the source with a bitmap at its original size left the stall in place. [Implementation order](2026-11-18-next-performance-checklist.md) · [Shadow draw area experiments](2026-11-18-shadow-bounds-followup.md)

Ground-unit drawing previously submitted the entire cached surface once per visible eligible unit per render frame. A 276×276 surface at DPR 2 covers up to 304,704 backing pixels per draw before clipping. At 200 visible ground units this is up to 60.9 million pixels of submitted rectangles per frame before clipping and overlap. The sampled 70×62 rectangle cuts nominal area by about 94%. Actual raster and compositor costs are measured separately.

The implementation scans alpha once when each shadow cache entry is first built or rebuilt after a settings change. It caches the source rectangle, retains two transparent pixels where available to accommodate filtering, and offsets the destination to preserve placement. The existing first-use shadow preparation now includes one readback per type. The steady-state render uses a single unscaled draw call per nonempty shadow and keeps the original canvas and cache lifecycle. If canvas security rules prevent alpha readback, the full source rectangle is used. The settings preview still uses the complete shadow canvas.

## Reproduce

The baseline preview on port 4193 serves the existing production runtime through `cabbb3fc`. Its metadata predates that commit because the build already included its runtime patch when built. The optimized Vite build was made from parent `92ce7c1d` with this shadow change and its release note. The intervening commits contain benchmark tooling and documentation. See the [baseline build record](2026-11-18-combined-cpu-gpu-fps.md).

```sh
node node_modules/vite/bin/vite.js build --outDir tmp/unit-heavy/shadow-fix-dist
node node_modules/vite/bin/vite.js preview --outDir tmp/unit-heavy/shadow-fix-dist --host 127.0.0.1 --port 4196 --strictPort
```

For the stationary battle capture, run the baseline and candidate in order on a verified active hardware display. Use the baseline preview on port 4193 and the candidate preview on port 4196.

```sh
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_EXPECT_FIXTURE_SHA256=65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_COMPOSITOR_TRACE=1
for run in a1 b1 b2 a2; do
  case "$run" in a*) port=4193 ;; b*) port=4196 ;; esac
  BENCHMARK_URL=http://127.0.0.1:$port BENCHMARK_OUTPUT=tmp/unit-heavy/shadow-fix-$run node scripts/benchmark-unit-heavy.mjs
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/shadow-fix-$run/compositor.json"
done
```

Baseline served entry bundle SHA-256 was `6bdc909f7f5bd3677d986316534424ee58bc4e91536c2410f77ec7a830093334`. Optimized served entry bundle SHA-256 was `b585145306ed5a4a9ff4fd5726318d7f2fd55f82915a5f77190cabcf33c15383`.

The updated parity diagnostic calls the production cached draw directly and compares it against the full shadow canvas. It found zero changed RGBA channels across 168 cases covering seven fixture ground-unit types, four settings, DPR 1 and 2, and three fractional positions. Browser and setting coverage are limited to the [parity matrix](2026-11-18-shadow-parity.md). Lint passed. The full unit run passed 5,908 tests and reproduced the existing `U05433` map sprite alpha failure.

## Stationary battle results

All four captures used the active Apple M1 Metal GPU, Chrome 157.0.8103.79, WebGPU terrain, a 950×739 CSS viewport at DPR 2 and approximately 60 Hz blank-page callback cadence. All started with 500 units and 47 selected tanks. The tutorial stayed disabled, the camera stayed fixed, defeat was prevented and the harness recorded no invalid-scene frames or page errors. Peak visible Apache rockets ranged from 18 to 24 and peak impacts from 18 to 28. All measurements used the complete scene with the foreground diagnostic modes off.

| Run | Average presented FPS | Worst 1 s FPS | First 10 s FPS | p95 / p99 / max presentation gap (ms) | Gaps over 16.67 ms | Max backpressure span (ms) |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| A1 baseline | 2.139 | 1 | 2.3 | 966.6 / 983.3 / 983.3 | 113 | 968.2 |
| B1 bounded draws | 32.112 | 18 | 22.5 | 83.3 / 100.0 / 116.7 | 1,283 | 93.0 |
| B2 bounded draws | 30.006 | 17 | 21.5 | 83.3 / 100.0 / 100.0 | 1,215 | 88.0 |
| A2 baseline | 2.195 | 1 | 2.6 | 966.6 / 983.3 / 983.3 | 115 | 948.2 |

Mean presented FPS rose from 2.167 to 31.059, a gain of 28.892 FPS (1,333%). The worst one-second result across the two runs rose from 1 to 17 FPS. The 60 FPS gate remains open. The number of intervals per capture increased sharply as more frames presented, so absolute missed-deadline counts need the interval distribution alongside them.

| Run | Simulation ticks / wall s | Mean CPU update / render submission (ms per reported frame) | End units | Save preparation (ms) | Sampled terrain GPU p95 (ms) | Sampled JS heap p95 (MiB) |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| A1 | 9.96 | 37.79 / 3.93 | 481 | 3,607 | 19.66 | 149.43 |
| B1 | 59.93 | 14.34 / 2.73 | 264 | 3,613 | 20.91 | 192.53 |
| B2 | 59.94 | 14.33 / 2.75 | 255 | 3,509 | 10.29 | 123.85 |
| A2 | 10.30 | 40.10 / 4.16 | 481 | 3,645 | 20.19 | 136.44 |

The candidate advances much more of the battle in the same wall time, including more combat and unit losses. Its CPU and heap observations therefore cover different later stages of the battle. The first ten seconds still show a large presentation gain. Terrain GPU and JS heap samples summarize available readings rather than whole-GPU or native memory usage. This run did not include a dedicated GC profile.

## Scrolling regression check

A separate single pair used the same save and hardware settings and traversed the full map at 3,600 CSS pixels per second for about 2.94 laps with live simulation. Starting and ending unit counts were 500 / 261 for baseline and 500 / 257 for bounded draws. The first lap after import preparation took 20.408 seconds. To reproduce, use the stationary commands with `BENCHMARK_BATTLE_ONLY=0` and output directories `shadow-fix-scroll-4193` and `shadow-fix-scroll-4196`.

| Build | Overall average presented FPS | Worst 1 s FPS | First lap FPS | Remaining laps FPS | p95 / p99 / max gap (ms) | Gaps over 16.67 ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Baseline | 51.467 | 1 | 36.946 | 58.951 | 16.667 / 49.999 / 749.970 | 925 |
| Bounded draws | 58.080 | 33 | 54.831 | 59.756 | 16.667 / 33.333 / 233.324 | 1,128 |

The candidate gained 6.61 average presented FPS (12.8%) in this single pair. Maximum Core Animation backpressure fell from 734.3 to 81.9 ms. Mean CPU update / render submission were 10.06 / 0.47 ms and 9.81 / 0.49 ms respectively. Sampled terrain GPU p95 was 10.49 / 1.38 ms and sampled heap p95 was 139.29 / 264.68 MiB. These samples do not isolate a memory change, and the single pair cannot quantify run-to-run variance. The 60 FPS gate remains open on both the stationary scene and the scrolling route.
