# Spec 066: Biome-aware tagged street SSE rendering defaults

## Summary
Use `images/map/sprite_sheets/streets23_q90_1024x1024.webp` as a default static SSE option and route integrated street tile selection through adjacency tags (`top`, `bottom`, `left`, `right`) plus active biome tags (`grass`, `soil`, `snow`, `sand`).

## Requirements
1. The default static SSE sheet list/index must include `streets23_q90_1024x1024.webp` so it appears in Map Settings sheet selection by default.
2. For integrated street rendering, candidate tiles must include the `street` tag.
3. Street candidate selection must prioritize tiles whose directional tags match real street neighbors on the map (`top/bottom/left/right`).
4. Directional tags that are not valid for current neighbors must not be selected when better valid candidates exist.
5. If multiple candidates are valid, select the one matching the highest number of valid direction tags.
6. Street selection should prefer tiles matching the active biome tag, with fallback to generic `street` tiles if no biome-tagged candidate exists.
7. SOT rendering should be disabled for street host tiles (land/water behavior unchanged).

## Acceptance
- With integrated mode enabled and default sheets loaded, street tiles are sourced from the tagged streets sheet by default.
- Intersections/turns/dead-ends match expected neighbor connectivity without requiring manual tile painting.
- Street tiles do not render SOT overlays while land/water SOT behavior remains intact.
