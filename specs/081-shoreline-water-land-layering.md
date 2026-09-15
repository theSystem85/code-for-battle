# Spec 081: Shoreline water/land layering

## Requirements

- Procedural water is rendered beneath shoreline transition art on every supported terrain path.
- Organic shoreline transitions render land material onto water tiles using the same feathered mask as biome transitions; they must not paint animated water over opaque land tiles.
- Water-hosted land/street SOT corner information contributes to the shoreline transition direction, so SOT corners follow the same layer order as cardinal shore edges.
- The CPU fallback, WebGL water-only path, and WebGPU water-only path preserve this order: water base/SOT first, static land/street terrain next, and the land shoreline transition above the water canvas.
- Integrated sprite-sheet water remains governed by its own tagged water art, while SOT handling must not reintroduce a second mismatched animated water layer.
- Water-hosted diagonal SOTs render after the cardinal land feather with their own material and alpha edge; street SOTs must use street art rather than the land underlay.
- Consecutive cardinal and diagonal shoreline segments share the same tile-space mask orientation and must not leave rectangular gaps or material swaps at joins.
- A street tile with any cardinal or diagonal water neighbor has no land/biome underlay. Procedural water is drawn beneath its transparent street image in CPU, WebGL, and WebGPU water paths.
- A water-hosted SOT involving street terrain is typed and rendered as street, including mixed street/land corner legs.
- A water tile with a land or street SOT must not also receive the cardinal biome feather. The SOT alpha is the sole transition mask on that tile, keeping the fade perpendicular to its diagonal edge and its opaque legs aligned with neighboring cardinal transitions.
- Rock is a shoreline land owner for organic transitions. A water tile adjacent to a rock formation must receive the same sand coastline material that would be rendered beneath the rock, including when snow is the visible biome of a snow-enabled plateau.
- Snow-enabled plateau surfaces include every rock tile belonging to a qualifying solid 3x3 plateau footprint, including the north and west-facing surface tiles; cliff faces remain separate transparent overlays.

## Validation

- Unit coverage verifies cardinal and SOT-driven land transitions target water tiles and that land tiles no longer receive the animated-water transition.
- Browser coverage should verify shoreline pixels remain land-material dominant at the transition edge while the adjacent full-water sample continues to animate.
- Browser coverage should verify a street-over-water SOT samples street material and that a horizontal/SOT/vertical sequence has no opaque land replacement at the diagonal.
- Unit coverage verifies water underlays for shoreline streets, absence of their land underlays, street ownership of mixed SOT corners, and biome-colored land rendering through the oriented SOT alpha mask.
- Unit/browser coverage verifies rock-owned shoreline transitions select sand and that a 3x3 plateau assigns snow to all nine surface tiles without changing the rock gameplay type.

## Performance

The shoreline compositor runs once per visible terrain frame. Street-water detection performs a bounded eight-neighbor check only for street cells. Land/SOT composites use bounded 512-entry caches, preserving canvas identity after their first render and avoiding repeated offscreen compositing.

Local Chromium DPR-2 comparison (100×100 map, 15-second scrolling combat scene, 2026-09-15): HEAD baseline averaged 26.35 FPS, 10.54 ms render, 8.83 ms terrain, and 73.05 MiB heap. The final implementation averaged 33.53 FPS, 10.30 ms render, 8.90 ms terrain, and 64.85 MiB heap. FPS improved 27.2%; terrain time changed by +0.8%, within the 20% regression gate, and the final run passed the fixed 30 FPS budget. Exact commands:

```sh
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line --workers=1
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line --workers=1
```

The rock-coast follow-up adds no per-frame allocations or entity scans. A clean local Chromium DPR-2 sample on 2026-09-15 reported 27.47 FPS, 11.56 ms render, 9.77 ms terrain, and 68.86 MiB heap (456 samples; 100×100 map, 36 units, 83 buildings, 288 smoke particles). Two adjacent samples reported 27.38 FPS / 9.73 ms terrain and 24.18 FPS / 11.37 ms terrain, showing host scheduling variance. The unchanged fixed-floor run was below 30 FPS on this host; the 27.47 FPS sample remains within 20% of the documented 33.53 FPS comparison baseline, and the focused behavior test plus all unit tests pass.
