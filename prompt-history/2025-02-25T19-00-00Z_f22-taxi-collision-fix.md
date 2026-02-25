# 2025-02-25T19:00:00Z
## LLM: Copilot (Claude Opus 4.6)

## Prompt
Landing is being approached though but when trying to ground move to a parking space F22 tries to leave the pad and gets pushed inwards again so it never reaches its parking spot.

## Changes Made
Fixed three root causes preventing F22 from taxiing to parking after landing:

1. **Collision avoidance forces (movementCore.js)**: Grounded F22 was still subject to `calculateCollisionAvoidance`, which pushed it away from nearby ground units during taxi. Fixed by skipping all avoidance forces for F22 regardless of flight state.

2. **F22 as ground obstacle (movementCollision.js)**: Other ground units' `calculateCollisionAvoidance` saw grounded F22 via `queryNearbyGround` and pushed away from it. Fixed by skipping `otherUnit.type === 'f22Raptor'` in the avoidance loop.

3. **Tile edge-clipping collisions (movementCollision.js)**:
   - F22 street-only check used top-left corner (`Math.floor(unit.x / TILE_SIZE)`) instead of center, causing false terrain collisions when the corner clipped non-street tiles. Fixed with center-based tile lookup.
   - `hasBlockingBuilding(tile)` check also used top-left corner, blocking F22 when its corner overlapped hangar tiles. Fixed by skipping building check when center tile is confirmed on airstripStreet.
   - Removed unused `isF22GroundStreetBlocked` function.

## Files Modified
- `src/game/movementCore.js` — Skip all collision avoidance for F22
- `src/game/movementCollision.js` — Skip F22 in ground avoidance loop; center-based street/building checks; remove unused function
- `specs/021-f22-raptor-unit.md` — Updated engineering notes and B3/A8 status
