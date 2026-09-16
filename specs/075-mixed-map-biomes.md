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
- Organic terrain renders water over adjacent land with the same warped transparent mask used by biome transitions, including enclosed lakes and 45-degree SOT corners; the legacy grass-only coastline lip is not used.
- Graphics settings can toggle dynamic animated water blending over land; Map Settings exposes transition feather width in pixels.
- `Snow on plateaus` independently paints rock/plateau tops without consuming one of the configured mixed-biome regions.
- Each generated tile caches its primary biome, optional neighboring biome, and blend opacity. The renderer uses that cached data during static terrain chunk baking, with warped boundaries and transparent cross-fades rather than straight or circular seams.
- Mixed-biome transition assignment includes diagonal-only region contacts. At a turn, matching lower-region neighbors contribute a combined transition normal so the renderer receives corner metadata instead of leaving a full square biome tile in the boundary staircase.
- Every mixed-biome transition tile caches four fractional source-biome junction weights from the immutable region map. Organic and integrated sprite-sheet renderers bilinearly interpolate those values into a continuous, one-sided mask; binary junction expansion must not recreate tile-sized steps at diagonal or inward turns.
- Street tiles remain on the legacy road-fringe/SOT rendering path and do not use fractional biome transition masks.
- Changes to any biome control are persisted and immediately regenerate and rerender the map while preserving the camera position.
- Multiplayer snapshots and saved games preserve the mixed-biome generation settings and resulting tile biome state.

## Performance

Biome partitioning, ocean detection, region coloring, and blend calculation run only during map generation. Rendering adds at most one extra ground-material draw for transition tiles while retaining the existing bounded static chunk cache; no per-simulation-tick or per-entity scans are introduced.

The fractional-junction follow-up adds four cached numbers to each biome transition tile and reuses a bounded mask cache during chunk baking. Against the preceding 43.27 FPS build, the DPR-2 100×100 scrolling combat benchmark averaged 47.51 FPS, 2.23 ms update, 7.89 ms render, 6.81 ms terrain and 73.05 MiB heap. Mixed-biome cold baking was 0.63× the single-biome sample and its cached pass was 1.17×, within the 20% gate. The organic-terrain browser suite passed 10/10. Exact verification command:

```sh
TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=43.27 PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --reporter=line --workers=1
```

The diagonal-corner follow-up evaluates four additional neighboring cells per map tile during generation only. On the DPR-2 100×100 scrolling combat benchmark, the prior implementation averaged 43.92 FPS; the updated implementation averaged 43.27 FPS, 2.45 ms update, 8.80 ms render, 7.64 ms terrain and 54.17 MiB heap. The 1.5% FPS reduction is within the 20% regression gate. The full organic-terrain browser suite passed 10/10 and all 3,928 unit tests passed. Exact verification command:

```sh
TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=43.92 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --reporter=line --workers=1
```

Local Chromium DPR-2 comparison (100×100 map, 15-second scrolling combat scene, 2026-09-15): single-grass baseline averaged 36.27 FPS, 9.05 ms render, 7.74 ms terrain, and 68.86 MB heap; mixed mode with 32 regions averaged 35.52 FPS, 9.49 ms render, 8.21 ms terrain, and 68.86 MB heap. The mixed workload reduced FPS by 2.1% and increased terrain time by 6.1%, within the 20% gate. Exact commands:

```sh
TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line
TERRAIN_BENCHMARK=1 TERRAIN_MIXED_BIOME=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line
```
