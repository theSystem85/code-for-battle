---
name: map-assets
description: Create and register Code for Battle map decorative (DT) and terrain sprite-sheet assets with SSE tags, biome/season/group contracts, WebP packing, and hybrid organic+SSE placement. Use when adding biome props, lakes, rocks, or new map sprite sheets.
---

# Map Assets Skill

Use this checklist when creating decorative map tiles (DT), biome props, or new static map sprite sheets for Code for Battle.

## Locked product decisions
- **Hybrid:** ship new DT sheets alongside existing organic DT until organic is turned off later. Do not delete organic grass decorative paths.
- **WebP quality:** new map sheets use **85%** compression (`.webp`).
- **Load policy (current):** load **all** new decorative sheets up front (no per-biome lazy-load yet). Design sheet naming so single-biome skipping remains possible later.
- **Camera (new DT art only):** ~**65°** top-down (not 90° orthographic, not isometric), ~**300 m** altitude, photorealistic.
- **Biome-independent tag:** `universal` (not a fifth map biome).
- **Seasons:** encode as SSE tags on sprites: `spring` | `summer` | `autumn` | `winter`.
- **Mixed maps:** multi-tile DT footprints must stay entirely inside **one** biome.
- **Winter/frozen lakes:** tagged `impassable` (and usually `water` + `winter`).
- **Rocks/stones:** include biome-tagged rock groups on the new DT sheets.
- **Cliffs/boulders:** keep on the existing neutral system (`rockCliffsMountains_*` / rock type). Do **not** replace them with DT sheets.

## Biomes and sheets
Map biomes: `grass` | `soil` | `sand` | `snow` (+ `mixed` at map level only).

Create **separate decorative sheets per biome** plus one **universal** sheet:

| Sheet | Path pattern |
|-------|----------------|
| Grass DT | `public/images/map/sprite_sheets/dt_grass_1024_q85.webp` + `.json` |
| Soil DT | `.../dt_soil_1024_q85.webp` + `.json` |
| Sand DT | `.../dt_sand_1024_q85.webp` + `.json` |
| Snow DT | `.../dt_snow_1024_q85.webp` + `.json` |
| Universal DT | `.../dt_universal_1024_q85.webp` + `.json` |

Register every new sheet in:
1. `public/images/map/sprite_sheets/index.json`
2. `DEFAULT_SSE_SHEETS` in `src/ui/mapEditorControls.js`
3. SSE fallback list in `src/ui/spriteSheetEditor.js` (if applicable)

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

Default SSE tag list must include `universal`, `spring`, `summer`, `autumn`, `winter` so SSE can paint them.

## Footprints
Support rectangular footprints (via `group_N`): **1×1, 2×2, 2×1, 1×2, 3×3, 2×3, 3×2**.

After packing, **visually inspect** the sheet and write accurate tags/footprints from occupied cells — do not guess occupancy.

## Art pipeline
1. Generate photorealistic props matching the camera brief (per-prop preferred if full-sheet one-shot quality is poor).
2. Place sources under `tmp/dt-props/` (or equivalent).
3. Pack with `node scripts/pack-biome-decorative-tiles.mjs` (or update that manifest for new props).
4. Inspect output WebP in SSE / image viewer; correct JSON tags/groups.
5. Keep `package-lock.json`; Netlify build stays `npm ci --include=dev && npm run build && npm run test:smoke`.

## Runtime integration
- Integrated mode selects decorative tiles by `tile.biome` + `decorative`, with `universal` + `decorative` eligible on any land biome.
- Grouped decorative selection requires the full rectangle to share one biome on mixed maps.
- Organic DT path remains valid (hybrid). Cliffs/boulders stay on the rock/neutral sheets.
- Occupancy must honor `impassable` tags on selected integrated tiles (frozen lakes).

## Validation
- Open SSE → select each `dt_*` sheet → confirm tags/groups visible.
- Map Settings → enable Custom sprite sheets → ensure DT sheets checked → regenerate map across biomes / Mixed.
- `npm run test:unit`
- `npm run lint:fix:changed`
- Update `TODO/Features.md`, `specs/087-map-decorative-tiles-research.md`, and `prompt-history/`.
