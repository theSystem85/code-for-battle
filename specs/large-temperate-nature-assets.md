# Larger grass and soil woodland, lake and stone assets

Add two alpha source/atlas pairs, `dtv7_nature_grass_large` and `dtv7_nature_soil_large`, alongside existing art. Each has 24 props: eight woodland groups, eight lakes/ponds and eight rock/stone formations. Match the existing camera/style, use green summer foliage for grass and earthy autumn foliage for soil, and never offer either set to sand/snow. Every new sprite must have a default map placement path.

## Art and world scale

Use the existing map-assets/SSE workflow: isolate source silhouettes with the real detector, pack and export them with source hashes, original bounds, exact import ratios, reference bounds, tile spans and fully tagged footprints. Original generated PNGs stay outside the repository. Source and target repository images use WebP quality 85 / alpha quality 100. Detection must yield exactly 24 sprites per source at alpha cutoff 128, gap 0 and minimum area 1000.

Larger woodland sprites contain more ordinary trees and coherent clearings, not enlarged individual trees. Reference individual crowns against existing ~65–80 atlas-pixel trees. Larger lakes extend water/banks; keep reeds and bank stones consistent with existing art. Low rocky formations contain multiple normal boulders, without adding cliffs or mountains. Compare rendered groups beside the 3×3 factory and a single oak before shipping.

`scripts/large-nature-profiles.mjs` records reviewed per-prop reference rectangles and semantic tags. Apply one offline scalar `min(maxScale, referenceWidth/sourceWidth, referenceHeight/sourceHeight)` and round dimensions. For these two composite sources, explicitly allow maxScale 2 to recover normal-scale details drawn within small source panels; older profiles retain their existing maxScale 1. No stretching, fixed-canvas shrinking or runtime zoom/resizing is introduced. Reserve ceil((dimension+4)/64) cells and grow the atlas. Actual outputs include 5×4 woods, 6×6 lakes, 2×2/3×2 boulder groups and 1×1 loose stone patches. The factory is a reference for detail scale, not a maximum size for a forest/lake.

See the [complete scale report](../docs/asset-reports/2026-10-24-large-nature-scale-review.md) and [map-size comparison](../docs/asset-reports/large-nature-map-scale-comparison.webp).

## Tags, placement and preparation

Every prop/cell has its biome, season, decorative, group_N and exactly one passability tag. Woods use trees/impassable; lakes use water/lake/impassable; boulder/outcrop formations use rocks/impassable; loose river/fieldstone formations use rocks/stones/passable. Retain one group across every rectangular footprint. Do not add landmark caps to ordinary lakes or woods, or shore classes to inland lakes.

Discover and enable both pairs through the bundled registry and keep index.json aligned. Version 1 is the current layout; future repacking must bump the guard. Existing opt-outs remain respected and new default pairs are automatically enabled. Preserve existing forest density fields, seeded formation rules, complete-footprint biome/resource/road/start clearance and spacing. Larger forest groups enter the same prepared forest pass; lakes and boulders use ordinary prepared placement and stone groups the existing scatter pass. Keep sand/snow art and all older atlases unchanged.

All resampling stays offline. Runtime rendering/layout algorithms are unchanged; the two target images add bounded static assets, with dimensions within existing texture limits. Do not add per-frame entity scans or resizing. Hardware 75 FPS acceptance remains pending on Patrick's qualifying GPU, and no graphics benchmarks are run without verified hardware.

## Verification

Replay all source extraction and compare every resized alpha pixel against original component data at the recorded ratio. Verify all 48 props, category counts, biome/season restrictions, natural relative dimensions, tags, spans, q85 alpha images and registration. Generate real maps with all defaults and require every sprite, including each new large lake and forest, to appear across samples. Browser SSE must load/export both sheets and real browser layouts must contain biome-matching woods, impassable lakes and rocks, with large groups present.

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Extraction | Rebuild each dtv7 target with its named profile and inspect SSE | Exactly 24 clean alpha imports per source; recorded aspect-preserving ratios and q85 | 1: U05433 | 1: E00229 |
| T02 | Scale | Inspect the oak/factory comparison | Normal-scale crowns/boulders; 5×4 woods, 6×6 broad lake, 1×1 small stones | 1: U05458 | 1: E00229 |
| T03 | Biomes | Generate grass and soil maps | Woods/lakes/rocks present; matching summer/autumn tags; no sand/snow eligibility | 1: U05458 | 1: E00229 |
| T04 | Registration | Load stored selections, open both pickers and regenerate defaults | Both pairs enabled by default; every old/new sprite has a placement path | 3: U04162, U05459, U01221 | 1: E00057 |

- [x] T01 SSE replay and export verification
- [x] T02 Visual map-size comparison and numeric size contracts
- [x] T03 Browser biome placement checks
- [x] T04 Default registry/catalog placement checks
- [x] Final full-suite/lint/build results recorded in the change note
- [ ] Qualifying-hardware 75 FPS acceptance by Patrick
