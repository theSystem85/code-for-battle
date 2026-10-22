- [x] **Improvement: Original-resolution vegetation, rocks and lakes**
  Repacked all 273 sand/snow nature sprites at scale 1 with larger rectangular footprints and sheets, preserving source dimensions and exact extracted alpha silhouettes at WebP q85.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

- [x] **Feature: Dense natural forests with isolated trees**
  Added deterministic biome-specific forest fields with branching elliptical lobes, irregular edges, varying density, clearings and sparse isolated trees. A dedicated tree pass respects full footprints, matching biomes, roads, water, bases, resources and narrow passages; orchards retain farm placement. Larger boulders/lakes get placement priority over small stones so native-size props are not starved.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

- [x] **Improvement: Asset workflow and future decoration plan**
  Updated the map-assets skill with forest placement rules and documented proposed decoration sheets in the asset plan. All five rebuilt atlases invalidate stale SSE grid overrides.
  Spec: [Native source map assets and forests](../../specs/native-source-map-assets-forests.md)

Native atlas dimensions: temperate city 1024×1536, sand city 1024×1600, snow city 1024×1664; sand nature 1024×2112, snow nature 1024×2240. All 737 imported sprites preserve extraction dimensions and alpha. Representative 96×96 tree-only fixtures (12 tree variants, seeds 1/2/3/688) changed from 116/28/49/27 trees to 653/674/618/503, including 13/18/21/11 isolated trees at least four tiles from another footprint. With the full bundled catalog on a 96×96 land fixture plus a road (seed 688), tree counts increased from 10/5/9/2 to 362/308/190/237 across grass/soil/sand/snow, even with the larger nature footprints. The three real city catalogs also retain the central size gradient over seeds 1/2/3/688: single-tile houses average roughly 7.3 tiles from centers, two-tile spans roughly 5.0–5.2, and larger spans roughly 3.1–4.3. These are deterministic layout checks, not frame-rate benchmarks.

Validation passed: `npm run test:unit` (326 files, 5,391 tests); `npm run test` (328 files, 5,477 unit/integration tests); focused Chromium (13 tests); `npm run lint:fix:changed`; `npm run lint`; `npm run build`. The unchanged all-default-sprite generated-map coverage assertion passes after prioritizing full-size props. Production build and lint pass. Exact focused Chromium files: `sseExtend.test.js`, `mapSourceSheets.test.js`, `destructibleCityBuildings.test.js`, `integratedStartupSheets.test.js`, `legacySheetStorage.test.js`. All other Playwright files, including multiplayer and hardware benchmark suites, were skipped. Hardware 75 FPS acceptance remains pending on qualifying hardware; no software-GPU performance test was run.
