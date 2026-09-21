# 069 — Rendering preparation contracts

Status: implemented foundation (C00) and profiler tooling (P00), 2026-09-19.

## Purpose and acceptance boundary

This specification freezes the shared contracts required by the staged rendering improvement plan. It intentionally does not connect them to the live renderer. No frame-path behavior or visual output changes in C00, so it cannot claim the 75 FPS performance gate. Physical certification remains required after integration.

The P00 function-timing preference is persisted as a boolean UI preference only. Timing samples remain in-memory and are discarded when the overlay is reset or the page unloads; disabled timing takes a fast path without statistics writes.

## Stable modules and ownership

| Contract | Module | Owner after integration |
|---|---|---|
| Per-domain, per-chunk revisions | `src/rendering/prepared/renderRevisionStore.js` | map lifecycle creates/disposes; mutation producers notify; terrain reads |
| Prepared map generation | `src/rendering/prepared/preparedMap.js` | preparation pipeline publishes; terrain/water retain; publisher disposes |
| Prepared sprite generation | `src/rendering/prepared/preparedSpriteRegistry.js` | sprite preparation publishes and disposes; renderers only look up |
| Byte reservations | `src/rendering/prepared/renderByteBudget.js` | the allocating lane reserves and releases its own token |
| Reusable viewport | `src/rendering/prepared/frameViewport.js` | canvas/layout lifecycle writes once; render paths read |
| Append-only profiler IDs | `src/performance/profilerIds.js` | performance owner; later lanes may append but must not renumber |
| Diagnostic schema | `src/performance/renderDiagnostics.js` | performance owner; renderer lanes write counters only |

Prepared caches, revisions, handles and diagnostics are device state and must never enter saved, replayed or network game state. Disposal is idempotent. A preparation job captures map, asset and layout generations and uses `AbortSignal`; cancellation or a generation mismatch must reject it before publication and dispose staging resources. A complete generation is published atomically—never one asset callback at a time.

## Mutation domains and footprints

- **Topology:** `type` and `airstripStreet`. Notify with both old and new footprints. Use a conservative 10-tile halo until full-rebuild oracle tests prove a narrower cliff/SOT dependency.
- **Surface:** `biome`, `shorelineBiome`, every `biomeBlend` visual member (including `featherPixels`), and static-building detail suppression. Use a conservative two-tile halo during initial integration.
- **Resources:** `ore`, `oreDensity`, `seedCrystal`, and `seedCrystalDensity`. These are visual even where the legacy signature omitted density.
- **Decals:** tag, variant, group dimensions and group origins. Every member that controls source/destination selection is a dependency.
- **Assets/layout:** global generations, independent of map revisions. Density changes prepare a complete replacement before swap.
- **Water:** topology changes follow the topology domain. Animation phase/time is dynamic and must not invalidate static map or water topology revisions.

`noBuild` and `decalCounter` are not direct render dependencies. Bulk replacement, generation, load and network restore create a map generation and coalesce local notifications in a transaction.

## M10 producer inventory

M10 owns notifications at actual writes in these files; it must not discover changes with per-frame scans:

- `src/mapEditor.js`: editor paint writes.
- `src/buildings.js`: building footprint, street, ore and teardown changes.
- `src/factories.js`: factory-created tiles, occupancy and ore/type writes.
- `src/game/harvesterLogic.js`: ore density and depletion.
- `src/game/gameStateManager.js`: ore spreading.
- `src/game/tileDecals.js`: decal creation and grouped footprints.
- `src/game/mapBiomes.js`: biome and blend bulk assignment.
- `src/gameSetup.js`: terrain/resource generation and full-grid replacement.
- `src/saveGame.js`: normalize, restore and grid replacement.
- `src/network/stateSync.js`: fallback network grid replacement.
- `src/game/gameOrchestrator.js`: new/regenerated/client map lifecycle transactions.

Replay routes through the same command producers and has no separate direct map mutation. `src/rendering.js` remains the T10 adapter, not an M10 producer.

The audit also identifies legacy-invalidated fields missing from the current signature: `oreDensity`, `seedCrystalDensity`, `biomeBlend.featherPixels`, and decal grouping/origin fields. M10/T10 parity tests must cover them.

## Resource accounting

Budgets are explicit per owner: terrain resident, terrain staging, decoded sources, sprites, transfers, GPU staging, minimap and effects. A reservation is rejected before allocation if its owner limit would be exceeded and returns an idempotent release token. Reports keep decoded source, prepared raster, transfer and GPU staging bytes separate; unsupported heap/GPU measurements are represented as unavailable rather than zero.

No hard-coded universal device budget is approved yet. Each lane must justify its configured limits against the reference environment and record peak resident plus staging overlap.

## Reference certification matrix

Still required from a qualifying physical run:

- Actual CPU, GPU, OS, browser/version, power/thermal mode, memory and viewport.
- A display/browser path verified at 75 Hz or higher, with real backend and effective DPR recorded.
- Cold traversal, repeated full-map laps, reversals/jumps, selected layered units, firing/effects, movement and procedural water.
- FPS, frame-time p95/p99/max, missed 13.333 ms deadlines, CPU update/render, GPU time where supported, uploads/draws/resizes, memory and GC evidence.

Headless/software-only evidence may diagnose behavior but cannot certify 75 presented FPS.

## P00 profiler implementation

`src/performance/renderProfiler.js` owns the opt-in bounded profiler. Its fixed span definitions come from the append-only C00 registry; legacy `logPerformance` sites receive a bounded dynamic registration (maximum 128 names) without allocating call/frame buffers until timing is enabled. The profiler uses a reusable depth-64 stack, 300-frame rings and 512-call rings per observed span. It reports self and inclusive cost, calls, rolling milliseconds per frame/second, call and frame tails, aggregate-self sorting, and overlap with frames exceeding the 13.333 ms deadline.

The `Function timings` preference continues to use `codeForBattle.functionTimingsEnabled`. Only that boolean is stored. Samples and legacy statistics remain in memory and reset on explicit reset or page reload. Disabled wrappers preserve receiver, return and thrown-error identity while taking a no-clock/no-statistics-write path. `GameLoop.animate` is the fixed root frame span; later rendering lanes own their narrower fixed spans.

`RenderDiagnostics` accumulates stable draw, upload-byte, resize, decoded/prepared/staging-byte, eviction and backlog counters. Performance recordings subtract a start baseline, so the report retains all events during the recording instead of reading only a final-frame snapshot. Heap is sampled at most once per second into a 120-sample bound. Heap and GPU timing/memory use explicit unavailable records when browser/backend APIs do not supply evidence. Frame residual is named `unattributedWait`; it is never presented as GPU time.

The live table refreshes at 4 Hz only while visible and does no snapshot/sort/DOM work while hidden or timing-disabled. Local Node microbenchmarks on 2026-09-19 measured 0.000272–0.000278 ms added per frame for three spans across five 250,000-frame runs. A 50-span stress probe measured 0.004617–0.004660 ms/frame across three 100,000-frame runs. Both are below the 0.25 ms/frame design budget, but they do not replace production-browser route measurement or physical 75 Hz certification.

## Verification

`tests/unit/renderingPreparationContracts.test.js` covers unioned old/new halo invalidation, transaction publication, prepared generation readiness/disposal, stale cancellation, sprite budgets, stable viewport updates, append-only profiler lookup and idempotent byte release. `tests/unit/renderProfiler.test.js`, `functionTiming.test.js`, `performanceDialog.test.js` and `performanceMonitor.test.js` cover bounded nesting/windows, recursion, tails, sorting, persistence, disabled behavior, legacy semantics, visibility-gated refresh, capability labeling and recording-wide counters.
