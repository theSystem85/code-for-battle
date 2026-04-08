# Spec 061: Shoreline Smoothing (Shoreline-Only Blend Mask)

## Summary

Add shoreline-only terrain blending in the WebGL path by precomputing chunk-local shoreline edge masks and using a soft alpha transition in the terrain shader to blend land and water at coastlines.

## Requirements

1. Keep the tile-based terrain system intact.
2. Detect shoreline tiles where orthogonal land/water borders exist.
3. Precompute shoreline mask data chunk-locally.
4. In WebGL terrain shader, sample land texture data and procedural water shading and blend using shoreline mask.
5. Use smooth interpolation (`smoothstep`) so shoreline intersections appear softer.
6. Restrict additional blend work to shoreline tiles only.
7. Avoid full-map recompute when a few tiles mutate; invalidate only affected chunks/tiles.
8. Add a debug mode that renders the shoreline mask in grayscale.
9. Do not apply fullscreen postprocessing and do not blur unrelated terrain.
10. Preserve runtime performance characteristics as much as possible.

## Notes

- Shoreline chunk masks are keyed by map-renderer chunk key and rebuilt lazily on demand.
- Tile updates invalidate shoreline chunks in a 3x3 chunk neighborhood around the changed tile to preserve correctness for adjacent coastline transitions.
- Shader path keeps non-shoreline tiles on existing fast path and branches into blend logic only when per-instance shoreline metadata is active.
