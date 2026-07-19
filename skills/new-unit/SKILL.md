---
name: new-unit
description: Add or revise a Code for Battle unit with complete data, production, movement-domain pathfinding, combat, service, HUD, rendering, audio, cheats, AI, persistence, tests, specs, and prompt history. Use for any new ground, air, or water unit or when auditing an incomplete unit integration.
---

# New Unit Implementation Checklist

Use this checklist when adding any new unit type to Code for Battle.

## Data and production
- Add unit stats: cost, health/maxHealth, armor, speed, turn speed/rotation behavior, firepower, weapon ranges, reload times, projectile types, sight/radar visibility, crew capacity, fuel, ammo, repairability, and destruction behavior.
- Add tech-tree requirements and unlock rules so the unit appears only after required prerequisite buildings or milestones.
- Add production-queue integration, including factory routing for its domain (land from Vehicle Factory, aircraft from Helipad/Airstrip as appropriate, ships from naval production buildings).
- Add cheat-console integration so the unit can be spawned and inspected consistently with existing units.
- Make cheat spawning use the unit's movement-domain passability (water units on open water, ground units on land/street, aircraft at a legal pad/strip or explicit airborne spawn). Reuse center-based occupancy checks.
- Add save/load compatibility for any new persistent properties.
- Integrate enemy AI production and use: prerequisite-aware build order, correct production building, target selection, domain-valid movement, resupply/repair retreat, and resumption of the interrupted order.

## Movement and path planning
- Select the correct movement domain: ground, air, or water.
- Ensure pathfinding uses domain-specific passability rules and avoids incompatible terrain.
- Propagate the movement domain through every path entry point: direct player commands, global/attack recalculation, rally/spawn paths, AI, stuck recovery, smoothing/direct-line checks, and formation fallback tiles.
- Test a produced unit from launch tile to a user-set rally point. Audit both mouse-down selection suppression and mouse-up assignment for production buildings, rally flag rendering, tile/world coordinate conversion, and the spawned unit's initial path.
- Include movement domain in path-cache keys, and ensure terrain occupancy is separated or explicitly ignored for the unit's valid domain (for example, a land-oriented occupancy map's water markers must not block ships).
- Ensure occupied tile calculation is center-based: `Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)` and `Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)`.
- Exclude a unit's own occupancy tile from blocking/collision checks to prevent self-blocking reroute loops.
- Make collision lookahead, slide/separation, dodge/stuck recovery, move cursors, and rally-point validation use the same movement-domain passability as pathfinding.
- Configure speed, acceleration/turn behavior, collision radius, selection size, and formation spacing. Size every selection-HUD mode and its cursor hitbox from the rendered sprite bounds so long/wide units fit completely.

## Combat, service, and HUD
- Wire weapon range, minimum range, reload/cooldown, target filters, projectile visuals, sound, and damage attribution.
- Add the unit to aiming-cursor eligibility, use the effective combat range calculation for in/out-of-range state, show target distance/max range, and render any requested selected-unit range indicator.
- Support health depletion/refill, repairability, ammo depletion/refill, fuel depletion/refill where applicable.
- Decide whether the unit needs a type-specific armor or crew-casualty multiplier; verify changes at the actual damage application site rather than only in stat metadata.
- Ensure selection HUD shows health, ammo/fuel/service state, rank/crew state, and domain-specific status.
- Confirm friendly-fire, target priority, guard/attack-move, and forced-target commands behave correctly.

## Rendering and audio
- Add map and sidebar assets, or derive them from supplied assets when directed.
- Treat map and build-button art as two mandatory, distinct camera conventions:
  - **Build-button/sidebar art:** use a photorealistic elevated three-quarter perspective with the entire unit visible. The horizon must always be visible inside the second quarter from the top of the image (25–50% image height). Ships retain a realistic water background.
  - **Map art:** use a strict 90-degree top-down/orthographic view with clean alpha, the entire unit visible, and the unit facing straight downward (south). Do not use an isometric, three-quarter, diagonal, or horizon-bearing map sprite.
- Add rotation animation/facing support matching existing unit conventions. Always default to the single authored strict top-down south-facing map sprite and rotate it programmatically for every angle. Use multiple authored headings only when the user explicitly requests them.
- Add movement effects such as dust, tracks, rotor wash, jet exhaust, wake, or waves as applicable.
- Verify effect layer order (for example, wakes below a ship), emit movement effects only after actual displacement/current speed, and let residual particles fade after stopping.
- Add damage smoke/fire and destruction animation, wreck or sink behavior, and sound hooks.
- Explicitly decide whether the new unit/building emits smoke; do not inherit smoke spots from source artwork assumptions.

## Validation
- Add/update unit tests for reusable logic and production/tech-tree behavior.
- Test domain-aware cheat spawning, rally paths, AI production routing, low-health service retreat/resume, renderer source selection/rotation, and visual-effect anchor calculations where applicable.
- Run `npm run test:unit` and fix root causes.
- Run `npm run lint:fix:changed` and manually resolve remaining lint issues.
- Update relevant TODO and specs files, and record the prompt in `prompt-history/`.
