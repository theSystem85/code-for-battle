# Terrain cache recovery

Previously loaded terrain must not be treated as a cache hit after its backing canvas loses its context. Context loss invalidates raster readiness; restoration invalidates it again and reacquires the 2D context. Until restoration, render the same base terrain directly with the existing water-layer options. Do not mark a lost context ready during background warming. Released pages must also become unrendered.

Before preparing any visible page, protect every page in the current viewport from eviction, including pages later in draw order. Keep byte budgets and normal offscreen LRU eviction.

## Hot-path audit

`renderTiles` runs once per rendered frame, independent of entity count. The added viewport pin pass performs one key/Set insertion per visible chunk, replacing insertions in the draw pass and reusing the existing Set. Context availability adds one optional native query per visible chunk and per cache update; event closures are allocated only when creating a page. No added raster overdraw on healthy frames and no change to DPR, source imagery, resolution, water animation, or visual detail. Direct fallback uses the existing tile path only while a cached context is unavailable.

## Validation

`npm run test:unit` and `npm run test` cover mocked canvas recovery and cache pressure. Focused command: `npx vitest run tests/unit/mapRendererTerrainCache.test.js` (U07003–U07005).

Validation results: `npm run lint:fix:changed`, `npm run lint`, and `npm run build` passed. The full unit run reported 353 passing files and the combined unit/integration run 355 passing files. Both runs reported six failures across two files: two terrain assertions used a transform snapshot from before the final source edits made during the long-running suites, and four existing release tests hit sandbox `spawnSync git EPERM`. After the source was committed, `npx vitest run tests/unit/mapRendererTerrainCache.test.js tests/unit/releaseScript.test.js` with subprocess permissions passed all 16 tests in both files (including all six failed cases). No assertions were weakened.

Hardware GPU acceptance is pending; no hardware GPU is exposed in this environment. GPU rendering E2E and performance benchmarks are deferred under AGENTS.md rule 14. On an iPhone and qualifying desktop GPU, scroll quickly through land, streets, and shores in both directions, revisit terrain after eviction, and verify no black gaps. Also check cold traversal, repeated full-map scrolling, selected layered units, firing effects, movement, and procedural water with realistic entity counts at unchanged settings. Record FPS, frame-time p95/p99/max, missed 13.333 ms deadlines, CPU/GPU timing, DPR/backend, and memory/GC as required by `performance_improvement.md`; require at least 75 FPS on qualifying reference hardware.
