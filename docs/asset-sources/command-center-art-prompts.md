# Command Center and perk badge art: provenance

- **Generated:** 2026-11-21 by Grok Bot, using its built-in image generation tool (Grok Imagine).
- **Approved:** by Patrick Beyer on 2026-11-21. He picked Command Center variant 2 and all of the proposed perk badges.
- **Feature spec:** [specs/command-center-perks.md](../../specs/command-center-perks.md).
- **Source images:** stored in `docs/asset-sources/command-center/` as WebP q85 re-encodes of the generated JPEGs.
- **Rebuild:** `python3 docs/asset-sources/command-center-build.py` recreates every shipped file from those sources.

| Shipped file | Source | Post-processing |
|---|---|---|
| `public/images/map/buildings/command_center.webp` (384×384 RGBA) | `command-center/command-center-map-source.webp` | magenta chroma key, despill, crop to bbox, square pad, Lanczos to 384, neutralise 6 fringe pixels, WebP q85 (alpha 100) |
| `public/images/sidebar/command_center.webp` (256×256 RGB) | `command-center/command-center-sidebar-source.webp` | Lanczos to 256, WebP q85 |
| `public/images/perks/<perk-id>.webp` ×35 (256×256 RGBA) | `command-center/perk-badges-sheet-a.webp`, `-b.webp`, `-c.webp` | per-cell badge detection (ignoring the printed numbers), circular alpha with the background flood-removed, Lanczos to 256, WebP q85 (alpha 100) |
| (proposal only) | `command-center/cc-map-variants-sheet.webp` | the 12-variant pick sheet; Patrick picked cell 2 |

## Prompts

### 1. Command Center proposal sheet (`cc-map-variants-sheet.webp`)

Reference images: the existing map sprites `hospital.webp`, `fire_department.webp`, `technology_research_center_map.webp` and `construction_yard.webp`.

> Game asset proposal sheet: a clean 4 columns x 3 rows grid of 12 distinct variations of a military RTS 'Command Center' headquarters building, each one isolated in its own equal square cell on a flat uniform muted grey-green background (#5a6e50), no ground plane, small soft contact shadow only. Every building has a square 3x3-tile footprint and is shown from the same isometric three-quarter top-down camera (about 45 degree rotation, about 35-40 degree elevation) exactly matching the style of the reference building sprites: semi-realistic painted 3D render, grey concrete, weathered steel, beige accents, crisp edges, readable silhouette at small size. Each variation must look clearly different: 1) armored bunker HQ with tall comms antenna mast, 2) building with large white radar dome and satellite dishes, 3) … 12) high-tech command center with a large holo-table glowing under a transparent roof. Put a small white number 1 to 12 in the top-left corner of each cell, no other text. Consistent lighting from top-left, same scale for every building.

### 2. Command Center map source (`command-center-map-source.webp`)

Reference images: cell 2 of the proposal sheet, `hospital.webp` and `technology_research_center_map.webp`.

> Single game sprite, high resolution: exactly the same military RTS Command Center building as the first reference image (grey concrete multi-block headquarters with a large white radar dome on a central tower and two satellite dishes on the roof, blue-tinted windows, square concrete base plate), square 3x3-tile footprint, shown from the same isometric three-quarter top-down camera as the other reference building sprites (about 45 degree rotation, about 35-40 degree elevation), semi-realistic painted 3D render matching the reference sprites' style, lighting from top-left. The building is centered and fills about 90% of the frame. Background: perfectly flat uniform pure magenta (#FF00FF) everywhere around the building for clean cutout, no ground shadow outside the base plate, no text, no numbers, no other objects.

### 3. Build button source (`command-center-sidebar-source.webp`)

Reference images: the map source above and the sidebar buttons `hospital.webp`, `radar_station.webp` and `fire_department.webp`.

> Photorealistic RTS game build-menu button image, square: the exact same Command Center headquarters building as the first reference image (grey concrete multi-block HQ with a large white radar dome on a central tower, two satellite dishes on the roof, blue-tinted windows, square concrete base plate), shown as a realistic three-quarter elevated hero view standing in a sunny desert military base with dry sand ground, sparse shrubs and distant mountains under a clear blue sky, exactly matching the photographic style, lighting and framing of the other reference build-button images (hospital, radar station, fire department). Building centered and filling most of the frame, fully opaque background, no text, no logos, no people.

### 4. Badge sheet A (`perk-badges-sheet-a.webp`): unit control (cyan) and base build (amber)

No reference image.

> Game UI icon sheet: a precise 4x4 grid of 16 round futuristic military sci-fi perk badges on a flat dark navy background (#0b1220), each badge centered in its own equal square cell with generous spacing, all the same size and the same visual family: brushed gunmetal circular rim with fine tech engravings, glossy dark glass inner disc, a single bright glowing holographic emblem in the center, no text inside the badges. Cells 1 and 9 are larger 'start' badges with a hexagonal crest frame. Top two rows use a CYAN glow color, bottom two rows use an AMBER/ORANGE glow color. Emblems by cell: 1 crosshair over a tank silhouette, 2 heartbeat monitor line with a small fuel gauge, 3 globe with radio signal rings, 4 radar sweep screen with a red enemy blip, 5 wrench crossed with a supply crate, 6 two crossed tank shells, 7 four-way movement arrows, 8 jet fighter silhouette above a helipad H, 9 building blueprint with a construction crane, 10 stack of coins with a lightning bolt, 11 three small building icons with a tally counter, 12 binoculars, 13 power plant cooling tower, 14 medical cross with a wrench, 15 factory with a gear, 16 fortified wall with a gun turret. Small white number 1-16 under each badge, no other text.

Cells 1–16 map to `cc.unit.start`, `cc.unit.if.own`, `cc.unit.if.world`, `cc.unit.if.sensing`, `cc.unit.do.service`, `cc.unit.do.combat`, `cc.unit.do.movement`, `cc.unit.do.air`, `cc.base.start`, `cc.base.if.economy`, `cc.base.if.census`, `cc.base.if.enemies`, `cc.base.do.economy`, `cc.base.do.support`, `cc.base.do.production` and `cc.base.do.defence`.

### 5. Badge sheet B (`perk-badges-sheet-b.webp`): base defence (red) and unit build (green)

Reference image: sheet A.

> Same style as the reference badge sheet: a precise 4x4 grid of 16 round badges … Top two rows glow RED, bottom two rows glow GREEN. Emblems: 1 defensive gun turret in front of a shield (hexagonal crest), 2 circular perimeter radar with a dotted defense ring, 3 gun turret with a small health and ammo gauge, 4 electric power pylon with a lightning bolt, 5 raised open palm stop hand, 6 bullseye target circle, 7 padlock inside a crosshair, 8 gun turret with curved rotation arrows, 9 factory assembly line conveyor carrying a tank (hexagonal crest), 10 stack of coins with an upward arrow, 11 clipboard roster with small unit silhouettes, 12 broken military dog tag, 13 radar screen showing three red enemy tank dots, 14 front view of a battle tank, 15 ambulance truck with a cross, 16 waving flag with a forward arrow.

Cells 1–15 map to `cc.def.start`, `cc.def.if.sensing`, `cc.def.if.own`, `cc.def.if.world`, `cc.def.do.discipline`, `cc.def.do.engage`, `cc.def.do.lock`, `cc.def.do.manual`, `cc.prod.start`, `cc.prod.if.economy`, `cc.prod.if.census`, `cc.prod.if.losses`, `cc.prod.if.enemies`, `cc.prod.do.ground` and `cc.prod.do.support`. Cell 16 was rejected because it had a medical cross, and is not shipped.

### 6. Badge sheet C (`perk-badges-sheet-c.webp`, regenerated once)

Reference image: sheet A.

> A precise 2x2 grid of 4 round badges in the same style … Cell 1 emerald GREEN: helicopter rotor blades crossed with a jet fighter silhouette. Cell 2 GREEN: ship anchor in front of a warship silhouette on waves. Cell 3, the prestige CAPSTONE badge: crimson red glow with a polished GOLD rim, laurel wreath and four small gem inlays (cyan, amber, green, red), emblem a defensive gun turret with three bright gold five-pointed stars arched above it. Cell 4 GREEN: a military deployment order symbol, a large bold arrow sweeping from a small factory icon toward a red target crosshair with a tiny triangular pennant. Absolutely no plus sign, no cross, no medical symbol.

Cells 1–4 map to `cc.prod.do.air`, `cc.prod.do.naval`, `cc.def.capstone` and `cc.prod.do.orders`. The first attempt is not shipped, because its cell 4 copied the medical cross from sheet B.
