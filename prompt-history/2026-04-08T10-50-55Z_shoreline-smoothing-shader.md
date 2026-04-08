# 2026-04-08T10-50-55Z UTC
- Model: codex

## Prompt
Implement shoreline smoothing by blending land and water in the terrain shader using a soft alpha mask.

Requirements:
- Keep the terrain tile system tile-based
- Detect shoreline tiles where land borders water
- For shoreline areas, generate a blend mask that smoothly transitions from land to water
- In the WebGL terrain shader, sample both the land texture and the water texture and blend them using the shoreline mask
- Use smooth interpolation so tile intersections and jagged shoreline edges become visually softer
- Restrict this extra blending work to shoreline tiles only
- Preserve current terrain rendering performance as much as possible
- Terrain changes must update the shoreline mask only in affected chunks/tiles
- Add a debug view to render the shoreline mask in grayscale

Implementation notes:
- Prefer chunk-local precomputed mask data
- Avoid full-map rebuilds when only a few tiles change
- Do not use a fullscreen postprocess pass
- Do not blur unrelated terrain
- The result should make the coast look softer without making the whole map look muddy
