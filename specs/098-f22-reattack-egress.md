# Spec 098: F22 re-attack egress

## Problem
After a strike the F22 stayed inside its weapon range. Combat steering yawed the nose toward the target faster than the flight plan could turn, so the jet settled into a tight circle inside the minimum firing distance. Rockets stopped, ammo remained, and the return-home path never started.

A second defect hid the wider combat orbit: each tick replaced `f22AssignedDestination` with a clamped `{x, y}` and dropped `mode`. Attack runs and the "target destroyed" return both depend on `mode: 'combat'`.

## Behavior
- While rockets remain and the target lives, the F22 flies an inbound pass through the firing window, then egresses.
- Egress distance is weapon range plus two minimum turn radii plus a four-tile margin. The turn radius uses the same per-tick speed and yaw as flight-plan steering.
- The next inbound run starts only after that distance is reached (or the farthest in-bounds point, when the map border cuts the leg short).
- The flight plan owns heading during the attack. Combat does not yaw the nose into the target.
- Leaving the firing window pauses an in-progress volley. It does not discard it, so the next pass can keep firing without the full volley cooldown.
- When rocket ammo reaches zero, the volley is cleared and the existing return-to-base path runs. A destroyed target still returns home because the combat destination keeps its mode.

## Performance
The planner runs once per F22 per movement tick. It uses a fixed eight-heading search and does not allocate sets, maps, or sprite work. It does not draw range circles or other viewport-sized canvas effects.

This session cannot certify 75 presented FPS. There is no qualifying display here. That hardware check stays outstanding. The change does not alter resolution, effects, or animation cadence.

## Verification
- Unit: `npx vitest run tests/unit/f22AttackEgress.test.js tests/unit/gameFolderUnitCombat.test.js`
- The kinematic test steps cruise speed and flight yaw. It requires two firing-window entries separated by a departure of at least the egress distance, and a closest approach greater than four tiles.
