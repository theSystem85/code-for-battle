# Spec 081: Shoreline water/land layering

## Requirements

- Procedural water is rendered beneath shoreline transition art on every supported terrain path.
- Organic shoreline transitions render land material onto water tiles using a shared-junction feathered mask; they must not paint animated water over opaque land tiles.
- Water-hosted land/street SOT corner information contributes to the shoreline transition direction, so SOT corners follow the same layer order as cardinal shore edges.
- The CPU fallback, WebGL water-only path, and WebGPU water-only path preserve this order: water base/SOT first, static land/street terrain next, and the land shoreline transition above the water canvas.
- Integrated sprite-sheet water remains governed by its own tagged water art, while SOT handling must not reintroduce a second mismatched animated water layer.
- Organic land corners and cardinal shores use one continuous mask. Street SOTs retain street art rather than the land underlay.
- Consecutive cardinal and diagonal shoreline segments share the same tile-space mask orientation and must not leave rectangular gaps or material swaps at joins.
- A street tile with any cardinal or diagonal water neighbor has no land/biome underlay. Procedural water is drawn beneath its transparent street image in CPU, WebGL, and WebGPU water paths.
- A water-hosted SOT involving street terrain is typed and rendered as street, including mixed street/land corner legs.
- Organic land shore coverage comes from four shared tile junctions, each occupied if any incident land/rock cell exists. Bilinear interpolation and a smooth alpha ramp connect all four convex and four concave corners to their cardinal neighbors. Diagonal-only shoulders participate. Legacy water triangles must neither overwrite nor cut out organic land.
- One-pixel oriented SOT overlap remains for legacy and street triangles. It is not a substitute for matching organic shoreline edge coverage.
- Rock is a shoreline land owner for organic transitions. A water tile adjacent to a rock formation must receive the same sand coastline material that would be rendered beneath the rock, including when snow is the visible biome of a snow-enabled plateau.
- Snow-enabled plateau surfaces include every rock tile belonging to a qualifying solid 3x3 plateau footprint, including the north and west-facing surface tiles; cliff faces remain separate transparent overlays.
- Land-to-land biome transitions use the same shared tile-junction coverage as water shorelines, so biome turns have matching edge endpoints and no detached corner notches.
- Street fringes currently retain the original `roadFringeMask` plus oriented triangle path. Shared-junction biome coverage is intentionally limited to biome transitions until the street rendering is revisited.

## Validation

- Unit coverage verifies cardinal and SOT-driven land transitions target water tiles and that land tiles no longer receive the animated-water transition.
- Browser coverage should verify shoreline pixels remain land-material dominant at the transition edge while the adjacent full-water sample continues to animate.
- Browser coverage should verify a street-over-water SOT samples street material and that a horizontal/SOT/vertical sequence has no opaque land replacement at the diagonal.
- Unit coverage verifies water underlays for shoreline streets, absence of their land underlays, street ownership of mixed SOT corners, and biome-colored land rendering through the oriented SOT alpha mask.
- Unit/browser coverage verifies the shared one-pixel corner placement for all four outward and inward SOT orientations.
- Unit/browser coverage verifies rock-owned shoreline transitions select sand and that a 3x3 plateau assigns snow to all nine surface tiles without changing the rock gameplay type.
- Unit/browser coverage verifies biome turn orientations share alpha at tile boundaries.
- Unit coverage verifies street fringe rendering continues to use the original corner-triangle path.

## Performance

### Shared-junction corner correction (2026-09-15)

The supplied image showed a straight-edged water triangle detached from the cardinal feather. The two masks placed their edge crossings at different positions within the tile; increasing triangle bounds by a pixel did not address that mismatch. Organic land shores now use the same junction field in every orientation. The rendered eight-case browser fixture checks every shared-edge alpha byte, detects holes in land, and verifies partial alpha remains. Existing direct/chunk parity and edited-chunk checks also pass. All 3,925 unit tests and changed-file lint pass.

Frequency/cost: shoreline topology is evaluated during static chunk baking (16 bounded incident-cell checks per water cell), not per unit. A 1190×1000 viewport has approximately 1,200 tiles; an uncached 60-Hz pass could perform 1.15 million incident-cell checks/second. Normal scrolling reuses chunk canvases. At DPR 2, a 32×32 tile covers 4,096 backing pixels; masks are built once at logical tile resolution and composited into existing chunks. There are at most 15 nonempty shoreline masks per tile size and 512 material composites shared with the existing transition cache. No new per-frame full-viewport blending, entity scans or GPU shader work is introduced.

Same local Chromium DPR-2 scrolling combat benchmark, 100×100 map, 83 buildings, 36–39 units and about 300 smoke particles: baseline 35.57 FPS, CPU update 2.83 ms, render 10.11 ms, terrain 8.91 ms, heap 73.05 MiB. Updated: 41.29 FPS, update 2.80 ms, render 9.37 ms, terrain 8.09 ms, heap 73.05 MiB. FPS improved 16.1%, passing both the 30 FPS floor and 20% regression threshold. Both samples reported two slow render frames; no increased heap/slow-frame symptoms were observed. Direct GC-event timing is unavailable. This host selected the CPU fallback; hardware WebGL/WebGPU performance was not measured.

```sh
# Baseline, before implementation:
TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep 'terrain combat performance' --reporter=line --workers=1
# Updated suite, including opt-in performance checks:
TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=35.57 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --reporter=line --workers=1
# Eight rendered orientations and rock material ownership:
npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep 'all eight|rock shorelines' --reporter=line --workers=1
```

The combat benchmark additionally asserts that shoreline masks are active and caches stay within their bounds. Its final run passed at 43.65 FPS, update 2.39 ms, render 8.65 ms, terrain 7.53 ms and heap 64.85 MiB. The cache check imports Vite's exact loaded renderer URL, including its HMR timestamp, to avoid accidentally inspecting a second unused renderer instance. Previous measurements below describe earlier implementations.

### Biome and street corner correction (2026-09-15)

The second supplied image set showed the same detached-junction geometry at land biome turns and road/cliff/sand edges. Biome overlays now derive their source material from all incident tile corners, including neighboring transition tiles, and use a wider feather to soften the remaining staircase. Street fringe rendering remains on the original road mask and oriented triangle path. The focused browser test renders a biome turn and checks shared seam alpha.

The focused Chromium DPR-2 scrolling combat benchmark averaged 46.30 FPS, 2.18 ms update, 8.11 ms render, 6.98 ms terrain and 61.04 MiB heap, compared with the prior 43.73 FPS baseline. The complete organic terrain suite averaged 43.92 FPS, 2.42 ms update, 8.51 ms render, 7.37 ms terrain and 77.63 MiB heap; this is a 0.4% FPS improvement over baseline and remains inside normal host variance. Both runs pass the 20% regression gate. The full organic terrain browser suite passed 10/10, and the full unit suite passed 3,927 tests. The CPU fallback was selected on this host; WebGL/WebGPU hardware performance was not measured.

```sh
npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep 'land biome turns' --reporter=line --workers=1
TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=43.73 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --reporter=line --workers=1
npm run test:unit
```

The shoreline compositor runs once per visible terrain frame. Street-water detection performs a bounded eight-neighbor check only for street cells. Land/SOT composites use bounded 512-entry caches, preserving canvas identity after their first render and avoiding repeated offscreen compositing.

Local Chromium DPR-2 comparison (100×100 map, 15-second scrolling combat scene, 2026-09-15): HEAD baseline averaged 26.35 FPS, 10.54 ms render, 8.83 ms terrain, and 73.05 MiB heap. The final implementation averaged 33.53 FPS, 10.30 ms render, 8.90 ms terrain, and 64.85 MiB heap. FPS improved 27.2%; terrain time changed by +0.8%, within the 20% regression gate, and the final run passed the fixed 30 FPS budget. Exact commands:

```sh
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line --workers=1
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line --workers=1
```

The rock-coast follow-up adds no per-frame allocations or entity scans. A clean local Chromium DPR-2 sample on 2026-09-15 reported 27.47 FPS, 11.56 ms render, 9.77 ms terrain, and 68.86 MiB heap (456 samples; 100×100 map, 36 units, 83 buildings, 288 smoke particles). Two adjacent samples reported 27.38 FPS / 9.73 ms terrain and 24.18 FPS / 11.37 ms terrain, showing host scheduling variance. The unchanged fixed-floor run was below 30 FPS on this host; the 27.47 FPS sample remains within 20% of the documented 33.53 FPS comparison baseline, and the focused behavior test plus all unit tests pass.

The SOT corner-stitching follow-up was measured on the same local Chromium DPR-2 100×100 combat/scroll scene on 2026-09-15. The pre-change checkout averaged 33.92 FPS, 10.38 ms render, 9.10 ms terrain, and 64.85 MiB heap; the updated checkout averaged 30.07 FPS, 12.15 ms render, 10.78 ms terrain, and 54.17 MiB heap. FPS decreased 11.3% and terrain time increased 18.5%, both within the 20% regression gate; the updated run passed the fixed 30 FPS floor. The run used the existing opt-in performance test and emitted no additional per-tile allocations.

Exact commands:

```sh
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 TERRAIN_BENCHMARK=1 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --grep "terrain combat performance" --reporter=line --workers=1
```

The command was run once against the pre-change checkout and once against the updated checkout on port 5173.
