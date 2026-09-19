# 069 — Rendering preparation contracts

Status: implemented foundation (C00), 2026-09-16.

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

## Verification

`tests/unit/renderingPreparationContracts.test.js` covers unioned old/new halo invalidation, transaction publication, prepared generation readiness/disposal, stale cancellation, sprite budgets, stable viewport updates, append-only profiler lookup and idempotent byte release.
