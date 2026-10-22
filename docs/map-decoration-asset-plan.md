# Proposed map decoration sheets

These are proposals, not generated or registered assets. Before adding new art, follow [map-assets](../skills/map-assets/SKILL.md): the same camera, source-native dimensions, transparent WebP q85, explicit biome/category/passability tags, reproducible SSE extraction and catalog placement tests. Use one source image per biome/theme when possible. Supply isolated sprites with generous truly transparent gutters; avoid touching trees/buildings and low-alpha backdrop noise. Keep variation in actual object size; do not normalize all art to equal cells.

| Priority | Proposed source/sheet | Missing visual role | Integration |
| --- | --- | --- | --- |
| 1 | `temperate_vegetation_rocks_lakes` | Temperate equivalent of the new native-resolution sand/snow collection: oak, birch, conifers, shrubs, mossy boulders, small ponds and larger lakes | `grass`/`soil`; trees/rocks/water plus passability, native grouped footprints. Existing temperate art remains available. |
| 2 | `forest_floor_temperate` / `forest_floor_snow` | Fallen logs, stumps, root plates, leaf litter, mushrooms, pine needles and snow-covered deadwood | Forest-edge props and passable `ground_detail`; larger fallen trunks use explicit blocking footprints. Forest-aware undergrowth would need a placement rule for non-tree forest tags. |
| 3 | `city_edges_<biome>` | Hedges, fences, gardens, small sheds, bus stops, street lamps and roadside furniture to join large buildings to their surroundings | City/roadside matching-biome props; long fence segments need orientation/placement support. Keep clear road/path corridors. |
| 4 | `wetlands_temperate` | Marsh grasses, cattails, reeds, mud banks and riparian shrubs around ponds and rivers | Existing onshore/offshore/shore_trans contracts; inland lake-edge placement may need an adjacency rule for decorative lakes. |
| 5 | `rural_<biome>` | Orchards, barns, hay, wells, field-edge hedgerows and abandoned farm equipment | Existing farm clusters and roadside/ruin categories; biome-specific variants. |
| 6 | `industrial_ruins_<biome>` | Collapsed warehouses, broken utility structures, abandoned railway pieces and old machinery | Existing ruin clusters; static neutral props. Railway continuity/orientation needs a dedicated rule if desired. |

## Workflow improvements now available

- Rebuild a category directly: `npm run make:map-sprite-sheets -- --kind=city` or `--kind=nature`; omit the filter for all five sources.
- Profiles centralize source paths, matching biomes, SSE alpha settings and explicit touching-component guides. Source SHA-256 and import rectangles make each output reproducible.
- Packing copies extracted pixels at scale 1, reserves the complete padded footprint and grows the atlas; it never shrinks a sprite to save canvas space.
- `tests/unit/mapSourceSheets.test.js` verifies all 737 native-size import dimensions and alpha silhouettes after encoding, alongside tags, ownership, footprint bounds and transparency.
- `tests/unit/defaultDtvPlacementCoverage.test.js` checks every bundled sprite can reach a generated map. Larger props run before small stone scatter; forests do not crowd the rest of the catalog out.
- Repacking increments the layout version and invalidates saved editor coordinates, preventing older metadata from applying to newly packed pixels.

Future automation worth adding when more source collections arrive: a reviewed profile manifest for new source categories, contact sheets that label each isolated sprite with its ID and tags, and a one-command build/audit/map-preview report. Keep pixel-preservation checks mandatory; a contact-sheet preview must never become a source for the game atlas.
