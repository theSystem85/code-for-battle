# Shipyard Coastal Placement

- A Shipyard's complete 5×5 footprint is on water and at least one footprint tile is orthogonally or diagonally adjacent to land.
- The rule applies uniformly to north, south, east, and west coasts, corners, islands, lakes, and every map position.
- A Shipyard may be within four tiles of any eligible owned base-building anchor. Other building types retain the global three-tile range.
- The placement overlay colors blocked tiles red. It colors clear water green when the footprint touches land and reaches the Shipyard's four-tile base range. Clear water is orange if either requirement fails. The chain preview validates each planned Shipyard in order and turns red at the first invalid footprint.
- Player placement, plans, touch/mobile controls, multiplayer validation, and enemy AI all use the authoritative building placement validator.
- Classic AI and strategic AI schedule one Shipyard earlier for naval-first plans and later for air-first plans. AI placement searches every all-water footprint and delegates coast, occupancy, and range decisions to the authoritative validator; maps without a reachable coast fail without placing an invalid building and retry through normal planning.
- Ship launch selection considers open water around all four Shipyard edges rather than assuming a south-facing coast.

## Performance

The single-placement overlay checks one 5×5 footprint per frame while Shipyard placement is active, with one bounded perimeter check and the existing 25 tile fills at any device pixel ratio. Chain placement checks only the proposed Shipyards and stops validation at the first invalid footprint. The existing draw count is unchanged. Hardware GPU acceptance for the 75 FPS gate remains pending on qualifying hardware.
