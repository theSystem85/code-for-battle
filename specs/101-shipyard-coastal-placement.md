# Shipyard Coastal Placement

- A Shipyard's complete 5×5 footprint is on water and at least one footprint tile is orthogonally or diagonally adjacent to land.
- The rule applies uniformly to north, south, east, and west coasts, corners, islands, lakes, and every map position.
- A Shipyard may be within four tiles of any eligible owned base-building anchor. Other building types retain the global three-tile range.
- The placement overlay colors each footprint tile on its own. Blocked tiles (land, occupied water, city buildings, stones, and other invalid terrain) are red. Clear water is green when at least one footprint tile is inside the Shipyard's four-tile base range, and orange when none of them is. Missing the coast does not recolor clear water; placement still requires an all-water footprint that touches land.
- Player placement, plans, touch/mobile controls, multiplayer validation, and enemy AI all use the authoritative building placement validator.
- Classic AI and strategic AI schedule one Shipyard earlier for naval-first plans and later for air-first plans. AI placement searches every all-water footprint and delegates coast, occupancy, and range decisions to the authoritative validator; maps without a reachable coast fail without placing an invalid building and retry through normal planning.
- Ship launch selection considers open water around all four Shipyard edges rather than assuming a south-facing coast.

## Performance

Placement and AI construction searches run only during placement/build decisions, not per simulation tick or per rendered entity. The 5×5 validation and bounded perimeter checks allocate no persistent per-frame state. Hardware GPU acceptance for the 75 FPS gate remains pending on Patrick's qualifying hardware; no GPU benchmark was run.
