# Organic terrain, shorelines and connected cliffs

## Performance requirement supersession — 2026-09-16

Historical benchmark numbers and relative acceptance ratios below are retained as history. The current requirement is the [strict 75 FPS specification](rendering-pipeline-75fps.md); neither a 20% allowance nor 30/40/60 FPS qualifies. The [current analysis](../rendering_analysis.md) shows substantial signature hashing even on cached terrain and incomplete preparation for normal maps. Follow [the implementation checklist](../rendering_improvement_todos.md) to remove this work while retaining all visuals and procedural-water animation. No optimization is implemented by this documentation update.

## Behavior

Cliff rendering is superseded by [080-terraced-cliff-rendering.md](080-terraced-cliff-rendering.md): width-dependent plateau contours, eight material variants per shape, 2-4-cell macro faces, all height directions, and a quality-85 transparent WebP atlas. The narrow-ridge description below applies only to the retained load-failure fallback.

The default terrain uses model-generated materials and props baked into two static PNG atlases. Gameplay tile types, blocked cells, collision, pathfinding, map serialization and minimap colors remain unchanged.

Roads use the full 47 canonical eight-neighbor blob masks and four deterministic material variants. Neighboring SOT triangles now count as connected road edges, preventing rounded holes between the road and its wedges. The SOT triangle's two legs remain fully opaque; only its exposed hypotenuse gets irregular feathering. Grass and road SOT use current materials rather than the previous fallback atlas. Shoreline lips overlap water with pre-baked ragged alpha; water-SOT banks soften the diagonal cut. In CPU fallback, animated water renders below the cached shoreline, matching GPU layering. Water animation and shaders are unchanged.

Grass uses new imagegen meadow artwork without the previous sinusoidal macro pattern or mirrored grass sampling. Two subtly different 8x8 material blocks are coordinate-hashed. Twelve generated low ground decorations are placed sparsely (~1 eligible cell in 19), away from shores, roads, resources, runways and buildings. Placement is deterministic; these decorations do not block movement. Fine source detail still repeats over an eight-cell period. The irregular beach-like contour belongs to the sand/water edge; the inland sand/grass edge uses the same longer corner-weighted smooth blend as ordinary biome intersections.

The legacy fallback (used if the new cliff atlas fails to load) behaves as follows: rock components of three or more cells use cliffs; isolated cells and pairs use six new neutral boulder variants. A bounded radius-two test classifies chains, including diagonal endpoints. Eight directional connection bits preserve diagonal-only neighbors; redundant diagonals are suppressed when cardinal joins already connect them. The atlas contains 256 connection masks with two subtle tone variants, compiled from generated horizontal, vertical and both diagonal cliff profiles. These also produce corners, branches and endpoints. Wide barriers favor uninterrupted opposing ledges over a lattice of junctions. Profile overlap is baked and uses one sprite draw per cliff cell at chunk-build time.

Cliffs and boulders have neutral transparent feet and debris, with no baked grass/sand/snow disc. The same art is used in default and custom integrated biome modes; the ground under a rock cell comes from the selected land material. Thus snow/sand custom biomes retain their ground. Cliff silhouettes can overlap water; this does not turn a blocked rock cell into a navigable water tile. Custom integrated biome grass/road/water art retains its original rendering; its rock art is replaced by the shared neutral formation set.

## Assets and rebuild

Run `npm run make:terrain` from the repository. The existing sharp dependency suffices; no network or API key is needed. Commit generated PNG/JSON files and source art together.

- `public/images/terrain/organic-atlas.png`: 1280x1472; grass and 188 road sprites.
- `public/images/terrain/terrain-details.png`: 1024x2352; grass/road SOT, shoreline lips/banks, 12 decorations, 512 cliff variants and 6 boulders.
- Both atlases have adjacent JSON layout manifests. About 2.6 MiB compressed total, 16.4 MiB decoded RGBA. Old unused rock cells were removed from the original atlas.
- `source/meadow.webp`, `source/decoration.webp`, `source/cliffs.webp`, `source/boulders.webp`: generated terrain sources, stored as quality-85 WebP.
- `source/cliffs-layout.json`: inspected crop bounds; generated gutters were unequal, so nominal grid cropping captured neighboring fragments. These bounds prevent that artifact.
- Existing `source/materials.webp` remains the road source; `source/rocks.webp` is retained as the previous artwork.
- `scripts/build-terrain.mjs` compiles materials; `scripts/build-terrain-details.mjs` compiles masked overlays and connection sprites.

Generation prompts requested: quiet realistic overhead olive meadow without sharp stipple/blade noise; twelve isolated passable low props (scrub, bush trio, grass tufts, branch, stones, stump, fern, weeds, leafy plants, twigs, broad-leaf scrub, windswept grass); a neutral continuous stratified cliff sheet containing horizontal/vertical/both diagonal ridges, corners, endcap, junction and a cluster; six neutral boulder silhouettes (squat, angular trio, layered outcrop, gravel cluster, split pair, flat ledge). All use upper-left lighting, transparent backgrounds where appropriate, no text/UI/frames, no biome-colored mats on stone assets. Original generated raster sources are saved in the repository.

## Runtime cost and invalidation

All new selection, alpha overlays and grouping execute during chunk rebuilds. Cached frame rendering retains the same bounded chunk count, resolution and blits; there are no new simulation/entity loops, runtime pixel operations, shader effects or full-screen translucent passes. CPU water's existing draw pass moves before terrain; no extra water pass is added. A three-cell topology signature halo covers cliff-neighbor dependencies of overlapping sprites. Only the original one-cell core halo computes decal/resource signatures, reducing unnecessary per-frame string work. Load completion invalidates caches after both atlases are ready; failures retain legacy art.

The beach-contour reassignment keeps that cost model: shoreline alpha is generated only for bounded cached mask variants, and inland shoreline corner weights are calculated once during biome assignment. Six deterministic beach-contour variants are selected per sand shoreline tile. Their edge-safe envelope makes every variant evaluate to the same shared-edge values, so random-looking neighboring choices remain seamless. It adds no per-frame terrain, entity, or high-DPI canvas work.

2026-09-16 before/after focused benchmark (Headless Chromium, 1440×1000 viewport, DPR 2, 100×100 mixed-biome map): mixed-terrain cold chunk baking was 190.3 ms before and 201.5 ms after (+5.9%); the cached pass remained 13.4 ms before and after. Reported ending heap was 68.0 MB before and 81.4 MB after, a single-snapshot difference that can include unrelated GC timing. The persistent per-frame cached path had no measured regression and stayed within the existing 1.2× budget.

## Validation

- `npm run test:unit`: 159 files, 3,879 tests passed.
- Browser coverage compares all RGBA pixels of direct versus four cached chunks with transparent water holes, before and after editing a chunk-boundary tile; checks that tile data is unchanged; verifies fully opaque SOT legs, partially transparent diagonal pixels and alpha outside cliff silhouettes.
- Directional unit coverage checks horizontal, vertical and both diagonal chains, endpoints, isolated pairs and road-to-SOT connectivity.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_SKIP_WEB_SERVER=1 TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=41.07 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --workers=1` runs the optional performance gate. Use the port of the actual server. The performance-monitor button is used to avoid measuring a different module instance after Vite HMR.
- Required final checks: `npm run lint:fix:changed`, `npm run build`, and `git diff --check`.

Before -> after: Headless Chromium 145, 1440x1000 viewport, DPR 2 (2380x2000 terrain backing), seed 4, 100x100 map, existing combat benchmark and scrolling 8px/frame, 15s. Monitored FPS 41.07 -> 45.15; update CPU 2.61 -> 2.39 ms; render CPU 6.66 -> 6.00 ms; terrain 5.56 -> 4.90 ms; ending JS heap 64.85 -> 57.51 MiB; slow CPU-work frames 5 -> 4. Both final views had 9 cached hits, no direct tile passes. Single-run results vary with combat and camera timing, and heap snapshots are not a GC guarantee. Neither baseline nor updated headless rendering certifies 60 FPS on physical hardware.

## Further visual suggestions (not implemented)

1. Replace the visibly repeating water pattern with a quieter multi-tile animation atlas; retain the existing frame selection and draw budget.
2. Add sparse reeds and damp silt only at suitable shoreline segments, baked into chunks and kept away from routes.
3. Implemented in spec 080: generated cliff material variants and width-dependent nested plateau contours replace repeated interior ridges.
4. Add subtle traffic wear and gravel shoulders at road junctions and building approaches, using sparse cached decals.
5. Add biome-specific vegetation palettes over the shared neutral cliffs, rather than separate stone assets per biome.

Final repository verification: all four Chromium tests passed, including the opt-in combat performance gate and actual CPU shoreline visibility. Required changed-file lint, production build and whitespace checks passed.

Water-SOT legs also participate in coastline neighbor checks, preventing ground lips across water-to-water connections. The added regression test covers this case; all 3,879 unit tests and four browser tests passed after the correction.
