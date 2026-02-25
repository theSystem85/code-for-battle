# 2026-02-25T15:45:00Z
**LLM**: copilot (Claude Opus 4.6)

## Prompt
When a game with parked F22 on airstrip is loaded the F22 are not heading in the same direction as they would spawn. Ensure they do. [Previous fix]

After loading a save game the F22 on the airstrip parking lots look in the correct direction but they seem to be locked there and do not take off anymore when commanded to move or attack! Find the root cause and fix that issue. Also fix the issue that currently a group of F22 when commanded to land is not properly making a queue in the air where they cruise around in large circles (10 tiles radius) before the airstrip entrance and they are supposed to land one after another. Ensure EACH unit moves on the ground to its empty parking lot!

## Root Causes

### Issue 1: F22 stuck after save/load
- `src/saveGame.js`: F22-specific state (`airstripId`, `airstripParkingSlotIndex`, `f22State`, `flightState`, `altitude`, etc.) was NOT serialized with the unit data
- On load, `createUnit` defaulted `f22State='parked'` but `airstripId` and `runwayPoints` were undefined
- When the user commanded a move/attack, `assignApacheFlight` set `f22PendingTakeoff=true` and `f22State='wait_takeoff_clearance'`
- But `updateF22FlightState` calls `ensureRunwayData(unit)` which tries to find the airstrip by `unit.airstripId` (undefined) → no runway data
- The check `if (!runway) { finishTick(); return }` caused the entire state machine to skip → unit permanently stuck

### Issue 2: Landing queue holding orbit too small
- Holding orbit used `TILE_SIZE * 3.5` (3.5 tiles), user wanted 10 tiles
- All queued F22 shared the same orbit angle → visual overlap

### Issue 3: Parking slot race condition
- When transitioning from `landing_roll` to `taxi_to_parking`, `claimAirstripParkingSlot` found a free slot but didn't mark it occupied
- The slot was only marked when the unit finished taxiing
- A second landing F22 could claim the same slot before the first arrived

## Changes
### `src/saveGame.js`
- Added `setAirstripSlotOccupant` and `getAirstripRunwayPoints` to imports from `airstripUtils.js`
- Added F22-specific fields to unit serialization block: `f22State`, `airstripId`, `airstripParkingSlotIndex`, `flightState`, `altitude`, `landedHelipadId`, `helipadTargetId`, `f22PendingTakeoff`, `groundedOccupancyApplied`
- Rewrote post-buildings-load F22 restoration:
  - For old saves without `airstripId`: finds airstrip by position
  - Re-derives `runwayPoints` from the airstrip
  - Restores parking slot occupancy via `setAirstripSlotOccupant`
  - Sets `direction`/`rotation` from parking spot facing
  - Restores `landedHelipadId`, `flightState`, `groundedOccupancyApplied`

### `src/game/movementF22.js`
- Changed holding orbit radius from `TILE_SIZE * 3.5` to `TILE_SIZE * 10`
- Added per-unit angular staggering using queue position in `f22RunwayLandingQueue`
- Added immediate `setAirstripSlotOccupant` call when claiming a parking slot during `landing_roll → taxi_to_parking` transition
