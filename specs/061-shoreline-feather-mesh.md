# 061 - Shoreline Feather Mesh Smoothing

## Goal
Soften coastline tile stair-stepping by rendering a lightweight feathered shoreline mesh where land meets water.

## Requirements
- Trace coastline borders from the terrain grid using deterministic local rules.
- Build a narrow strip mesh along coastline segments.
- Render the shoreline overlay after terrain rendering.
- Use a soft-alpha feather texture (no fullscreen post-process).
- Support diagonal/stair coastline transitions with robust segment generation.
- Cache shoreline mesh per terrain chunk for large-map performance.
- Rebuild only affected chunk meshes when nearby terrain mutates.
- Keep chunk-border generation stable so coastline strips do not visually break.
- Add debug mode to show generated mesh lines and triangles.

## Implementation Summary
- Add marching-squares coastline extraction per chunk (+ small neighbor padding).
- Convert contour segments to strip quads for feathered rendering.
- Store strips + debug geometry (`lines`, `triangles`) in chunk cache.
- Use shoreline signatures to skip unchanged chunk mesh rebuilds.
- Invalidate neighboring chunk shoreline signatures on tile mutation.
- Add `gameState.shorelineMeshDebug` flag for debug visualization.

## Non-Goals
- Physically accurate shoreline simulation.
- Terrain modification or tile type conversion.
- Full contour simplification/spline fitting.

## 2026-04-08 Visual Polish Follow-up
- Replaced two-sided contour ribbons with one-sided feather strips generated from direct land-edge-to-water boundaries.
- This removes crossing artifacts in tight zig-zag coastlines while keeping chunk-local rebuilds and stable borders.
