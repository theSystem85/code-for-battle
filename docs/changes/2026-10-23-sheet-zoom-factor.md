- [x] **Feature: Per-sheet map sprite zoom**
  Added `zoomFactor` (default 1) for decoration/detail sprite sheets; footprints use ceil(source span × factor) while artwork scales continuously and stays centered inside the rounded footprint. All three city sheets use factor 2. Source atlas pixels and extraction metadata remain unchanged.
  Spec: [Sprite sheet map zoom](../../specs/sprite-sheet-map-zoom.md)

- [x] **Improvement: City layouts accommodate enlarged buildings**
  Expand city layouts with the largest selected city scale, preserve original-size building tiers, space branches for larger lots and allow enlarged roadside props to extend away from their road-facing anchor.
  Spec: [Sprite sheet map zoom](../../specs/sprite-sheet-map-zoom.md)

Zoom changes participate in topology fingerprints, prepared cache signatures, SSE import/export and saved metadata. City layout version 4 prevents prior editor overrides from silently restoring scale 1. The atlas builder retains default city factor 2 on regeneration; other sheets default to 1.

Performance audit: zoom geometry is prepared once per selected-sheet configuration, bounded to 65,536 extra virtual cells and 64 MiB of fallback raster memory. Contiguous alpha city sprites sample the original atlas directly with no new raster or image variants. Each visible tile retains one image draw; the per-tile render path reads precomputed destination bounds, with no added per-frame arrays, masks or resizing variants. For a 1280×720 CSS viewport and 32 px map tiles, 40×23 = 920 nominal tile draws (984 with the existing one-tile guard) cover one uncached base-layer rebuild. At DPR 2 this covers 2560×1440 = 3,686,400 physical pixels; even an uncached 75 Hz path would retain at most the existing roughly 73,800 tile draws/second. This is a static work estimate, not a benchmark. Cached chunks reduce steady-state work, and unit count does not multiply this zoom preparation or tile work. Hardware 75 FPS acceptance remains pending on qualifying hardware; no GPU/performance benchmark was run.

Validation passed:

- `npm run test:unit`: 327 files, 5,398 tests.
- `npm run test`: 329 files, 5,484 unit/integration tests.
- Focused Chromium: all 14 tests passed across `mapSourceSheets.test.js`, `destructibleCityBuildings.test.js`, `integratedStartupSheets.test.js`, `legacySheetStorage.test.js` and `sseExtend.test.js`. This includes real canvas pixel bounds/seams for 2, 1.25 and 0.4 factors, city 2× footprints, SSE round-trip zoom, startup and city destruction. One existing E00114 new-sheet UI test timed out when its accordion closed during the concurrent run; its isolated rerun passed in 4.7 seconds. All other Playwright files, including multiplayer and GPU benchmark suites, were skipped.
- Final focused source/zoom/topology/registry checks: 29 tests passed. All-default-catalog placement coverage remains intact using source tile provenance for virtual cells.
- `npm run lint:fix:changed`, `npm run lint` and `npm run build` passed. No binary atlas files changed.

Workflow: direct commit and push to dev, as requested.
