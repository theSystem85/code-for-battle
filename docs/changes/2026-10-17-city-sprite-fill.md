# City sprites fill their footprint (2026-10-17)

- `dtv3_city.webp`: every building's art is now cropped to its visible bounds and scaled (aspect ratio kept) to fill its 2x2 / 2x1 / 1x1 span with a 3% margin.
- Before, the SSE pack left the art at roughly 55-75% of its span, so 2x2 buildings looked about one tile wide in game.
- The metadata (rects, tags, groups) is unchanged; only the pixels moved. The script is `fill-city.py` in the asset workspace, run on the lossless SSE export.
