# 2026-02-26T12:45:00Z
**LLM**: copilot (Claude)

## Prompt
User reported F22 stalls mid-taxi after landing and must be deselected/reselected 2-3 times before
reaching its parking spot. Pathfinding itself appeared correct.

## Changes
- `src/game/movementCore.js`: Removed `f22Raptor` from `noAutoRotationTypes` for grounded state so
  `updateUnitRotation()` runs during ground taxi; airborne F22 rotation still handled by flight-plan
  steering. This was the root cause — rotation never updated, so the rotation-gated acceleration check
  (`rotationDiff < π/12`) permanently blocked forward movement after any turn > 15°.
- `src/game/movementStuck.js`: Skip `handleStuckUnit` for F22 in `taxi_to_parking` and
  `taxi_to_runway_start` states to prevent random dodge/rotation moves from interfering with the
  internal taxi re-pathing logic.
- `specs/021-f22-raptor-unit.md`: Added engineering update round 8.
- `TODO/Bugs.md`: Added resolved bug entry.
