# Spec 057: Map Generation Terrain Controls (Water/Rock %, Shores, Center Lake)

## Goal
Add map generation controls in the sidebar so the host/player can define terrain composition and shoreline shape while preserving fair land connectivity for all bases.

## Requirements
1. Add two numeric map generation inputs in Map Settings:
   - `Water %` (percent of map tiles targeted as water)
   - `Rocks %` (percent of map tiles targeted as rock)
2. Add shore topology toggles:
   - North shore
   - West shore
   - East shore
   - South shore
3. Add a fifth topology toggle:
   - Big center lake
4. Topology combinations must be supported:
   - Any subset of shore toggles
   - Big center lake on its own
   - All four shores + big center lake simultaneously
5. Regeneration must apply these settings deterministically with the active seed.
6. Safety/fairness constraints:
   - Every base spawn anchor must remain on passable land (land/street).
   - Every base must be reachable by land path from every other base.

## Persistence and Multiplayer
- Persist new settings in localStorage for host UX continuity.
- Include new terrain generation settings in host snapshot sync so remote clients regenerate matching maps.

## Validation
- Unit coverage should assert:
  - Water percentage control materially affects generated water coverage.
  - Shore toggles produce water on requested map edges.
  - High-water/high-rock combined settings still preserve land-reachable base anchors.
