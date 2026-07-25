# Shipyard and Destroyer Naval Groundwork

## Requirements
- Add a Shipyard production building using `public/images/map/buildings/shipyard_map.webp` and `public/images/sidebar/shipyard_sidebar.webp`.
- Shipyard must require Radar Station and Vehicle Factory tech, cost more than core factories, consume power, be repairable like other buildings, and support rally points.
- Shipyard placement must be shoreline-only: its 5x5 footprint uses the closest whole-row split that preserves at least half water (upper two rows land, lower three rows water), the placement preview reflects that split, and a water launch row exists immediately below the building.
- Add a Destroyer as the first naval unit, produced from Shipyards and using a derived image from the ship shown in the Shipyard art.
- Add reusable naval groundwork for water passability, naval production classification, and Shipyard launch tile resolution.
- Destroyer must use water-only pathfinding across player commands, global/attack repathing, cache, smoothing, collision and stuck recovery; carry fuel/ammunition; have crew/armor/health/cost; and attack ground/naval targets with guns plus airborne targets with missiles.
- Destroyer map art uses only the transparent south/down-facing authored sprite. The renderer rotates that single source programmatically for every heading.
- The sole Destroyer map asset is `public/images/map/units/destroyer_map.webp`; no directional subfolder or duplicate heading assets are retained.
- Moving Destroyers leave a stern V-wake aligned to the rendered hull endpoint plus a smaller bow V-wake. Both render below the hull, emit only during actual movement, and fade after the ship stops.
- The bow/frontal wake uses a 70-degree inner V angle so both arms remain visible outside the hull.
- The south-facing Destroyer's main-gun projectile origin is source-image coordinate (55, 260), transformed with the ship for every heading.
- Destroyed ships use one of four deterministic-random directional sinking animations—front-down, back-down, left-down, or right-down—with equal 25% probability.
- Selecting a Destroyer shows its 18-tile weapon radius. Hovering an enemy uses the in-range/out-of-range attack cursor and displays current distance versus maximum range.
- Selecting a Shipyard shows a three-tile service area measured from its edges, clipped to water tiles. Only friendly naval units can use it.
- Selecting a Destroyer shows a selection HUD large enough to contain the complete 2.6-tile sprite at any heading.
- Shipyard service independently requires the matching friendly land building: Gas Station for fuel, Ammunition Factory for ammo, Hospital for crew, and Vehicle Workshop for health.
- Shipyards do not emit smoke.
- Shipyard rally points accept only open water, render while selected, and route newly produced ships from their water launch tile.
- The Shipyard owner flag is anchored at top-left; other building flags retain their existing ground-corner position.
- Destroyer spawn cheats search open water and reject land, buildings, and center-occupied tiles.
- Classic and LLM enemy AI progression is Helipad/Apache, then Shipyard/Destroyers, then Airstrip/jets. Enemy Destroyers prioritize enemy ships and attack reachable enemy base targets. Below 20% health they save their target, return to a friendly Shipyard service tile, repair to at least 98%, and resume combat.

## Balancing
- Shipyard: 5x5 footprint, 5000 credits, -120 power, 450 health, requires Radar Station and Vehicle Factory.
- Destroyer: 4500 credits, 250 health, armor 1.5, 5% per-crew-member casualty chance on damaging hits, 60 ammunition, 6000 fuel, slow acceleration, naval movement, long 18-tile range.
- Destroyer sidebar build art shows the entire ship from a photorealistic elevated three-quarter perspective over water, with the horizon inside the second quarter from the top; map art remains strict top-down, south-facing, and transparent.

## Validation
- Unit tests must pass with `npm run test:unit`.
- Changed-file lint auto-fix must run with `npm run lint:fix:changed`.
