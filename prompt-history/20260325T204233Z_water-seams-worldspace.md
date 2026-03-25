# 2026-03-25T20:42:33Z
# LLM: copilot (claude-sonnet-4.6)

Water SOT edges still clearly visible after initial timing fix.

Root cause identified: `drawProceduralWater` placed horizontal bands at tile-relative Y
positions (`screenY + (i+1) * bandHeight` where `bandHeight = size/(bandCount+1)`).
This created a double-gap at every tile boundary — bands inside each tile are ~5.5px apart
but the gap *between* the last band of one tile and the first band of the next was ~10px.
The same issue applied to vertical columns.

Additionally, the shimmer overlay used a high spatial frequency (`0.03/zoom`) causing
visible per-tile brightness steps at boundaries.

Fix applied in `src/rendering/mapRenderer.js` → `drawProceduralWater`:
1. Replaced tile-relative band loop with world-space band positions using global band index
   `k` so bands anchor to absolute world Y coordinates and are continuous across tiles.
2. Same world-space approach for vertical column positions.
3. Reduced shimmer spatial frequency from `0.03/zoom` to `0.004/zoom` to prevent
   visible shimmer seams between adjacent tiles.
