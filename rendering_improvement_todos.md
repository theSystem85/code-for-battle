# Rendering improvement delegation checklist

Status: **Wave 2 lanes merged; I20 integration in progress (2026-09-19)**. Date: 2026-09-19. Read [rendering_analysis.md](rendering_analysis.md), [performance_improvement.md](performance_improvement.md), and [spec 069](specs/069-rendering-preparation-contracts.md) before taking a task. Use a model no higher than GPT-5.6 Sol, as requested by the user.

Model roles are intentional: Astra leads this analysis/documentation task; the implementation tasks below are assigned to Luna agents.

## Dispatch instructions

Copy this instruction and substitute the IDs listed in the schedule:

> Implement steps **X, Y, Z** from `rendering_improvement_todos.md`. Read their prerequisites and the two linked analysis/design documents. Work only in the allocated file set, preserve current visuals and procedural water, and keep the 75 FPS gate. Do not weaken tests or reduce DPR/effects/animation cadence. Do not edit shared docs/manifests or another agent's files. If an extra file is required, report it for ownership assignment. Add focused behavior tests, run the repository's required unit tests and changed-file lint after implementation, and report changed paths, remaining issues, validation commands/results, and your exact model. Performance benchmarking is serialized through the integration owner; do not run it concurrently with other workers. Do not claim 75 FPS based on a non-qualifying display or a headless CPU-only run.

Each task gets an isolated branch/worktree created from the same landed prerequisite commit. Tests owned by that task stay with its changes. Integration owner merges sequentially and resolves shared integration points. Do not have multiple agents cherry-pick, stage or edit the same checkout simultaneously. Existing unrelated version edits are not part of these tasks.

The integration owner alone updates this checklist, shared specs/TODO/history, package scripts, asset manifest registrations and other shared documentation. It logs every dispatched prompt in a unique timestamped history file on behalf of the task; workers return the prompt/model/results for that entry. If independent history files are required by their environment, use unique step-prefixed names and never amend the shared TODO concurrently.

## Parallel schedule

| Wave | Agent assignment | Can run together? | Barrier |
|---|---|---|---|
| 0 | C00 contracts/ownership | Single owner | APIs, exact path inventory and reference evidence format approved in repository |
| 1 | P00 profiler; P01 benchmark/visual/resize harness | Yes, disjoint files; **browser measurements serial** | Both land, initial baseline recorded |
| 2 | T10+T11 terrain cache; B10+B11 baking; W10+W11 water; A10+A11 sprites; E10+E11 entity/effects; V10+V11 viewport/minimap; M10 mutation producers | Yes, seven disjoint ownership lanes, after C00/P00/P01 | All focused tests pass; merge one at a time |
| 3 | I20 pipeline integration | Single owner only | Combined startup, revisions, assets, water and profiler wiring verified |
| 4 | Q30 physical performance certification; Q31 visual/memory audit | Read-only analysis can run together on captured evidence; captures/benchmarks run serially | 75 FPS, unchanged visuals, resize and memory gates |
| 5, if needed | G40 retained GPU static terrain | Single backend integration owner; begins only on measured need | Repeat Q30/Q31; never relax the target |

“Parallel” applies within a wave and within disjoint files; it does not mean each task is dependency-free. T10/T11 share `mapRenderer.js` and must be one agent or sequential. B10/B11 share asset/preparation state and must be one agent. W10/W11 share water contracts and should be one agent initially. A10/A11 share image renderers; E10/E11 share effects/entity rendering. Integration must not overlap file edits from these lanes.

## C00 — contract and ownership freeze [implemented 2026-09-16]

- [x] Inventory the current map mutation producers and record every file to be owned by M10. Confirm no new changes invalidate the measured baseline.
- [x] Specify `RenderRevisionStore`, `PreparedMap`, `PreparedSpriteRegistry`, `FrameViewport`, profiler numeric IDs, diagnostics schema and explicit byte-budget ownership. Implement only the small shared contract modules necessary for independent lanes; avoid competing singleton implementations.
- [x] Declare which module publishes map/asset/layout generations, who owns disposal, and how cancellation rejects stale jobs. Keep device caches out of serialized game state.
- [x] Define mutation domains and old/new dependency footprints, water-phase rules, final-size sprite metadata and full-transform resizing classification.
- [x] Record qualifying hardware/environment matrix and requests still needed for reference-scene certification. Local analysis can proceed without it; certification cannot be fabricated.

**Exclusive write set:** new contract modules under `src/rendering/prepared/` and `src/performance/` with filenames fixed before dispatch; shared docs and specs; dependency/package scripts only if needed. Downstream agents consume these modules and do not redefine them. Do not alter game behavior in C00.

**Done:** contracts import cleanly, version/disposal semantics are tested, ownership table has no duplicated path. Public signatures are stable for wave 2.

## P00 — opt-in function profiler and overlay [implemented 2026-09-19]

**Prerequisite:** C00. **Parallel with:** P01.

- [x] Add “Function timings” toggle to existing performance overlay, usable independently of recorder; persist only the preference, not traces (2026-09-19).
- [x] Implement bounded nested spans with self/inclusive times, call counts, rolling ms/frame and ms/s, p95/p99/max, sorting by aggregate self cost and slow-frame correlation.
- [x] Remove always-on object-replacing behavior from legacy `logPerformance` when detailed profiling is disabled; preserve callers and error/return semantics.
- [x] Add low-rate memory trends, capability fields and explicit unavailable GPU/heap values; separate unattributed wait from GPU time. Other lanes add their own spans later.
- [x] Add diagnostic byte/upload/draw/resize counters with stable IDs; retain totals through a recording rather than only final-frame snapshots.
- [x] Measure off/on overhead. No hidden per-frame sorting/DOM updates; no arbitrary-function wrapper explosion.

**Exclusive write set:** `src/performance/performanceMonitor.js`, new profiler implementation files designated by C00, `src/performanceUtils.js`, `src/ui/performanceDialog.js`, `src/ui/fpsDisplay.js`, necessary overlay markup/styles, `src/game/gameLoop.js` for root timing only; profiler unit tests. P01 must not edit these files.

**Done:** toggle works independently of recording; parent/child/recursion/exception accounting is covered; off mode has no clock reads, statistics writes or detailed timing allocations; the exported table identifies fixed and bounded legacy registrations; unknown GPU/heap capabilities are labeled. A five-run Node microbenchmark of the reusable profiler core measured 0.000272–0.000278 ms added per frame for three spans, and a 50-span stress probe measured 0.004617–0.004660 ms/frame, below the 0.25 ms/frame design budget. These are local CPU instrumentation measurements, not physical 75 FPS certification. API timing is CPU submission unless explicitly measured otherwise.

## P01 — strict benchmark and diagnostic tooling [implemented 2026-09-20]

**Prerequisite:** C00. **Parallel with:** P00, using the fixed diagnostics schema.

- [x] Capture current golden images/sequences before any optimization. The opt-in visual capture emits WebP-85 shoreline/terrain/cliff-road/dynamic-entity states and a fixed-state repeat manifest; existing shoreline orientation coverage remains diagnostic input.
- [x] Add time-based route runner, route completion checks, first-visit and repeat-lap windows, reversals/jumps, scene readiness boundary and refresh-capability labeling.
- [x] Replace permissive rendering acceptance with 75 FPS/13.333 ms deadline evidence, tails/max/missed frames; preserve historical diagnostic scenarios without calling them acceptance passes.
- [x] Add CDP sampling/trace helper with explicit profiling-overhead labeling and readable self/inclusive function table. Include startup and steady captures separately.
- [x] Add transformed-image resize/decode/canvas-resize audit, asset metadata/byte inventory and report capture. Auditing is opt-in and runs only inside the diagnostic E2E.
- [x] Add physical-hardware run instructions and backend assertions. Distinguish real GPU vs CPU/software fallback; report independent FPS samples without selecting the larger. Headless, unknown-refresh and software runs are diagnostic-only.

**Exclusive write set:** `tests/e2e/organicTerrain.test.js`, `tests/e2e/mobileFpsRegressionBenchmark.test.js`, new `tests/e2e/renderingPipeline75Fps.test.js`, `tests/e2e/renderingVisualParity.test.js`, diagnostics/helpers under `tests/e2e/helpers/`, new read-only capture tools under `scripts/performance/`. C00/integration owner handles package scripts; do not edit application renderer files.

**Done:** strict reports include cold startup and steady repeat-lap captures, p95/p99/max frame tails, deadline misses, route completion, backend/refresh eligibility, resize events, transformed draws, asset bytes and separate CDP profiles. `PERF_RENDERING_PIPELINE_ACCEPT=1` refuses to certify headless/software/under-75Hz runs. Physical qualifying-hardware certification remains an external measurement step.

## T10 — constant-time terrain cache validity [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Same agent as:** T11.

- [x] Replace clean-frame signature scans with chunk revisions; cache water/SOT presence and invariant state.
- [x] Implement local topology/surface invalidation with correct old/new halo reach; separate local SOT changes from global map generation.
- [x] Retain debug-only full-rebuild oracle and randomized edit parity tests. Use the M10 contract; do not patch mutation producers yourself.
- [x] Add function spans/counters proving unchanged map rendering makes zero `computeChunkSignature` calls and does no topology reconstruction.

**Exclusive write set for T10/T11:** `src/rendering/mapRenderer.js`, `src/rendering.js`, new terrain revision implementation module designated by C00, `tests/unit/mapRendererWater.test.js` and new cache-revision/warm-queue unit tests. Must not edit `organicTerrain.js`, GPU backends, mutation producers or startup orchestrator during this wave.

`src/rendering.js` changes are limited to the terrain revision adapter. The revision API is fixed by C00; T10 implements it and tests synthetic mutations while M10 independently wires real producers. T10 can finish component work before M10, but complete real-game mutation parity cannot be accepted until both land in I20. This is a join barrier, not a cyclic dependency.

**Done:** byte/pixel parity against full rebuild after mutations; O(visible chunks) primitive validity checks; no full-grid hashes in normal frames. Legacy street output unchanged.

## T11 — bounded cache residency and warm scheduling [implemented 2026-09-19]

**Prerequisite:** T10 (same lane).

- [x] Reuse visibility/active-key storage; refresh neighbor discovery only on chunk-boundary/direction/revision changes.
- [x] Replace repeated array materialization/sorts with stable bounded scheduling. Distinguish queued work from resident pins; enforce byte budgets rather than only count targets.
- [x] Add maximum job age, backlog, evictions, resident/staging byte telemetry and cancellation generation handling.
- [x] Consume prepared handles from B10/B11. Defer shared integration to I20; do not invent a flat placeholder fallback or freeze dirty visuals to make a benchmark pass.

**Done:** no allocation proportional to warm-queue size each frame; no prefetch starvation in fast scrolling; repeated laps remain bounded; missing-page behavior satisfies visual/readiness contract.

## B10 — decode/readiness barrier and preparation lifecycle [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Same agent as:** B11.

- [x] Unify readiness for all required terrain/biome/cliff art and applicable prepared sprite variants; wait for actual decode.
- [x] Publish one complete asset generation rather than invalidating global caches once per image callback.
- [x] Implement prepare/cancel/dispose/progress API and fail/retry behavior. Build testable preparation module; I20 wires it into actual start/load/settings flows.
- [x] Count decoded source, prepared raster, transfer and GPU staging bytes separately; do not assume JS heap sees native allocations.

**Exclusive write set for B10/B11:** `src/rendering/organicTerrain.js`, `src/rendering/cliffTerrain.js`, `src/rendering/textureManager.js`, new preparation modules, corresponding `organicTerrain`, `cliffTerrain`, and texture-manager unit tests. No `mapRenderer.js`/`renderer.js`/game orchestrator edits in this wave.

**Done:** decode races and cancellation tested; no incomplete terrain generation is marked ready; asset failure is explicit; one atomic publish per prepared generation.

## B11 — prepare topology, masks and affordable terrain pages [implemented 2026-09-19]

**Prerequisite:** B10 (same lane).

- [x] Prepare SOT/biome/cliff descriptors once per map generation and reuse them until relevant edits. Preserve exact corner/halo rules.
- [x] Prepare masks and compositing at intended density; canonicalize keys only when visual equality is proven. Release old generation caches.
- [x] Choose all-resident raster mode only after byte accounting; implement retained descriptors for larger maps. Demonstrate 200×200 DPR-2 memory constraints rather than raising cache limits blindly.
- [x] Prototype worker preparation with transferable immutable data if needed; measure total time, responsiveness and duplicate memory. No unmeasured worker assumption.

**Done:** no static generation or source resizing on the first certified scroll; memory budget includes overlaps/transfers; all required terrain pixels or renderable descriptors ready; animated water not baked into static pages.

## W10 — retain GPU water geometry and instrument GPU time [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Same agent as:** W11 initially.

- [x] Retain water/SOT world-space instances per revision; stable GPU buffers/pipelines/uniform locations; camera/time-only updates on clean frames.
- [x] Limit uploads to changed topology ranges; keep geometry and texture uploads out of clean scrolling.
- [x] Add nonblocking capability-checked GPU timers and upload/draw counters; discard invalid/disjoint readings and label unsupported paths.
- [x] Preserve existing shader animation, water phase, density, colors, corners and street isolation; test context loss/restoration.

**Exclusive write set for W10/W11:** `src/rendering/webglRenderer.js`, `src/rendering/webgpuRenderer.js`, new `src/rendering/prepared/cpuWaterPass.js` (or C00-designated equivalent), GPU-specific unit tests and a new uniquely named water-retention E2E test. Do not edit `mapRenderer.js`; expose CPU pass API for I20.

**Done:** same-time images match reference; moving water remains live; clean-camera frames do not recreate/upload world topology; real GPU timings and fallback reason available where supported.

## W11 — cache CPU-water invariants [implemented 2026-09-19]

**Prerequisite:** W10 contract stable (same lane).

- [x] Extract behavior-equivalent CPU pass behind contract; cache setting palettes and world-space coefficients, retain visible water runs and reuse buffers.
- [x] Sample animation time once per pass; preserve tile phase, alpha and layering. No reduced update rate, low-resolution substitution or static loop.
- [x] Compare output over multiple fixed timestamps and camera positions, especially SOT/land blends and map edges.

**Done:** matches reference animation and coverage; less CPU work demonstrated after integration; no per-tile color-array rebuild in normal frames. I20 connects the extracted pass.

## A10 — generated final-size sprite registry [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Same agent as:** A11.

- [x] Inventory source dimensions, real logical footprint, density, alpha, anchors and state variants for units/buildings/terrain pieces used by entity renderers.
- [x] Build WebP-85 generator/manifest and runtime loader for prepared native-size variants, preserving source masters and exact layer anchors.
- [x] Prepare custom art and nonstandard DPR before readiness; cache keys include asset version and density. Add decoded byte/disposal accounting.
- [x] Ensure complete-transform sizing audit recognizes truly native draws; do not remove rotations or quantize headings.

**Exclusive write set for A10/A11:** new sprite preparation/build modules and generated assets under a new dedicated `public/images/prepared/` directory; map image renderer files for tank, harvester, rocketTank, ambulance, tankerTruck, recoveryTank, ammunitionTruck, mineLayer, mineSweeper, howitzer, destroyer, supplyShip, navalFleet, turret, apache, f22, f35; `jetRenderScale.js` only if necessary to enforce state exceptions; matching image-renderer tests. C00 owner handles shared package/manifest registrations. Do not edit `buildingRenderer.js` or `unitRenderer.js` (E10 lane).

**Done:** deterministic regeneration, correct sizes/anchors/alpha, explicit byte totals and no unbounded heading/size Cartesian-product cache.

Building-layer boundary: A10 exclusively prepares/owns the generated art, manifest and registry; E10 consumes it in `buildingRenderer.js`. Neither edits the other's files. C00 fixes the lookup interface and I20 resolves cross-lane integration.

## A11 — consume prepared unit/naval/aircraft layers [implemented 2026-09-19]

**Prerequisite:** A10 (same lane).

- [x] Replace steady size conversion in owned image renderers with prepared layers; retain continuous rotation, mounting, recoil, muzzle flashes, clips and aspect ratios.
- [x] Prepare Apache's existing body buckets and fixed rotor dimensions before play; preserve rotor motion.
- [x] Use stable prepared aircraft ground/flight sizes and allow only actual takeoff/landing resizing; tag those audit events explicitly.
- [x] Expose prepared building-layer lookup for E10; do not edit E10 files.

**Done:** no unauthorized resized draws/late variant creation in owned renderers; matched visual sequences and selected naval/turret tests pass; aircraft exceptions do not cover ordinary ground/naval resizing.

## E10 — reusable visible entities and building layers [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. A10 contract available from C00; integrate its implementation at I20. **Same agent as:** E11.

- [x] Reuse per-frame visible lists and ID indexes; remove repeated linear target lookups and redundant allocations in selected overlays.
- [x] Consume prepared building base/turret lookups without touching A10 image renderer files. Preserve construction/Tesla cropping without stretching.
- [x] Preserve all layer ordering, tooltip/hit-test semantics, friendly/enemy visibility and airborne terrain occlusion.
- [x] Add entity/effects/HUD spans to owning modules; measure before removing useful work.

**Exclusive write set for E10/E11:** `src/rendering/renderer.js`, `unitRenderer.js`, `buildingRenderer.js`, `effectsRenderer.js`, `wreckRenderer.js`, `wreckSpriteCache.js`, `pathPlanningRenderer.js`, `movementTargetRenderer.js`, `retreatTargetRenderer.js`, `guardRenderer.js`, `dangerZoneRenderer.js`, `mineRenderer.js`, `spriteSheetAnimation.js`, `src/ui/harvesterHUD.js`, and corresponding focused tests. Do not edit `gameLoop.js`, canvas/layout utilities, minimap, or per-unit image renderers.

**Done:** O(1) ID lookup after one shared index build when needed; reusable list identity; correct culling bounds and no missing overlays; visuals and gameplay unaffected.

## E11 — effects/wreck culling and remaining resize conflicts [implemented 2026-09-19]

**Prerequisite:** E10 (same lane).

- [x] Cull offscreen wrecks/effects using expanded bounds; preserve visible cables/shadows and lifetime behavior.
- [x] Prepare lazy gradient/wreck caches before gameplay where finite; account for their memory and eviction.
- [x] Enumerate all remaining growing raster effects/sinking/animation resizing. Implement parity-preserving procedural or exact prepared-frame alternatives; leave unresolved conflicts explicit.
- [x] Explicitly resolve smoke/core (`effectsRenderer.js:382–405`), explosion plume/core (`:500–536`) and sinking-wreck (`wreckRenderer.js:192–222`) size conversion. Do not discretize a continuous age-based animation or use aircraft exceptions for these cases; Q31 remains blocked without a continuous-equivalent solution or explicit user decision.
- [x] 2026-09-22: chimney smoke now samples one prepared sprite at the continuous radius (`preparedSmokeSprites.js`). The radius is not bucketed. The procedural gradient loop remains the fallback. Explosions are still procedural. See `specs/087-gpu-chimney-smoke.md`.
- [x] Coordinate any necessary simulation lifetime changes through I20; do not silently stop particles advancing when culled.

**Done:** no lost visible effects, no new angular/time quantization, no unapproved resizing exceptions; profiler verifies actual benefit under active worst-case effects.

## V10 — stable viewport/density lifecycle [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Same agent as:** V11.

- [x] Cache logical/backing dimensions on layout events; remove repeated frame-path `getBoundingClientRect` reads and result allocations.
- [x] Publish reusable viewport state and density-generation events. Prepare and atomically swap required raster variants on explicit display/DPR changes.
- [x] Keep selected visual quality fixed during scrolling. Do not count current mobile DPR reduction as success; separate explicit user graphics settings from automatic degradation.

**Exclusive write set for V10/V11:** `src/rendering/canvasManager.js`, `src/rendering/renderingUtils.js`, `src/rendering/minimapRenderer.js`, viewport-specific new helper modules and corresponding unit tests. `src/utils/layoutMetrics.js` only if allocated by C00. Do not edit `renderer.js`, game loop or game orchestrator until I20.

**Done:** no continuous canvas size resets/layout reads while scrolling; coherent density across layers; resize/reorientation preserves alignment and input coordinates.

## V11 — minimap and visibility cache [implemented 2026-09-19]

**Prerequisite:** V10 (same lane).

- [x] Prepare minimap ground at destination backing dimensions, with independent terrain/resource and visibility revisions.
- [x] Avoid full-map fog reconstruction if unchanged; retain live viewport rectangle, units, buildings and current video/radar behavior.
- [x] Add separate spans for fog, base image, video and entity markers; avoid attributing video decoding to terrain.

**Done:** no steady minimap source-size conversion; resource/fog updates correct; camera indication remains responsive without lowering visual cadence to pass.

## M10 — complete mutation-producer wiring [implemented 2026-09-19]

**Prerequisites:** C00, P00, P01. **Parallel with:** other wave-2 lanes through frozen revision API.

- [x] Inventory all writes to fields formerly covered by signatures, including direct assignments and bulk replacements. Register exact files before editing.
- [x] Wire old/new local change notifications and bulk transactions for editor, resources/harvesting, building footprints, tile decals, map regeneration, save/load/replay and network map restoration.
- [x] Avoid per-entity/tick scans or allocations to discover mutations. Notify at the actual write point; coalesce duplicates.
- [x] Confirm state serialization remains device independent and no simulation/occupancy behavior changes.

**Exclusive write set:** C00-inventoried producer files outside `src/rendering/`, `src/performance/`, and the other lanes' named paths. Expected candidates include `src/mapEditor.js`, `src/game/tileDecals.js`, `src/game/harvesterLogic.js`, `src/gameSetup.js`, `src/saveGame.js`, `src/buildings.js`, relevant map generation/resource/network modules, and map-changing methods in `src/game/gameOrchestrator.js`. This list is provisional until C00 resolves actual writers; do not blanket-edit `src/game/**`. Startup readiness wiring in the same orchestrator is deferred to I20.

**Done:** mutation matrix has no uncovered field/producer, full-rebuild oracle agrees after edits and restores, serialization tests pass, no per-frame hash substitute introduced.

## I20 — integration and readiness publication [implemented 2026-09-19; Q30/Q31 still required]

**Prerequisite:** all wave-2 tasks complete and merged. **Exclusive phase; no other code-editing lanes.**

- [x] Connect prepared-map and sprite readiness to new game, load, multiplayer restore, settings, custom assets and context restoration.
- [x] Wire CPU-water extracted implementation, terrain prepared pages/descriptors, profiler spans, viewport record and mutation store into actual call paths.
- [x] Verify every mode sets water/static layer flags correctly and that global SOT/texture generations do not accidentally force all chunks dirty.
- [x] Audit every diff for source scaling, lazy cache construction, dynamic allocation, visual compromises and unsupported fallback claims.
- [x] Run full unit suite, changed-file lint, relevant E2E/parity tests and production build. Record failing performance criteria as blockers, not test exceptions.

**Write set:** integration points in `mapRenderer.js`, `renderer.js`, `gameLoop.js`, game orchestrator/main/load flows, shared registrations and tests, now unlocked from earlier owners. Update docs with measured results only.

**Done:** complete prepared pipeline is exercised by the real game, all nonperformance regression checks pass, and artifacts are ready for Q30/Q31.

## Q30 — physical 75 FPS certification [not completed]

**Prerequisite:** I20. **Owns the exclusive browser/hardware measurement slot.**

- [ ] Run production build on qualifying ≥75 Hz reference hardware at unchanged density/quality. Log actual backend and all environment fields.
- [ ] Execute deterministic full-map routes at all agreed speeds, first visit, repeat laps, reversals/jumps and selected combat/effect worst case.
- [ ] Verify ≥75 FPS evidence, 13.333 ms deadline budget, zero application-caused dropped 75 Hz refreshes, tails/max, queue/cache/upload behavior and on/off profiler overhead.
- [ ] Repeat serially, save reports/traces and diagnose every failure. CPU fallback and low-refresh diagnostics remain separately labeled; no weaker floor.

**Write set:** measurement artifacts and step-specific findings; central owner updates authoritative specs/TODO/history. No unrelated code fixes in certification; route failures to their owner.

## Q31 — visual, sizing and memory certification [not completed]

**Prerequisite:** I20. **Can analyze captured artifacts in parallel with Q30; coordinate capture time.**

- [ ] Compare fixed-time golden images and live animation sequences; verify all eight shoreline/biome corner cases, page seams, cliffs, roads and entity layers.
- [ ] Confirm water animates continuously at existing cadence while stationary/scrolling and after context recovery. No resets/frozen chunks.
- [ ] Run zero-unauthorized-resize audit after readiness, including first appearance of every entity/effect family.
- [ ] Verify byte budgets and disposal across laps, new maps, loading, settings and failures. Use JS trends plus explicit native allocation estimates; distinguish suspected GC from measured collections.
- [ ] Record any visual difference or memory/resize conflict as a blocker. Do not loosen visual thresholds merely to accept an optimization.

**Done:** parity, animated behavior, resizing policy and bounded memory all verified. Final acceptance requires Q30 **and** Q31.

## G40 — retained GPU static terrain, only if measurements require it [not implemented]

**Prerequisite:** I20 measurements show raster/composition/residency remains over budget; record the causal trace. This step is not automatic.

- [ ] Prototype retained world-space terrain geometry/material atlas/mask composition, reusing immutable descriptors and preserving the current pixel output.
- [ ] Measure native-density memory/upload/overdraw costs against the revised Canvas path. Preserve shader water as an independent animated layer and street art as currently rendered.
- [ ] Preserve draw ordering, premultiplied alpha, gutters, filtering, coverage, mixed corners, cliffs, decals and resources. Implement recovery/fallback contracts without claiming an unverified fallback passes 75 FPS.
- [ ] Promote only after parity and Q30/Q31 pass; remove obsolete duplicate resources rather than retaining two full resident pipelines.

**Write set:** GPU backends plus required terrain/renderer integration, exclusive after earlier owners finish; new backend-specific tests. No simultaneous T/W/I edits.

## Final handoff checklist

- [ ] Every task reports changed paths, exact model, measurements, and unresolved items.
- [ ] Shared docs accurately distinguish implemented behavior, historical measurements and remaining work.
- [ ] No source/asset resize during steady gameplay except explicitly tagged aircraft takeoff/landing.
- [ ] No visual quality/cadence degradation; procedural water remains animated.
- [ ] No 20% allowance or lower-FPS default can pass the strict target.
- [ ] Combined production pipeline passes the qualifying reference scene at 75 FPS; otherwise keep the project performance work open with the exact next bottleneck.
