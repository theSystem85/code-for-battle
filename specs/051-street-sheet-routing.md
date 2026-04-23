# 051 — Street sprite-sheet routing (streets23 default)

1. The bundled sheet `images/map/sprite_sheets/streets23_q90_1024x1024.webp` must be listed in default static SSE sheet registries (`index.json`, map settings defaults, and SSE fallback list) so it is selectable without manual import.
2. Street-tile integrated rendering must resolve candidates using `street` plus directional tags (`top`, `bottom`, `left`, `right`) computed from orthogonal neighboring street tiles.
3. A directional tag is valid only when that matching orthogonal neighbor is a street tile (e.g. `top` only if the tile above is street).
4. Candidate street tiles containing any invalid directional tag must be excluded.
5. If multiple candidates remain, select the candidate that matches the most currently valid directional tags; ties may be broken deterministically by coordinate hash.
6. Street selection should prefer candidates also tagged with the active integrated biome tag (`grass`, `soil`, `snow`, `sand`) when available, with fallback to non-biome street candidates.
7. Street-hosted SOT rendering must be disabled for now in both CPU and WebGL overlay passes; land-hosted SOT remains unchanged.
