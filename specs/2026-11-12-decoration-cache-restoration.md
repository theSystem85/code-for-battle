# Decoration cache restoration

Decorations must return when their map location re-enters the viewport, including every cell of multi-tile sprites spanning terrain pages. Existing visual quality, fade preferences, byte limits, prepared ground retention and cooperative preparation scheduling remain unchanged.

## Cache lifecycle

Static terrain preparation retains chunk objects even when the bounded overlay cache evicts them. Releasing a chunk's decorative raster must clear its canvas, context, publication key and visibility timestamp together, release its resident reservation, remove dependencies and discard unfinished preparation. A subsequent visible visit queues new preparation and publishes the complete page atomically. Uninterrupted resident pages and atomic replacements retain their existing fade behavior.

Ground pages have a two-pixel padded border. All visible ground pages must be composited before decorative pages, so a neighboring ground page cannot overwrite the edge of a decorative image. This preserves the original padded ground raster while restoring complete decoration pixels at seams.

## Performance scope

Publication cleanup runs only during resource release. The seam fix moves the existing decoration draws into a second pass over the reused visible-page key set, adding one map lookup and readiness check per page with no entity scans, new collections, extra draw calls, new raster sizing or extra blending. At 75 FPS and 45 visible pages (for example a 3840×2160 logical viewport), this adds 3,375 map lookups per second. At DPR 2/3, backing pixel areas scale by 4/9, but draw counts and pixel work remain unchanged. The existing resident and staging byte limits remain enforced.

## Validation

- Unit regression U07130 (two cases): retain prepared ground, publish decorations, evict under both page-count and byte pressure, revisit the retained chunk, verify full-size rebuilt rasters and released reservations.
- Browser regression E00259: render a four-section decoration spanning four pages, scroll left and right under cache pressure, return, and compare every decoration pixel to its original color. This is a correctness test, not an FPS benchmark.
- The updated dev base also contained a soil nature sheet whose alpha silhouette differed at 98 pixels from its recorded extraction. Regenerate using `node scripts/build-map-sprite-sheets.mjs --name=dtv7_nature_soil_large` and `npm run build:map-sprite-tiers`; preserve the exact-alpha assertion and quality 85 WebP output. `npm run check:map-sprite-tiers` verifies all 21 sheets.
- `npm run lint:fix:changed` and `npm run lint`: pass (5,812 unique test declarations).
- `npm run test:unit`: 372 files, 5,820 cases pass.
- `npm run test`: 374 files, 5,906 unit/integration cases pass.
- `npm run check:map-sprite-tiers`: all 21 sheets pass.
- Focused browser suite: 11 cases pass, covering decoration restoration, terrain byte/cache pressure, return visits, ground/resource seams, DPR 2 raster parity, configuration preparation and WebGL/WebGPU recovery. Used `npm run test:e2e -- --config=/tmp/decoration-playwright.config.mjs tests/e2e/decorationCacheRestoration.test.js tests/e2e/terrainCachePressure.test.js tests/e2e/scrollingStallRecovery.test.js tests/e2e/remainingRenderingFixes.test.js --grep-invert E00248` (E00248 is the unrelated autosave test). The temporary runner imports `playwright.config.js`, sets the repository test directory and server cwd, uses one worker, headed Chromium, `launchOptions.args: ['--mute-audio', '--use-angle=metal']`, and `ignoreDefaultArgs: ['--enable-unsafe-swiftshader']`.
- GPU verification: `system_profiler SPDisplaysDataType` reports an 8-core Apple M1 with Metal support. Chromium CDP `SystemInfo.getInfo` with the Metal launch configuration reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 26.6.2 (Build 25G83))`, hardware rasterization enabled. The default runner selected SwiftShader, so no performance benchmark was run on that default renderer.
- Full suite attempt: `PLAYWRIGHT_HEADED=1 npm run test:e2e -- --config=/tmp/decoration-playwright.config.mjs --max-failures=3`: 2 passed, 3 failed, 221 did not run. E00002 completed its Apache flow but reported a page error, `Camera demand superseded`; E00004 timed out waiting for helipad refill; E00005 timed out waiting for an Apache rocket launch. These aircraft scenarios are outside this decoration fix and remain outstanding; the full suite is not green. Native narration uses a separate Playwright configuration and was not run.
- Hardware scrolling diagnostic: `PERF_RENDERING_PIPELINE=1 PLAYWRIGHT_HEADED=1 npm run test:e2e -- --config=/tmp/decoration-playwright.config.mjs tests/e2e/renderingPipeline75Fps.test.js`: completed both route laps (104,580 logical pixels), WebGPU, DPR 2, 1440×1000 viewport, 2380×2000 game backing canvas; zero page errors. Measured 431 frame intervals over 7,216.6 ms: 59.723 FPS; p95 17.6 ms, p99 17.7 ms, max 33.3 ms; all 431 intervals exceed the 13.333 ms gate. This is diagnostic evidence only: the run observed roughly 60 Hz cadence, reported no explicit display refresh rate, and used intrusive CDP sampling. Its `navigator.webdriver` heuristic also labels the headed automated session as headless. No 75 FPS acceptance is claimed. GPU timings, independent update/render timings and memory/GC acceptance evidence were not collected by this fixture; matched before/after reference-scene and full worst-case acceptance remain pending. Quality/settings were not reduced.
- Strict 75 FPS acceptance follows `performance_improvement.md`; hardware/backend/display verification and matched worst-case cold/repeat scrolling measurements remain required before performance acceptance.

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Decoration restoration | Open dev with decorations enabled; scroll several viewports away from a visible large decoration and back, including fast reversals | Every section returns after bounded preparation; resident pages stay visible | 1: U07130 (2 cases) | 2: E00259, E00244 |
| T02 | Decoration edges | Inspect a large decoration crossing a 16-tile terrain-page boundary before and after scrolling | Adjacent terrain does not overwrite or crop its edges | 0 | 1: E00259 |
| T03 | Rendering performance | Follow the hardware acceptance protocol at unchanged graphics settings, with cold/repeat full-map scrolling and active worst-case units/effects | No application-caused frames exceed 13.333 ms; quality stays unchanged | 0 | 0 |

- [ ] T01 Decoration restoration on the dev deployment
- [ ] T02 Complete decoration edges on the dev deployment
- [ ] T03 Strict 75 FPS reference-scene acceptance
