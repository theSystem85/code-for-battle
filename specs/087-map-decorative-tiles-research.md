# Spec 087 (research only): Biome-aware decorative map tiles — analysis

**Status:** research / no implementation. Do not treat this as an approved build plan until open questions are answered.

**Date:** 2026-09-22  
**Intent (deferred):** biome-independent + biome-dependent decorative tiles (DT); per-biome sprite sheets with lazy load; SSE tag format; photorealistic ~65° top-down ~300 m; footprints 1×1, 2×2, 2×1, 1×2, 3×3, 2×3, 3×2; seasonal trees/forests, winter/summer lakes, biome rocks; SSE + map-gen integration; repo skill for future map assets.

---

## Findings (summary)

Two decorative systems exist today and neither fully matches the proposed design:

1. **Default organic terrain** (`OrganicTerrain.drawDecoration`) stamps 12 shared low props from `terrain-details.png` onto any land tile (~1/19). Props are meadow-green scrub and are **not biome-tagged**.
2. **Custom integrated SSE mode** selects land art by **`biome` + `passable`/`decorative`/`impassable`**. Decorative candidates require both the biome tag and `decorative`. Current season sheets have **no `soil` land tiles** and **no soil decorative**; sand/snow/grass decorative coverage is uneven.

Legacy grass-only DT under `public/images/map/grass_tiles/passable/decorative/` still drive classification ratios via `grassTileMetadata` even in SSE mode.

---

## Document index (map assets / SSE / biomes)

| Path | Relevance |
|------|-----------|
| `specs/047-sprite-sheet-editor-integrated-rendering.md` | SSE schema, tags, biome land resolution, multi-sheet composition, WebP converter notes |
| `specs/065-sse-rectangular-group-tags.md` | `group_X` rectangles; rocks/decorative/debris grouped selection |
| `specs/064-sse-sidebar-image-converter.md` | SSE converter defaults (q90, 1024², max 2048) |
| `specs/075-mixed-map-biomes.md` | Mixed biomes, weights, shoreline sand, plateau snow |
| `specs/057-map-generation-terrain-controls.md` | Water/rock %, shores, center lake |
| `specs/organic-terrain.md` | Organic atlases, decoration placement, cliff/boulder rules |
| `specs/082-terrain-source-webp.md` | Terrain sources → WebP q85 |
| `specs/080-terraced-cliff-rendering.md` | Cliff atlas (related rock visuals) |
| `public/images/terrain/source/terraced-cliffs-prompts.md` | Built-in imagegen prompts for cliffs |
| `docs/UnitImageAssetPromptTemplate.md` / `docs/BuildingImageAssetGenerationPromptTemplate.md` | Unit/building art (90° map sprites; **not** map DT) |
| `skills.md` + `skills/new-unit/SKILL.md` | Unit/building skill patterns; **no map-asset skill yet** |
| `AGENTS.md` rule 17 | New binaries must be WebP **85%** |
| `TODO/Bugs.md` / `TODO/Features.md` | Historical SSE/biome/DT follow-ups |

---

## Current architecture

### Ground biomes

- Biomes: `grass`, `soil`, `sand`, `snow`, plus mode `mixed` (`src/game/mapBiomes.js`).
- Default ground materials: `meadow.webp`, `soil.webp`, `sand.webp`, `snow.webp` via `terrainAssetManifest.js`.
- Mixed mode partitions land into regions; ocean shores feather sand; lakes do not; optional snow on plateaus.

### Decorative / land classification

- Ratios: `GRASS_DECORATIVE_RATIO = 33`, impassable similar (`src/config.js`).
- `TextureManager.getLandClassificationTag` maps hash → passable / decorative / impassable using **grass_tiles** counts only.
- SSE land resolve (`getIntegratedTileForMapTile('land', …)`): decorative → `selectGroupedTileForMapTile('decorative')` then candidates tagged `[biome, 'decorative']`; else `[biome, 'passable']` excluding decorative/impassable.
- Organic DT: always same 12 variants from details atlas row y=192; no biome filter.

### Why DT feel “grass-bound”

1. Legacy assets live only under `grass_tiles/…/decorative/`.
2. Organic overlays are green scrub regardless of `tile.biome`.
3. SSE requires `decorative` **and** biome tag; soil bucket is empty for land; sand/snow DT sparse; missing bucket → no SSE DT (legacy decorative only if zero SSE candidates for that biome).

### Asset loading

- Custom sheets: all **checked** sheets with tags load when integrated mode applies (`setIntegratedSpriteSheetConfig`); images cached by path.
- Untagged sheets skipped (`hasTaggedIntegratedTiles`).
- **No per-biome lazy sheet load** today — only “selected sheets vs not.”
- SSE UI lazy-loads sheet images on modal open.
- Streets / crystals / combat decals preload as defaults even when custom mode is off.
- `rocks_64x64_1024x1024_q85.webp` is indexed but **has no sidecar `.json`** → contributes no tags until tagged in SSE.

### Group footprints

- Spec 065 + `buildGroupedTagCatalog`: perfect rectangles only; prefer larger area; exclusive to group path.
- Existing groups (debris sheet): 2×2, 4×2, 3×3 — **proposed 2×1 / 1×2 / 2×3 / 3×2 are already expressible**; need authored + tagged assets.

---

## Format specs (SSE JSON)

Canonical contract in `specs/047-…` Data Contract; live examples: `public/images/map/sprite_sheets/*.json`.

```json
{
  "schemaVersion": 1,
  "sheetPath": "images/map/sprite_sheets/seasons_1024_q90_3.webp",
  "tileSize": 64,
  "rowHeight": 64,
  "borderWidth": 1,
  "blendMode": "black",
  "tags": ["passable", "decorative", "impassable", "…", "grass", "soil", "snow", "sand", "rocks", "water"],
  "columns": 16,
  "rows": 16,
  "runtimeNormalization": {
    "sourceTileSize": 64,
    "targetTileSize": 64,
    "scale": 1,
    "requiresUpscale": false
  },
  "tiles": {
    "0,0": {
      "tags": ["passable", "grass"],
      "rect": { "x": 0, "y": 0, "width": 64, "height": 64 },
      "col": 0,
      "row": 0
    }
  }
}
```

**Tag conventions observed**

- Land fill: `passable` + biome; decorative: `decorative` + biome (+ usually `passable`); rocks: `rocks`; streets: `street` + `top`/`right`/`left`/`bottom`/`full` + optional biome; groups: `group_N` only (no bare `group` persisted).
- Compact alternate: `tileEntries` expanded by `src/utils/spriteSheetMetadata.js`.

**Layout / compression conventions**

| Item | Convention |
|------|------------|
| Sheet grid | Usually 16×16 cells on **1024×1024** WebP |
| Cell / SSE tileSize | **64** px (default); border 0 or 1 |
| Runtime map tile | `TILE_SIZE = 32` in `src/config.js` (sheet cells scaled down) |
| Blend | `black` (chroma-key) or `alpha` |
| SSE converter default | q**90**, 1024², max 2048 (`specs/064`) |
| Repo rule for new assets | WebP q**85** (`AGENTS.md`) — **conflicts with converter default / many `*_q90_*` filenames** |
| Terrain sources | WebP q85 (`specs/082`); compiled organic atlases still PNG |

**Existing decorative / terrain sheet paths**

- SSE static: `public/images/map/sprite_sheets/` — streets, seasons×2, crystals, rocks (webp only), rockCliffsMountains, debris (+ `index.json`)
- Animations: `public/images/map/animations/explosion.webp|.json`
- Legacy grass: `public/images/map/grass_tiles/{passable,passable/decorative,impassable}/`
- Organic: `public/images/terrain/{organic-atlas,terrain-details}.png` + `terraced-cliffs.webp`; sources under `public/images/terrain/source/` including `decoration.webp`, biomes, rocks, cliffs

---

## Gaps / risks for the proposed system

1. **Dual pipelines** (organic overlay vs SSE land cells) need a single placement contract.
2. **Soil land/DT missing** in current season tags; soil streets only.
3. **No biome-independent DT tag** today — every SSE decorative is biome-qualified or falls through.
4. **Per-biome lazy sheets** not implemented; enabling all sheets loads all selected WebPs.
5. **Camera conflict**: proposed ~65° / ~300 m vs unit skill 90° orthographic vs cliff prompts “overhead oblique.”
6. **Compression policy clash**: AGENTS 85% vs SSE converter 90% / q90 assets.
7. **Season / lake variants** have no first-class tags (`summer`/`winter`/`forest`/etc.).
8. **Grouped multi-tile DT** work for rocks/debris; season decorative tiles are mostly 1×1 ungrouped.
9. **Performance**: more sheets + large groups → decode/memory; must respect 75 FPS / prepared-rendering gates.
10. **Map gen** does not place named DT features; rock % and organic sparse hash only.

---

## Recommended approach sketch (no code)

1. Freeze tag vocabulary: keep biomes + `decorative` / `passable` / `impassable` / `rocks` / `water`; add explicit **`universal` (or omit biome)** for biome-independent DT; optional season tags if needed.
2. Author sheets as **one atlas per biome** (plus one universal sheet); register in `index.json` with sidecars; use `group_N` for all multi-tile footprints listed.
3. Extend runtime selection: pool universal DT for all biomes; biome DT only when `tile.biome` matches; keep organic overlays off or replaced when new DT path is active.
4. Lazy-load: load universal + sheets for biomes present on the generated map (or currently selected Map Settings biomes), not the full checklist.
5. Align generation prompts to one camera standard; document in a new `skills/map-assets/SKILL.md` mirroring unit/building skills.
6. Resolve WebP quality (85 vs 90) before bulk generation.
7. Do not implement until open questions below are answered.

---

## Open questions for the human

1. Primary pipeline: **replace organic DT**, **SSE-only when Custom sheets on**, or **always-on hybrid**?
2. Camera: **65° ~300 m** for DT only, or also ground/units/buildings?
3. Biome-independent tag name and whether those tiles may still tint/blend with ground?
4. Confirm footprints: only listed sizes, or also larger forests/lakes as multi-group clusters?
5. Seasons: map setting, mixed-region attribute, or sheet naming only?
6. Lakes: decorative overlay vs `water` tile replacement; winter ice passable?
7. Rocks: extend `rocks` groups by biome, or keep neutral cliffs + biome DT rocks separately?
8. WebP quality: enforce **85** everywhere or allow **90** for map sheets?
9. Lazy load trigger: biomes present on map, Map Settings selection, or viewport?
10. Should new map-asset skill live under `skills/map-assets/` and supersede parts of `skills.md`?
11. Mixed maps: may a 3×3 forest straddle two biomes?
12. Default game (Custom sheets off): ship new DT in organic path, or require Custom sheets?

---

## Verification note

Research-only; no unit/lint/E2E runs required for behaviour. Re-validate after any future implementation against `npm run test:unit`, `npm run lint:fix:changed`, and the 75 FPS protocol in `performance_improvement.md`.
