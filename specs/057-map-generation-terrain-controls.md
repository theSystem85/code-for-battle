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

## Follow-up Constraints (2026-03-24)
- Terrain percentages should generate **line/chain-based formations** (wider/longer lines as % increases), not random isolated scatter across the whole map.
- Coast contribution must scale with configured water percentage (lower water shrinks coast depth toward map borders; higher water expands coast depth inward).
- Water and rock percentages are constrained so `water% + rock% <= 50%`.
- When the user increases water beyond the budget, rock is automatically reduced by the same overflow amount (and vice versa).

- Rock line generation is applied before water; water generation is dominant and overwrites/cuts rock where paths intersect.

- Regenerating from map-settings changes preserves current camera position (clamped to new map bounds) rather than forcing recenter on base.
