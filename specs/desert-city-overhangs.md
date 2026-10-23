# Desert city ground footprints and upper artwork

User approved 20–24 detailed transparent buildings and replacing the default desert city sheet. Generate 20 buildings in the existing photorealistic approximately 65° camera style with warm sandstone, flat roofs and varied towers. Use the 3×3 vehicle factory as the scale reference. Physical bases must be at least 2×2, towers at least 3×3. This source yields bases from 3×2 to 4×3 and eight towers with three or four rows of projected upper imagery.

## Asset contract

`cities_sand_tall.webp` is the new source. Replay SSE's connected-alpha extraction with cutoff 16, gap 0, minimum area 1000. Preserve each isolated component's pixel dimensions and alpha. The builder packs native pixels into a growing 64px grid, with minimum two-pixel insets, at ratio 1. Source and atlas use WebP quality 85, alpha quality 100. Target is `dtv4_city_sand.webp` with layout version 5; reject earlier saved metadata. Other biome sheets are unchanged.

Per-cell biome/category/group tags cover the full image rectangle. Lower rectangular ground cells are `impassable`. Upper cells are `passable`, `overhang`, without `impassable`. Towers also carry `skyscraper`. `propLayout.footprint` documents the relative ground rectangle. Runtime derives the physical rectangle from cell tags so SSE export is sufficient; partial/nonrectangular bases are rejected. No sheet zoom factor is introduced.

## Placement, rendering and interaction

Place and reserve only physical bases within one biome, maintaining existing roads, spacing and base/resource exclusions. Towers favor inner city lots; smaller bases favor outskirts. Require full projected artwork inside map boundaries. Upper projected cells preserve their underlying terrain occupancy; an independent object can still block them.

Prepare one complete image per group at final canvas density during sheet configuration and controlled DPR changes. Budget 64 MiB; publish prepared images only after all are built. Skip these sprites in Canvas/WebGL/WebGPU terrain paths. Draw complete images once per visible living building after grounded unit bases and before HUDs, ordered by the southern edge of their bases. Aircraft remain above. Cull offscreen imagery and apply existing city/base visibility rules. Ground footprints own shared neutral HP and attack lookup; projected upper cells are not building attack targets. Destruction frees only physical occupancy and makes the visual and its occlusion disappear. Save data retains only persistent building state, never image/canvas handles.

Prepare a per-map linked occlusion index outside render loops. HUD lookup uses unit centers, constant-time tile access and only overlapping entries. Occluded healthy units receive a visible health bar; selected units also have their selection marker drawn above the image. Existing click and drag hit testing uses unit coordinates and therefore remains available behind the image. Occupancy updates retain center-based coordinates and self-exclusion.

## Render work audit

One lookup per visible unit overlay per animation frame, independent of total city count; no city scans or allocations per unit. At 500 visible units and 75 Hz this is 37,500 tile lookups/second (DPR does not change lookup work). A single prepared draw per visible city per frame replaces terrain-baked imagery for these groups. At 100 visible buildings and 75 Hz this is 7,500 draws/second; pixel work scales with their visible image bounds and DPR squared (DPR 2 = 4×, DPR 3 = 9×). Full sand atlas has 16 columns and 29 rows; the cached group rectangles total 351,232 logical pixels: 1,404,928 bytes at DPR 1, 5,619,712 at DPR 2 and 12,644,352 at DPR 3, below the 64 MiB cap. No per-frame resizing, mask creation, mapwide fills or source raster construction. Linked index entries are allocated only during layout preparation.

Hardware acceptance at 75 FPS is **pending Patrick's verified hardware GPU**. No software-GPU benchmark was run. This environment's functional headless Chromium checks cannot certify the frame-time gate.

## Validation

- Unit: footprint occupancy and straight-line route behind roof, shared HP, attack targeting, final-density preparation, draw ordering/culling/fog, healthy HUD and selection marker, invalid masks, destroyed visual/index, save serialization.
- Asset replay: all 20 native dimensions and alpha silhouettes, packing bounds and all-default placement coverage; every biome's existing sources remain validated.
- Chromium: actual SSE extracts 20 native sprites and grows the sheet; version-5 export preserves upper tags; default maps use replacement art; a moving unit crosses opaque upper pixels, keeps its HUD, supports actual click and drag selection, and reappears after destruction.
- Broader commands/results recorded in the corresponding change note. Full unrelated Playwright suite and GPU/performance scenarios are not run; focused SSE/map/destruction coverage is used in this headless environment.
