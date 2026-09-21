# Rendering performance improvement plan

Status: proposed implementation, not implemented. Date: 2026-09-16. Evidence: [rendering_analysis.md](rendering_analysis.md). Agent assignments and executable step IDs: [rendering_improvement_todos.md](rendering_improvement_todos.md).

## 1. Required outcome and acceptance contract

Maintain at least **75 presented FPS during sustained fast scrolling** on the qualifying reference device, with current visual quality, full water animation, and unchanged simulation behavior. The rendering deadline is `1000 / 75 = 13.333… ms`. Do not accept 30/40/60 FPS, a 20% regression allowance, rounded FPS, or a hidden reduction of DPR, effects, water cadence, terrain detail or rotation fidelity as a pass.

Before implementation certification, capture the user's device/browser/GPU, display refresh, native/effective DPR, resolution, map/save, graphics mode, and usual maximum army size. Work can start immediately with repository fixtures; those fixtures do not substitute for the user's reference scene. A 60 Hz/headless/software-rendered environment can diagnose CPU work but cannot certify 75 presented FPS. Record such runs as diagnostic or not certifiable, not as relaxed passes.

Define a finite supported map, viewport, entity-count and camera-speed envelope from actual product limits. Today map dimensions have no finite upper bound. Keep unsupported/extreme cases visible in reports; do not silently cap maps or remove content. The user requirement is the gate for supported gameplay, including cold first traversal after readiness, fast reversals, return visits and camera jumps. An architecture unable to meet that must remain unfinished.

Suggested initial fixtures, to be supplemented with the user's save:

- 100×100 regression fixture, default 200×200 map, and 256×256 two-lap stress map; mixed and single biomes; 32 and 64 regions; coast-heavy and cliff-heavy routes.
- Native DPR 1/2/3, actual reference viewport plus 1440×1000; frozen quality configuration throughout each measured run.
- 40, 200 and 500 units; selected layered naval units, independently firing turrets, moving ground units, aircraft takeoff/landing, 300 smoke particles, fog and minimap. These are proposed test loads, not newly declared product limits.
- Actual WebGL, actual WebGPU where supported, CPU fallback, custom integrated sheets, save/load, map edits, resource depletion, building placement/destruction, context loss/recovery.
- Stationary control, current 8px/frame route for historical comparison, then deterministic **time-based** 600/1800/3600 logical px/s routes, abrupt reversal and corner-to-corner jump. Report achieved distance and route completion. Existing pixels-per-rAF scrolling slows as FPS falls and must not be the only stress test.

Start measured gameplay only after preparation completes, but measure preparation separately and do not hide the first traversal behind an extra warmup lap. Run at least three serial repetitions of each acceptance fixture, at least 60 seconds and two complete map laps where applicable; retain worst-case values. Never run competing browser benchmarks in parallel.

Acceptance evidence includes actual cadence/dropped-refresh evidence where the browser exposes it, per-frame CPU work and GPU timers, all 1-second and 5-second FPS windows, p50/p95/p99/max interval/work time, longest hitch, missed-deadline count, stable memory, resize events, cold bakes and uploads. Do not substitute `max(reportedFPS, measuredFPS)` for the independent result. Timing precision uncertainty must be stated, not converted into a 74 FPS target. Diagnose any over-budget application frame; do not pass on averages alone. External interruptions are retained and labeled, with a clean rerun for certification.

## 2. Target architecture

```text
Asset manifest + saved/generated map + fixed session graphics configuration
                 |
 decode required assets, size variants, topology, masks and texture preparation
                 |
 bounded terrain raster/geometry preparation + GPU upload + visual readiness
                 |
         atomic publication of a complete prepared map generation
                 |
 each frame: camera/time uniforms -> cached terrain + live water -> visible entities/effects -> UI
                 ^
 edits/resources/decals/asset changes -> local revisions -> prepare affected data -> atomic swap
```

Prepared-map data should be independent of simulation data. Never serialize GPU handles, canvas objects, transient profiler state or device-specific cache entries into saves/network snapshots. Use a map generation ID and separate revision domains for terrain topology, surface/decal/resource state, water topology, source assets and viewport density. World-space terrain descriptors are immutable until their revision changes.

Proposed shared interfaces, finalized in step C00 before parallel implementation:

- `RenderRevisionStore`: map generation, per-chunk static/water revisions, `markTileVisualChange(x,y,kind,oldValue,newValue)`, bounded bulk edit transaction, dependency-radius calculation, asset/config generation. No grid scan on a clean cache hit.
- `PreparedMap`: generation token, decoded asset set, topology descriptors, prepared chunk handles, water geometry, readiness progress, cancellation and byte-accounting registry.
- `PreparedSpriteRegistry`: asset/content version, logical dimensions, backing density, source rectangle, anchor/mount metadata, image handle and decoded bytes. A missing ordinary variant after readiness is a correctness/diagnostic failure, not silent lazy scaling.
- `FrameViewport`: stable logical/backing dimensions, effective density, camera coordinates, visible chunk bounds; mutate primitive fields in a reused record rather than allocating each frame.
- `RenderProfiler`: fixed numeric span IDs, disabled fast path, hierarchical synchronous timing, aggregate counters, capability-labeled GPU/memory data. Integrations import these contracts; workers do not independently invent competing global state.

Suggested CPU allocation at the reference scene: update ≤3.0 ms, terrain validation/submission ≤2.5 ms, entities/effects ≤1.5 ms, UI/minimap ≤0.75 ms, scheduling/layout/diagnostics ≤0.5 ms: total ≤8.25 ms, leaving ~5.08 ms deadline headroom. These are design targets, not measured achievements or independent allowances that can all grow. GPU work overlaps CPU submission; do not add inclusive GPU and CPU timings naively. Measure the end-to-end critical path and aim for GPU completion comfortably before the next refresh.

## 3. First priority: eliminate repeated terrain validation

Replace `computeChunkSignature` from normal `getChunkRenderState` calls with constant-time revision comparisons. Cache `containsWater`, animated SOT presence, cliff depth/coverage and texture-mode eligibility when topology changes. Compare a small set of primitive versions, not joined strings or scans.

Build a complete mutation matrix before removing hashes: every field currently hashed must have a producer and notification route. Include type/airstripStreet, ore/density/seed crystals, no-build/decal state, biome/blend/corner weights, shoreline biome and source-art/settings changes. Route editor, harvesting, construction, bulk map replacement, load/replay/network restore through these notifications. Preserve old and new dependency footprints, including the seven-tile topology halo, cliff overlays and cross-chunk corner continuity. Resource/decal changes need not rebuild unrelated cliff topology or water geometry.

Use dirty bitsets/typed revision arrays and deduplicate changes per tick/transaction. A topology edit should not globally invalidate every chunk merely by advancing `sotMaskVersion`; split full-map generation from local SOT revisions. Asset callbacks should publish one asset generation when the required set is ready.

Cliff invalidation must derive from actual preparation inputs: the current four-cell draw expansion plus five-cell depth margin and positive-end extra cell reads `[start−9, end+10)`. Initially invalidate any chunk whose raw footprint contains the edited tile, conservatively using ten tiles on either side if the API is symmetric. Reduce this only with pixel-dependency proof and boundary-distance tests. Do not copy the seven-tile signature radius as an assumed complete cliff dependency contract.

Retain a debug-only verifier that compares revision-selected output with full hash/rebuild output after randomized edits, saves and network reloads. This is the main correctness protection against stale caches. Test unchanged-camera and fast-camera frames with a counter proving zero tile hashing on clean terrain.

Run surrounding-chunk discovery only when visible chunk bounds, direction bucket or relevant revision changes. Reuse active arrays/bitsets and stable queues. Avoid rebuilding/sorting candidate arrays on every frame or every task pop. Track queued/running/resident states separately so queued entries cannot indefinitely pin all evictable canvases.

## 4. Startup baking, readiness and residency

1. Await image `decode`/required fonts and all terrain/detail/cliff/biome sources, plus game-mode unit/building variants. Validate failures explicitly. First gameplay must not trigger a required asset decode, gradient-cache construction, shader compilation or texture upload burst.
2. Precompute full-map inexpensive metadata: SOT/corner ownership, immutable biome weights, cliff topology/descriptors, chosen texture variants, water runs/instance records and minimap base. Do not flatten animated water into this static data.
3. Prepare raster pages at the **actual destination density**, or retain geometry referencing final-size prepared assets. Include deterministic gutters/overdraw ownership so alpha corners and cliff silhouettes do not acquire page seams.
4. Bake all pages for maps that fit the byte budget. Use one explicit owner to count live raster, texture and staging bytes, including double-buffered generations. Limit temporary copies and release obsolete canvases/ImageBitmaps/GPU resources.
5. For larger maps, prototype retained GPU terrain geometry using the existing exact compositing/mask results. Upload all affordable immutable descriptors and share material atlases; draw visible geometry with a camera uniform. Do not assume full-map pixel baking at DPR 2 is affordable: 200×200 already needs ≥625 MiB unpadded.
6. Where streaming is used, prove readiness throughput at maximum camera speed and test teleports. Precomputed compressed pages still need decode/upload. A missing page must not trigger synchronous terrain construction, show flat placeholders or lower quality during certified gameplay. If the streaming design cannot meet this, retain renderable geometry for missing pages or fail the architecture gate.
7. Workers/OffscreenCanvas are implementation candidates, not a guarantee. Verify browser support, source transfer costs and memory duplication. Workers may prepare immutable data; main-thread publication is atomic and rejects stale generation jobs. Cancellation, new map, settings changes and context loss must release old work.
8. Normal edits prepare bounded dirty regions while preserving the correct game state. Define when new visuals become visible; do not use stale terrain to conceal an over-budget rebuild. Bulk map/graphics/display reconfiguration can enter an explicit preparation state outside the fast-scroll capture, preserving simulation/network semantics.

Keep loading progress understandable: decode, prepare terrain, prepare units, upload, ready; report duration and memory. Avoid promising a fixed load-time limit until measured. Persistent disk caches may be added only with version/seed/settings/asset/DPR keys, corruption recovery, storage limits and graceful unavailable-storage behavior.

Full-map metadata readiness does not mandate full-map resident raster pages. Raster residency remains byte-budgeted; readiness requires a correct, deadline-capable presentation route for every allowed camera destination, whether retained descriptors or already prepared pages.

## 5. Animated water optimization

Preserve shader formulas, time progression, spatial frequency, color controls, reflections/bands, water-only batch separation, coastline overlays and all eight corner cases. Water animation must change at the same cadence while both stationary and scrolling. Its time must not reset when a chunk enters view or a buffer is recycled.

For WebGL/WebGPU, build world-space water instances once per dirty chunk and retain GPU buffers. Camera movement changes uniforms and visible chunk selection, not every vertex/instance payload. Cache uniform/bind locations and pipelines. Upload only dirty ranges; avoid `new Float32Array` and full attribute `bufferData` on ordinary frames. Preserve street isolation and alpha order. Validate context recovery without stale/blank water.

For CPU fallback, cache settings-derived palettes and world-coordinate phase coefficients, sample time once per water pass, reuse scratch data, and iterate retained water ranges. Reduce string construction while retaining the same color/alpha output. Keep time-dependent sine/cosine and drawing unless a mathematically equivalent optimization is verified. Do not freeze water, replace it with a short visibly repeating loop, reduce its resolution or lower its frame rate to satisfy performance.

GPU timer measurements decide whether shader arithmetic, fill area, uploads or composition remains expensive. Do not switch the entire engine to WebGPU based only on CPU-water results. Hardware paths and CPU fallback need distinct reports and failures.

Validate static-chunk eligibility separately for organic CPU separation, integrated sheets with authored water, classic animated fallback, procedural fallback, GPU water-only split and GPU full terrain. Water-time/frame changes must never invalidate unrelated static content in any mode. Do not extrapolate the verified ordinary organic path to these other combinations.

## 6. Remove ordinary gameplay resizing without losing visuals

Create a generated manifest for all map-visible assets, footprint/draw sizes, source regions, anchors, supported densities and animation states. Offline generation is preferred for fixed sizes; prepare imported/custom art and unusual display densities during loading. New binary outputs: WebP quality 85, preserving alpha. Avoid recompressing already generated outputs as the input for subsequent builds.

Measure effective source-to-backing transform. For a sprite of logical size `L` at density `d`, prepare the source at the required backing footprint while preserving exact fractional anchors. A DPR cancellation transform used to draw those backing pixels is not an additional asset resize; diagnostic tooling must evaluate the complete transform. A five-argument `drawImage` is not by itself proof of a resize.

Keep four distinct values in metadata/audits: source asset dimensions, logical destination dimensions `L`, backing destination dimensions `L×d`, and complete canvas-transform scale. Example: 32 logical pixels at DPR 2 use 64 backing pixels. A prepared 64px source is drawn at 32 logical pixels under that transform, or at 64 backing pixels with the density transform canceled; drawing it at 64 logical pixels would double-scale. Preserve classic-water overlap as 33 logical pixels (66 at DPR 2), not an unexplained 33px backing bitmap. Apply this contract to buildings, rotors and stable flight sprites too.

Prepare hulls, turret/barrel layers, buildings, decorations, masks, classic-water variants, effect frames and minimap output. Keep continuous heading, independent turret rotation, recoil translation, proportional source clipping for construction/Tesla/submarine states and correct aircraft altitude behavior. Do not quantize arbitrary headings. Apache's existing heading buckets can be prepared up front without adding new angular quantization.

Explicit exceptions: actual plane/helicopter takeoff and landing size interpolation. Stable flight and grounded states use prepared sizes. Browser/window/DPR changes require a controlled prepare-and-swap path; current adaptive quality reduction during scrolling cannot count as an optimization.

Resolve effects individually: growing smoke, explosions, sinking ships and sprite-sheet animations can currently request changing raster sizes. They are **not** silently exempted. Prefer procedural vector/shader geometry preserving the visual function, or exact precomputed frames at existing animation sample times with bounded memory. If a continuous raster-size animation cannot be preserved under the strict rule, document the conflict and leave that acceptance item blocked for an explicit product decision. Do not introduce visual stepping to make a counter zero.

Precomputed discrete states are valid only when the original animation already uses those discrete states. Arbitrary per-rAF age-based growth is continuous: converting it into a finite frame sequence can change motion and is not automatically acceptable. E11 owns the identified smoke/core, explosion plume/core and sinking-wreck conflicts and must provide continuous-equivalence evidence or keep them blocked.

Add a diagnostic scaled-draw audit: original/source rectangle dimensions, destination dimensions, complete canvas transform scale, call-site/function ID, asset ID, preparation/gameplay phase, permitted exception and counts. Track `canvas.width/height` resets, lazy image decodes, ImageBitmap resizes, upload resizes, and `ctx.scale` as well as `drawImage`. Zero unauthorized events after readiness is the gate. Cropping/rotation/translation are classified separately.

## 7. Remaining pipeline work

Reuse frame viewport dimensions to remove repeated layout queries. Reuse visible entity lists and ID lookup tables across base/overlay passes while preserving draw order, aircraft-over-cliffs layering, fog and interaction hit testing. Cull wrecks/effects using expanded bounds that include shadows, smoke, muzzle flashes and cables crossing the viewport. Move effect lifetime mutation out of drawing only with simulation-equivalence coverage.

Separate stable building bases and changing turrets/health/selection where measurement justifies a layer cache. Avoid a huge extra full-viewport translucent layer that increases memory bandwidth. Keep dynamic effects and water live. Minimap terrain and fog use independent revisions; camera rectangle/entity dots remain responsive. No lower-quality or slower-updating replacement is approved by this plan.

Profile secondary allocation hotspots after the signature fix: renderer arrays, tooltip work, friendly-owner sets, nested entity searches, temporary effect lists and diagnostics object replacement. Reuse state without retaining dead entities or stale selection. Preserve center-based occupancy and self-collision exclusion whenever any shared unit bookkeeping is touched.

## 8. Live bottleneck monitor and helper tools

Add an explicit **Function timings** on/off control inside the existing performance overlay. It must work during normal play, independently of recording a report. Off means no function timers, no wrapper allocation, no sorting or hidden DOM refresh; reuse a disabled fast-path API. The existing always-active `logPerformance` mechanism should share or defer to this control.

Show a live sortable top-N table, refreshed about 4 times/s from a fixed rolling window:

| Column | Meaning |
|---|---|
| Function / module / phase | Stable named instrumentation site |
| Self ms/s and self ms/frame | Default descending ranking; actual aggregate contribution |
| Inclusive ms | Time including child spans, clearly labeled |
| Calls/frame; mean/call | Distinguish cheap high-frequency work from rare expensive calls |
| p95/p99/max call and frame contribution | Bounded histogram/window; units and population labeled |
| % CPU frame budget | Self time only for additive percentages |
| Slow-frame correlation | Which functions overlap missed deadlines |

Named initial spans: `GameLoop.animate/update`, `Renderer.renderGame`, `MapRenderer.render/renderTiles/getChunkRenderState/computeChunkSignature/queueWarmChunksAroundViewport/updateChunkCache/renderDynamicWaterLayer/drawProceduralWater`, cliff preparation, biome-mask creation, WebGL instance build/upload/submit, WebGPU pack/upload/submit, entity bases/overlays, effects, fog, minimap and HUD. Group tiny calls under their parent unless drill-down is enabled; timing every pixel would itself cause a regression.

Use a fixed ID registry, reusable nested span stack, inclusive-to-self child subtraction, `try/finally` safety, bounded ring buffers/histograms and in-place counters. Correct recursion and exceptions; label asynchronous worker/queue latency separately rather than counting an awaited promise as CPU work. Do not double-count nested phases. Instrumentation can rank registered functions, not magically every arbitrary JS function. Add an optional Chromium CDP sampling helper to find uninstrumented costs, a downloadable profile/trace, and browser DevTools guidance for other engines.

CPU/GPU/memory panel requirements:

- Distinguish CPU update, render submission, raster/compositor evidence, scheduler delay and actual GPU timestamps. Use capability-checked asynchronous GPU timer queries, never blocking readback/fences in the frame path. Unsupported/disjoint samples show unavailable; residual `frameInterval − CPU` must say **unattributed wait**, not GPU time. GPU results cover instrumented passes, not all browser composition.
- JS heap trend at low frequency where exposed, collection-like drops labeled suspected unless confirmed by a trace, major long tasks/animation frames where supported, worker timings, estimated decoded image/canvas/buffer/texture bytes. Actual GPU memory may be unavailable: do not present estimates as exact memory usage.
- Per-frame and rolling chunk hits/misses/dirty rebuilds/evictions, cache byte totals, queue age/depth, startup vs gameplay bakes, masks created, uploaded bytes, draw calls, visible/culled entities, and unauthorized resize events. Preserve cumulative counters; final snapshots alone are insufficient.
- Export scene/seed/route/build/device/backend/refresh/DPR/quality configuration and profiler mode with metrics. Compare profiler off/on on identical routes and show its measured overhead. Target disabled overhead below measurement noise; enabled CPU overhead ≤0.25 ms/frame at 75 FPS. If exceeded, reduce sampling/UI frequency, not game quality, and flag intrusive captures.
- Expose threshold highlighting for 13.333 ms and missed deadlines; do not misdiagnose display/RAF limits as a CPU or GPU bottleneck without evidence.

Helper tools to implement: deterministic fast-scroll runner, CDP CPU/trace capture, cache-event recorder, transformed-image resize audit, asset/decoded-memory inventory, and matched-camera/time screenshot comparison. Browser trace GPU/raster categories are diagnostic and engine-specific; do not claim portable GPU observability where none exists.

## 9. Visual and performance validation

Capture a golden set from the current build before implementation: all rotated convex/concave shores and biome turns; cliff layers crossing page edges; roads and runways; custom sheets; fog; units/buildings/turrets; construction/charging/submergence; wrecks; effects; and aircraft ground/transition/flight states. Freeze camera and simulation/water time for exact within-backend comparisons. Preserve coverage, alpha, geometry, colors, anchors and smooth rotation. Any platform antialiasing tolerance must be justified and must not hide missing edges, blur or detail loss.

Also record real-time water/effect sequences while stationary and scrolling, to catch frozen phases, lowered cadence and entry-boundary resets. Test cache invalidation against an uncached/reference bake after each mutation type. Simulated context loss, cancelled generation and save loading must recover before presenting a ready frame.

Run strict tests on a production build on qualifying hardware; diagnostic headless runs remain useful but separate. Report cold-first and warm-repeat laps, random jumps, selected worst-case battles and monitor off/on. Count application-caused deadline misses; no relative-regression threshold replaces 75 FPS. Track JS and native-cache memory through repeated laps/map changes and ensure no monotonic retained growth, queue starvation or uncontrolled decoded-page expansion.

Implementation work must run `npm run test:unit`, `npm run lint:fix:changed`, relevant behavior tests and the new performance/visual gates. This documentation-only task ran existing diagnostics; it did not implement any optimizations or claim a passing 75 FPS result.

## 10. Execution order and decision gates

1. Freeze interfaces/ownership, establish current visual and physical-device baseline, implement useful diagnostics and strict tests.
2. Run independent lanes for revision-based terrain caching, startup preparation, retained animated-water geometry, final-size sprites, frame/visibility cleanup and mutation producers.
3. Integrate at one controlled barrier. Shared `mapRenderer`, `renderer`, startup and game-loop files must have one owner at a time.
4. Remeasure. If retained Canvas terrain meets 75 FPS with visual parity and bounded memory, do not add a second terrain engine. If raster/composition remains over budget, implement the retained GPU terrain proposal as a separate gated step with full parity checks.
5. Certify the entire combined pipeline. Keep performance blockers open until the reference workload passes; use the evidence to choose further targeted work rather than weakening thresholds.

The delegation checklist gives exact step IDs, file ownership and dependencies. All listed implementation is future work for GPT-5.6 Luna agents; no worker should start a later wave until its prerequisites have landed.
