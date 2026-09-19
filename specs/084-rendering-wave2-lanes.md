# 084 — Rendering Wave 2 ownership lanes

Status: in progress (2026-09-19). Prerequisite: [069](069-rendering-preparation-contracts.md), P00 profiler, P01 diagnostics.

## Purpose

Implement the seven disjoint Wave 2 lanes from `rendering_improvement_todos.md` without redefining C00 contracts. Integration into live start/load/settings flows is deferred to I20. Physical 75 FPS certification remains Q30.

## Lanes

| Lane | Exclusive application write set | Tests |
|---|---|---|
| T10+T11 | `src/rendering/mapRenderer.js`, `src/rendering.js` (revision adapter only), new terrain revision/warm-queue module under `src/rendering/prepared/` | `tests/unit/mapRendererWater.test.js` plus new cache-revision/warm-queue unit tests |
| B10+B11 | `src/rendering/organicTerrain.js`, `src/rendering/cliffTerrain.js`, `src/rendering/textureManager.js`, new preparation modules | matching organic/cliff/texture-manager unit tests |
| W10+W11 | `src/rendering/webglRenderer.js`, `src/rendering/webgpuRenderer.js`, `src/rendering/prepared/cpuWaterPass.js` | GPU unit tests plus uniquely named water-retention E2E |
| A10+A11 | prepared sprite modules and `public/images/prepared/`; listed unit/naval/aircraft image renderers; `jetRenderScale.js` only if required | matching image-renderer tests |
| E10+E11 | `renderer.js`, `unitRenderer.js`, `buildingRenderer.js`, effects/wreck/path/guard/danger/mine/HUD files listed in the checklist | focused entity/effects tests |
| V10+V11 | `canvasManager.js`, `renderingUtils.js`, `minimapRenderer.js`, viewport helpers | viewport/minimap unit tests |
| M10 | C00 producer inventory outside rendering/performance lanes | mutation notification tests; serialization remains device-independent |

## Shared contracts (do not redefine)

- `RenderRevisionStore` and `RENDER_REVISION_DOMAINS`
- `PreparedMap` / `PreparationGeneration`
- `PreparedSpriteRegistry`
- `FrameViewport`
- `RenderByteBudget` / `RENDER_BYTE_OWNERS`
- `PROFILER_SPAN_IDS` (append only; do not renumber)
- `RenderDiagnostics` counters

## Acceptance for this wave

Each lane lands focused unit tests and lint-clean changed files. Unchanged map frames must not hash full-grid signatures. Prepared art must not bake animated water. Visual quality, procedural water cadence, and unauthorized gameplay resize policy are unchanged. Combined pipeline wiring and 75 FPS evidence are I20/Q30, not claimed here.
