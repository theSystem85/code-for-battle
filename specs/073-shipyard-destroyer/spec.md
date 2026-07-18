# Shipyard and Destroyer Naval Groundwork

## Requirements
- Add a Shipyard production building using `public/images/map/buildings/shipyard_map.webp` and `public/images/sidebar/shipyard_sidebar.webp`.
- Shipyard must require Radar Station and Vehicle Factory tech, cost more than core factories, consume power, be repairable like other buildings, and support rally points.
- Shipyard placement must be shoreline-only: the upper 50% (two rows) of its footprint is land, the lower 50% (two rows) is water, the placement preview reflects that split, and a water launch row exists immediately below the building.
- Add a Destroyer as the first naval unit, produced from Shipyards and using a derived image from the ship shown in the Shipyard art.
- Add reusable naval groundwork for water passability, naval production classification, and Shipyard launch tile resolution.
- Destroyer must use water-only pathfinding across player commands, global/attack repathing, cache, smoothing, collision and stuck recovery; carry fuel/ammunition; have crew/armor/health/cost; and attack ground/naval targets with guns plus airborne targets with missiles.
- Destroyer map art must have transparent backgrounds and provide eight authored 45-degree headings. The renderer selects the nearest heading and rotates intermediate angles mathematically.
- Moving Destroyers leave V-shaped wakes below the hull. Wakes are emitted only during actual movement and fade after the ship stops.
- Selecting a Destroyer shows its 18-tile weapon radius. Hovering an enemy uses the in-range/out-of-range attack cursor and displays current distance versus maximum range.
- Selecting a Shipyard shows a three-tile service area measured from its edges, clipped to water tiles. Only friendly naval units can use it.
- Shipyard service independently requires the matching friendly land building: Gas Station for fuel, Ammunition Factory for ammo, Hospital for crew, and Vehicle Workshop for health.
- Shipyards do not emit smoke.

## Balancing
- Shipyard: 4x4 footprint, 5000 credits, -120 power, 450 health, requires Radar Station and Vehicle Factory.
- Destroyer: 4500 credits, 500 health, armor 5, 60 ammunition, 6000 fuel, slow acceleration, naval movement, long 18-tile range.

## Validation
- Unit tests must pass with `npm run test:unit`.
- Changed-file lint auto-fix must run with `npm run lint:fix:changed`.
