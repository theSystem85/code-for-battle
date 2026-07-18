# Ship Unit Implementation Checklist

Use this checklist when adding ship or naval units.

## Naval domain groundwork
- Mark the unit with a reusable water/naval movement domain (for example `movementType: 'water'` or `isNaval: true`).
- Route production through naval buildings such as Shipyard, not land/air factories.
- Use water-only pathfinding and passability helpers that can be reused by future boats/submarines.
- Audit all naval path entry points, not only the core A* terrain predicate: player move commands, global and attack repathing, path-cache keys, direct-line smoothing, neighbor expansion, rally paths, collision lookahead, local avoidance, and stuck/dodge recovery must all carry the water movement domain.
- Ensure the shared land-oriented occupancy map's water markers are ignored by water-mode paths; use runtime naval collision checks or a separate naval occupancy layer, and always exclude the ship's own center tile.
- Exclude land, rocks, streets, and buildings from water paths unless a future amphibious unit explicitly allows them.
- Keep center-based tile occupancy and self-occupancy exclusion consistent with all other units.

## Shipyard placement and spawning
- Naval production buildings should be placeable only along shoreline when required: at least one footprint tile on valid land and at least one designated water-edge/launch tile connected to water.
- Analyze building art to define the exact land/water footprint percentage (for the current Shipyard, 50% land and 50% water), color the placement preview accordingly, and spawn ships from the water-facing launch tile.
- Store or compute launch tiles in a reusable way so future naval buildings can share behavior.

## Ship combat and service
- Define naval gun behavior against ships and ground targets.
- Define anti-air missile behavior against airborne targets, with separate range/reload/damage if needed.
- Decide whether ship ammo/fuel/crew/health can be serviced by Shipyard or future naval service buildings; persist the service state and prerequisites.
- Shipyard service areas must be measured from building edges, clipped to water tiles, restricted to friendly naval units, and share the same predicate between rendering and simulation.
- When Shipyard service delegates to land infrastructure, gate each resource independently (Gas Station for fuel, Ammunition Factory for ammo, Hospital for crew, Vehicle Workshop for health).

## Ship visuals
- Add/derive background-free sidebar and map imagery from naval assets; validate transparent corners and avoid source-water/dock contamination.
- Author at least eight coherent ship headings at 45-degree intervals, choose the closest heading at runtime, and mathematically rotate only intermediate angles.
- Add a clearly V-shaped wake behind moving ships that respects movement direction, renders below the hull, is emitted only after actual movement, and fades after stopping.
- Add ship destruction with an explosion, hull splitting into bow/stern pieces, and sinking/fading into water.
- Ensure render ordering keeps ships visually on water and wakes below the ship.

## Tests and documentation
- Add tests for shoreline placement, water path passability, naval production routing, and ship target filtering.
- Add tests for movement-command water options, path-cache domain isolation, collision/stuck water passability, service radius water clipping/prerequisite gating, and aiming-cursor range eligibility.
- Update specs/TODO and prompt history for every naval feature request.
