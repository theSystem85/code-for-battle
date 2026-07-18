# New Unit Implementation Checklist

Use this checklist when adding any new unit type to Code for Battle.

## Data and production
- Add unit stats: cost, health/maxHealth, armor, speed, turn speed/rotation behavior, firepower, weapon ranges, reload times, projectile types, sight/radar visibility, crew capacity, fuel, ammo, repairability, and destruction behavior.
- Add tech-tree requirements and unlock rules so the unit appears only after required prerequisite buildings or milestones.
- Add production-queue integration, including factory routing for its domain (land from Vehicle Factory, aircraft from Helipad/Airstrip as appropriate, ships from naval production buildings).
- Add cheat-console integration so the unit can be spawned and inspected consistently with existing units.
- Add save/load compatibility for any new persistent properties.

## Movement and path planning
- Select the correct movement domain: ground, air, or water.
- Ensure pathfinding uses domain-specific passability rules and avoids incompatible terrain.
- Propagate the movement domain through every path entry point: direct player commands, global/attack recalculation, rally/spawn paths, AI, stuck recovery, smoothing/direct-line checks, and formation fallback tiles.
- Include movement domain in path-cache keys, and ensure terrain occupancy is separated or explicitly ignored for the unit's valid domain (for example, a land-oriented occupancy map's water markers must not block ships).
- Ensure occupied tile calculation is center-based: `Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)` and `Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)`.
- Exclude a unit's own occupancy tile from blocking/collision checks to prevent self-blocking reroute loops.
- Make collision lookahead, slide/separation, dodge/stuck recovery, move cursors, and rally-point validation use the same movement-domain passability as pathfinding.
- Configure speed, acceleration/turn behavior, collision radius, selection size, and formation spacing.

## Combat, service, and HUD
- Wire weapon range, minimum range, reload/cooldown, target filters, projectile visuals, sound, and damage attribution.
- Add the unit to aiming-cursor eligibility, use the effective combat range calculation for in/out-of-range state, show target distance/max range, and render any requested selected-unit range indicator.
- Support health depletion/refill, repairability, ammo depletion/refill, fuel depletion/refill where applicable.
- Ensure selection HUD shows health, ammo/fuel/service state, rank/crew state, and domain-specific status.
- Confirm friendly-fire, target priority, guard/attack-move, and forced-target commands behave correctly.

## Rendering and audio
- Add map and sidebar assets, or derive them from supplied assets when directed.
- Validate alpha/transparency at runtime size so no source background remains in map or sidebar art.
- Add rotation animation/facing support matching the unit's movement and firing behavior. When authored directional sprites are required, provide at least eight 45-degree views and rotate only the intermediate angle mathematically.
- Add movement effects such as dust, tracks, rotor wash, jet exhaust, wake, or waves as applicable.
- Verify effect layer order (for example, wakes below a ship), emit movement effects only after actual displacement/current speed, and let residual particles fade after stopping.
- Add damage smoke/fire and destruction animation, wreck or sink behavior, and sound hooks.
- Explicitly decide whether the new unit/building emits smoke; do not inherit smoke spots from source artwork assumptions.

## Validation
- Add/update unit tests for reusable logic and production/tech-tree behavior.
- Run `npm run test:unit` and fix root causes.
- Run `npm run lint:fix:changed` and manually resolve remaining lint issues.
- Update relevant TODO and specs files, and record the prompt in `prompt-history/`.
