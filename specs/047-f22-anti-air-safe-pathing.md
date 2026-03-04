# Spec 047: Enemy F22 anti-air-safe targeting and approach pathing

## Context
Enemy F22 AI should avoid selecting targets that are already covered by anti-air missile threats, and when it commits to a target it should steer via waypoints that avoid anti-air action radii as much as possible.

## Requirements
- Enemy F22 target acquisition must reject player targets located inside active anti-air threat envelopes from:
  - player Rocket Tanks
  - player Rocket Turrets (only when powered)
- Enemy F22 attack flight planning must attempt a safe approach path that avoids anti-air threat tiles.
- The safe approach planner should:
  - operate in tile space
  - avoid anti-air radii plus a small safety buffer
  - gracefully fall back to direct targeting when no safe route exists

## Acceptance Criteria
1. In a scenario with one protected harvester (inside rocket-tank/turret range) and one unprotected harvester, enemy F22 selects the unprotected harvester.
2. During approach planning, the assigned F22 waypoint remains outside anti-air missile action radii.
3. Existing F22 attack flow (target lock + takeoff intent) remains functional.

## Verification
- E2E: `tests/e2e/enemyF22AntiAirAvoidance.test.js`
