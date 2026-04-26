# Spec 041: Sprite Sheet Editor deterministic 4-bit road autotile mask generator

## Goal
Add a production-usable generator to the existing Sprite Sheet Editor (SSE) that procedurally builds a strict 4-bit road mask sheet for RTS autotiling.

## Bit order (must be explicit and stable)
- LSB→MSB mapping:
  - Top = `1`
  - Right = `2`
  - Bottom = `4`
  - Left = `8`
- Connectivity bits are binary (`0` = disconnected, `1` = connected).
- Generate each bitmask `0..15` exactly once.

## Output constraints
- Sheet size: exactly `1024x1024`.
- Grid: `16x16`.
- Tile size: `64x64`.
- Only first 16 tiles contain generated base connectivity set.
- All remaining tiles remain pure black.

## Geometry constraints
- White roads on black mask.
- Connected edges must touch the tile border center.
- Disconnected edges must not reach border center and must fade into black before the border.
- Road width is globally consistent across all 16 patterns.
- Deterministic rendering only (no randomness, no variants in base set).

## SSE integration requirements
- Add generator panel inside existing SSE UI (no disconnected page).
- Include controls for:
  - generator type
  - tile size
  - sheet columns/rows
  - road width
  - fade distance
  - corner smoothing
  - regenerate
  - export
- Add dedicated preview canvas.
- Add tile overlay/debug labels toggle (`index` and `T/R/B/L` bits).
- Add tile click inspector to show selected tile connectivity.
- Add export options:
  - PNG
  - WebP (if browser supports export encoder)

## Architecture requirements
- Keep generation logic independent from UI.
- Separate concerns:
  - connectivity conversion
  - tile geometry/rasterization
  - sheet assembly
  - validation
  - editor integration/export

## Validation requirements
- Ensure 16 unique connectivity masks exist.
- Ensure no duplicates.
- Ensure connected edges reach border center.
- Ensure disconnected edges do not hit border center.
- Ensure export dimension remains exactly 1024x1024.
