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
- Preview canvas with optional debug overlay labels.
- Tile inspector by clicking preview tile.
- Regenerate + export PNG + export WebP actions.

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
