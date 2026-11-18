# Remaining presentation stalls with full-quality rendering

The benchmark can now align per-frame terrain counters, page-visible unit and terrain sprite requests, and main-thread WebGPU texture upload calls with compositor presentation feedback. `BENCHMARK_ASSET_TRACE=1` enables the probe. The reporter joins events by clock time and reports intersections with renderer main-frame, GPU swap, Core Animation backpressure, Dawn IOSurface scheduling and raster spans. These overlaps can nest and do not identify a common frame across processes.

## Hardware results

The two full-quality runs served the production build from `61e5a7d0` on port 4197. Chrome 157 used the active Apple M1 Metal GPU, WebGPU terrain, DPR 2 and a 950×739 CSS-pixel game viewport. The blank-page callback cadence was 60 Hz. Both imported the same 500-unit save with the tutorial disabled and 47 tanks selected. The battle camera was fixed and defeat protection was active. The stationary run had 21 visible Apache rockets and 29 visible impact centers at peak. The separate scrolling run used about 2.94 live laps at 3,600 CSS pixels per second. Both recorded zero page errors. This item adds measurement tools, so the results characterize remaining stalls after the previous optimizations.

| Workload | Average presented FPS | Worst 1 s FPS | p95 / p99 / max gap (ms) | Gaps over 16.67 ms | Mean CPU update / render (ms) |
| --- | ---: | ---: | --- | ---: | --- |
| Stationary battle | 34.605 | 18 | 83.3 / 100.0 / 100.0 | 1,369 | 14.20 / 2.71 |
| Full-map scrolling | 58.181 | 34 | 16.7 / 33.3 / 100.0 | 1,221 | 9.38 / 0.90 |

The first ten seconds of battle averaged 22.4 presented FPS and the rest averaged 37.0. The first scrolling lap averaged 56.15 FPS and the remaining laps 59.23. The preceding uninstrumented captures of this build showed 30.75 and 32.20 FPS in battle and 57.62 during scrolling. These are different executions, so the spread does not measure probe overhead. The 60 FPS gate remains open. Counts close to the deadline are sensitive to rounding at 60 Hz.

| Observed activity | Stationary battle | Scrolling |
| --- | ---: | ---: |
| Page-visible sprite requests overlapping capture | 60 | 60 |
| Main-thread WebGPU texture upload calls overlapping capture | 0 | 23 |
| Reported terrain upload bytes, first to last sampled game frame | 334,369,800 → 334,369,800 | 334,369,800 → 380,374,528 |
| Chunk misses across reported game frames | 0 | 0 |
| Evictions across reported game frames | 0 | 489 |
| Longest ten gaps overlapping a recorded upload or sprite request | 0 / 10 | 0 / 10 |
| Longest ten gaps containing a reported eviction | 0 / 10 | 2 / 10 |
| Largest single Core Animation backpressure overlap in those gaps | 73.3 ms | 68.4 ms |
| Largest measured CPU update in those gaps | 56.0 ms | 70.9 ms |
| Largest single Chrome raster-command overlap in those gaps | 2.8 ms | 1.9 ms |

The probe observed 340 texture upload calls before each capture, confirming the upload interception was active. The static terrain counter covers renderer-reported work, while the browser probe counts calls on the page's WebGPU queue. The counter and probe can cover different scopes and should be interpreted independently. Resource Timing records request activity visible to the page. Worker-internal decoding, worker requests, and browser-managed uploads of Canvas2D sources are outside its coverage. Game cache counters come from completed frame reports. Their zeros cover reported frames only. The measured activity gives no basis for prioritizing additional terrain or sprite preloading to resolve the longest gaps on this workload.

Across the battle capture, Core Animation backpressure accounted for 40.19 s of recorded spans, with the longest individual span 89.5 ms. The scrolling capture recorded 1.98 s and a longest span of 82.8 ms. Sampled terrain GPU p95 was 11.80 ms in battle and 1.57 ms in scrolling. Sampled JS heap p95 was 119.12 and 283.75 MiB respectively, with no dedicated GC capture. The trace supports continued investigation of renderer and compositor work, with individual slow CPU updates as a separate lead. Shared cross-process frame identifiers remain unavailable in this capture.

## Reproduce

Use the verified hardware setup and production candidate from the [collision optimization report](2026-11-18-collision-query-pruning.md).

```sh
export BENCHMARK_URL=http://127.0.0.1:4197
export BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb
export BENCHMARK_EXPECT_FIXTURE_SHA256=65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce
export BENCHMARK_IMPORT_SAVE=1 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_ASSET_TRACE=1
for mode in battle scroll; do
  case "$mode" in battle) battle=1 ;; *) battle=0 ;; esac
  BENCHMARK_BATTLE_ONLY=$battle BENCHMARK_OUTPUT=tmp/unit-heavy/remaining-stalls-$mode node scripts/benchmark-unit-heavy.mjs
  node scripts/performance/report-unit-heavy-presentation.mjs "tmp/unit-heavy/remaining-stalls-$mode/compositor.json"
  node scripts/performance/report-unit-heavy-gaps.mjs "tmp/unit-heavy/remaining-stalls-$mode/compositor.json" "tmp/unit-heavy/remaining-stalls-$mode/result.json"
done
```

## Residual shadow draw diagnostic

The earlier fixes reduced shadow draw area and collision work. To test the remaining cost of the shadow draw path, a separate 30-second capture suppressed draws to the foreground canvas whose source was a 276×276 OffscreenCanvas. The previous source inventory identified this size with cached unit shadows on this fixture. The selector uses dimensions, so it cannot prove the identity of every matching source. The diagnostic intercepted 296,554 draws over the run. A separate 30-second control ran the identical production build and probe with full visuals. Both runs used the same fixture, fixed camera, disabled tutorial and defeat protection, and both advanced nearly 60 simulation ticks per second.

| Mode | Average presented FPS | Worst 1 s FPS | p95 / p99 / max gap (ms) | Max Core Animation backpressure span |
| --- | ---: | ---: | --- | ---: |
| Full-quality control | 26.111 | 18 | 83.3 / 100.0 / 100.0 | 94.0 ms |
| Shadow-size draws suppressed | 55.916 | 45 | 33.3 / 33.3 / 83.3 | 9.1 ms |

The diagnostic gained 29.81 presented FPS and 27 frames in the worst second. It omits matching draws and its results measure attribution only. The live battle diverged during the pair, ending with 353 units in the control and 326 in the suppression run. This is one pair, and it does not explain the remaining frame misses in the suppression mode. The priority for the conditional parallel experiment is a bounded, batched shadow draw prototype. Compare complete visual output and preserve compositing order where shadows and unit bodies overlap. Measure submission and synchronization costs against the cached Canvas2D path before choosing a production approach.

Use the battle command above with `BENCHMARK_BATTLE_DURATION_MS=30000` and `BENCHMARK_HOLD_FOREGROUND=shadow-size` for the suppression run. Set `BENCHMARK_HOLD_FOREGROUND=0` for the control and use different output folders.

Lint and all four gap reporter tests passed. The full unit suite passed 5,910 tests and reproduced the existing `U05433` map-sprite alpha failure.
