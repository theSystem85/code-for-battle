# 067 - SSE Deterministic 4-bit Road Autotile Mask Generator

## Summary
Add an integrated generator inside the existing Sprite Sheet Editor (SSE) that procedurally builds a deterministic 4-bit road mask spritesheet.

## Requirements
- Generator lives in SSE UI/workflow (no disconnected page).
- Output must be exactly 1024x1024 with 16x16 grid of 64x64 tiles.
- Generate each 4-bit edge connectivity pattern exactly once (16 total).
- Bit order is fixed/documented: top=1, right=2, bottom=4, left=8.
- First 16 tile slots hold generated base masks; remaining tiles stay black.
- Roads are white on black mask.
- Connected edge reaches edge-center and touches border directly.
- Non-connected edge fades into black before border.
- Geometry deterministic, no random/art variants/noise.

## SSE UI additions
- Generator type selector.
- Generator controls: tile size, columns, rows, road width, fade distance, corner radius.
- Bit order display.
- No separate sidebar preview canvas; regenerate directly into the SSE main canvas.
- Optional debug overlay labels rendered on the main canvas.
- Tile inspector by clicking tiles in the main canvas while the `Masks` tab is active.
- Regenerate + export PNG + export WebP actions.
- Group all generator controls under a dedicated sidebar tab named `Masks`.
- Add info bubble explaining debug code semantics (`T/R/B/L`, `1/0`).
- `Masks` tab lives in the top SSE mode-tab row (next to `Static` / `Animated`) and when active it owns the entire sidebar.
- Static/Animated tagging UI must remain available for normal sprite-sheet tagging (including generated mask sheets).

## Layout follow-up
- Group base pattern rotations by column: each pattern family gets one column, rows are the 4 rotation slots.
- Keep all T-junction rotations in one shared column.
- Straight column uses only 2 rows (one per unique orientation).
- Cross column uses only 1 row (no redundant rotations).
- Include an extra full-fill tile (no fade) for fully connected interior street usage.
- Include a dedicated column of 4 full-tile edge-fade variants (left/top/right/bottom fade) for wider multi-tile street composition.

## Geometry follow-up
- Fade must affect only the sides of road parts, not the road endings.
- Fade distance supports `0` (fully hard mask edges).

## Metadata/tagging follow-up
- On generation, bitmask debug labels are also written as per-tile SSE tags so generated sheets can be tagged/filtered immediately.

## API/architecture
- Keep generation logic independent from SSE UI in a reusable module.
- Expose:
  - `generateRoadAutotileMaskSheet(config)`
  - `generateRoadAutotileMaskTile(bitmask, config)`
  - `bitmaskToConnectivity(bitmask)`
  - `connectivityToDebugLabel(connectivity)`

## Validation checks
- Exactly 16 generated patterns.
- No duplicated bitmask patterns.
- Connected edges touch border centers.
- Non-connected edges remain clear at border centers.
- Export/source dimensions exactly 1024x1024 for default config.
