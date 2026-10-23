# Alpha decoration replacements

Replace the five opaque dtv2 biome/universal atlases, dtv3 shore and old mixed-background winter atlas with alpha art. Keep active alpha skyline/village/town sheets, ground detail and sand/snow nature art.

## Sources and extraction

Eight generated sources live in `public/images/map/sprite_sheets/sources/alpha_*.webp`. Original tool PNGs are retained outside the repository. Sources and target images use WebP quality 85, alpha quality 100. Targets use alpha blending, 64 px tile pitch and no border.

| Target | Props | Placement |
|---|---:|---|
| dtv6_decor_grass | 24 | Green farms, vegetation, water, ruins and rocks |
| dtv6_decor_soil | 24 | Autumn farms, vegetation, water, ruins and roadside relics |
| dtv6_decor_sand | 24 | Palms, cacti, oasis, ruins and desert relics |
| dtv6_decor_snow | 24 | Winter vegetation, frozen water, ruins and equipment |
| dtv6_decor_universal | 24 | Ruins, rare facilities and roadside wreckage |
| dtv6_shore | 36 | Onshore banks, offshore plants/boats, crossing piers/huts |
| dtv6_nature_grass | 40 | Summer trees/shrubs, rocks, loose stones and ponds |
| dtv6_nature_soil | 40 | Autumn trees/shrubs, rocks, loose stones and ponds |

`npm run make:map-sprite-sheets -- --kind=props` rebuilds the replacements through SSE's actual alpha detector, packer and exporter. Reviewed names and tags in `scripts/map-prop-guides.mjs` correspond to source rows; sorting uses vertical centers in fixed column-count batches before horizontal ordering. Abort if detection does not match the authored count. Decor/nature use alpha cutoff 128, gap 0, min area 1000; shore uses cutoff 16 to retain detached pier connections. Keep source hashes, detection settings, original component bounds, packing and target import records in JSON.

No shrinking: copy each extracted silhouette at ratio 1, reserve ceil((pixels+4)/64) cells on each axis, and grow the atlas. No runtime zoom/resizing is introduced. Explicit names/categories/biomes are copied to every group cell and propLayout entry. No black-key or inner-cuts tags are needed. Only matching vegetation biomes/seasons are eligible; universal ruins/wrecks remain biome-independent. Rare water tower/fuel depot and landmark limits stay in effect.

## Native-size placement

Prepare all layouts before gameplay. Onshore rectangles extend inland from any cardinal coast. Offshore rectangles start adjacent to land and may extend into water by at most their largest span. A two-pass Chebyshev land-distance transform uses linear map-area preparation time and one byte per map cell. Crossing art is authored west-to-east: its western column is the land strip and the remaining columns are water. Rotate both footprint and imagery for the four coast normals. Validate the complete rectangle, retain normal spacing/keep-clear rules, and keep every water cell passable. The former 2x1 crossing is a compatible special case.

One quarter of seeded maps reserve large (span ≥5) ordinary props before smaller ordinary props; other maps offer the combined catalog. This preserves a placement path for wide farmsteads/orchards without starving smaller farm and rock variants in their limited clusters.

Roadside anchors stay directly beside streets; larger native rectangles can extend inland beyond the former second ring, while no covered cell may be a road. All existing resource, biome, base, occupancy and spacing exclusions remain applicable.

Retire dtv2_grass/soil/sand/snow/universal and dtv3_shore/winter image+JSON pairs. Drop their stored editor metadata, last sheet and saved active sheet through the registry's existing migration. New bundled pairs are enabled by default and index.json matches registry ordering.

## Verification

Replay SSE extraction for every source and compare every alpha pixel and render dimension against packed imports. Validate source hashes, WebP compression, tags, non-overlap and biome pools. Generate maps across every biome/default and eight-settlement settings until every default sprite is observed. Exercise large onshore/offshore/crossing rectangles on all four coast orientations, water passability and saved-state retirement. Chromium opens/exports all eight sheets, checks native imports and verifies retired sheets are absent.

Runtime audit: getValidDecorationCell already visits the covered footprint for each rendered integrated cell. Crossing validation adds constant integer coordinate comparisons, no allocation, entity scan or image creation. At a visible 60x40 tile region and DPR 2 this remains bounded by visible cells × group footprint; DPR adds no JavaScript iteration. Distance fields and anchor selection run during layout preparation only. No performance/GPU benchmarks run without verified hardware; 75 FPS acceptance remains pending on Patrick's qualifying GPU.

## Manual test plan

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | New alpha art | Open each dtv6 sheet in SSE and export it | Eight sheets; counts 24/24/24/24/24/36/40/40; alpha, q85, ratio 1 and complete biome/group tags | 1: U05433 | 1: E00227 |
| T02 | Map variety | Regenerate grass, soil, sand, snow and mixed maps with varied seeds | Every default sprite has a placement path; summer/autumn vegetation stays biome appropriate; large and small farms can appear | 2: U01221, U05454 | 2: E00053, E00220 |
| T03 | Coasts | Inspect banks, floating plants/boats and piers at each coast orientation | Whole native rectangles fit; crossings rotate; water remains passable | 3: U01202, U01204, U05452 | 0 |
| T04 | Migration | Load old dtv2/shore/winter selections and open both sheet pickers | Replaced files absent; current sheets enabled; stale coordinates removed | 1: U05453 | 1: E00057 |
| T05 | Existing cities | Generate all biome city sets and select a unit behind a tower | Building tiers, footprints, occlusion, HUD and click/drag selection retained | 0 | 4: E00223, E00224, E00225, E00226 |

- [x] T01 Automated functional verification
- [x] T02 Automated map generation and catalog verification
- [x] T03 Automated cardinal coast/occupancy verification
- [x] T04 Automated stored-selection migration verification
- [x] T05 Automated city rendering/selection regression verification
- [ ] Qualifying-hardware 75 FPS acceptance by Patrick
