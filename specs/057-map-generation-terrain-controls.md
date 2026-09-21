# Spec 057: Map Generation Terrain Controls (Water/Rock %, Shores, Center Lake)

## Goal
Add map generation controls in the sidebar so the host/player can define terrain composition and shoreline shape while preserving fair land connectivity for all bases.

## Requirements
0. Fresh installations default to a 200×200 map with four players, 5% rocks, all four shores, a big center lake, and 20,000 starting money. Persisted user settings and explicit startup URL overrides continue to take precedence.
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
  - Middle-of-shore depth varies, changes gradually, and does not stay flat for a long straight run.
  - Two enabled shores ease into each other over several columns instead of a one-tile cliff.
  - The center lake's boundary radius varies by angle, contains the center tile, and is a single water component.
  - The same seed reproduces the organic water mask and a different seed does not.

## Follow-up Constraints (2026-03-24)
- Terrain percentages should generate **line/chain-based formations** (wider/longer lines as % increases), not random isolated scatter across the whole map.
- Coast contribution must scale with configured water percentage (lower water shrinks coast depth toward map borders; higher water expands coast depth inward).
- Water and rock percentages are constrained so `water% + rock% <= 50%`.
- When the user increases water beyond the budget, rock is automatically reduced by the same overflow amount (and vice versa).

- Rock line generation is applied before water; water generation is dominant and overwrites/cuts rock where paths intersect.

- Regenerating from map-settings changes preserves current camera position (clamped to new map bounds) rather than forcing recenter on base.

## Organic shorelines and center lake (2026-09-21)
- Enabled shores are no longer constant-depth rectangles. Depth along each shore follows a seeded smooth-noise profile, so the tile coastline curves into bays and headlands. The map-edge row or column of an enabled shore stays water.
- Where two enabled shores meet, their normalized distances are blended with a smooth minimum, so the corner is a curve instead of a right-angle step.
- The big center lake is a seeded radial blob. Radius varies by angle around the same base radius the circular stamp used, and the lake stays one connected body containing the map center.
- Average shore depth and lake radius still scale with the configured water percentage. Base anchors stay on land, and streets still reconnect bases after water is stamped.
- Coastline rendering (shaders, sprites, autotiles, SOT) is unchanged. Only the generated tile types change.
- Hand-authored mission maps are stored maps and are not passed through this generator.
