# Extracted biome map sprite sheets

Build all five committed source WebP images with `npm run make:map-sprite-sheets` (Node and Sharp). The script imports the real SSE `detectSprites`, `findPackingRegion`, `fitSprite` and `exportMetadata` functions. No generated image model or rectangular screenshot crops substitute for extraction.

| Source | Output atlas | Biomes | Extracted sprites |
|---|---|---|---|
| cities.webp | dtv3_city.webp | grass, soil | 153 |
| cities_sand.webp | dtv4_city_sand.webp | sand | 157 |
| cities_snow.webp | dtv4_city_snow.webp | snow | 154 |
| vegetation_rocks_lakes_sand.webp | dtv4_nature_sand.webp | sand | 155 |
| vegetation_rocks_lakes_snow.webp | dtv4_nature_snow.webp | snow | 118 |

## Extraction and source limits

These sources have low-alpha noise. At alpha > 0, the detector merges more than 900,000 pixels into one component for each source; that default is not reliable for these particular inputs. The recorded profile uses eight-connected alpha > 128, no gap bridging and minimum area 256. It retains original RGBA within each accepted component and discards near-transparent bridges/background noise. Black sprite details remain foreground.

Two physically touching pairs in cities_snow require source guides: x=328 in [270,0,120,70], and y=913 in [495,850,135,160]. Only the intersecting component is partitioned; each resulting portion is passed back through SSE detection. These are deliberate source-specific guides, not a claim that alpha alone separates physically touching objects. The other sources need no guides. The script records source hashes, profiles, bounds and per-component area in JSON so the 737 results can be replayed and audited.

## Packaging and default use

Sprites use 64px grid cells, rounded source-size footprints (minimum 1x1), contained aspect ratio and 2px margins. Every footprint cell has matching category, biome, passability and group tags. JSON includes propLayout, SSE extension imports, pixel rectangles, atlas dimensions and compression metadata. Outputs use lossy WebP quality 85 with full-quality alpha. Blank space remains transparent. Native-alpha blend mode prevents the renderer from black-keying or applying ground cutouts to the extracted art.

City sources distinguish destructible city buildings from passable roadside parks/parking/props. Nature sources distinguish impassable trees, rocks, stones and lakes from passable shrubs; snow lakes carry frozen_lake. No universal tag lets temperate/desert artwork leak onto snow. Existing default nature sheets remain available alongside the additions.

The grass/soil atlas replaces dtv3_city in place. Its layoutVersion=2 invalidates old persisted editor/applied metadata while preserving new-layout edits. Four new dtv4 image/JSON pairs are automatically discovered and enabled through the registry's existing opt-out behavior; index.json mirrors the complete default selection.

## City layout

During map preparation, sort each city's street lots from its center outward. Prefer groups with maximum span >=3 in the inner 45% of city radius, two-tile spans through 80%, and single-tile buildings outside that. Smaller groups fill unavailable central lots. A catalog containing only larger footprints remains usable. Reserve every footprint cell and retain street-facing access, resource/base clearances, street connectivity and deterministic seeded generation.

Ruin props use a dedicated pass at their seeded anchors so the expanded shrub/lake catalog cannot starve an existing ruin of valid placements. Small stones also carry rocks, respecting the same cluster constraints as existing boulders instead of outcompeting them at unconstrained sites. The default-catalog coverage test still requires every old and new sprite to appear on generated maps.

All extraction, packing, decoding and placement changes run in build tools or initialization, outside gameplay update/render loops. Native-alpha assets use the existing prepared texture path. No new per-frame scaling, masks, searches or GPU effects are introduced. The 75 FPS hardware acceptance test remains pending on Patrick's qualifying hardware; no software-only GPU/performance benchmark was run.

## Verification

Unit coverage replays every source, rejects giant merged components, checks unique pixel ownership, verifies source hashes, output dimensions/alpha/lossy encoding, complete nonoverlapping footprints, biome pools, persisted metadata compatibility, deterministic city placement and the large-center/small-edge distribution. Browser coverage loads real atlases on grass, soil, sand and snow, confirms native-alpha pixels and default registration, and checks startup, legacy opt-outs, destructible city buildings and SSE extraction/edit/export/tag layout.

Manual: open each atlas in SSE, create maps for all four biomes, inspect streets and building scale, destroy a multi-tile city building, and check larger structures near centers and smaller houses toward city ends. Hardware scrolling acceptance remains pending.
