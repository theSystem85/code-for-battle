---
name: ship-unit
description: Add or revise naval units and Shipyard integration in Code for Battle, including shoreline placement, water-only paths and cheats, naval production/rally/service logic, AI combat and repair retreat, rotated ship art, wakes, HUD, sinking, and validation. Use for ships, boats, submarines, or naval production features.
---

# Ship Unit Implementation Checklist

Use this checklist when adding ship or naval units.

## Naval domain groundwork
- Mark the unit with a reusable water/naval movement domain (for example `movementType: 'water'` or `isNaval: true`).
- Route production through naval buildings such as Shipyard, not land/air factories.
- Use water-only pathfinding and passability helpers that can be reused by future boats/submarines.
- Audit all naval path entry points, not only the core A* terrain predicate: player move commands, global and attack repathing, path-cache keys, direct-line smoothing, neighbor expansion, rally paths, collision lookahead, local avoidance, and stuck/dodge recovery must all carry the water movement domain.
- Make spawn cheats search open water with the same water predicate and center-based occupied-tile calculation. Never reuse the land-unit cheat search unchanged.
- Ensure the shared land-oriented occupancy map's water markers are ignored by water-mode paths; use runtime naval collision checks or a separate naval occupancy layer, and always exclude the ship's own center tile.
- Exclude land, rocks, streets, and buildings from water paths unless a future amphibious unit explicitly allows them.
- Keep center-based tile occupancy and self-occupancy exclusion consistent with all other units.

## Shipyard placement and spawning
- Naval production buildings should be placeable only along shoreline when required: at least one footprint tile on valid land and at least one designated water-edge/launch tile connected to water.
- Analyze building art to define the exact land/water footprint split, color the placement preview accordingly, and spawn ships from the water-facing launch tile. For odd footprint heights, document the chosen whole-row approximation and keep at least the requested water share.
- Store or compute launch tiles in a reusable way so future naval buildings can share behavior.
- Verify the full rally lifecycle: selecting the Shipyard must suppress drag selection on mouse-down, water-only validation must run on mouse-up, the rally flag must render for the selected Shipyard, and production must create a water-only path from the resolved launch tile.
- Make AI Shipyard placement use a shoreline-specific search; ordinary AI building placement commonly rejects every water tile. Validate the candidate with the same placement function used by players.

## Ship combat and service
- Define naval gun behavior against ships and ground targets.
- Define anti-air missile behavior against airborne targets, with separate range/reload/damage if needed.
- Decide whether ship ammo/fuel/crew/health can be serviced by Shipyard or future naval service buildings; persist the service state and prerequisites.
- Shipyard service areas must be measured from building edges, clipped to water tiles, restricted to friendly naval units, and share the same predicate between rendering and simulation.
- When Shipyard service delegates to land infrastructure, gate each resource independently (Gas Station for fuel, Ammunition Factory for ammo, Hospital for crew, Vehicle Workshop for health).
- Extend service-zone bounds from the current Shipyard footprint while keeping the specified edge radius. Do not hard-code the old building width/height.
- Give enemy naval units an explicit lifecycle: produce only after earlier tech phases, attack enemy ships and reachable coastal/base targets, return below the configured health threshold, stop within the water-only service zone, repair, then resume the saved target/order.

## Ship visuals
- Keep the map sprite background-free and render it from a strict 90-degree top-down/orthographic camera, with stern at the top and bow facing straight downward (south). No horizon, visible hull-side perspective, isometric angle, or diagonal heading is allowed in map art.
- Render the build-button image from a photorealistic elevated three-quarter perspective over water. Keep the whole ship inside the frame and place the visible sea horizon in the second quarter from the top (25–50% image height).
- Use one authored top-down south-facing map sprite and rotate that image programmatically for all headings, matching the standard unit renderer. Do not load directional exceptions unless explicitly requested.
- Anchor the main V-shaped wake to the rendered hull's stern, not the one-tile logical center, and add a smaller bow V at the forward hull endpoint. Both must rotate with heading, render below the hull, emit only during actual movement, and fade after stopping.
- Size the selection HUD and cursor hitbox to contain the ship's full rotated sprite in every HUD mode.
- Add both ship-destruction variants: a 33% hull-split animation that crops the real sprite into bow/stern halves before they separate and sink, and a 67% bow-first animation that tilts/foreshortens the ship and progressively clips the bow below the waterline.
- Ensure render ordering keeps ships visually on water and wakes below the ship.

## Tests and documentation
- Add tests for shoreline placement, water path passability, naval production routing, and ship target filtering.
- Add tests for movement-command water options, path-cache domain isolation, collision/stuck water passability, service radius water clipping/prerequisite gating, and aiming-cursor range eligibility.
- Add tests for water-only cheat spawn, Shipyard rally creation-to-launch routing, AI shoreline placement/production order, naval attack staging, low-health return/repair/resume, single-source sprite rotation, and stern/bow wake anchors.
- Update specs/TODO and prompt history for every naval feature request.
