# Rendering improvement delegation checklist

Current sprite-loading regression follow-up: [ranked open tasks S00–S10](#sprite-streaming-follow-up-2026-10-25) and [analysis](specs/138-sprite-streaming-performance-analysis.md). Historical wave status below is not performance certification.

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

## Sprite streaming follow-up (2026-10-25)

New open work based on [the source analysis and memory inventory](specs/138-sprite-streaming-performance-analysis.md). This supersedes historical “implemented” claims only where the current audit identifies remaining work; it does not reopen unrelated terrain/water tasks. **Analysis complete; implementation and physical performance acceptance pending.** Priorities are expected impact, not measured browser rankings. The user now authorizes temporary coarse sprite tiers while fast scrolling, followed by refinement. Preserve final visual fidelity, canvas DPR, animation cadence, deterministic placement and simulation behavior; see the analysis for this narrow exception to the earlier fixed-quality policy.

### Ranked issues

Sorted by expected combined frame-time and memory impact; the memory column makes differences explicit. S00 is the execution prerequisite despite its lower direct performance impact.

| Rank / task | Issue | Expected scroll/CPU impact | Memory impact | Dependency / owner lane |
|---|---|---|---|---|
| 1 / S01 | Synchronous map-sheet black keying, group cutouts and repeated metadata signatures | Very high during preparation/config changes; conditional during scrolling | High transient pixel arrays and retained canvases | S00; asset build lane |
| 2 / S02 | 768 tank rotations generated on main thread after loading | High; up-to-8-ms slices plus indivisible job overshoot | High: ~22.77 MiB retained at DPR 3, plus temporaries | S00; rotation lane |
| 3 / S03 | First-visible/evicted terrain pages bake on main thread; upgrades need local invalidation | High for cold/large-map traversal | High page/staging residency | S00; terrain lane |
| 4 / S04 | Fragmented budgets, retained sources/atlases, no tier replacement/eviction | High under native memory pressure/GC/upload churn | Very high; old/new tiers and generations overlap | S00; resource lane |
| 5 / S05 | Idle queue drains all deferred art without scroll/deadline/byte backpressure | High competing background preparation | Medium–high queued/in-flight/resident growth | S00; scheduler lane |
| 6 / S06 | Integrated sheets lack build tiers and demand-driven coarse-to-full publication | High potential on cold traversal; needs S01/S03–S05 to avoid churn | High benefit if selective; worsens if all tiers retained | S01, S03–S05, S07; integration owner |
| 7 / S07 | Only explosions use workers; custom sheet processing falls back synchronously | High for dynamic/custom art; limited effect on already warm pages | Medium–high transfer/copy peaks | S00; worker lane |
| 8 / S08 | Decoration layout can rebuild in a render lookup and mutates city state | High on an invalidation miss, low when already warmed | Medium map/catalog allocations | S00; layout lane |
| 9 / S09 | Stable sheet URLs, serial loads and offline fill compete with streaming | Medium startup/network effect; CPU blocking not demonstrated | Medium disk/cache + potential download amplification | S00 and asset manifest contract; PWA lane |
| 10 / S00 | Missing trace attribution for sheet prep, rotations, tiers and native memory | Enabler; avoids optimizing the wrong cause | Enabler; distinguishes heap from pixel/GPU storage | First; integration/profiling owner |
| 11 / S10 | Full worker rendering or WASM adopted without a causal bottleneck | Conditional, potentially high; high migration cost | Can improve or duplicate snapshots/textures/WASM memory | Measured S01–S09 results; experiment lane |

### S00 — freeze contracts, attribution and ownership

- [x] Add bounded, opt-in stage counters/spans for sheet load/decode/key/cutout/catalog, rotation generation, queue waits, bitmap creation/publication, chunk rebuild/upload and bytes by tier/generation. Stable sprite IDs 90–98 live in `src/performance/profilerIds.js`; chunk rebuild and upload reuse existing IDs 15 and 31. The fixed typed-array counter schema and stage-to-profiler-ID table live in `src/rendering/spriteStreamingDiagnostics.js`. Recording is a no-op while disabled and creates no per-event objects.
- [ ] Record cold and warm causal traces using the spec protocol. **Pending: this agent environment has no verified hardware GPU.** No software renderer measurements were taken and no fabricated baseline is substituted. Patrick must capture cold/warm traces on qualifying hardware after the implementation lanes integrate the contracts.
- [x] Freeze the new dedicated modules: `src/rendering/spriteStreamingProtocol.js` (worker request/result, capability and fallback), `src/rendering/spriteStreamingGeometry.js` (stable IDs/logical geometry and per-tier rectangles), `src/rendering/spriteStreamingLifecycle.js` (reservations/releases, demand snapshots, cancellation and publication/revision), and `src/rendering/spriteStreamingDiagnostics.js` (bounded attribution schema). The progressive-tier sampling exception is limited to drawing a prepared lower tier into unchanged logical geometry; it never changes simulation dimensions, final density or DPR.
- [x] Freeze shared integration ownership: only the S00/S06 integration owner edits the reserved paths listed below during independent development. Component lanes must return proposed integration patches rather than editing them concurrently.

#### S00 frozen path ownership for independent lanes S01–S09

| Lane | Exclusive paths | Paths reserved to the integration owner |
|---|---|---|
| S01 | `scripts/build-map-sprite-tiers.mjs`; `scripts/lib/mapSpriteBuild/**`; `public/images/prepared-map-sprites/**`; uniquely named build fixture tests | `src/rendering/blackKeyPixels.js`; `src/rendering/decorationCutout.js`; package scripts; `vite.config.js`; manifest registrations |
| S02 | `src/rendering/tankRotationCache.js`; new rotation worker modules; `tests/unit/tankRotationCache.test.js`; uniquely named worker tests | `src/rendering/tankImageRenderer.js`; startup wiring |
| S03 | `src/rendering/mapRenderer.js`; new static-page worker/adapters; focused map-cache tests | `src/rendering.js`; shared mutation and startup modules |
| S04 | `src/rendering/prepared/spriteResourceStore.js`; focused resource-lifecycle tests | `src/rendering/prepared/preparedSpriteRegistry.js`; `src/assetLoading.js`; explosion integration |
| S05 | `src/utils/idleAssetQueue.js`; new scheduler module; scheduler unit tests | camera, startup and prepared-registry wiring |
| S06 | Serialized integration after S01–S05/S07 land; all paths in the reserved list below | Every active component lane path until its owner has landed |
| S07 | `src/rendering/spritePreparationPool.js`; `src/rendering/spritePreparation.worker.js`; uniquely named protocol tests/fixtures | existing explosion modules and shared pixel helpers |
| S08 | `src/rendering/decorationLayout.js`; new preparation adapter; layout fixture tests | `src/rendering/textureManager.js`; `src/rendering.js`; city-state wiring |
| S09 | `src/pwa/offlineAssetPlan.js`; `src/pwa/sw.js`; offline downloader/manifest plugin; focused PWA tests | build/Vite/TextureManager wiring and manifest registrations |

The integration-owner-only paths are exactly: `src/rendering/textureManager.js`, `src/rendering/spriteSheetAnimation.js`, `src/rendering/prepared/preparedSpritePipeline.js`, `src/rendering/prepared/preparedSpriteRegistry.js`, `src/rendering/prepared/renderingPipeline.js`, `src/rendering.js`, `src/assetLoading.js`, `src/game/gameOrchestrator.js` startup/load wiring, display/settings wiring, `package.json`, `package-lock.json`, `vite.config.js`, shared documentation, and all shared asset/offline manifest registrations. Ownership lasts until independent S01–S05 and S07–S09 work is landed and S06 begins serialized integration.

**Done:** downstream lanes can implement and test against frozen fixtures/interfaces; exact path ownership recorded; hardware trace status explicit. This is the execution barrier, not a requirement to invent baseline timings before starting safe component work.

### S01 — bake bundled sheet masks, cutouts and resolution tiers

- [x] Add an auto-discovered `.webp` + `.json` sheet build pipeline, separate from the hand-maintained unit inventory; include group/inner-cut/threshold/feather/coverage behavior exactly. Share pure pixel rules with runtime where possible. Process alpha key/cutout before tier downsampling so silhouettes remain stable.
- [x] Generate padded atlas pages at chosen coarse/intermediate/final backing sizes (initial candidates 0.5×, 1×, 2×, 3×; select useful tiers by footprint and byte inventory). Use WebP q85, deterministic hashes, per-tier rects/anchors/decoded byte metadata and algorithm versions. Do not produce fake extra detail by upscaling beyond masters without recording it.
- [ ] Precompute immutable per-sheet metadata signatures and catalogs; remove O(T×M) signature recomputation from tile-reference construction through the integration API. Preserve source/editor metadata and saved identifiers. **S01 component complete:** signatures/catalogs and source/editor identifiers are generated; integration-owner consumption is pending.
- [ ] Verify reproducibility, coverage/group seams, alpha interiors, `inner_cuts`, mixed biomes and generated outputs. Add a stale/missing-art check for the normal build; return package/Vite/Netlify wiring to the integration owner. **S01 component complete:** focused fixtures and `--check` are present; reserved normal-build wiring remains pending in `docs/patches/s01-map-sprite-tier-build-wiring.md`.

**Exclusive component paths:** new `scripts/build-map-sprite-tiers.mjs`, `scripts/lib/mapSpriteBuild/`, generated `public/images/prepared-map-sprites/`, new build fixture tests. Existing `blackKeyPixels.js` and `decorationCutout.js` remain integration-owned until explicitly transferred; consume or propose extracted helpers without editing shared paths concurrently.

**Done:** every bundled usable sheet has validated derivatives; normal build integration fails stale derivatives; no bundled runtime full-sheet readback/key/cutout after publication. Avoid fetching every generated tier.

### S02 — remove background tank rotation contention

- [x] Move existing angle/part preparation into the worker contract, or build packed rotation atlases before deployment; compare transfer/storage/upload/residency costs before choosing. Keep the current visual result and angle count; do not add angle buckets to continuously rotated units.
- [x] Request only needed variants, enforce a byte reservation before staging, and publish complete part sets atomically. Retain correct live-rotation behavior until ready. Budget temporary supersampling separately.
- [x] On reset, cancellation, partial failure or superseded density, explicitly release every staged canvas/bitmap. Current early returns from `buildTankRotationCache()` leave unpublished frame cleanup to GC.

**Exclusive component paths:** `src/rendering/tankRotationCache.js`, new rotation worker module, `tests/unit/tankRotationCache.test.js` and uniquely named worker tests. `tankImageRenderer.js`/startup glue edits belong to integration owner.

**Done:** no rotation preparation slices contend with gameplay on main thread; bounded native bytes across repeat density changes; visual/facing/recoil tests pass. Hardware validation remains separate.

### S03 — bounded terrain-page preparation and tier revisions

- [x] Diagnose first-route versus warm cache misses; retain revision-based validity and bounded cache behavior already implemented. Introduce immutable page-preparation jobs and local asset-to-page dependency indexes.
- [ ] Evaluate worker composition of static decorated pages at actual backing DPR. Separate procedural water and live entity/effect layers; transfer complete results, budget upload/publication and avoid rebuilding pages synchronously on render misses.
- [x] Add per-sheet/tier revisions with deduplicated local rebuilds, directional lookahead and safe frame-boundary swaps. Preserve old complete pages while preparing replacements; handle neighboring-page halos and edits. Prevent each sprite completion from triggering global invalidation.

**Exclusive component paths:** `src/rendering/mapRenderer.js`, new static-page worker/adapters and focused map-cache tests. `src/rendering.js`, shared mutation/startup modules remain integration-owned.

**Done:** cold traversal, eviction, reversals and detail promotion do not cause unbounded page work or stale coarse pages; no seams, lost decals or frozen water. Native byte and upload budgets verified.

### S04 — one bounded image resource lifecycle

- [x] Implement reference-counted resources shared by source/atlas/tier handles with byte reservation for resident, staging, transfer and old/new generations. Deduplicate source atlas accounting; distinguish GPU estimates from measured values.
- [ ] Define visible pins, byte-based eviction, tier replacement and teardown. Release decoded sources after consumers finish; choose shared atlas views versus 240 cropped Apache bitmaps using measured draw/upload and memory costs.
- [ ] Specify registry replace/remove semantics and hooks to stop deferred jobs before disposal. Fix underlying-operation timeouts: close late bitmaps and prohibit stale publication. Handle failure retry instead of permanently caching a fulfilled failed job.
- [ ] Integrate explosion cache reservation rollback, count-limit recovery and teardown. Test aborted/superseded loads, density changes, worker crashes, invalid dimensions, partial registration and repeated maps. Final-entry byte sums alone must not represent the total memory budget.

**Exclusive component paths:** new `src/rendering/prepared/spriteResourceStore.js` and focused resource-lifecycle tests. Return patches for existing registries, source promise retention, `assetLoading.js` and explosion state to integration owner; do not independently mutate those shared implementations.

**Done:** peak native allocations fit explicit limits including overlaps; discarded resources are closed deterministically; no stale lookup points at an evicted/closed image.

### S05 — demand-driven scheduler with backpressure

- [x] Extend `src/utils/idleAssetQueue.js` behind the frozen contract: visible coarse > lookahead > visible refinement > optional work, with bounded aging to prevent starvation, generation cancellation, deduplication and controlled retries.
- [x] Admit work using both concurrency and byte reservations. Honor idle deadline/timeout and explicit foreground slack; async completion work must also be bounded. Implement timer fallback without assuming a 16 ms delay provides idle time.
- [x] Coalesce camera demand snapshots outside per-entity loops. Pause optional upgrades/rotations during rapid camera movement, then resume after a settled dwell interval with hysteresis. Bound obsolete requests and avoid building new Maps/Sets every frame.
- [ ] Replace enqueue-all behavior at integration with actual demand/resident policy; preserve pre-readiness requests for critical assets.

**Exclusive component paths:** `src/utils/idleAssetQueue.js`, new scheduler module and scheduler unit tests. Camera/startup/prepared registry wiring is integration-owned.

**Done:** fast reversals cancel stale queued work, urgent visible requests progress, long dwell reaches full detail, bounded queues/bytes and worker completions cannot flood main-thread callbacks.

### S06 — integrate progressive sprite detail

- [x] Consume S01 build manifest, S04 store, S05 demand scheduler and S07 worker APIs in `TextureManager` and prepared sprite paths. Stage all sheet metadata before rendering; stream visual resources without changing pools, placement or city simulation based on arrival order.
- [x] Publish coarse handles rapidly, promote visible settled regions to requested final density under budgets, and keep previously sharp resident art sharp. Preserve effective logical size and per-tier source rectangles for groups/animation frames. Separate final density from current tier in cache keys/audits.
- [x] Integrate S03 dependency invalidation; prevent coarse baked pages from surviving indefinitely. Coordinate display/DPR, map/load/editor/custom assets, missing files and context recovery through controlled generation swaps.
- [x] Wire build/stale checks and conditional fallbacks. Update resize policy/tests to recognize user-authorized progressive sampling honestly. Keep final-quality acceptance distinct from scrolling coarse-tier latency.

S06 software integration is covered by focused generation, tier-promotion, layout-lifecycle and offline-policy tests. Q30/Q31 and the 75 FPS cold-scroll/final-convergence acceptance remain pending capture on qualifying hardware; no result is inferred from headless tests.

**Exclusive paths:** all S00-reserved integration files, plus producer adapters only after component owners have landed. This phase is serialized; do not edit active lane files.

**Done:** cold fast scroll shows available coarse sprites, stationary view converges to full selected detail without blocking input, no flash/missing groups or simulation changes, tests prove stale jobs cannot replace current art. Full unit/integration/E2E/build/lint checks and Q30/Q31 hardware gates recorded separately.

### S07 — persistent bounded sprite preparation workers

- [x] Implement worker-side fetch/blob decode (`createImageBitmap`) and OffscreenCanvas preparation for custom/dynamic sheets, using metadata-aware edge-connected keying and group cutouts rather than the explosion-only simple key algorithm. Transfer ownership of bitmap results; avoid cloning RGBA buffers or simulation state.
- [x] Reuse a small bounded pool with cancellation, backpressure, capability handshake, crash/timeout recovery and stale-result cleanup. Do not spawn a worker per tile. Account for image/linear buffers and multiple in-flight jobs before allocating.
- [x] Provide prebuilt bundled derivatives or explicit custom-asset preparation state when worker capabilities/CSP fail. No silent full-sheet synchronous conversion during gameplay. Main-thread handle publication remains bounded; worker rendering does not remove GPU upload cost.

**Exclusive component paths:** new `src/rendering/spritePreparationPool.js`, `src/rendering/spritePreparation.worker.js`, worker protocol tests/fixtures. Existing explosion modules and shared pixel-helper edits require ownership transfer after S01/S00, or integration-owner wiring.

**Done:** supported path has no main-thread full-sheet pixel loops/readbacks; unsupported/error paths are behavior-tested and explicit. Transfers, worker lifetime and generation teardown stay within budgets.

### S08 — preparation-only layout and catalog rebuilding

- [ ] Make `getDecorationLayout()` lookups consume prepared immutable layout state; move cache-miss construction to startup/edit/config lifecycle. Preserve existing prewarming in `publishPreparedRuntimeMap()` and test all invalidation producers.
- [x] Compute deterministic placement from stable metadata independent of visual tier; publish once. Keep `prepareCityBuildings()`/collision effects authoritative on main simulation side, outside rendering and visual worker results.
- [x] Cache immutable tag/group selectors and signatures per revision; avoid per-tile filtering allocations proportional to the expanded sheet catalog where traces show a cost. Do not change candidate order/hash selection.

**Exclusive component paths:** `src/rendering/decorationLayout.js`, new preparation adapter and layout fixture tests. Integration owner applies `TextureManager`, `src/rendering.js` and city-state wiring after S08 lands.

**Done:** first render after edit/load/config cannot synchronously construct a map-wide layout; existing seeded decoration/city/collision tests preserve results.

### S09 — versioned tiers, load overlap and offline policy

- [x] Inspect NetworkFirst sheet routes and offline downloader activity alongside streaming traces. Use immutable content/version identity for derivative manifests/images; avoid mixed metadata/art revisions. Retain correct updates/offline fallback for original mutable editor assets.
- [ ] Use bounded overlapping sheet loads instead of serial network latency where useful, constrained by S04/S05 budgets. Avoid loading source plus derivative or every DPR/tier unnecessarily.
- [x] Define offline tier policy explicitly (minimum usable representation and selected final tier, storage quotas, upgrades/cleanup); yield offline fills to visible requests. Prepared imagery is currently excluded from bulk download, so verify offline rendering rather than assuming new derivative routes are covered.

**Exclusive component paths:** `src/pwa/offlineAssetPlan.js`, `src/pwa/sw.js`, offline downloader/manifest plugin and focused PWA tests. Build/Vite/TextureManager wiring belongs to integration owner. Register exact downloader paths at S00 before dispatch.

**Done:** warm online/offline/redeploy cases use consistent art, offline requests do not starve visible streaming, storage remains bounded and no automatic all-tier download amplification.

### S10 — conditional WASM / worker-rendering experiments

- [ ] Only after causal traces, compare worker JS/native decoding against WASM/SIMD for residual flood-fill/alpha/packing kernels. Include module cold start, transfer/copy time, linear-memory peak and fallback support; promote only a demonstrated net win with pixel parity.
- [ ] If composition/submit remains dominant after S03/S06, prototype retained OffscreenCanvas rendering with immutable presentation snapshots. Account for worker/main synchronization, multiple GPU contexts, alpha/order, continuous rotation, resizing, context recovery and procedural water; exclude simulation from visual workers.
- [ ] Record explicit go/no-go evidence. WASM on the main thread is not asynchronous. Audit isolation headers/third-party embedding before any SharedArrayBuffer/threading dependency; basic transferable workers must work without it.

**Exclusive paths:** new isolated experiment files/tests only. No production backend/shared dependency changes until serialized integration assigns ownership.

**Done:** accepted experiment has measured end-to-end benefit and no unbounded duplicate memory; rejected experiments remain documented without imposing new dependencies.

### Safe parallel execution

1. S00 freezes interfaces and exact test/path ownership. A single integration owner controls shared files and docs. This request prepares delegation tasks; it does not dispatch implementation agents.
2. Run S01 asset build, S02 rotations, S03 terrain pages, S04 resources, S05 scheduling, S07 workers, S08 layouts and S09 PWA as independent component lanes against frozen fixtures. Each gets a separate branch/worktree and uniquely named tests. Pure pixel helper extraction must land before both build/worker consumers; do not let them edit the same helpers concurrently.
3. Land components sequentially, then S06 integrates all adapters and owns cross-component failure handling. Reassign released paths explicitly. Schedule S10 only if combined measurements warrant it.
4. Serialize all physical browser/performance captures; read-only analysis of their artifacts may run in parallel. Run existing Q30/Q31 plus this spec's coarse-to-full, cancellation and memory cases. Leave hardware acceptance unchecked until qualifying evidence exists.

For each task report source evidence, changed paths, unit/integration/E2E/lint/build results as applicable, byte residency/peak estimates versus measurements, exact remaining blockers and model identity when available. Existing repository branch, test and deployment rules still apply.
