# 067 — SSE deterministic 4-bit road autotile mask generator

## Goal
Add an integrated, deterministic autotile mask generator to the existing Sprite Sheet Editor (SSE) for a strict 4-bit road family.

## Scope
- Extend existing SSE UI/workflow (no disconnected demo page).
- Generate and preview a deterministic 16-pattern road mask set.
- Export generated mask from SSE.
- Keep generation logic modular/reusable.

## Bit order (canonical)
- `top=1`, `right=2`, `bottom=4`, `left=8`.
- Displayed to the user as `TRBL` / `T=1 R=2 B=4 L=8`.
- Tile index == bitmask value for the base 16 generated tiles.

## Sheet constraints
- Output: `1024x1024`.
- Grid: `16 x 16`.
- Tile size: `64x64`.
- Generate exactly 16 unique patterns once each.
- Fill only required tiles (indices `0..15`); keep remaining tiles pure black.

## Rendering constraints
- White roads on black background.
- Connected edges reach/touch the exact border center.
- Non-connected edges fade to black before border (no border touch).
- Consistent road width across all patterns.
- Deterministic output (no randomization/noise/variants).

## SSE integration
- Add Autotile panel with controls:
  - generator type selector
  - tile size, cols, rows
  - road width, fade distance, corner smoothing
  - bit-order display
  - debug overlay toggle
  - tile inspector
  - regenerate, export PNG, export WebP (if supported)
- Click tile in SSE canvas preview to inspect index/connectivity when generator mode is active.
- Overlay labels can show tile index + connectivity pattern.

## Validation
Generator performs validation checks for:
- exactly 16 unique connectivity patterns
- no duplicates
- connected edges touching border center
- non-connected edges not touching border center
- export dimensions matching configured sheet dimensions
