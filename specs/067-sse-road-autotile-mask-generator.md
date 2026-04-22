# 067 — Sprite Sheet Editor deterministic 4-bit road autotile mask generator

## Goal
Integrate a production-usable, deterministic 4-bit road autotile mask generator directly into the existing Sprite Sheet Editor (SSE), with preview, inspection, validation, and export.

## Fixed generation contract
- Export sheet dimensions: **1024x1024**.
- Grid: **16 columns x 16 rows**.
- Tile size: **64x64**.
- Exactly 16 unique 4-bit patterns are generated once each.
- Only first 16 tiles (index 0-15) are populated; all remaining tiles remain pure black.

## Bit model
- Strict bit order: **TRBL**.
  - bit0 = Top
  - bit1 = Right
  - bit2 = Bottom
  - bit3 = Left
- Connectivity values:
  - 1 = connected
  - 0 = not connected

## Rendering rules
- White road mask over black background.
- Connected edges touch the exact border center for their side.
- Non-connected edges fade to black before reaching border center.
- No randomness, no decorative variants, no duplicate connectivity shapes.

## SSE integration
- Add in-sidebar generator panel with:
  - generator selector
  - tile size
  - columns / rows
  - road width slider
  - fade distance slider
  - corner smoothing slider
  - bit-order display
  - tile inspector
  - regenerate button
  - use-as-active-sheet button
  - PNG export
  - WebP export (best effort)
- Include preview canvas with toggleable tile overlays for tile index and TRBL connectivity labels.
- Click tile in preview to inspect tile connectivity.

## Validation checks
- Ensure 16 generated entries and 16 unique bitmasks.
- Validate connected edges touch border center sample.
- Validate non-connected edges do not reach border center sample.
- Validate exported sheet dimensions are exactly 1024x1024.

## Architecture notes
- Keep generator logic independent from UI in `src/tools/autotileMaskGenerator.js`.
- Keep SSE UI orchestration in `src/ui/spriteSheetEditor.js`.
- Export path reuses browser canvas blob download flow.
