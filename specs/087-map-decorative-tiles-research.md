# Spec 087: Biome-aware decorative map tiles (research → implementation)

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
- `getIntegratedTileForMapTile('land', …)` for decorative tiles:
  - Prefers grouped `decorative` variants whose tags include the tile biome **or** `universal`
  - Requires every cell of the footprint to be land+decorative and share the same biome
  - Falls back to 1×1 biome+decorative candidates, then universal+decorative
- Cliffs/boulders unchanged on `type === 'rock'` / rockCliffs sheets
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
