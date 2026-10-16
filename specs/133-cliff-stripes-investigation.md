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
