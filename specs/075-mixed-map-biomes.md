# Spec 075: Mixed map biomes

## Requirements

- Map Settings exposes `Mixed` alongside soil, sand, grass, and snow.
- Mixed maps deterministically partition passable ground into a configurable number of organic regions.
- Region placement supports vertical, horizontal, four-corners, and random distributions.
- Grass, soil, sand, and snow size weights control their relative region coverage. Disabled (zero-weight) biomes are excluded.
- Neighboring regions are assigned with a four-color-style greedy pass that avoids the same biome on connected regions whenever the enabled palette permits it.
- Ocean-connected shorelines prefer sand with a one-tile feather; enclosed lakes do not create sand belts.
- Shoreline sand feather normals follow the nearest ocean direction: north/south coasts blend vertically, east/west coasts horizontally, and corner coastlines diagonally.
- Map Settings exposes a shoreline width in tiles; plateau snow is applied after shoreline processing and always dominates sand on plateau interiors.
- `Snow on plateaus` independently paints rock/plateau tops without consuming one of the configured mixed-biome regions.
- Each generated tile caches its primary biome, optional neighboring biome, and blend opacity. The renderer uses that cached data during static terrain chunk baking, with warped boundaries and transparent cross-fades rather than straight or circular seams.
- Changes to any biome control are persisted and immediately regenerate and rerender the map while preserving the camera position.
- Multiplayer snapshots and saved games preserve the mixed-biome generation settings and resulting tile biome state.

## Performance

Biome partitioning, ocean detection, region coloring, and blend calculation run only during map generation. Rendering adds at most one extra ground-material draw for transition tiles while retaining the existing bounded static chunk cache; no per-simulation-tick or per-entity scans are introduced.

Local Chromium DPR-2 comparison (100×100 map, 15-second scrolling combat scene, 2026-09-15): single-grass baseline averaged 36.27 FPS, 9.05 ms render, 7.74 ms terrain, and 68.86 MB heap; mixed mode with 32 regions averaged 35.52 FPS, 9.49 ms render, 8.21 ms terrain, and 68.86 MB heap. The mixed workload reduced FPS by 2.1% and increased terrain time by 6.1%, within the 20% gate. Exact commands:

```sh
TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line
TERRAIN_BENCHMARK=1 TERRAIN_MIXED_BIOME=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line
```
