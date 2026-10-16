# PR #688: shore, biome detail and cliff stripes

## Findings from local history

Baseline: `1a9c1b23^` (`7bd010a5`), immediately before `feat: add biome-aware decorative map tile sheets`. Compared using:

```
git diff 1a9c1b23^ -- src/rendering/mapRenderer.js src/rendering/textureManager.js
git diff 1a9c1b23^ -- src/rendering/organicTerrain.js
git show 1a9c1b23^:src/rendering/textureManager.js
```

The organic terrain implementation, including `drawCliffs`, `drawRock`, source rectangles, and overlapping cliff drawing, is unchanged. `mapRenderer.js` now allows organic terrain with custom sheets enabled. Its ready-organic rock path still draws organic ground followed by the original cliffs/rocks. Optional sheets do not replace the organic cliff image. Decorations and details already require `tile.type === 'land'`; rock, cliff and mountain cells are excluded across complete footprints and again during edited-map validation. Decoration occupancy does not change tile types or cliff source selection.

The baseline texture manager supported grouped rock terrain selection; that selection was removed in the decorative-sheet branch. This is a difference in the fallback custom-sheet path, not the ready-organic cliff path. More directly, ungrouped decorative shore rocks were indexed under `rocks`, allowing their independently selected fragments to be used as terrain in that fallback path. Preparation now excludes decorative/detail art from terrain `rock`/`rocks` buckets. Genuine ungrouped terrain rocks retain their selection behavior. No generic grouped terrain-selection algorithm was reintroduced: optional prop groups belong exclusively to the land decoration layout.

The reported visual stripes cannot be conclusively attributed without a live reproduction. The code audit found and guarded the decorative-rock contamination path; it found no change to the procedural/organic cliff geometry. Visual comparison on the reporting hardware remains outstanding.

## Placement fixes

Ungrouped decorative tiles now enter prepared prop pools, including dtv3 reeds and cattails. Universal shore props supplement every biome and bypass the opaque-ground coverage rejection. A deterministic shore pass runs before detail and inland props, with one seeded anchor attempt per four tiles, independent of inland density noise, cluster restrictions and six-tile identity variety. Footprints cannot overlap or cover water, roads, buildings, resources, protected starts or narrow keep-clear passages. At least one footprint cell must neighbor water in the eight-neighborhood; not every cell must touch water. Only explicit `shore` tags qualify; dtv2 water-tagged ponds/lakes remain inland props.

Ground detail requires an explicit matching grass/soil/sand/snow tag. `universal` cannot substitute for that tag. Details remain passable and independent of prop occupancy. City health already uses actual group area and `CITY_BUILDING_HEALTH` (1 tile: 1500, 2 tiles: 2500, 4 tiles: 4000); regression tests cover houses, shops and petrol stations.

## Validation and performance

Changes run at catalog/layout preparation, once per invalidated configuration/map layout, not per entity, simulation tick or animation frame. No render-loop change, source resizing, draw-call increase per existing cell, or DPR-scaled allocation was introduced. Shore layout uses bounded footprint checks and the existing occupied-cell grid. The synthetic 64x64 lake check with salt 688 yields 35 shore props, including 20 multi-tile footprints.

Commands: `npm run lint:fix:changed`, `npm run lint`, `npm run test:unit`, and `npm run test:e2e -- tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`.

The parity E2E could not start: this sandbox rejects listening on 127.0.0.1:5173 with `EPERM`. No qualifying reference display/GPU is available; 75 presented FPS, frame-time percentiles, GPU timing and scrolling/active-worst-case validation remain outstanding. No performance certification is claimed and visual settings were not reduced.

Completed checks: `npm run lint:fix:changed` and `npm run lint` both exited 0; `npm run test:unit` passed 281 files / 5,064 tests in 54.35 seconds. This includes explicit empty-selection unit parity, synthetic-lake adjacency/density, ground-detail biome exclusion, rock/cliff/mountain footprint exclusion, terrain-rock bucket isolation, and city-footprint HP regressions. Dependencies were restored with `npm ci --offline --ignore-scripts`; no network was used.

## Root cause (2026-10-17)

The ready-organic default path in `mapRenderer.drawBaseLayer` calls `OrganicTerrain.drawCliffs`, which reads `images/terrain/terraced-cliffs.webp`. It does not randomly select cells from `rockCliffsMountains_64x64_1024x1024.webp` in that path. Optional DT selection cannot explain the default-mode symptom. Organic contour masks already use neighboring plateau depth, and `macroRunLength` partitions straight contours into globally aligned runs of up to four cells. Therefore a vertical connected contour necessarily joins separate pre-baked vertical macros every four cells.

The compiler `scripts/build-terraced-cliffs.mjs:makeMacro` previously guaranteed only the silhouette endpoints: its wave and rim perturbations used a vanishing sine envelope. Wall depth did not: it used `directionalDepth + sin(u*13+variant)*9 + sin(u*29+variant*3)*6`. Strata lighting also used an unenveloped `u*8` phase. Each strip resets u from 1 to 0, abruptly changing face depth and the bright/dark rock bands inside a continuous column. This is an actual atlas-generation discontinuity, not source-rect rounding or a missing terrain neighbor. Visual inspection of the old vertical macro pool confirmed abrupt lateral depth changes and bright bands. The material sampler already blends to a common end material, so replacing randomized variants alone cannot repair the discontinuous depth/lighting equations.

Fix: share a tested offline `cliffMacroProfile` and make depth variation and strata-phase variation vanish at both endpoints, alongside the existing silhouette/roughness envelope. Rebuild the existing 4096×5376 WebP at quality 85 with lossless alpha. Preserve all atlas coordinates, dimensions, contour masks, resolution, variants, shadows and runtime draw counts. No source art replacement is required for this join fix. Separate short-contour/corner transitions and intrinsic rock strata are retained; a live reproduction on reporting hardware is still required before claiming every reported visual artifact is resolved.

Evidence: compare premultiplied RGB at the first and last logical rows of each four-cell vertical strip (masks 6/9, eight variants, all 224 cross-strip pixels, 10,752 channel samples). Invisible gutter RGB is excluded through premultiplication. Before: mean absolute jump **8.36244**, maximum **138**. After: mean **1.82152**, maximum **43**, a 78.2% reduction in the mean. Pixel-center sampling and lossy WebP compression explain the small remaining difference; exact profile endpoints match to numerical precision. The regression checks both endpoint depth/phase and the shipped image (mean <3, max <60), and fails against the original atlas.

Reproduction:
```sh
node scripts/build-terraced-cliffs.mjs
node scripts/measure-cliff-joins.mjs public/images/terrain/terraced-cliffs.webp
npx vitest run tests/unit/cliffTerrain.test.js tests/unit/decorationPlacementRules.test.js
```

The compiler now runs through async main rather than top-level await. The terrain-details compiler likewise has async main and emits reviewed shore metadata through `shoreTags.mjs`. No dtv2 sprites carry shore tags; its water-related ponds/oasis/frozen lakes remain inland whole-footprint decorations under their existing water/impassable contract.

Performance: the cliff fix changes offline pixel generation only; runtime selection, uploads, byte dimensions and draw calls are unchanged. The compressed atlas decreases from 1,235,416 to 1,217,550 bytes. Shore rotation cost and the remaining qualifying-hardware acceptance are documented in [spec 135](135-shore-classes.md). No qualifying GPU/display is exposed here, so FPS, frame p95/p99/max, missed deadlines, GPU timing and memory/GC measurements are unavailable. The 75 FPS acceptance remains outstanding; no visual settings were reduced.

Browser validation attempted with `npm run test:e2e -- tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`. The server cannot listen on 127.0.0.1:5173 (`EPERM`), confirmed independently with `npm run dev -- --host 127.0.0.1`. The parity test is unchanged. Dependencies were restored via `npm ci --offline --ignore-scripts`; no network was used.

Final checks (2026-10-17): `npm run lint:fix:changed` and `npm run lint` both exited 0. `npm run test:unit` passed **282 files / 5,080 tests** in **46.35 seconds**. Both modified compiler entry points passed `node --check`; `git diff --check` passed.
