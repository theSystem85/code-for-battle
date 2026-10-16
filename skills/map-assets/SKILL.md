---
name: map-assets
description: Create and register Code for Battle map decorative (DT) and terrain sprite-sheet assets with SSE tags, biome/season/group contracts, WebP packing, and hybrid organic+SSE placement. Use when adding biome props, lakes, rocks, or new map sprite sheets.
---

# Map Assets Skill

Use this checklist when creating decorative map tiles (DT), biome props, or new static map sprite sheets for Code for Battle.

## Locked product decisions
- **Hybrid:** ship new DT sheets alongside existing organic DT until organic is turned off later. Do not delete organic grass decorative paths.
- **WebP quality:** new map sheets use **85%** compression (`.webp`).
- **Load policy (current):** load **selected** optional decorative sheets during preparation (no per-biome lazy-load yet). Design sheet naming so single-biome skipping remains possible later.
- **Camera (new DT art only):** ~**65°** top-down (not 90° orthographic, not isometric), ~**300 m** altitude, photorealistic.
- **Biome-independent tag:** `universal` (not a fifth map biome).
- **Seasons:** encode as SSE tags on sprites: `spring` | `summer` | `autumn` | `winter`.
- **Mixed maps:** multi-tile DT footprints must stay entirely inside **one** biome.
- **Winter/frozen lakes:** tagged `impassable` (and usually `water` + `winter`).
- **Rocks/stones:** include biome-tagged rock groups on the new DT sheets.
- **Cliffs/boulders:** keep on the organic terrain system (`type === 'rock'` cells drawn with `images/terrain/terraced-cliffs.webp`). The restored `rockCliffsMountains_*` sheet remains a default; do **not** add cliffs to DT sheets.
- **Ground:** plain ground always comes from the organic terrain art in `public/images/terrain/`. Do not add custom grass/soil/sand/snow ground sheets; DT sheets only carry decorations.
- **Multi-tile placement:** the map generator places multi-tile `group` sprites first from the sheet JSON (see spec 120), so a group must be fully tagged on the sheet with its biome and `decorative`.

## Biomes and sheets
Map biomes: `grass` | `soil` | `sand` | `snow` (+ `mixed` at map level only).

Create **separate decorative sheets per biome** plus one **universal** sheet:

| Sheet | Path pattern |
|-------|----------------|
| Grass DT | `public/images/map/sprite_sheets/dtv2_grass.webp` + `.json` |
| Soil DT | `.../dtv2_soil.webp` + `.json` |
| Sand DT | `.../dtv2_sand.webp` + `.json` |
| Snow DT | `.../dtv2_snow.webp` + `.json` |
| Universal DT | `.../dtv2_universal.webp` + `.json` |

Register dtv2 sheets in `OPTIONAL_SSE_SHEETS` in `src/ui/spriteSheetRegistry.js`.
Keep `DEFAULT_SSE_SHEETS` and `index.json` aligned with the seven main defaults.
Both Map Settings and SSE offer optional sheets; they start unchecked in Map Settings.
An explicit empty custom selection must behave exactly like disabled custom mode.
Tag every cell and propLayout entry of ruins with `ruins`; preserve other tags.
Ruin anchors use seeded, biome-matching clusters with minimum spacing.

## Sheet format (SSE contract)
Typical sheet (match existing seasons/debris sheets):
- **1024×1024** WebP, quality **85**
- **16×16** cells, `tileSize` / `rowHeight` **64**, `borderWidth` **1**
- Content rect per cell: **62×62** inset by the border
- `blendMode`: usually `"black"` (black chrome-key empty cells)
- Runtime map `TILE_SIZE` remains **32**; SSE metadata stays at source tile size 64

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
Support rectangular footprints (via `group_N`): **1×1, 2×2, 2×1, 1×2, 3×3, 2×3, 3×2**.

After packing, **visually inspect** the sheet and write accurate tags/footprints from occupied cells — do not guess occupancy.

## Art pipeline
1. Generate photorealistic props matching the camera brief (per-prop preferred if full-sheet one-shot quality is poor).
2. Place sources under `tmp/dt-props/` (or equivalent).
3. Pack with the Sprite Sheet Editor flow (`skills/extend-sprite-sheet/SKILL.md`): new 6-column 64 px sheet, Extract all, resize each sprite to its real size (1 tile ~ 10 m; vehicles, trees and small props 1x1), Compact, export, then tag every tile with `[biome|universal, decorative, passable|impassable]` plus `group_N` on multi-tile sprites, and save as WebP q85.
4. Inspect output WebP in SSE / image viewer; correct JSON tags/groups.
5. Keep `package-lock.json`; Netlify build stays `npm ci --include=dev && npm run build && npm run test:smoke`.

## Runtime integration
- Integrated mode selects decorative tiles by `tile.biome` + `decorative`, with `universal` + `decorative` eligible on any land biome.
- Grouped decorative selection requires the full rectangle to share one biome on mixed maps.
- Organic DT path remains valid (hybrid). Cliffs/boulders stay on the rock/neutral sheets.
- Occupancy must honor `impassable` tags on selected integrated tiles (frozen lakes).

## Validation
- Open SSE → select each `dtv2_*` sheet → confirm tags/groups visible.
- Map Settings → enable Custom sprite sheets → ensure DT sheets checked → regenerate map across biomes / Mixed.
- `npm run test:unit`
- `npm run lint:fix:changed`
- Update a dedicated `docs/changes/` note, feature spec, versioned release notes, and `prompt-history/`.
