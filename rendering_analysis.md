# Rendering bottleneck analysis

Date: 2026-09-16. Source baseline: `115df4f8`. Documentation-only investigation; no application, shader, asset, or test code changed. Existing staged version changes were preserved. Lead: GPT-6 Astra, medium reasoning, as identified for this session; three GPT-5.6 Luna medium subagents independently audited terrain, assets, and instrumentation. Their findings were checked against the active call paths rather than accepted as measurements.

Related documents: [optimization design](performance_improvement.md), [delegation checklist](rendering_improvement_todos.md).

## 1. Findings that determine the implementation order

The largest measured JavaScript rendering cost is **revalidating already-cached terrain**, especially string hashing of tile fields for visible chunks and the surrounding prewarm region. Startup baking alone cannot remove this cost. Replace steady-state hashing with explicit mutation revisions first, then move first-use rasterization and asset preparation behind a readiness barrier.

CPU procedural water is the next large measured render contributor. Preserve its animation, spatial phase, color settings and shore compositing; optimize invariant calculations and retained topology. Hardware GPU paths need a separate measurement: neither local browser run actually used WebGL water.

Image scaling is widespread, but the measured scene does not establish entity scaling as the primary cause of the scrolling regression. Baking final-size assets is still required by the requested rendering policy. Do it with DPR-aware sizing and byte accounting, preserving continuous orientation, recoil, construction and aircraft behavior.

The user-reported 75-to-40 FPS regression is consistent with the current measured ~44 FPS result. This investigation does **not** prove which individual visual commit caused it: no historical-commit same-device A/B comparison was performed. Existing tests accepting 30 FPS or a 20% regression explain why earlier passing checks did not protect a 75 FPS experience.

## 2. Measurements collected in this investigation

Local Vite, Chromium 145 headless, 1440×1000 viewport, DPR 2, seed 4, mixed biomes with 32 equal-weight regions, four players, water shores and center lake, 5% rocks. Main canvas: 2380×2000 backing pixels, 1190×1000 logical pixels. These are development-build diagnostics, not production or physical-display certification.

| Metric | Existing test, 100×100, 8 px/rAF | CPU-profiled run, 200×200, 48 px/rAF |
|---|---:|---:|
| Monitor duration | 16.95 s | 17.25 s |
| Mean FPS | 43.67 | 36.23 |
| Mean frame interval | 22.90 ms | 27.60 ms |
| Mean simulation update | 2.40 ms | 3.41 ms |
| Mean render, including minimap work | 9.10 ms | 12.03 ms |
| Mean terrain subphase | 7.95 ms | 10.82 ms |
| Mean minimap | 0.65 ms | 0.69 ms |
| Mean entities / effects / UI subphases | 0.14 / 0.11 / 0.11 ms | 0.14 / 0.10 / 0.13 ms |
| Maximum recorded render | 339.5 ms | 238.0 ms |
| Final JS heap snapshot | 64.85 MiB | 82.40 MiB |
| Actual water backend | CPU fallback | CPU fallback |
| Final visible chunks, all hits | 9 | 12 |
| Final resident / pending warm chunks | 19 / 33 | 35 / 65 |
| Final direct tile passes | 0 | 0 |

These are different scenes/speeds and the second includes profiler overhead: do not calculate a before/after optimization gain from them. Captures include benchmark setup; the maximum frames and biome-generation samples cannot yet be assigned exclusively to steady-state scrolling. Final chunk counters are a last-frame snapshot, not proof of zero misses throughout the run. FPS uses callback intervals, not verified display presentation. “Compositor wait” is a residual estimate, not measured GPU time.

The existing cold-bake test also passed: grass 278.30 ms cold / 10.90 ms cached validation; mixed 176.20 ms cold / 12.70 ms cached validation. Its “cached pass” iterates 49 chunks without presenting a normal game frame. Its 1.165× relative result is not a 75 FPS acceptance result and its ordering is susceptible to cache/JIT warmup.

Reproduction of the first measurement:

```sh
npm run dev -- --host 127.0.0.1
TERRAIN_BENCHMARK=1 TERRAIN_MIXED_BIOME=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep 'terrain combat performance|mixed-biome cached terrain' --reporter=line --workers=1
```

The second used a transient Playwright/Chrome DevTools Protocol session, `Profiler.setSamplingInterval({interval:1000})`, `Profiler.start`/`stop`, and this URL after persisting mixed settings through the existing IndexedDB storage API:

```text
http://127.0.0.1:5173/?seed=4&size=200&monitor=1&e2eIosBenchmark=1&benchmarkDurationMs=15000&benchmarkScroll=1&benchmarkScrollPixelsPerFrame=48
```

Sample durations below sum the profile's `timeDeltas` for each sampled leaf and ancestor. They are estimates, not precise instrumented call timings. Shared parent/child totals must not be added together.

| Function | Sampled self | Sampled inclusive | Interpretation |
|---|---:|---:|---|
| `mixSignature` | 3833.91 ms | 3833.91 ms | Largest identified application JS leaf |
| `computeChunkSignature` | 207.66 ms | 4033.25 ms | About 23.5% of the 17.20 s profile duration |
| `getChunkRenderState` | 192.08 ms | 4234.11 ms | Contains signature work |
| `queueWarmChunksAroundViewport` | 11.12 ms | 2243.89 ms | Much of the signature work is offscreen validation |
| `renderTiles` | 6.28 ms | 4556.64 ms | Parent of cache validation/composition |
| `drawProceduralWater` | 1250.50 ms | 1628.67 ms | Time-varying CPU water work |
| `renderDynamicWaterLayer` | 23.36 ms | 1817.08 ms | Includes water drawing |
| `updateChunkCache` | 2.51 ms | 176.63 ms | Actual baking is smaller than validation in this capture |
| Native `drawImage`, all callers | 619.75 ms | 619.75 ms | Submission/native cost; not isolated resampling or GPU cost |
| Native `getBoundingClientRect` | 72.88 ms | 72.88 ms | Repeated layout reads are secondary |
| Garbage collector | 172.60 ms | 172.60 ms | GC is visible; no allocation stack attribution yet |

`MapRenderer.render` inclusive: 6392.49 ms. `Renderer.renderGame`: 6707.08 ms. `(program)` consumed 7282.24 ms of samples; that category is not an identified game function or a GPU timer. The profile also includes `findPath`, movement, visibility, map generation, and minimap video overlay. A renderer-only plan must leave simulation headroom and avoid mislabeling benchmark setup/video as terrain cost.

## 3. Active pipeline and what is actually cached

`GameLoop.animate` → update simulation → `Renderer.renderGame` → clear main canvas → GPU water when available, otherwise CPU water → static terrain chunks/shore alpha → fog/grid/occupancy → buildings, wakes, wrecks, ground units → effects → overlays and airborne units → UI; minimap runs through its own cadence. See `src/game/gameLoop.js`, `src/rendering/renderer.js:281`, and `src/rendering/mapRenderer.js:2133`.

Already cached: static terrain chunk pixels, SOT topology, many selected texture variants, biome masks/composites, minimap ground, some effect sprites, Apache body orientation variants, and wreck imagery. New work should preserve and repair these systems rather than blindly duplicate them.

### A. Signature hashing on cache hits — measured P0

`getChunkRenderState` (`mapRenderer.js:684`) always invokes `computeChunkSignature` (`:860`). A full 16×16 chunk scans a seven-tile halo, up to 30×30 = 900 cells. The inner 18×18 area hashes additional ore, decals, biome, angle and fractional-corner fields. Values are converted to strings and each character is mixed into the signature.

`renderTiles` (`:1060`) validates every visible chunk. `queueWarmChunksAroundViewport` (`:1016`) also validates resident neighbors within a two-chunk desktop radius every frame, even if the camera stays within the same chunk range. For a 3×3 visible region this requests up to a 7×7 region: approximately 44,100 cell visits per frame if all 49 are resident, or 3.3 million visits/s at 75 FPS, before the per-field character loops. Actual counts depend on edges/residency. This JS work scales with chunk count, not DPR; raster pixel work scales with DPR squared.

Replacing the hash with a smaller/faster hash still leaves repeated scanning. Use per-chunk revisions and a complete mutation-notification contract. Retain full hashing only as a development correctness oracle outside normal rendering. The mutation audit must cover ore/depletion, decals, streets, construction footprints, biome settings, map editing, bulk regeneration, load/replay/network restoration, and texture readiness; a missed invalidation produces stale visuals.

### B. First-use baking, cache churn and load readiness — proven paths, hitch attribution pending

`prewarmStaticChunks` (`:581`) exits when total chunks exceed 24. A 100×100 map has 49 chunks; the default 200×200 has 169. Both bypass whole-map prewarming. Visible misses call `updateChunkCache` synchronously (`:1159`, `:919`). Claimed historical flat-color fallback behavior in spec 068 is not the current visible-miss implementation.

Organic readiness initially covers atlas/details; cliff and each biome image can independently invalidate all chunks (`organicTerrain.js:247–270`). A loading barrier should decode all required art, prepare stable masks and topology, then atomically publish ready terrain. Repeated asset callbacks must not cause first-scroll rebakes.

Cliff baking calls `buildCliffDepth`, allocating typed arrays and doing distance transforms (`cliffTerrain.js:43`; `organicTerrain.js:493`). It is not an ordinary per-entity operation, but repeats on actual chunk rebuilds. Cache immutable topology by revision and respect the existing dependency halo.

Dependency detail: `drawCliffs` expands chunk bounds by four tiles, passes `right+1/bottom+1`, and `buildCliffDepth` adds five more analysis cells. Away from map boundaries the raw read domain is `[start−9, end+10)` on each axis. This is wider than the seven-tile signature domain. Not every raw input necessarily affects visible pixels, but an optimization must prove a tighter radius rather than assume seven is sufficient. Use the conservative raw footprint for initial revision invalidation and test edits at each distance against a complete rebuild.

The warm queue copies/sorts entries (`mapRenderer.js:813`); eviction copies/sorts too (`:662`). Touch scrolling postpones warm work by 90 ms (`:1107`), so sustained motion can starve prefetch. The nominal 48-desktop/56-touch chunk cap is not an absolute byte limit: protected queued/visible entries may prevent eviction. Scheduling and residency need explicit byte budgets and worst-case arrival-rate tests.

### C. Animated water — measured CPU cost; GPU costs not established here

`drawProceduralWater` (`mapRenderer.js:1523`) recalculates five color arrays, saturation, time, trigonometric phase, alpha strings, and 11 fill rectangles per tile each frame. `renderDynamicWaterLayer` (`:1188`) scans visible land as well as water. At 400 visible water tiles and 75 FPS, that is 330,000 fill submissions/s plus math and string creation. Preserve time-dependent work; hoist settings-dependent palettes and world-coordinate coefficients, and traverse retained visible water runs/instances.

Crucial correction: the ordinary organic CPU fallback **already separates water**. `Renderer.renderGame` sets `separateWaterLayer`, and `MapRenderer.render` passes `skipWaterBase/skipWaterSot=true` to static chunks. Therefore water-frame rebaking of static terrain is **not** the demonstrated primary problem in this measured path. Other integrated/fallback modes can still include animated water in chunk eligibility (`getChunkRenderState`); audit them explicitly instead of globally assuming the cache is broken by water.

WebGL rebuilds visible tile instances, arrays, buffers and uniform lookups each frame (`webglRenderer.js:382`, `:661`, `:701`, `:729`). WebGPU similarly rebuilds/repacks a new `Float32Array` (`webgpuRenderer.js:284`, `:300`). For unedited maps, water topology, world positions, edge ownership and UVs are static. Retain them by chunk and update only camera/time/settings uniforms, plus dirty ranges on edits. The shader must keep running every presented frame. Fragment cost, canvas composition and uploads need real GPU measurements before choosing a backend migration.

### D. Entity, effects, fog, minimap and layout — secondary in measured scene; scale risks

- `renderer.js:57` creates two unit arrays plus a result object each frame; `:386` replaces diagnostics objects; `:468` concatenates building arrays for tooltips.
- `unitRenderer.js:1950` and `buildingRenderer.js:1308` independently traverse bases and overlays. Existing culling should remain; prepare reusable visible lists once when justified. Hose/target/queue helpers still use nested `find` calls (`unitRenderer.js:2020`, `:2066`; `pathPlanningRenderer.js:16–42`). Reuse a frame ID index, without changing gameplay positions or occupancy rules.
- Wreck visibility checks do not perform viewport culling (`wreckRenderer.js:38–83`). Effects have offscreen and allocation opportunities; wakes prune simulation state during rendering (`effectsRenderer.js:656`), which complicates safe frame skipping/culling.
- Minimap ground is cached but resized on draw; fog scans the full map when enabled (`minimapRenderer.js:159–215`). Cache fog by visibility revision and retain live entity/camera indicators. Do not simply reduce animation or simulation frequency to achieve the gate.
- `getCanvasLogicalSize` reads bounds and calls `getCanvasPixelRatio`, which reads bounds again (`renderingUtils.js:17–47`). Cache layout on resize/DPR changes and pass a stable frame viewport record.
- `performanceUtils.js:7` times wrapped functions and replaces statistics objects on every call even when its dialog is closed. `animate` is wrapped. Profiling must become opt-in with bounded storage.

The sampled entity/effect costs are small for ~38 units and 83 buildings. Large selected armies, naval turrets, smoke and fog require separate stress scenes before assigning them a large share of this regression.

## 4. Dynamic resizing inventory

“Uses a scaled draw” means source and destination sizes/transforms request scaling. It does not prove the browser allocates a new resized bitmap every call or quantify resampling cost; browsers can cache/rasterize internally. Rotation still requires sampling even after size preparation. Removing all sampling while keeping arbitrary continuous angles is not feasible; the implementable policy is **no application-requested size conversion or resize-cache creation during steady gameplay**, except aircraft takeoff/landing scale animation.

| Family | Current source location | Work to move before gameplay |
|---|---|---|
| Terrain chunk presentation | `mapRenderer.js:1175`; `canvasManager.js:245` | 517px chunk canvas is drawn under DPR transform; prepare at destination backing density or use approved native-density retained textures |
| Biomes, cliff sprites, road/SOT | `organicTerrain.js:274–567`; `mapRenderer.js:1351` | Source crop/size conversion during chunk baking; currently may occur on first scroll |
| Harvester, ambulance, trucks, mine units, rocket tank | respective `*ImageRenderer.js`, e.g. harvester `:38–54` | Fit source to 32 logical px every draw; prepare final-size body once per density |
| Tank layers | `tankImageRenderer.js:190`, `:243`, `:268` | Independent hull/turret/barrel size conversion; retain independent rotation/recoil |
| Howitzer layers | `howitzerImageRenderer.js:106–133` | Prepare base/barrel dimensions and mount anchors; keep elevation/recoil dynamic |
| Destroyer/supply ship/naval fleet | `destroyerImageRenderer.js:43`; `supplyShipImageRenderer.js:48`; `navalFleetImageRenderer.js:119`, `:182` | Prepare fixed hull/turret/barrel lengths, preserving fractional anchors and submerged clips |
| Buildings and turret buildings | `buildingRenderer.js:177–242`; `turretImageRenderer.js:121` | Prepare footprint-sized art and layers; construction and Tesla crop must reveal pixels rather than stretch them |
| Apache | `apacheImageRenderer.js:95–199` | Existing 48-heading × 5-tilt body cache is populated lazily; preload allowed states; rotor size can be prepared while rotation remains animated |
| F-22/F-35 | `f22ImageRenderer.js:119`; `f35ImageRenderer.js:103`; `jetRenderScale.js:7` | Prepare stable ground/flight sizes; explicitly allow dynamic takeoff/landing scale |
| Classic water | `textureManager.js:961`; `mapRenderer.js:1569` | 16 frames prepared 64→32 on loading, but destination draws use variable size including 33px seam overlap; prepare actual presentation variants |
| Minimap | `minimapRenderer.js:159`, `:345` | Prepare terrain layer at minimap backing dimensions and regenerate on layout/settings change |
| Effects, wrecks, sprite-sheet animation | `effectsRenderer.js:386`, `:520`; `wreckRenderer.js:139`, `:212`; `spriteSheetAnimation.js` | Audit changing smoke/explosion/sinking sizes; use exact-size procedural geometry or precomputed animation at the existing cadence. No silent exception beyond aircraft |

`makeSprites.js` excludes units/buildings and resizes only the legacy terrain atlas. There is no general final-size unit/building asset pipeline. Existing terrain build scripts emit PNG and legacy map atlas quality is 90; new or changed binary outputs must comply with the repository's WebP quality-85 rule. Preserve approved imagery and avoid lossy recompression chains.

Sizing contract: `32px` tiles and the classic-water `33px` seam overlap are logical dimensions; under DPR 2 they cover 64 and 66 backing pixels respectively. Preparing a density-sized raster requires compensating the destination transform so it is not enlarged twice. The same rule applies to Apache rotors and stable aircraft states. Final-size preparation removes size conversion, while continuous heading remains runtime rotation/sampling. Specific unresolved non-aircraft resize sites are smoke/core (`effectsRenderer.js:382–405`), explosion plume/core (`:500–536`) and sinking wreck imagery (`wreckRenderer.js:192–222`); E11 must resolve them before the strict resize gate can pass.

Camera movement is translation; no general camera zoom was found in the examined 2D path. Water-effect zoom changes pattern frequency, not camera scale. Browser zoom, display changes and adaptive DPR still change destination density. Current touch adaptive DPR changes quality while scrolling (`canvasManager.js:51–93`); lowering it cannot count as a solution under the no-visual-degradation requirement.

Do **not** introduce 16/24-heading atlases for continuously rotating vehicles merely to eliminate transforms: that would introduce visible angular stepping. Preserve existing orientation behavior. At DPR 2, a 64px source destined for 32 logical pixels can already match 64 backing pixels; the size audit must include the canvas transform rather than counting every 5-argument draw as avoidable resampling.

## 5. Memory and limits of full-map baking

Verified with `sharp.metadata`: cliff atlas 4096×5376 = 84 MiB decoded RGBA; organic atlas 1280×1472 = 7.19 MiB; details 1024×2352 = 9.19 MiB. These three alone represent ~100.38 MiB of decoded pixels before browser/GPU copies. Compressed WebP download size does not determine working memory.

Full interior chunk: `(16×32 + 2×2 + 1)² × 4` = 1,069,156 bytes, ~1.02 MiB. `chunkPadding=2` is **pixels**, not tiles. Forty-eight such chunks represent ~48.94 MiB at current logical density, before caches and textures.

| Square map | Minimum unpadded RGBA at 1× | At 2× backing density | Chunk count at 16 tiles |
|---|---:|---:|---:|
| 100×100 | 39.06 MiB | 156.25 MiB | 49 |
| 200×200 | 156.25 MiB | 625.00 MiB | 169 |
| 256×256 | 256.00 MiB | 1024.00 MiB | 256 |

Add gutters, edge pages, source art, upload staging, duplicated CPU/GPU copies, entities and render targets. The 2380×2000 main backing store alone is ~18.16 MiB; multiple layers multiply it. Map input sanitization has a minimum but no finite maximum (`gameOrchestrator.js:156`). Unbounded map size + full-map native-DPR baking + bounded memory + guaranteed instantaneous arbitrary camera jumps cannot all be promised simultaneously.

Recommended distinction: bake inexpensive topology/descriptors for the entire map; bake all raster pages only where the byte budget permits. For larger maps use resident prepared assets plus retained chunk geometry, or prove a page-prefetch throughput guarantee for a defined maximum scroll speed. Compressed offscreen pages still require decode/upload and are not sufficient evidence for a no-hitch guarantee.

Mask maps have no explicit byte eviction, but normal generated weights come from a finite set of fractions, so map-size-proportional mask growth is not established. Arbitrary saved weights, sizes and settings can expand keys; canonicalize only when pixel parity is proven. Coordinate composite caches are capped at 512 entries; their lifetime/eviction still matters during rebakes.

## 6. Measurement gaps and confidence

**High confidence:** signature hashing is a major CPU cost in the profiled run; typical maps bypass full prewarming; runtime scale requests exist; source image readiness can invalidate caches; current gates do not enforce 75 FPS.

**Not yet measured:** real hardware GPU water duration, GPU memory, actual display presentation, steady-state p95/p99/max, per-function allocations, worst supported map/entity count, production-build timing, first-visit vs repeat-lap costs, visual equivalence of proposed asset bakes.

A 75 Hz display has 13.333 ms per refresh. The current “capped” mode is `requestAnimationFrame`, not an explicit 75 Hz timer (`gameLoop.js:131–167`). A 60 Hz display cannot present 75 distinct frames/s, and a background/throttled tab cannot guarantee it. These cases must be labeled **not certifiable**, never passed at a lower FPS. On qualifying hardware, any application-caused missed 75 Hz deadline fails the requested gate. Current results do not meet it.

No implementation is approved as successful by this report. The linked plan defines how to make the bottlenecks measurable, eliminate them without changing visuals, and validate the final result.
