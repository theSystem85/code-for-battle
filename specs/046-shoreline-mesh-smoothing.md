# Spec 046: Feathered Shoreline Mesh Smoothing

## Goal
Add a lightweight shoreline smoothing layer that softens hard land/water tile intersections and staircase diagonals without modifying terrain data or using fullscreen postprocessing.

## Requirements
- Analyze the terrain grid and identify coastline borders where land/street tiles touch water tiles.
- Generate a thin shoreline mesh strip (quad-based triangles) along each coastline edge.
- Render shoreline mesh after terrain with soft alpha feathering from shoreline edge into adjacent water.
- Maintain stable chunk-border ownership logic so shoreline continuity does not visually break between chunks.
- Rebuild shoreline mesh data only when nearby terrain changes.
- Cache/generated shoreline mesh data per chunk for large-map efficiency.
- Include debug mode rendering that visualizes generated shoreline mesh border lines and triangles.

## Non-Goals
- No fullscreen post-processing effects.
- No terrain tile mutation/rewrite for smoothing.
- No mathematically perfect contour extraction requirement (favor robust grid-edge strips).

## Implementation Notes
- Chunk signatures for shoreline mesh should include a 1-tile perimeter to react to neighbor-border changes.
- Mesh generation should treat `airstripStreet` tiles as visual land for coastline detection.
- Debug mode can be toggled via runtime debug flags/state and should remain optional/off by default.

## Acceptance Criteria
- Coastlines display a soft feathered transition layer on top of base terrain.
- Diagonal shore stair-steps are visually softened by overlapping strip segments.
- Terrain mutations near shoreline invalidate only affected chunks (plus local neighbors).
- Shoreline visuals remain contiguous across chunk seams.
