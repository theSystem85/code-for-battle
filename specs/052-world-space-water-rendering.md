# 052 - World-space seamless water rendering

## Summary
Replace frame-based tile water animation with deterministic world-space layered water rendering and shoreline foam masks.

## Requirements

1. Water animation is continuous across tile borders.
2. Water movement is based on world-space coordinates, not per-tile local animation.
3. Tile logic remains unchanged for gameplay/pathfinding.
4. Shore foam appears only where water neighbors non-water terrain.
5. Rendering remains deterministic and multiplayer-safe.
6. Performance must remain acceptable for large RTS maps.
7. Renderer exposes tuning parameters for speed/scales/distortion/highlight/foam/tint/depth.
8. Debug toggles must support shoreline overlay and foam visibility.

## Implementation notes

- Introduce dedicated `WaterRenderer` module for layered world-space rendering.
- Compute shoreline masks as compact bitmasks from terrain adjacency.
- Keep renderer integration modular in `MapRenderer`.
- Avoid tile-sheet frame-based animation in final water path.

## Validation

- Add an E2E test that configures a deterministic custom map with coastline and verifies water debug stats/shoreline behavior.
- Run lint + targeted E2E.
