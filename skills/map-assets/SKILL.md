---
name: map-assets
description: Create and register Code for Battle map decorative (DT) and terrain sprite-sheet assets with SSE tags, biome/season/group contracts, WebP packing, and hybrid organic+SSE placement. Use when adding biome props, lakes, rocks, or new map sprite sheets.
---

# Map Assets Skill

Use this checklist when creating decorative map tiles (DT), biome props, or new static map sprite sheets for Code for Battle.

## Locked product decisions
- **Hybrid:** ship new DT sheets alongside existing organic DT until organic is turned off later. Do not delete organic grass decorative paths.
- **WebP quality:** new map sheets use **85%** compression (`.webp`).
- **Load policy (current):** load enabled bundled `dtv<N>_*` WebP/JSON pairs by default during preparation (players can opt out; no per-biome lazy-load yet). Design sheet naming so single-biome skipping remains possible later.
- **Camera (new DT art only):** ~**65°** top-down (not 90° orthographic, not isometric), ~**300 m** altitude, photorealistic.
- **Biome-independent tag:** `universal` (not a fifth map biome).
- **Seasons:** encode as SSE tags on sprites: `spring` | `summer` | `autumn` | `winter`.
- **Mixed maps:** multi-tile DT footprints must stay entirely inside **one** biome.
- **Winter/frozen lakes:** tagged `impassable` (and usually `water` + `winter`).
- **Rocks/stones:** include biome-tagged rock groups on the new DT sheets.
- **Cliffs/boulders:** keep on the organic terrain system (`type === 'rock'` cells drawn with `images/terrain/terraced-cliffs.webp`). Retired `rockCliffsMountains_*` sheets stay retired; do **not** add cliffs to DT sheets.
- **Ground:** plain ground always comes from the organic terrain art in `public/images/terrain/`. Do not add custom grass/soil/sand/snow ground sheets; DT sheets only carry decorations.
- **Multi-tile placement:** the map generator places multi-tile `group` sprites first from the sheet JSON (see spec 120), so a group must be fully tagged on the sheet with its biome and `decorative`.

## Biomes and sheets
Map biomes: `grass` | `soil` | `sand` | `snow` (+ `mixed` at map level only).

Create **separate decorative sheets per biome** plus one **universal** sheet:

| Sheet | Path pattern |
|-------|----------------|
| Grass DT | `public/images/map/sprite_sheets/dtv6_decor_grass.webp` + `.json` |
| Soil DT | `.../dtv6_decor_soil.webp` + `.json` |
| Sand DT | `.../dtv6_decor_sand.webp` + `.json` |
| Snow DT | `.../dtv6_decor_snow.webp` + `.json` |
| Universal DT | `.../dtv6_decor_universal.webp` + `.json` |

Bundled dtv pairs are discovered by `src/ui/spriteSheetRegistry.js`; verify the pair appears in its default list.
Keep `DEFAULT_SSE_SHEETS` and `index.json` aligned with the bundled default pairs. Map Settings and SSE expose all available pairs; bundled dtv decorations start enabled and can be deselected.
An explicit empty custom selection must behave exactly like disabled custom mode.
Tag every cell and propLayout entry of ruins with `ruins`; preserve other tags.
Ruin anchors use seeded, biome-matching clusters with minimum spacing.

## Sheet format (SSE contract)
For newly extracted sheets:
- WebP quality **85**, lossless alpha, transparent empty pixels, `blendMode: "alpha"`.
- **64 px** tile/row pitch and **zero border**. Canvas dimensions grow to whole grid cells; they need not be square or 1024 px tall.
- Preserve each isolated sprite at **exactly its original source pixel width and height**, except for the explicitly user-approved low/medium city calibration below. Reserve `ceil((width + 4) / 64)` × `ceil((height + 4) / 64)` cells for a two-pixel minimum inset. Copy the isolated RGBA pixels without resizing. Never round spans down, normalize every sprite into one tile, or shrink to a fixed canvas.
- Keep rectangular/multi-tile footprints, including spans larger than 3×3. Grow rows (and columns if a source exceeds sheet width), respecting SSE image limits.
- Runtime map `TILE_SIZE` remains **32**; source grid pitch remains **64**. Normal map rendering scale is separate from preserving atlas pixels.
- Gameplay combat decals retain their recorded black-key contract. The legacy dtv2 and dtv3 shore/winter decorative sheets are retired; do not restore or regenerate them.

Sidecar JSON must include `schemaVersion`, `sheetPath`, `tileSize`, `borderWidth`, `blendMode`, sheet-level `tags`, `columns`, `rows`, and per-tile `tiles["col,row"]` with `tags`, `rect`, `col`, `row`.

## Tags
Every decorative cell/group must include:
- Biome tag (`grass`/`soil`/`sand`/`snow`) **or** `universal`
- `decorative`
- Season tag when seasonal (`spring`/`summer`/`autumn`/`winter`)
- `group_N` on **every** cell of a multi-cell rectangle (SSE rectangular groups — specs/065)
- Lakes: `water` + `impassable` (winter frozen lakes required impassable; summer lakes also impassable in current DT sheets)
- Rock props: `rocks` (in addition to biome + decorative)

Biome-dependent content rules:
- No frozen lake on **sand**
- Iced / winter lake props belong on snow or winter-appropriate biome contexts (grass/soil/snow)

Default SSE tag list must include `ruins`, `universal`, `spring`, `summer`, `autumn`, `winter` so SSE can paint them.

## Footprints
Support any rectangular footprint via `group_N`, including larger native-size buildings and lakes. Every covered cell belongs to the same group.

After packing, **visually inspect** the sheet and write accurate tags/footprints from occupied cells — do not guess occupancy.

## Art pipeline
1. Keep original source images under `public/images/map/sprite_sheets/sources/`; use supplied images as-is. Generate new art only when requested, matching the camera brief.
2. Use the [SSE extension flow](../extend-sprite-sheet/SKILL.md) at source-to-target ratio **1**, or the reproducible repository builder, which imports SSE's actual detector, packer and metadata exporter. Do not substitute bounding-box rectangle crops that include neighbouring sprites.
3. For the active source profiles, run `npm run make:map-sprite-sheets -- --kind=city` or `--kind=nature` (omit the flag for all). Use `--name=dtv5_city_sand_medium` to rebuild just one sheet. Profiles record source hashes, extraction settings and biome tags. The six active low/medium city sources use `alphaCutoff: 16`, `gap: 0`, `minArea: 1000` and must yield exactly 20 sprites each. The two original noisy nature sources use `alphaCutoff: 128`, `gap: 0`, `minArea: 256`; a zero cutoff joins almost the entire image. Inspect alpha and do not apply either profile blindly to unrelated art.
4. Pack native-size pixels into expanded footprints/canvas. Record `source.packing: { scale: 1, padding: 2 }`, original `bbox`, target `renderRect`, `tileSpan` and `placedAt`. Tag every cell and propLayout entry with biome, decorative, passability, category and matching `group_N`; preserve source sprite IDs. Cities use grass/soil, sand or snow, rather than universal vegetation. Do not invent seasonal variants absent from the supplied art.
5. Encode WebP q85 with alpha quality 100. Inspect the resulting sheet, compare every imported width/height and alpha silhouette with the SSE extraction, and verify non-overlapping footprints and bounds. Run `npx vitest run tests/unit/mapSourceSheets.test.js tests/unit/defaultDtvPlacementCoverage.test.js` for all bundled sprites. When repacking an existing atlas, bump its `layoutVersion` and registry stale-metadata guard so saved SSE coordinates cannot override the new layout.
6. Validate actual map generation across grass, soil, sand, snow and mixed. Large city structures should occupy central street lots; smaller buildings should favour outskirts. Test that every bundled sprite has a placement path instead of silently omitting oversized art.
7. Keep `package-lock.json`; Netlify build stays `npm ci --include=dev && npm run build && npm run test:smoke`.

## Runtime integration
- Integrated mode selects decorative tiles by `tile.biome` + `decorative`, with `universal` + `decorative` eligible on any land biome.
- Grouped decorative selection requires the full rectangle to share one biome on mixed maps.
- Organic DT path remains valid (hybrid). Cliffs/boulders stay on the rock/neutral sheets.
- Occupancy must honor `impassable` tags on selected integrated tiles (frozen lakes).

## Validation
- Open SSE → select each changed `dtv<N>_*` sheet → confirm tags/groups visible.
- Map Settings → enable Custom sprite sheets → ensure DT sheets checked → regenerate map across biomes / Mixed.
- `npm run test:unit`
- `npm run lint:fix:changed`
- Update a dedicated `docs/changes/` note, feature spec, versioned release notes, and `prompt-history/`.

## Seeded placement categories (PR #688)

Add `trees`, `rocks`, `farm`, `landmark`, `roadside`, `shore`, `ground_detail`, `city`, `stones`, `rare` and `inner_cuts` to SSE's default and preferred tags. Keep all existing tags, especially `impassable`. Assign categories by propLayout sprite id to both the entry and every footprint cell; a prop can have multiple categories. Trees include groves, rows, palms, pines, shrubs and cacti; rocks include boulders, outcrops, ridges and ice chunks; farms include barns, hay, tools, wells, sheds and orchards. Tag the named 3x3 pond, farmstead, oasis, frozen lake and village block as landmarks. Wrecks, road obstacles, crates, barrels and scrap use roadside (placed by a sparse dedicated pass, anchored directly next to a road). Ruined buildings and military remains use `ruins` (ruin clusters only). `rare` limits a prop to one per map. Loose stones use `stones` (dedicated seeded cluster pass, `stoneCount` setting). Tag a sprite `inner_cuts` only when its enclosed black pixels are background (branch gaps, tyre holes, reed gaps; not combat decals); by default only edge-connected black is keyed. Existing water props keep their water tags; do not add shore to water footprints just to make them land props.

Decorations use seeded smooth noise with separate forest/rock/farm clusters. Forests use a prepared per-biome density field with overlapping rotated elliptical lobes, ragged noise edges and coherent clearings, roughly one forest center per 1,800 eligible biome tiles (bounded to 12 per biome). A dedicated final tree pass uses that density plus a 1/400 outside-forest candidate probability, subject to all normal exclusions. Ordinary props and full-size boulders/lakes precede small-stone scatter; trees follow those scarce props so forests do not starve the rest of the catalog. Farm orchards stay in farm clusters. Natural tree footprints may touch without overlap; identical tree art keeps a three-tile buffer. All other categories retain the ordinary 4/2/1 and six-tile variety spacing rules. All footprint cells stay on one biome and off roads, their one-tile buffer, starts/bases (radius 8), ore (radius 2) and narrow passages. Roadside anchors sit on the first road ring and native-size footprints may extend farther inland; shore footprints use adjacent land. For non-forest pairs, minimum separation by span is 4/2/1 tiles for large/medium/small props, and identical sprites require six tiles. Landmarks are limited to one per 64x64 region and three per map. Category bags cycle evenly through seeded candidates; incompatible candidates are rejected.

`ground_detail` belongs only to optional art, is passable and occupies an independent layer below props at opacity 0.55. It uses sparse noise, never water/roads, and does not consume spacing. With no detail art loaded, rendering is unchanged. Bundled `dtv3_ground_detail` and `dtv6_shore` are registered only when both WebP q85 and JSON exist; missing optional files warn and skip. Prepare layout before gameplay and use the bounded terrain cache; do not create resized sprite variants during gameplay. Verify DPR-aware final-size preparation when supplying the future art.

See [placement specification](../../specs/121-map-generator-placement-rules.md) for helper tests, performance audit and outstanding qualifying-hardware verification. Preserve the empty-custom-selection equivalence test.

## Destructible cities (PR #688 follow-up)

`dtv<N>_<name>` WebP + JSON pairs are discovered automatically and enabled by default unless explicitly deselected. Keep `index.json` consistent with bundled defaults. Snow only receives vegetation tagged `snow`. City groups and all physical ground-footprint cells carry their matching biome tags, `decorative`, `impassable`, `city` and `group_N`. Keep propLayout IDs stable. The city source variants are temperate (grass/soil), sand and snow; they are not four separate season sheets.

City groups use seeded city centers with an organic street layout (curved main street joined to the big roads, 1–4 side streets, houses only facing streets; spec 132), with whole-footprint keep-clear validation and no water. The shared settings are `citySeeds` (2, 0–8), `cityClusterSize` (8, 3–20), `ruinSeeds` (3, 0–10) and `ruinClusterSize` (7, 3–20) and `stoneCount` (40, 0–400). Zero seeds disables that category. Maintain matching sidebar, storage/URL, save and host snapshot behavior.

Each city footprint shares one neutral HP object, outside auto-target lists. Preserve saved tombstones when preparing layouts. Destruction uses only the existing combat decal system (`debris_craters_tracks`); never generate city rubble art. Free the static occupancy contribution while preserving other occupants, invalidate terrain and path caches, and use existing destruction effects. Keep city projectile lookup indexed and preparation outside steady-state loops. See [spec 132](../../specs/132-destructible-city-buildings.md), including outstanding browser/performance acceptance.

## Topology changes

Selected sheets and tile tags are gameplay configuration. Use `computeMapTopologyFingerprint` for canonical selected paths/tags and city/ruin settings; disabled mode and an empty selection share `default`. Apply changes through `applyIntegratedSpriteSheetRuntime`, which invokes the existing map reset with the same seed. Collect SSE edits until apply/close. Do not hash in update/render loops. Include tag changes in prepared rendering signatures.

Only hosts may edit multiplayer topology before start; distribute selection, metadata, settings and fingerprint. Never regenerate multiplayer maps mid-match. Saves retain their fingerprint and selected metadata: preserve saved topology on load and show a non-blocking mismatch notice. Keep the topology fingerprint and empty custom sheet E2E regressions green.

## Shore classes (2026-10-17)

Every coastal sprite keeps `shore` plus exactly one of `onshore`, `offshore`, `shore_trans`; expose all three in SSE. Onshore art stays on land touching water, offshore art is passable render-only on shallow coast water, and a native crossing's western column rests on land and its remaining columns extend over adjacent water (2x1 is a special case). Prepare rotation and transposed footprint offsets for all four cardinal coast normals. Water cells never contribute optional impassability.

Use one seeded attempt per 14 coastal land anchors with ordinary spacing and six-tile identical-sprite separation. Keep all road/resource/start/building exclusions. Reeds and lilies are grass/soil/sand, never universal or snow; grassy mounds are grass/soil. Retag propLayout and every group cell together. Biome water-tagged ponds and frozen lakes are inland footprints, not offshore coastal art: preserve their water/impassable contracts. The SSE source builder owns the reviewed dtv6 shore tags; the terrain-details compiler does not modify decoration metadata. See [shore specification](../../specs/135-shore-classes.md).

## Planning additional decoration art

See [map decoration asset plan](../../docs/map-decoration-asset-plan.md) for the remaining visual gaps, suggested source themes and placement prerequisites. Prefer genuinely transparent gutters and separated silhouettes in new sources; keep a labelled contact-sheet preview separate from the native-size atlas. Before choosing tags for new categories, verify the generator has a compatible placement rule and extend its coverage tests.

## Tall city art and ground footprints

The skyline targets `dtv3_city`, `dtv4_city_sand` and `dtv4_city_snow` were explicitly retired. Their `cities_{temperate,sand,snow}_tall.webp` sources remain archived history; do not register or regenerate the retired targets. The active city catalog contains only the six dtv5 low/medium targets below. Registry migration must reject retired targets even when an old saved layout version matches.

Author realistic building scale against the vehicle factory's **3×3** ground footprint. Skyline and medium city ground rectangles must be at least **2×2**, skyscrapers at least **3×3**; the later low-density calibration below allows **2×1** cottage bases. Preserve original isolated pixels and increase atlas dimensions; source-grid pitch 64 still renders at map pitch 32. Do not restore the reverted sheet zoom feature.

For tall sprites, keep one complete rectangular `group_N` covering the entire image. Give every cell its matching biome tag(s), `decorative`, `city`, matching `group_N`, and `skyscraper` where appropriate. Paint only the bottom ground rectangle `impassable` (without `passable`). Paint upper visual cells `passable`, `overhang` (without `impassable`). The rectangular base and all upper cells must fully cover the group's rectangle. `propLayout.footprint` records the base relative to the full group; runtime uses per-cell tags as the authoritative contract, so SSE export retains behavior. Paint upper cells individually in SSE; imported-sprite tag toggles apply to the whole sprite.

Runtime derives physical placement/occupancy from the base, projects the complete image north, and prepares one final-DPR sprite per group within a 64 MiB budget. Do not bake these images into terrain. Draw them after grounded unit images and before unit HUDs, with northern building bases drawn first. Aircraft remain above them. Keep the occlusion index prepared with the layout, preserve dead-building tombstones, and leave click/drag unit selection independent of decorative imagery. Upper artwork must fit inside map bounds; underlying cells remain traversable according to their own terrain/objects.

Validate actual browser SSE extraction (`extractAll({ alphaCutoff: 16, gap: 0, minArea: 1000 })`, the recorded size ratio), all recorded dimensions, SSE tag export, a route through opaque upper art, visible full-health HUDs, click and drag selection, and destruction revealing the unit. Run `tests/e2e/desertCityOverhangs.test.js` alongside map-source and destructible-city coverage. Hardware 75 FPS acceptance must use a verified hardware GPU; never substitute a software benchmark.

Active low/medium sources contain four columns and five rows. Keep at least one upper row when selecting the lower base rows where the imagery has an overhang. Test all four biome contexts, including soil sharing the temperate atlas, in `tests/e2e/desertCityOverhangs.test.js`. This historical filename now covers surviving medium buildings; select an actual opaque roof above a passable tile when testing unit occlusion.

## Low/medium settlements and scale calibration

There are **six active city targets**: `dtv5_city_{temperate,sand,snow}_{low,medium}`. Each new source has 20 buildings, in four columns/five rows, with source names `cities_{biome}_{level}.webp`. All city layouts are version **6**, invalidating pre-density version-5 metadata; update guards and index pairs together. The two nature profiles remain unchanged. Use `--kind=city` to rebuild all six.

User-approved scale exception: new low imports use **0.5**, medium **0.75**, archived skyline art used **1**. This calibration makes cottages visually smaller than skyscrapers. Keep source originals intact and record actual import geometry and ratios (`source.packing.scale`, `extension.imports.sizeRatio`, original `bbox`, actual `renderRect`). Do not normalize each prop into an arbitrary cell count or introduce runtime zoom. Smallest density-1 cottages have **2×1** ground bases with northern passable/overhang artwork. Other low homes are usually 2×2 (some duplexes 3×2); medium blocks are larger; towers remain at least 3×3. A two-row image wholly within a two-row base can remain a terrain prop, without an overhead cache entry.

Every building cell and propLayout entry carries one `density_1`…`density_10` tag; propLayout also records numeric density. Score architecture independently of size. Inspected new source row scores are low **1,2,3,2,3**, medium **4,5,6,7,5**. Archived skyline sources contained scores 4–10; current bundled art spans 1–7. Snow cells keep `winter`. Actual API extraction must call `setSizeRatio(0.5/0.75)` before importing the corresponding sources, with alpha cutoff 16, gap 0, minimum area 1000. Source component count must be exactly 20.

Settlement maximums repeat **3,7,7,10**. Prefer dense architecture centrally with a 20%-radius core, then taper to one outward. Never fall back above a settlement's permitted score; missing sheets may leave lots empty. Untagged custom groups retain legacy size ordering 1–3. Placement coverage exercises both default two-city maps (including scarce natural props) and eight-city maps with medium fallback when the skyline catalog is absent; the default two seeds form a village and a town. Keep all footprint/road/biome/start/resource exclusions.

Keep the six active overhead catalogs within the existing **64 MiB** cap, verified by the browser test; ordinary ground-only homes are not cached as overlays. Keep final-size preparation outside frames and the indexed HUD/selection layer. Run cityDensity unit/browser checks, cityStreets, source replay/placement coverage and existing overhang/destruction regressions. See [density spec](../../specs/city-density-tiers.md) for the full contract and pending hardware acceptance.

## Reviewed alpha decoration replacements (2026-10-23)

The five `dtv6_decor_{grass,soil,sand,snow,universal}` sets contain 24 props each; `dtv6_shore` has 36; `dtv6_nature_grass` and `dtv6_nature_soil` have 40 each. Grass and soil deliberately have **separate** nature sources, green summer vs earthy autumn. Existing alpha city sets and sand/snow nature are retained. The five dtv2 atlases and dtv3 shore/winter are retired, including persisted editor coordinates; do not recreate them with the terrain compiler.

Run `npm run make:map-sprite-sheets -- --kind=props`. `scripts/map-prop-guides.mjs` records every subject's name and placement tags in reviewed row order. Reuse SSE detection, packing and export; no rectangle crops or resizing. Detect at alpha cutoff 128/min area 1000 except shore's 16 cutoff (higher cutoffs detach pier pieces). Assert counts before packing, preserve native dimensions/alpha, and grow atlases. Do not infer semantic categories from final atlas coordinates. Shore reeds/lilies get explicit compatible biomes; snowy shoreline art gets snow/winter; universal rocks/wrecks remain independent.

Before shipping art, check its placement contract at native size. Onshore rectangles extend inland; offshore rectangles may reach deeper water by their span; crossings rotate the full footprint and use the western source column as land strip. Keep water passable and resources/roads/base clearance intact. Roadside anchors touch streets while their native rectangles can extend inland. One quarter of map seeds place span ≥5 ordinary props first; remaining maps offer all ordinary sizes together, preserving both large farmsteads and smaller cluster variants. Test all four coast normals and replay all default sprites on generated maps. Preserve source provenance and ratios so accidental shrinking is caught automatically. See [replacement specification](../../specs/alpha-decoration-replacements.md).

### Skyline retirement

Do not reintroduce `dtv3_city`, `dtv4_city_sand` or `dtv4_city_snow` through the generator, index, default list or saved SSE metadata. Low/medium sheets remain available for every biome. The settlement density planner retains support for custom high-density art, but bundled maps currently have scores 1–7 and fall back to medium centers. Keep archived sources intact unless their removal is separately requested. Browser occlusion and destruction checks use surviving medium buildings with passable overhangs.
