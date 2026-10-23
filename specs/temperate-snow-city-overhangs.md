# Temperate and snow tall city replacements

Extend the [desert city footprint and rendering contract](desert-city-overhangs.md) to the remaining biomes. Create one transparent source for temperate architecture used by both grass and soil, and one snow-covered source. Each source contains 20 substantial buildings with eight towers, matching the desert camera, realistic detailed style and vehicle-factory scale. Buildings have minimum 2×2 physical bases; skyscrapers minimum 3×3.

## Sources and packing

- `sources/cities_temperate_tall.webp` replaces the source for `dtv3_city`; biome tags are `grass`, `soil`.
- `sources/cities_snow_tall.webp` replaces the source for `dtv4_city_snow`; biome tag is `snow`, with `winter` on all group and tile records.
- Keep old sources as history. New source and target assets are WebP quality 85, alpha quality 100.
- Reuse SSE alpha extraction at cutoff 16, gap 0, minimum area 1000. Reject counts other than 20 rather than publishing merged/missing buildings. Both sources also produce 20 at cutoffs 64 and 128; use 16 to preserve edge details.
- Keep isolated source pixels at ratio 1; reserve complete 64px cells with at least two pixels of inset, and grow the target canvas. Temperate atlas is 1024×1664 (16×26); snow atlas is 1024×1728 (16×27).
- Every full image group has complete biome/category/group tags. Only its bottom rectangular base is `impassable`; upper cells are `passable`, `overhang`, never `impassable`. Keep at least one upper image row. Actual temperate bases range from 4×2 to 5×3; snow bases from 3×2 to 4×3. Eight skyscrapers per sheet receive `skyscraper` and at least 3×3 ground bases.
- City layout version 5 invalidates old saved version-3 grids. Sand stays version 5, nature version 3. Source and target paths remain independent, preserving default registration and user opt-outs.

## Runtime behavior

Reuse existing city-overhang preparation, placement, HUD, selection, attack lookup and destruction. Do not add another drawing layer or restore the reverted zoom feature. Reserve physical ground rectangles in one biome and favor towers near city centers. Full images project north over otherwise walkable terrain and draw after ground unit bodies, before HUDs. Existing aircraft ordering stays above them. Underlying terrain or objects may independently block projected cells. Hidden healthy units retain a visible health bar and actual click/drag selection. Destruction removes imagery and occlusion and frees ground occupancy.

## Preparation and frame work

No new steady-state code path is added. Existing indexed HUD checks run once per visible unit overlay; existing overhead draws run once per visible living city building. At 500 units/100 buildings and 75 Hz this is 37,500 lookups and up to 7,500 draws per second; raster work scales with image bounds and DPR squared. All three city catalogs total 39,702,528 cached bytes at DPR 3 (13,639,680 temperate + 12,644,352 sand + 13,418,496 snow), below the 64 MiB budget. Prepare at explicit configuration/DPR lifecycle boundaries, with no per-frame raster creation or resizing. The additional sets use the existing caches and indexed lookup rather than introducing per-unit building scans.

75 FPS acceptance remains pending on Patrick's qualifying hardware GPU. No GPU/performance benchmark is run in the headless environment.

## Acceptance checks

- SSE replay: 20 components each, original dimensions and exact alpha silhouettes after target WebP encoding; upper/base passability, biome and winter tags; footprint minima; atlas bounds and provenance hashes.
- Every default bundled sprite still has a generated-map placement path, with existing biome/forest/city exclusions.
- Chromium tests cover sand, grass, soil and snow: actual SSE source extraction at ratio 1; export preserves upper tags and version; ground occupancy and a route across opaque upper-floor pixels; visible full-health HUDs; real click/drag selection; destruction reveals the unit.
- Default multi-biome map selection and destructible cities remain covered. Combined prepared cache size stays within its budget.
- Run full unit and integration suites, lint, production build and focused Chromium checks. Exact results and skipped browser scope are recorded in the change note.
