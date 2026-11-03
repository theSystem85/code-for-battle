# Fresh-map scrolling hitch investigation

Date: 2026-11-04 (Europe/Berlin). Status: investigation and repair proposals; no gameplay changes implemented. Tested commit: fetched `origin/dev`, `c6a7aa7708bad205b07672622a94d794fcff267b`.

## Scope and hardware

Patrick reports severe scrolling drops even on a fresh map and requested measurements on his GPU-equipped machine before proposals. All completed benchmarks use the current `origin/dev` source. The old local `dev` branch was divergent; it was preserved, and the working branch now starts from current `origin/dev`. Historical builds were not benchmarked, so source history identifies relevant changes, not a measured regression bisect.

- MacBook Pro / Apple M1, eight GPU cores, 16 GB unified memory.
- System Chrome `156.0.8078.80`, headed, separate temporary profile.
- CDP `SystemInfo.getInfo`: `ANGLE Metal Renderer: Apple M1`, `ANGLE_METAL`, `GraphiteDawnMetal`; GPU rasterization, 2D canvas and compositing enabled. No SwiftShader, GPU-disabling switch, CPU throttling or resolution reduction was used. Playwright's default `--enable-unsafe-swiftshader` argument was removed.
- Reported screen and test viewport: 1280×720; playable canvas: 1030×720 logical/backing pixels, effective DPR 1. The observed ordinary rAF cadence is about 60 Hz. This hardware-backed diagnostic cannot certify 75 presented FPS on that display/browser configuration.
- Production build, fresh browser storage, seed 11, 200×200, four players, 24 requested ore fields; ordinary graphics defaults, integrated decoration sheets and animated procedural water. Tutorial disabled in test storage. Simulation and AI continue normally.
- Actual water backend is **WebGL**, despite Auto requesting WebGPU: the WebGPU shader fails compilation, described below.

## Measurement method and exclusions

Use a deterministic time-based 3600 logical px/s serpentine route, row spacing at most 80% of viewport height, plus a return leg. Its approximately 72,566.6 px loop takes 20.16 seconds; a 60-second phase traverses approximately 2.98 loops. Position follows elapsed time, so a slow browser cannot make the workload easier by reducing camera speed.

The final collector waits for the loading screen's hidden class and initialized game/assets. A renderer-entry wrapper publishes the desired camera position immediately before rendering; the stationary control holds the initial camera position. This prevents incidental input or another camera writer from contaminating the route. It records independent rAF intervals, the existing loop's CPU update/render breakdown, terrain counters, heap samples and available asynchronous water GPU timings. Those GPU values cover the instrumented water pass only, not Canvas rasterization or browser composition.

Captures run serially. No test suite, build or competing browser benchmark runs during a measurement. The normal function profiler is off for baseline and sustained captures. A separate diagnostic samples functions or traces the main thread; its results are explicitly separate from baseline frame pacing.

Preliminary runs without explicit camera ownership are retained only as diagnostic function evidence. Their stationary control moved, so their frame-pacing results are superseded. Initial probes of the old checkout produced no completed benchmark and are excluded entirely.

A broad trace using GPU/CC/V8 categories produced excessive diagnostic data: the trace phase fell to approximately 32 FPS and its export exceeded the string collector limit. **Discard that phase** as baseline performance evidence. The later unprofiled run also slows down, so the broad trace cannot be asserted to be the sole cause of the observed degradation. The corrected collector saves every phase before starting a bounded main-thread trace and streams the trace to disk. It does not retry the broad trace. A native Chrome UI inspection was not approved; the separate Playwright browser remains the authorized measurement surface.

## Results

### Verification with exact locked dependencies

The initial checkout's installed dependencies did not match the fetched branch's lockfile: Vite 6.4.4 and Sharp 0.34.5 were installed. Those earlier captures use the tested current-dev **source**, but that dependency difference is a reproducibility limitation. After `npm ci`, the verification build uses locked **Vite 6.4.1, Sharp 0.34.4 and libvips 8.17.2**. No source or image was changed. This final two-minute scrolling run has CPU profiling/tracing off:

| Minute | rAF FPS | Interval p95 / p99 / max, ms | CPU update mean / max, ms | CPU render mean / max, ms | Visible cold pages / redraws / pages warmed |
|---|---:|---|---|---|---|
| 1 | 58.32 | 18.6 / 18.8 / 533.3 | 0.391 / 11.3 | 0.806 / 252.1 | 62 / 536 / 2,387 |
| 2 | 53.70 | 18.7 / 51.9 / 416.7 | 0.827 / 6.6 | 1.699 / 417.6 | 152 / 456 / 2,067 |

Minute 2 has 18 units and 25 buildings. Its 75 cold-page frames average **38.67 ms render**, maximum **417.6 ms**; 3,076 clean-cache frames average **0.475 ms**, maximum **5.7 ms**. Thus the main terrain-miss attribution survives restoring the exact locked build. The severity varies between runs: this shorter locked run does not reproduce the full approximately 22 FPS level of the earlier five-minute run. Do not collapse these results into one supposedly identical baseline or attribute every difference to match age, Vite, AI or hardware state without a matched comparison.

### Earlier controlled diagnostic capture

The earlier controlled unprofiled current-source capture, using the pre-existing Vite 6.4.4 installation, measured:

| Phase | Duration | Independent rAF FPS | Interval p95 / p99 / max, ms | CPU update mean / max, ms | CPU render mean / max, ms | CPU update+render >13.333 ms |
|---|---:|---:|---|---|---|---:|
| Stationary immediately after readiness | 10 s | 57.11 | 17.2 / 17.6 / 466.7 | 0.308 / 2.5 | 0.561 / 3.4 | 0 |
| First scripted traversal | 60 s | 58.97 | 16.8 / 17.5 / 249.3 | 0.422 / 4.1 | 0.787 / 253.3 | 20 |
| Repeat traversal | 60 s | 59.25 | 16.8 / 17.6 / 216.7 | 0.815 / 9.9 | 0.766 / 26.7 | 28 |

There were 13 and 8 intervals above 33.4 ms on the first/repeat routes. **All** ordinary approximately 16.7 ms display intervals already exceed 13.333 ms; the last column instead counts application CPU-work misses and is not presented as a count of all missed presentation deadlines. CPU work occurs between rAF timestamps, so its maximum need not equal the maximum interval in the independent observer.

The stationary camera remained exactly `(93,5368)` throughout. Its 466.7 ms interval with no corresponding expensive game frame demonstrates why renderer-only timers are insufficient. The first route contains a 253.6 ms game rAF callback in the Long Animation Frame observer; other gaps have no long script attribution and must not all be blamed on the simulation or GPU.

First/repeat visible terrain counters: 538/545 page redraws, 60/69 page misses, 47/69 evictions, 2,402/2,367 pages warmed. Clean chunk hashing and topology reconstructions were both zero. Warming/preparation, rather than rehashing the whole map on ordinary hits, is the relevant path in this build.

Asynchronous water GPU samples: first-route mean/p95/max approximately 0.204/0.553/2.983 ms; repeat 0.221/0.579/2.474 ms. These low water-pass times do not certify Canvas/compositor GPU cost. Heap first/repeat mean approximately 51.8/59.6 MiB, observed maximum 120.4/124.5 MiB, with collection-like drops. These are JS heap samples including collector data, not total process or GPU memory and not proof of a leak.

The bounded 15-second main-thread trace ran separately at approximately 58.60 rAF FPS. Its largest recorded main-thread major GC was 263.931 ms, including a nested 254.699 ms `V8.GC_HEAP_EMBEDDER_TRACING_EPILOGUE`. Those nested times must not be added together. It also contained major GCs of approximately 36.5 and 35.6 ms. This is diagnostic trace evidence, not an unprofiled throughput result.

### Five-minute sustained run, profiling off, earlier dependency installation

This separate fresh match reproduced Patrick's observed degradation with neither CPU profiling nor tracing enabled. The collector clears its frame arrays after each minute and samples counts/heap once per second. The route and graphics remain fixed; normal AI construction continues.

| Minute | rAF FPS | Interval p95 / p99 / max, ms | CPU update mean, ms | CPU render mean / p95, ms | Units / buildings at end | Visible cold pages / redraws / pages warmed |
|---|---:|---|---:|---|---|---|
| 1 | 33.54 | 166.5 / 233.3 / 633.4 | 0.392 | 8.44 / 21.0 | 6 / 13 | 377 / 397 / 1,127 |
| 2 | 22.83 | 200.0 / 233.4 / 450.0 | 0.932 | 16.50 / 180.1 | 18 / 22 | 549 / 346 / 542 |
| 3 | 21.80 | 199.9 / 366.7 / 616.6 | 1.158 | 18.08 / 185.8 | 18 / 25 | 519 / 299 / 474 |
| 4 | 21.93 | 200.0 / 250.0 / 466.7 | 1.184 | 16.67 / 181.5 | 18 / 28 | 532 / 342 / 465 |
| 5 | 21.85 | 200.0 / 333.3 / 600.0 | 1.224 | 19.60 / 182.9 | 19 / 30 | 523 / 324 / 494 |

The first/repeat short capture was faster than this sustained run; the cross-run spread must remain visible. These measurements do not establish that match age is the only changing variable. The following within-run split is the stronger attribution evidence:

| Minute-5 frame category | Frames | CPU render mean / p95 / max, ms | Render frames above 50 ms |
|---|---:|---|---:|
| At least one visible cold page | 266 | 82.85 / 240.8 / 465.5 | 97 |
| Redraw, no cold page | 34 | 96.04 / 226.8 / 422.8 | 16 |
| Neither miss nor redraw | 1,013 | 0.43 / 0.7 / 1.7 | 0 |

Every render frame above 50 ms in that minute coincides with a terrain miss/rebuild. The same clean-cache frames include the current entities and animations yet remain cheap. AI update maximum was 7.5 ms in minute 5. Shadow of war remained off; smoke stayed capped at 300 from minute 1 onward, with zero sampled explosions/bullets and two wrecks late in the run. This strongly identifies synchronous terrain reconstruction as the immediate rendering bottleneck in this reproduced scene. It does not exclude an AI/effect bottleneck in other scenes or prove why native bake cost varies across runs.

Water GPU sample maxima remained approximately 2.7–3.6 ms across the sustained minutes. The sampled JS heap remained approximately 36–77 MiB across minutes 1–5, without monotonic retained growth. A test-process inspection found one active Playwright browser tree, with no abandoned benchmark browser. OS thermal/power status could not be read (`pmset -g therm` returned unavailable), so thermal/external state is not certified.

### Targeted water-policy diagnostic

After the five unchanged minutes, a temporary wrapper treated a successfully executed empty retained-water pass as success. It changed no shader, image, resolution, animation cadence, simulation or source file, and was restored before the disposable browser closed. This isolates the return-value policy; it is not a production patch or a matched visual acceptance test.

The following minute had **9 redraws**, compared with 324 in minute 5, but **574 cold page misses** remained and FPS was **22.30**. Its 1,061 clean-cache frames averaged 0.44 ms render, maximum 1.1 ms; cold-page frames averaged 68.97 ms. Therefore P1 demonstrably removes unnecessary invalidations, but **does not solve the sustained slowdown by itself**. The highest-priority repair is the synchronous cold-page preparation/residency path, with P1 reducing avoidable work around it.

## Confirmed causes and contributing work

### Terrain cache policy changes when the viewport contains no water

[`GameWebGLRenderer.renderRetainedWater`](../../src/rendering/webglRenderer.js) clears/submits a valid water frame but returns `drawCalls > 0`. An empty inland view therefore reports rendering failure. [`Renderer.renderGame`](../../src/rendering/renderer.js) derives `skipWaterBase` and `skipWaterSot` from that return value. [`MapRenderer.getChunkRenderState`](../../src/rendering/mapRenderer.js) treats a change to either flag as a complete page invalidation.

Consequently, entering/leaving a water-containing viewport changes the raster policy for shared terrain pages. Warm jobs can bake the opposite policy to the next visible frame. This is independent of units, fog, firing or changed terrain. With the current integrated-sheet mode, CPU water can also become eligible for inclusion in otherwise static pages when GPU water reports an empty frame.

The controlled first traversal explicitly recorded 295 redraw requests switching both flags from `true` to `false`, 275 switching them back, and 115 water-frame-related redraw requests in 60 seconds. These are combined foreground/background `updateChunkCache` calls with precomputed state. Ordinary cold misses are counted separately. This explains repeated repaint bursts on a revisited route instead of the expected stable cache hits.

**Proposal P1:** separate successful backend ownership from nonzero draw count. An initialized, cleared, empty water pass is a successful empty frame, while initialization/context/device failure remains a failure. Keep static terrain's water-exclusion policy stable for the session/backend generation. If CPU water is required, render it as a separate live layer. Test shore→inland→shore, cache warming, empty views and real context failure with unchanged image output; assert that clean pages do not rebuild merely because water leaves the viewport.

### A single synchronous terrain bake can block many frames

[`MapRenderer.processChunkWarmQueue`](../../src/rendering/mapRenderer.js) limits the callback to one processed job, but `updateChunkCache` calls `drawBaseLayer` synchronously for the entire 16×16 page before checking elapsed time again. The visible cache-miss path invokes the same whole-page bake inside rendering. A one-job limit does not bound wall-clock cost.

The diagnostic A/B/A capture observed a **213 ms** `drawBaseLayer` call, nested in `updateChunkCache`, and an original render frame of approximately 249 ms. Warm callbacks also reached 22 ms. Both paths exceed the 13.333 ms deadline. Sampling identifies substantial nested `drawGrass` / `drawBiomeTransition`, `drawCliffs`, native `drawImage`, and `getContext` work. CPU sampling attributes time spent inside native calls to their caller; it does not prove that all of that time is JavaScript computation or actual GPU execution.

**Proposal P2:** prepare complete static page output, masks and required uploads before gameplay where affordable; use retained descriptors or another deadline-capable representation for nonresident pages. For post-start mutation/preparation, make the work genuinely resumable at bounded sub-page work units or move safe immutable preparation to workers, and publish only complete generations. Do not substitute hidden/missing decoration, flat terrain, stale simulation visuals, reduced quality or direct synchronous fallback for readiness. A valid solution must also handle camera jumps and context recovery.

### Cache churn repeatedly recreates terrain and transition surfaces

Desktop `maxCachedChunks` is 48, but the 200×200 map has 13×13 = 169 pages. The warm radius is two chunks around the viewport, and prewarm-all explicitly skips maps above 24 pages. The controlled first route recorded 2,278 cold update requests across visible rendering and background warming. This is much more work than preparing each map page once, and revisiting the map does not guarantee residency.

[`OrganicTerrain`](../../src/rendering/organicTerrain.js) still lazily constructs transition/shore canvases and masks. Its coordinate-keyed transition raster cache holds only 512 entries and evicts by insertion order. Page eviction plus transition-cache eviction makes return visits repeat source draws and composite preparation. Those runtime caches are distinct from the terrain preparation pipeline's metadata/mask resources; having a prepared-map object does not prove that live rendering consumes prepared output.

**Proposal P3:** measure useful versus discarded warm work, predict the actual swept camera footprint, cancel obsolete preparation, and stop preparing side/behind pages that will be evicted before use. Retain reusable transition descriptors/materials and connect live rendering to the prepared resources. Use explicit shared byte accounting for all raster, decoded and GPU resources, rather than simply raising entry limits.

A full 517×517 RGBA page is about 1.02 MiB at DPR 1. Forty-eight base plus decoration pages can approach 97.9 MiB before other resources. Full 200×200-map RGBA is 156.25 MiB per layer before padding at DPR 1 and 625 MiB at DPR 2. Blind full-map raster retention is therefore not a universal fix.

### WebGPU is broken before gameplay starts

[`webgpuRenderer.js:151`](../../src/rendering/webgpuRenderer.js) contains:

```wgsl
let grainBits = u32(floor(input.worldPos.x)) * 1664525u ^ u32(floor(input.worldPos.y)) * 1013904223u;
```

Chrome's actual shader compiler rejects it: `mixing '*' and '^' requires parenthesis`. The shader module fails even if the shallows branch is disabled at runtime. Auto falls back to WebGL on this M1. Source blame points to `bc3873646` (2026-10-19). This is a confirmed renderer-selection defect; this investigation does **not** establish that WebGPU would eliminate the Canvas terrain hitches.

**Proposal P4:** parenthesize each multiplication and add real shader-compilation coverage on supported hardware. Check the full module for any further validation errors and verify actual selected backend, continuous animated water, empty views, device loss and visual parity. Keep P1/P2 necessary for both backends.

### Decoration settings allocate and serialize for each tile lookup

[`TextureManager.getDecorationLayout`](../../src/rendering/textureManager.js) normalizes all settings with object/array construction and serializes them before reading an already prepared layout. The settings-key work moved into the lookup in `c81371d5e` (2026-10-25); the later lifecycle-only layout reader retained it.

The diagnostic capture recorded approximately 138,552 / 141,509 / 140,740 calls in successive 30-second original / memoized / restored-original phases. Lookup CPU totals were approximately 230.3 / 27.9 / 221.9 ms. Decoration queue totals were approximately 365.5 / 147.3 / 349.7 ms. This supports a real allocation/CPU reduction, but approximately 0.1 ms per ordinary frame cannot explain a 200 ms hitch. Cache warmth and ongoing simulation differ across these diagnostic phases; their FPS difference is not a clean causal speedup estimate.

**Proposal P5:** normalize settings only at explicit configuration/save/map-generation boundaries. Publish a primitive configuration revision and stable layout handle; use constant-time revision checks in rendering. Preserve invalidation on every relevant settings/map/catalog change. Reuse state after initialization and test identity and invalidation behavior.

### Periodic autosaves block the main thread

The unprofiled Long Animation Frame observer identifies `TimerHandler:setInterval` callbacks at navigation times approximately **64.031 s and 124.031 s**, lasting **123.4 ms and 116.3 ms**. Matching their source character position in the tested production bundle identifies `startLastGameAutoSaveLoop` in [`saveGame.js`](../../src/saveGame.js), which calls `saveLastGameCheckpoint('interval')` every 60,000 ms.

`saveGame` synchronously constructs the state snapshot, including 40,000 map-tile records and biome blend data, and serializes it before queued storage persistence. Async IndexedDB persistence does not make snapshot construction or `JSON.stringify` asynchronous. This is a confirmed once-per-minute hitch source, independent of an expensive `updateGame` tick. The recurring deadline explains a timed hitch, not necessarily a sustained loss of throughput.

**Proposal P7:** maintain revision-based static map snapshots and create a coherent, bounded dynamic checkpoint at a simulation safe point. Move serialization/encoding to a worker using an efficiently transferred/retained snapshot, or use a resumable snapshot protocol with explicit versioning and atomic publication. Preserve saved-state consistency, automatic persistence and update-reload guarantees. Merely moving the same unbounded synchronous call into an idle callback or disabling autosave does not satisfy the requirement. Test several autosave boundaries while scrolling and verify restore equivalence.

### AI, shadows, effects and garbage collection

Patrick observed a later dramatic slowdown and suggested AI, shadows or animations. A separate five-minute unprofiled scrolling run reproduces degradation as the fresh match develops. It tracks unit/building/bullet/effect counts, shadow-of-war state, CPU update/render cost and heap samples per minute without function profiling. The broad trace is therefore not a sufficient explanation of the late slowdown.

Early fresh-map hitches occur with no player-built army. The diagnostic crystal glow draw cost was approximately 10 ms total per 30 seconds, and the sampled offline radar animation was approximately 178 ms inclusive per 30 seconds. These measured contributions do not account for a single 200 ms terrain bake. They remain potential worst-case multipliers with larger viewports/entity counts. No visual effect should be disabled on that evidence alone.

The separate 30-second CPU profile sampled approximately 542 ms in garbage collection. The final bounded trace confirms an individual **263.931 ms main-thread major GC**, with 254.699 ms in the nested native/JS embedder tracing epilogue. This confirms a second long-pause mechanism outside the ordinary game-loop timers. It does not identify the responsible retained object population by itself: raster/canvas churn, periodic save snapshots and the collector itself need allocation/lifecycle attribution before claiming a leak or a single allocation root.

**Proposal P6:** correlate GC/long-animation-frame records with retained page/canvas/resource counts and autosaves, then remove demonstrated allocation sources and audit lifecycle releases. Reuse preparation records, release backing stores deliberately and avoid repeated creation of equivalent transition canvases. Use a bounded collector and compare profiler off/on. Investigate AI/update work separately if the sustained run shows increasing simulation cost. Do not infer GPU time from `frame interval − CPU work`.

## Proposed implementation order and acceptance

1. P2/P3/P6: remove synchronous cold preparation from gameplay, prevent wasteful warm/transition-cache churn and attribute the confirmed major-GC pauses. The sustained run shows this path dominates slow frames. Preserve full visuals and bounded memory.
2. P1: stabilize water-layer ownership. The targeted diagnostic removes most unnecessary redraws but proves that cold-page work must also be fixed.
3. P7: eliminate the measured synchronous once-per-minute checkpoint stall while preserving consistent saves.
4. P4: repair and validate the actual WebGPU shader; compare backends only after both are functional.
5. P5: remove per-tile normalization/serialization with lifecycle-owned invalidation, then address any independently observed sustained AI/effect bottleneck and remeasure the combined pipeline.

Before implementing a hot-path change, account for its call frequency and entity/pixel multiplier. At 75 FPS, a 1030×720 full-canvas pass touches about 55.6 million pixels/s at DPR 1 or 222.5 million at DPR 2 before overdraw. The diagnostic decoration rate is roughly 4,600 calls/s. One 16×16 page means 256 tile operations plus transitions/cliff halos and uploads; limiting job count alone cannot provide a frame budget.

All proposed fixes need unchanged-quality cold/repeated routes, abrupt reversals and jumps, normal fog/water, bounded memory and no unauthorized runtime source resizing. Final 75 FPS acceptance remains open on a verified ≥75 Hz display with independently measured intervals, CPU/GPU evidence and all application-caused deadline misses explained. Selected layered units, firing, movement, aircraft and large armies remain additional acceptance workloads; the present request is centered on fresh-map scrolling.

## Reproduction and retained evidence

The local production build used `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4174` in an isolated checkout of the tested SHA. The initial test URL is `http://127.0.0.1:4174/?seed=11&size=200&players=4&oreFields=24`. The final locked build uses the same commands with port **4176**, after `npm ci`, and `rts-locked.mjs` records its two-minute capture. Chrome is launched through Playwright with `channel: 'chrome'`, `headless: false`, and `ignoreDefaultArgs: ['--enable-unsafe-swiftshader']`; the script aborts before measuring unless CDP reports the expected hardware renderer and enabled rasterization.

Reproduction harnesses, raw phase records, CPU profiles and the bounded trace are retained locally under ignored `tmp/scrolling-analysis/`. They are investigation artifacts, not changes to the game. `rts-final.mjs` captures the controlled baseline; `rts-long.mjs` captures five unprofiled minutes and a clearly labeled temporary water-policy diagnostic. The latter restores the method before closing its disposable browser. No gameplay source is patched by either harness. Run serially with the production server available; hardware-gate failure must stop the run.

## Validation and delivery

No runtime source, shader, image, test assertion, schema or release entry is changed by this investigation. The build-generated tracked `src/version.json` edit was restored. The existing divergent local `dev` branch remains preserved; the report is on `codex/scrolling-frame-analysis`, based on the tested `origin/dev`.

- `npm run build`: passed, including the final locked-dependency build.
- `npm run lint:fix:changed`: no changed lintable files.
- `npm run lint`: passed, including the stable-ID check.
- `npm run test:unit`: 364 files / 5,729 tests passed; one failed test, U05433, in `mapSourceSheets.test.js`.
- `npm run test`: 366 files passed and one failed file; 5,815 tests passed and one failed test, the same U05433.
- U05433 fails on the **untouched tested origin/dev checkout**, for `woodland_lakes_stones_soil`, because 98 alpha pixels differ from the exact recorded-scale expectation. Restoring the exact locked dependencies and separately disabling SIMD still reproduces the same failure. Its root is not resolved here. No image was regenerated and no assertion was weakened. A full post-install suite was not repeated after that focused failure confirmed the blocker.
- Focused headed Chromium E2E: E00244 (`terrainCachePressure.test.js`), real Canvas pressure/reversals, passed. The full E2E suite was not run for this documentation-only investigation; no gameplay changes need new behavior coverage.

The user-provided pre-push gate requires all failures fixed before every push. Consequently this existing baseline asset failure blocks publishing/merging the investigation branch; the report and evidence remain locally reviewable. This is separate from the confirmed scrolling findings and from the still-open runtime fixes and 75 FPS acceptance.
