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
7. Mobile performance target is 60fps; default street-sheet terrain should move into the GPU atlas path rather than relying on CPU terrain compositing.
8. Mobile canvas pixel density must be configurable in the settings config editor, from native DPR down to 1x.
9. The mobile benchmark must include a full-map scroll sweep. During that sweep, every measured scrolling FPS window must stay at or above the 60fps mobile target; a drop below 60fps is a test failure.
10. Compare deploy preview 650 against deploy preview 645 for the scroll regression, because 645 is the reported last preview that stayed near 60fps while scrolling.

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
- Follow-up: WebGL water placement now uses the actual canvas backing-store ratio instead of raw `window.devicePixelRatio`, because adaptive mobile DPR can lower the canvas to 1x while the device reports 3x. This keeps GPU water aligned instead of drawing black/transparent water behind the CPU street layer.
- Follow-up: when WebGL terrain cannot initialize, animated CPU water renders in a separate dynamic pass while land/street terrain chunks skip water and remain static, avoiding full mixed-chunk redraws every water frame.
- Follow-up: CPU terrain chunk cache telemetry now reports drawn chunks, cache hits, cache misses, and redraws in the FPS overlay and benchmark diagnostics.
- Follow-up: mobile minimap rendering is throttled while the main game continues rendering every frame, reducing repeated sidebar/minimap draw submission during touch scrolling.
- Follow-up: canvas DPR is adaptive on touch/mobile layouts; it starts capped at 2 and can step down toward 1 under sustained low FPS, then recover toward 2 when the device has headroom.
- Follow-up: the default street sheet can now be bound as a secondary WebGL atlas, allowing default street terrain instances to render on the GPU and letting the 2D SOT overlay skip the expensive per-frame CPU street repaint pass when GPU terrain succeeds.
- Follow-up: mobile canvas pixel density is exposed in Graphics config/settings as `mobileCanvasPixelRatioCap`, defaulting to 1x for mobile performance and allowing users to raise the cap toward native DPR for sharper output.
- Follow-up: the mobile benchmark now drives a deterministic serpentine scroll route across the whole map and reports the lowest scrolling FPS window, worst frame, route completion, page errors, chunk cache misses/redraws, and visible water while moving.
- Follow-up: static CPU terrain chunks are prewarmed for small/medium maps whenever water is rendered as a separate dynamic layer, and SOT/cache validation order now recomputes SOT after cache invalidation so prewarm keys stay stable.
- Follow-up: the FPS overlay includes the number of chunks prewarmed in the current frame.
- Follow-up: browser-driven mobile stability checks found no page errors after the latest local fixes, but showed that long scrolling can visit many terrain bands; the static terrain chunk cache is now bounded with LRU eviction so mobile Safari cannot keep accumulating offscreen chunk canvases while traversing large maps.
- Follow-up: the FPS overlay includes chunk eviction counts so users can see cache churn alongside draw/hit/miss/redraw/prewarm telemetry.
- Follow-up: the mobile benchmark can now sweep larger maps for repeated laps and optionally enforce heap and chunk-cache budgets, making scroll-crash regressions fail even when instantaneous FPS stays near 60.

## Benchmark notes
- Pre-fix local reproduction: desktop game-loop FPS >60; throttled mobile reproduced the failure at ~1fps effective / ~3fps overlay, with CPU render around 700-800ms per frame in the stress scene.
- Preview comparison before local fixes: preview 650 submitted ~37k drawImages/sec desktop and ~8.5k/sec mobile in the benchmark; preview 640 submitted ~24k/sec desktop and ~6.5k/sec mobile. Preview 650 also exposed the new bottleneck overlay identifying CPU render/draw submission.
- Post-fix local benchmark: desktop game-loop FPS remained >60; throttled mobile improved to ~11fps reported in the 8x CPU-throttled stress profile, with drawImage submissions reduced to ~2.7k/sec.
- Follow-up benchmark records page errors during scroll sweeps and samples visible water pixels so black/transparent water regressions are caught alongside FPS metrics.
- Follow-up local benchmark: desktop reported 94fps / 57.8 effective FPS, throttled mobile reported 13fps / 12.6 effective FPS, page errors were 0, visible water sampled successfully, and mobile drawImage submissions fell to ~56/sec with 0 chunk redraws.
- Mobile 60Hz target benchmark at 1x pixel density: desktop reported 90fps / 59.2 effective FPS; mobile reported 60fps / 59.5 effective FPS, page errors were 0, visible water sampled successfully, and CPU render averaged ~3.5ms. Headless Chromium did not expose the WebGL terrain path in this run, so the benchmark validates the 1x mobile fallback while unit coverage validates the secondary-atlas GPU street path.
- Full-map scroll benchmark must be used for future mobile fixes: scrolling must cross every chunk band, finish the entire route, and fail when any rounded one-second scrolling window falls below 60fps.
- Preview comparison with the full-map scroll benchmark: deploy preview 650 held mobile at rounded 60fps windows with a 390x844 backing canvas, while deploy preview 645 fell to rounded 7-27fps windows with a 1170x2532 backing canvas. The old preview’s collapse validates the pixel-bandwidth side of the regression; the local fix additionally removes cold static-chunk misses while scrolling.
- Post-fix local full-map scroll benchmark: mobile completed the whole route at 60fps reported / ~59.8fps effective, lowest rounded scroll window 60fps, 0 page errors, visible water sampled, chunk cache size 16, and final-frame chunk misses/redraws 0.
- Browser-use local verification: the in-app browser stayed alive through repeated long scroll sweeps with no console warnings/errors; FPS overlay reported capped 75fps on the desktop viewport before the bounded-cache fix, confirming the remaining risk was scroll-distance cache growth rather than an immediate render crash in Chromium.
- Post-cache-cap local 128x128 benchmark: throttled mobile completed the full route at 60fps reported / ~59.9fps effective, lowest rounded scroll window 60fps, max frame 17.7ms, visible water sampled, no page errors, heap ~57.5MB, and chunk cache size 32.
- Post-cache-cap 256x256 two-lap benchmark: throttled mobile completed 233kpx of scrolling at 60fps reported / ~60.0fps effective, lowest rounded scroll window 60fps, max frame 17.7ms, visible water sampled, no page errors, heap ~87.5MB, and chunk cache size stayed within the 32-chunk budget.

## Remaining candidates
- Dirty-rect entity overlay rendering on mobile; minimap throttling is in place, but entity overlays still render every frame for correctness.

## Acceptance criteria
- Unit tests remain green.
- Repeated street topology selection calls reuse cached pools.
- FPS overlay surfaces bottleneck metrics in realtime during gameplay.
- FPS overlay surfaces chunk cache hit/miss/redraw counters in realtime during gameplay.
- The E2E benchmark can run against local and remote preview URLs and reports separate desktop/mobile effective frame-rate metrics.
- The E2E benchmark reports visible water samples and page errors while sweeping the map on mobile.
- The E2E benchmark fails if the mobile full-map scroll route does not complete or if any scrolling FPS window drops below 60fps.
- The E2E benchmark can enforce mobile heap and terrain chunk-cache budgets during long scroll sweeps.
- A local non-throttled mobile benchmark profile can reach the 60fps target when mobile pixel density is set to 1x.
- The benchmark evidence is used to validate that mobile render time improves after fixes.
