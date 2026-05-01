# 068 — Mobile FPS regression after sprite-sheet routing + realtime bottleneck overlay

## Context
Recent street sprite-sheet routing work introduced a major mobile framerate regression (reported from ~60fps to <10fps).

## Requirements
1. Identify and fix the core render-path performance issue introduced by sprite-sheet street routing changes.
2. Add realtime bottleneck diagnostics to the FPS overlay so users can see likely limiting factor while playing.
3. Bottleneck visibility should include:
   - CPU simulation/update time
   - CPU render submission time
   - GPU/compositor/wait estimate
   - JS heap usage (when browser exposes `performance.memory`)
4. Before further code analysis, add an E2E performance benchmark that reproduces the observed mobile degradation (<10fps equivalent under mobile throttling) while preserving normal desktop performance (>60fps equivalent in an uncapped benchmark path).
5. Compare deploy preview 650 against deploy preview 640 with the benchmark and inspect sprite-sheet/SOT rendering differences before choosing fixes.
6. Fix the most likely root causes found in sprite-sheet/SOT/rendering paths and document additional candidate fixes that remain out of scope.

## Implementation summary
- Street tile selection now caches filtered candidate pools per topology/signature instead of re-filtering tag buckets every draw call.
- Street tag matching now precomputes tag sets and direction bitmasks to avoid repeated per-tile array scans.
- FPS overlay now receives frame-phase breakdown data from the game loop and renders a dominant bottleneck label plus realtime phase timings and heap info.
- Added `tests/e2e/mobileFpsRegressionBenchmark.test.js`, an opt-in Playwright benchmark (`PERF_BENCHMARK=1`) that can run against localhost or comma-separated remote preview URLs. It records desktop and throttled-mobile FPS, frame timings, drawImage rates, heap, and renderer diagnostics.
- Deployed preview comparison showed preview 650 doing substantially more CPU draw submission than preview 640 in the same stress profile, with mobile dominated by CPU render/draw submission rather than update or heap growth.
- Map rendering now computes visible tile bounds from logical canvas dimensions (`getBoundingClientRect`/`clientWidth`) instead of backing-store dimensions, avoiding DPR-squared overdraw on mobile.
- When custom integrated mode is off, procedural GPU terrain now runs in water-only mode so the CPU-rendered street/land layer can use static chunk caching instead of repainting street tiles in the per-frame SOT overlay pass.
- Static CPU terrain chunks remain cacheable even when GPU water-only rendering asks the 2D layer to skip water base/SOT.
- Main canvas DPR is capped at 2 to reduce mobile canvas bandwidth while preserving a sharper-than-1x presentation.

## Benchmark notes
- Pre-fix local reproduction: desktop game-loop FPS >60; throttled mobile reproduced the failure at ~1fps effective / ~3fps overlay, with CPU render around 700-800ms per frame in the stress scene.
- Preview comparison before local fixes: preview 650 submitted ~37k drawImages/sec desktop and ~8.5k/sec mobile in the benchmark; preview 640 submitted ~24k/sec desktop and ~6.5k/sec mobile. Preview 650 also exposed the new bottleneck overlay identifying CPU render/draw submission.
- Post-fix local benchmark: desktop game-loop FPS remained >60; throttled mobile improved to ~11fps reported in the 8x CPU-throttled stress profile, with drawImage submissions reduced to ~2.7k/sec.

## Remaining candidates
- Move street-sheet terrain rendering into a GPU atlas path so default street art no longer requires any CPU terrain compositing.
- Add chunk-level redraw counters to the FPS overlay/benchmark to separate cache misses from entity/UI draw submission in realtime.
- Throttle or dirty-rect minimap/entity overlay rendering on mobile; the main map is improved, but render submission remains the dominant bottleneck under heavy throttling.
- Consider adaptive canvas DPR (2 on strong devices, 1.5 or 1 on weak/mobile sustained low-FPS devices) rather than a fixed cap.

## Acceptance criteria
- Unit tests remain green.
- Repeated street topology selection calls reuse cached pools.
- FPS overlay surfaces bottleneck metrics in realtime during gameplay.
- The E2E benchmark can run against local and remote preview URLs and reports separate desktop/mobile effective frame-rate metrics.
- The benchmark evidence is used to validate that mobile render time improves after fixes.
