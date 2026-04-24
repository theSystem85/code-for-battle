# 051 — Street sprite-sheet routing (streets23 default)

1. The bundled sheet `images/map/sprite_sheets/streets23_q90_1024x1024.webp` must be listed in default static SSE sheet registries (`index.json`, map settings defaults, and SSE fallback list) so it is selectable without manual import.
2. Street-tile integrated rendering must resolve candidates using `street` plus directional tags (`top`, `bottom`, `left`, `right`) computed from orthogonal neighboring street tiles.
3. A directional tag is valid only when that matching orthogonal neighbor is a street tile (e.g. `top` only if the tile above is street).
4. Candidate street tiles containing any invalid directional tag must be excluded.
5. If multiple candidates remain, select the candidate that matches the most currently valid directional tags; ties may be broken deterministically by coordinate hash.
6. Street selection should prefer candidates also tagged with the active integrated biome tag (`grass`, `soil`, `snow`, `sand`) when available, with fallback to non-biome street candidates.
7. Street-hosted SOT rendering must be disabled for now in both CPU and WebGL overlay passes; land-hosted SOT remains unchanged.
8. Street rendering must always paint a biome terrain underlay before the street overlay, so keyed/transparent street pixels reveal biome terrain rather than prior street/base artifacts.
9. Biome underlay for street tiles must use integrated biome-tagged land art when integrated sheets are enabled, and fall back to default grass/land terrain when integrated sheets are disabled.
10. Tagged street-sheet street rendering must remain active by default even when the `Custom sprite sheets` toggle is disabled.
11. In GPU base-layer mode, the CPU overlay pass must repaint street tiles using the same street underlay/overlay pipeline so streets23 rendering remains visible without requiring `Custom sprite sheets`.
12. Street-type SOT generation/rendering must be fully disabled, but water-type SOT must still render on street-hosted tiles so water/shore smoothing continues against the biome underlay beneath streets.
13. For street tiles adjacent to water corners, SOT texture content must use biome/land texture (selected integrated biome land when available, otherwise default land) rather than street texture so coastline smoothing visually matches the ground underlay.
