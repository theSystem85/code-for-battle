# Terraced, directional cliff terrain

## Request and visual diagnosis

The supplied first screenshot repeats a complete narrow ridge inside every rock cell. Thick clusters consequently look like parallel fences. The second screenshot instead shows a single elevated landmass, perimeter faces, and higher nested terraces in broad regions. Implement that topology with generated rock artwork, at least five variations per piece, transparent biome blending, and a single quality-85 WebP atlas with the existing JSON sprite-sheet schema.

## Implementation

`cliffTerrain.js` computes a capped Chebyshev distance to non-rock terrain with two linear sweeps over a chunk-local padded patch. Contours at distances 1, 3 and 5 produce up to three visual elevation levels as formations widen. Tile types, pathfinding, occupancy, collision, save formats, and minimap data are never changed. This is visual elevation, not gameplay elevation or a traversable plateau system.

Marching squares connects tile centres. NW/NE/SE/SW are bits 1/2/4/8. All 16 masks are represented, including the two diagonal saddle cases. Masks 0 and 15 have no face; the 14 boundary cases have eight stone-pattern and palette variants each. Reversed masks reverse the high/low side. Corners curve through common boundary midpoints with matching tangents. Diagonal-only clusters remain visually connected. Unlike the legacy branch, isolated cells also use the same contour topology.

The offline compiler curves and textures the generated rock material, varies internal fracture patterns, and fixes common endpoint texture strips. Upper-left lighting makes west/north rims shallower and brighter, and east/south faces taller and darker. Baked translucent contact/cast shadows fall on the lower side, strongly toward the right and bottom. Clear plateau interiors reveal the underlying terrain material, including integrated biome textures; no grass-colored mat is baked into the stone art. Additional sparse transparent plateau details break up large tops.

The runtime selects deterministic variants by coordinate and terrace level. It paints terraces from low to high during chunk baking, with no faces on solid interiors. The current terrain material supplies plateau ground. Existing artwork remains the load-failure fallback.

### Plateau eligibility and tile ownership

A rock formation must contain a solid 3x3 rock footprint before it can render as a plateau. The qualifying core expands by one tile only through existing rock cells, so the complete minimum footprint owns its perimeter. Cardinally connected non-plateau components of at least three tiles render one south/east-facing escarpment; shorter and diagonal-only fragments remain ordinary boulders. This classification is visual and does not alter tile types.

The renderer clips the complete cliff layer once per chunk bake to the union of qualifying rock-tile rectangles. Rock faces, rim pixels, debris, and alpha shadows therefore cannot paint neighboring land or water cells. Every qualifying plateau tile receives one of five deterministic transparent crack-and-stone overlays on its biome ground. Non-qualifying rock tiles receive one of the existing six boulder sprites.

Generated rock lines now have a minimum requested thickness of three tiles, with broader lines at higher rock percentages. This makes plateau-capable 3x3 areas a normal output of map generation. Later water, roads, and protected base clearing may carve those formations without leaving stale visual eligibility because classification reads the final map grid during chunk baking.

## Assets and reproducibility

- `public/images/terrain/terraced-cliffs.webp`: the single runtime sprite sheet, 3600x3584 pixels. Its top section contains 17 columns by eight rows of 160px cells with a 64px logical footprint and 48px transparent overlap padding. The lower section packs 96 variable-size macro sprites. At the game's 32px tiles this provides 2x source sampling for DPR 2.
- `public/images/terrain/terraced-cliffs.json`: schemaVersion 2, alpha blend mode, exact source rectangles, rock/cliff tags, eight variants, corner-bit layout, contour definitions, and every macro block rectangle. The runtime reads matching fixed layout constants to avoid an extra metadata request; tests cover the dimensions and coordinates.
- `public/images/terrain/source/terraced-cliffs.png`: built-in imagegen source sheet. Generated row orientations were not sufficiently dependable for direct tiling, so the compiler uses solid frontal stone samples and deterministic directional geometry to guarantee topology and lighting.
- `source/plateau-details.png`: five generated transparent crack/chip patterns. `source/terraced-cliffs-canyon.png` supplies the new warm and canyon material families. `source/terraced-cliffs-prompts.md` records all complete generation prompts.
- `scripts/build-terraced-cliffs.mjs`: offline Sharp compiler; rebuild with `node scripts/build-terraced-cliffs.mjs`. No API key needed to rebuild. WebP `quality: 85` means the encoder quality setting, not an 85% reduction in bytes. Alpha uses `alphaQuality: 100`.

## Performance gate and invalidation

Frequency identified before implementation: distance transforms, variant selection, and contour drawing execute only on chunk creation/invalidation. With a typical 16x16 chunk plus overlap, this is a bounded patch of approximately 30x30 cells, two distance sweeps, then three contour passes; it does not multiply by unit count. Cached rendering still blits approximately nine visible chunks per frame. At 60 FPS that is approximately 540 cached blits/second; a 1440x1000 viewport at DPR 2 has 5.76 million backing pixels/frame. No new full-screen alpha pass, runtime shadow/filter, or per-entity allocation is introduced.

A seven-cell topology-signature halo includes deepest-terrace dependencies and overlapping sprites. Existing neighboring-chunk dirty invalidation covers this distance because it is smaller than a 16-cell chunk. The depth array is allocated once per bake, never in a cached-frame or entity loop. No persistent per-grid mutable elevation cache can become stale after edits.

## Validation

Commands:

```sh
npm run test:unit
npm run lint:fix:changed
CLIFF_BENCHMARK=1 CLIFF_BASELINE_FPS=60 TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=38.93 npx playwright test tests/e2e/terracedCliffs.test.js tests/e2e/organicTerrain.test.js --workers=1 --reporter=line
npm run build
```

The focused benchmark uses an isolated live page to avoid rendering a second game canvas underneath the test scene: 100x100 cells, 6,153 rock cells, 1440x1000 viewport, DPR 2, 240 frames, scrolling 4px/2px each frame, first 30 frames excluded. Baseline: 60.00 FPS, 4.83ms mean terrain render CPU, 6ms maximum, zero frames over 34ms, reported heap samples 18.41MiB. Browser heap reporting is coarse; identical samples are not proof that no GC occurred.

The independent existing combat benchmark uses seed 4, 100x100 terrain, four parties, approximately 35 units/83 buildings, firing effects and 300 smoke particles, scrolling, and DPR 2. Baseline: 38.93 FPS, 2.78ms update, 7.00ms render, 5.77ms terrain, 61.04MiB ending heap, four slow CPU-work frames. This headless combat baseline already misses 60 FPS; the focused terrain budget is 60 FPS and the existing combat test enforces its established 30 FPS floor plus no more than 20% regression. Physical device performance is not inferred from headless Chromium.

Final results are recorded below after visual refinement.


## Final measured results (2026-09-12, Chromium 145)

- Dense cliffs: 60.00 -> 59.99 FPS; mean terrain render 4.83 -> 4.73ms; max 6.00 -> 5.20ms; zero frames over 34ms in both runs; coarse heap samples 18.41MiB in both runs. The isolated terrain scene has no simulation update workload.
- Combat: 38.93 -> 37.48 FPS (3.7% decrease); update 2.78 -> 2.87ms; render 7.00 -> 7.93ms; terrain 5.77 -> 6.74ms; ending heap 61.04 -> 54.17MiB; four slow CPU-work frames in both runs. No direct tile passes, nine cached chunk hits at the final sample. These single-run headless measurements establish the regression gate, not device-independent timing or absence of GC.
- A run overlapping the full unit suite was discarded because CPU contention contaminated combat timing. The final comparisons ran with no concurrent build or unit suite.
- 160 unit files / 3,883 tests passed. Six browser tests passed, including byte-for-byte direct/chunk RGBA equivalence before and after a deep-terrace boundary edit, all 15 nonempty artwork types having five distinct variants, alpha coverage, water compatibility, and both performance gates.
- Required changed-file lint, production build, and `git diff --check` passed. Build emitted the existing large-bundle advisory. Build-generated version metadata was restored to avoid unrelated changes.
- Final preview: `assets/terraced-cliffs-preview.webp`. Artwork follows the reference's plateau/terrace structure; it is not a pixel reproduction of the supplied image.

## Rock-tile ownership follow-up (2026-09-13)

- A solid 3x3 footprint now gates plateau rendering; thinner rock formations use the six ordinary boulder variants.
- One chunk-local clipping path contains faces, rims, shadows, and top decals within plateau-eligible rock tiles. A browser pixel test renders a 3x3 plateau onto transparency and confirms zero alpha on every land tile while confirming detail pixels on the centre top tile.
- Generated plateau tops now receive one of five coordinate-stable crack/stone overlays on every eligible tile.
- Procedural rock lines now request at least three tiles of thickness. Unit coverage verifies the seeded 100x100 generator retains at least one solid 3x3 rock footprint after water, roads, and base protection are applied.
- Final focused result: 60.00 FPS, 4.38ms mean terrain render, 5.10ms maximum, zero frames over 34ms, and coarse heap samples of 18.41MiB. The previous implementation measured 59.99 FPS and 4.73ms in the same test.
- Final combat result: 34.90 FPS, 3.59ms update, 8.05ms render, 6.55ms terrain, 57.51MiB ending heap, and five slow CPU-work frames. This variable combat scene remains above its 30 FPS fixed floor and above the 80% regression threshold against the previous 37.48 FPS run.
- Required verification passed: 160 unit files / 3,886 tests, seven Chromium tests, changed-file lint, production build, and `git diff --check`. The build retained its existing large-bundle advisory.

## Full-depth edges and narrow escarpments

The supplied follow-up screenshot showed that the outside north/west contour was nearly truncated while interior south/east faces retained their height. The compiler's minimum source-face depth was only four pixels before the runtime's 0.5 scale, and most wall pixels extended toward the low tile where rock ownership clipping removed them. Every direction now starts at 16 source pixels; lower/right directional terms add up to 46 more. The complete wall body extends into the contour's high-ground rock footprint, while its shadow remains on the low side. Upper and rear edges remain brighter and shallower than front faces, but they keep a clearly readable rock wall after clipping.

Long cardinal rock chains that lack a 3x3 plateau footprint now render a single exposed escarpment instead of boulders or two opposing walls. The renderer derives a bounded chain mask during the same chunk-bake topology pass, draws only south/east-facing marching-square segments, and applies plateau top detail to those rock cells. Diagonal-only and shorter fragments remain boulders because a one-sided continuous face cannot be guaranteed from their logical footprint. Both the escarpment and plateau layers use rock-tile clipping.

At five-percent rock coverage, generated lines can now vary between three and five tiles wide rather than remaining fixed at three. Higher settings continue to increase the maximum. This produces a mix of single-sided escarpments, complete plateaus, broader faces, and nested terraces while retaining the requested terrain percentage as the generation stopping target.

### Follow-up verification (2026-09-13)

- Dense cliffs: 60.00 FPS baseline -> 60.00 FPS; mean render 5.49 -> 5.53ms; maximum 5.80 -> 5.90ms; zero frames over 34ms in both runs. Eight sampled heap readings stayed at 18.41MiB, so the benchmark observed no heap growth or collection sawtooth.
- Combat: 39.62 FPS baseline -> 36.15 FPS (8.8% decrease, within the 20% gate); final update 2.80ms, render 8.11ms, terrain 6.95ms, ending heap 64.85MiB, and five slow CPU-work frames. The scenario retained 12 cached chunk hits and zero direct tile passes at its final sample.
- 160 unit files / 3,887 tests passed. Eight Chromium tests passed, including rock-only alpha ownership, broad north-face atlas coverage, five distinct variants for every nonempty topology, one-sided narrow escarpments, and both performance gates.
- Changed-file lint, the production build, and `git diff --check` passed. The build emitted its existing large-chunk and mixed static/dynamic import advisories; generated version metadata was restored after verification.

## Organic silhouettes and macro cliff blocks

The renderer preserves the generated sprites' irregular transparent perimeter instead of cutting outer faces against rectangular tile clips. Logical rock topology remains the source of every cliff, but faces and their soft fringe may overlap the immediately adjacent low biome as part of the cliff sprite. Plateau top decals remain contained to rock ground.

The atlas includes two-tile-thick macro cliff blocks with 2x2, 3x2, 4x2, 2x3, and 2x4 logical footprints. Each block is selected only when the matching footprint contains rock and is reserved once during chunk baking. Broad plateau edges use a compressed version of the same continuous 2-4-cell silhouette to avoid repeated one-cell scallops; genuinely two-tile-deep escarpments use its full height. Eight deterministic material variants span gray limestone, taupe, ochre, muted rust, and layered red/brown canyon palettes. Palette selection is stable across 16x16-tile regions so a formation reads as one geology instead of alternating colors every cell. Generation seeds 35 percent of requested rock coverage with four-grid-aligned 2x2/2x3/2x4 stamps, then joins and broadens them with the existing continuous terrain lines.

### Macro-cliff verification (2026-09-14)

- The sprite compiler produced one 3600x3584 transparent WebP at encoder quality 85: 112 contour faces, eight plateau-detail cells, and 96 macro faces (four directions × three lengths × eight materials). Browser pixel hashes confirm eight distinct versions of every contour and macro topology.
- The browser preview includes a dedicated isolated 2x4 rock block using a full-height macro and broad plateau runs using the compressed continuous silhouette. Adjacent-biome alpha tests confirm that the irregular rim/fringe crosses only into the immediate neighboring tile; distant land stays untouched and plateau-ground decals remain on rock.
- Direct rendering and four cached 16x16 chunks are byte-identical across every RGBA channel before and after an edited deep-terrace boundary. Low-profile macro cross-scaling uses an integer-aligned 56-pixel destination at the standard 32-pixel tile size to avoid offscreen raster rounding differences.
- Dense cliffs measured 57.82 FPS against 60.00 FPS baseline (3.6% decrease), 3.83ms mean render time, 4.80ms maximum, five frames over 34ms, and flat 18.41MiB heap samples. Combat measured 32.23 FPS against 36.15 FPS baseline (10.8% decrease), 3.90ms update, 9.05ms render, 7.43ms terrain, 61.04MiB ending heap, and seven slow CPU-work frames. Both remain inside the 20% regression gate and the project fixed floors.
- Required verification passed: 160 unit files / 3,890 tests, eight Chromium rendering and performance tests, changed-file lint, production build, and `git diff --check`. The build retained its existing large-chunk and mixed-import advisories; generated version metadata was restored afterward.
