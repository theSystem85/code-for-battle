# Spec 120: Biome-aware decorative map tiles (research → implementation)

## Status
Implemented hybrid biome DT sheets + runtime selection (organic DT retained).

## Research hypotheses (verified in code)
1. **SSE multi-sheet composition** already merges tagged tiles from all selected sheets (`TextureManager.setIntegratedSpriteSheetConfig` / `buildIntegratedTagBuckets`). New DT sheets participate by registration + tags alone.
2. **Decorative classification** still comes from legacy grass ratio hashing (`getLandClassificationTag`); integrated mode then swaps art via biome+decorative / grouped selection.
3. **Grouped footprints** use `group_N` rectangles (specs/065). Catalog indexes groups under every non-group tag, so callers must filter by biome/`universal`.
4. **Occupancy** honors `impassable` on the resolved integrated tile (`buildOccupancyMap` / `isLandTileImpassable`). Frozen lakes must carry `impassable` on the selected decorative group cells.
5. **Organic DT** (`grass_tiles/passable/decorative/*`) remains the fallback when integrated decorative candidates are empty or integrated mode is off (hybrid).

## Locked decisions
- Hybrid organic + new DT sheets
- WebP quality 85%
- Load all new DT sheets up front
- New DT camera: ~65° top-down, ~300 m, photorealistic
- Biome-independent tag name: `universal`
- Seasons as SSE tags: spring/summer/autumn/winter
- Multi-tile DT footprints stay inside one biome on mixed maps
- Winter/frozen lakes impassable
- Biome-tagged rock/stone groups on DT sheets
- Keep cliffs/boulders on existing neutral rock sheets
- Skill: `skills/map-assets/SKILL.md`

## Delivered sheets
| Sheet | Role |
|-------|------|
| `dt_grass_1024_q85` | Grass biome trees (4 seasons), lakes, rocks |
| `dt_soil_1024_q85` | Soil biome trees, lakes, rocks |
| `dt_sand_1024_q85` | Sand biome scrub/trees, summer oasis lake only (no frozen lake), rocks |
| `dt_snow_1024_q85` | Snow biome trees, melt + frozen lakes, icy rocks |
| `dt_universal_1024_q85` | Biome-independent props (deadwood, logs, stump, brush, clearing, rubble, path stones, camp) |

Packer: `scripts/pack-biome-decorative-tiles.mjs`.

## Runtime behavior
- Ground: plain land always shows the default organic terrain, also with custom sprite sheets on. Decorations are drawn on top of it (`MapRenderer.drawIntegratedLandOverlay`).
- Placement (`src/rendering/decorationLayout.js`), built once per map grid and sheet configuration by `TextureManager.getDecorationLayout(mapGrid)`:
  1. Decorative `group_N` definitions from the sheet JSON are split per biome into multi-tile and 1x1 pools. A group joins a biome when it is tagged with that biome or `universal`. Season tags are filtered per biome (`BIOME_SEASONS`: grass summer/autumn, soil spring/summer/autumn, sand summer, snow winter); untagged sprites are always allowed.
  2. Multi-tile pass first: every land cell whose hash hits `MULTI_TILE_ANCHOR_INTERVAL` is an anchor. Candidates are tried from a hash-chosen start, largest first; a sprite is placed only when every covered cell is free, decoratable land (no ore, seed crystal, building or airstrip) of the anchor's biome. Covered cells are marked occupied.
  3. 1x1 pass: remaining free land cells whose hash hits `SINGLE_DECORATION_INTERVAL` get a 1x1 sprite of their biome.
  4. Everything else is null, so the organic ground shows.
- The layout is a pure function of the map grid, so it is deterministic per map seed. A lookup re-validates the whole footprint, so a later map edit (street, building) drops the entire sprite instead of leaving half a lake.
- The old per-cell hash classification and the post-hoc search for matching neighbouring cells (`selectGroupedTileForMapTile`) were removed.
- Ground cut-out (`src/rendering/decorationCutout.js`): each group is composed into one canvas, pixels close to the group's border ground colour become transparent and the outer edge is feathered. Sprites that fill their footprint (forests) get a wide irregular fade instead. Universal sprites that stay mostly opaque (clearings, paths, rubble fields) are not placed on maps because they would show as foreign ground patches.
- Custom ground sheets (passable, non-decorative tiles) added through the editor still cover undecorated land cells.
- Cliffs/boulders stay on the organic `terraced-cliffs` art for `type === 'rock'` (the `rockCliffsMountains_*` sheet was removed on 2026-10-15)
- Occupancy passes `mapGrid` + `tile.biome` into integrated lookups so mixed-map lakes block correctly

## Verification
### SSE
1. Open Sprite Sheet Editor.
2. Load each `dt_*_1024_q85.webp` from the sheet list.
3. Confirm biome/`universal`, `decorative`, season, `rocks`, `impassable`/`water`, and `group_N` tags on cells.

### In-game Map Settings
1. Enable **Custom sprite sheets**.
2. Ensure the five `dt_*` sheets are checked (loaded by default via index).
3. Regenerate maps for grass/soil/sand/snow and Mixed; confirm decorative props appear and multi-tile groups do not cross biome borders.
4. Confirm frozen lakes block unit pathing; cliffs/boulders still come from the rock sheets.

### Automated
```sh
npm run test:unit
npm run lint:fix:changed
```

Netlify remains: `npm ci --include=dev && npm run build && npm run test:smoke`.
