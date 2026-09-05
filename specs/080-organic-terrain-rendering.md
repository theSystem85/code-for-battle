# 080 — Organic terrain rendering and asset pipeline

## Goal
Make grass, streets, and blocked rock formations read as a continuous RTS landscape while leaving map data, occupancy, collision, and pathfinding unchanged.

## Requirements
- Grass remains the visual underlay for streets and rock.
- Street art uses a four-neighbour topology mask (top=1, right=2, bottom=4, left=8), including isolated, endcap, straight, corner, junction, and full-connectivity shapes.
- Every topology has deterministic coordinate-hashed variants with irregular dirt edges, gravel, weeds, and cracks.
- Rocks use the same topology principle and transparent irregular silhouettes so connected blocked cells form ridges rather than squares.
- Grass macro overlays are sparse, deterministic, and subtle.
- Assets are generated into one alpha WebP atlas by `node scripts/generateOrganicTerrainAtlas.mjs`; its JSON metadata is the renderer configuration.
- Rendering remains one sampled quad per ordinary terrain layer. Macro overlays occur on fewer than 2% of logical cells; street and rock already require their grass underlay.
- Canvas rendering reuses the static chunk cache. WebGL/WebGPU use the existing secondary-atlas instanced batch; there is no runtime compositing, linear entity lookup, shader, gradient, shadow, or map-sized alpha fill.

## Performance gate
The changed path runs once per visible terrain cell per rendered frame (typically about 1,500 cells at a desktop viewport, independent of device-pixel ratio because culling is in logical tiles). Topology variant pools are built once and cached; steady-state selection performs four constant-time grid reads plus a coordinate hash. The sparse macro gate adds an overlay to approximately 1/80 cells.

Run the opt-in representative benchmark with roads, rocks, movement, and the full-map scroll sweep:

```bash
PERF_BENCHMARK=1 npx playwright test tests/e2e/mobileFpsRegressionBenchmark.test.js --project=chromium --reporter=line
```

Record baseline/result FPS, CPU update/render time, heap/GC symptoms, and draw submissions below when executed.

## Acceptance criteria
- Road and rock topology selections are deterministic and neighbor-correct.
- Generated overlay pixels have transparent backgrounds and no square frame.
- Existing maps and gameplay terrain types are unchanged.
- Unit tests, lint, and production build pass.

## Verification record (2026-09-04)
- Static draw cost: ordinary grass remains one quad; rock/street remain an underlay plus one overlay; macro variation is gated to fewer than 2% of cells. Atlas decode size is 1024x384 (0.39M pixels), down from the prior default street atlas's 1024x1024 (1.05M pixels).
- The Playwright benchmark and visual screenshot were attempted, but the installed Playwright browser was absent and the browser CDN returned HTTP 403 when installation was attempted. FPS, CPU update/render time, and heap/GC measurements therefore cannot be truthfully recorded in this environment.
- The deterministic selection unit test and production build validate the fallback and GPU integration paths without changing simulation state.
