# 2026-03-31T12:21:50Z
**LLM**: Copilot (Claude Opus 4.6)

## Prompt
Continuation of harvester rerouting investigation. After fixing the retreat infinite rerouting loop, harvesters (player and AI) still circle around target tiles instead of entering them. User suspected self-occupancy: when a harvester is about to enter the target tile, its center crosses into that tile first, causing the occupancy map to mark it as occupied. Since `unit.tileX` (used as pathfinding start) hasn't updated yet, `destinationIsStart` is false, so the destination appears blocked and pathfinding reroutes to an adjacent tile — creating an endless circling loop.

## Root Cause
Coordinate mismatch between `unit.tileX` (floor-based: `Math.floor(unit.x / TILE_SIZE)`) and the occupancy map (center-based: `Math.floor((unit.x + TILE_SIZE/2) / TILE_SIZE)`). During tile transitions, these differ by 1, causing the unit to block its own destination in the occupancy map while pathfinding doesn't recognize it as "self".

## Fix
Changed `buildOccupancyMap`, `updateUnitOccupancy`, and `removeUnitOccupancy` in `src/units.js` to use floor-based coordinates matching `unit.tileX`. Aligned `prevTileX`/`currentTileX` in `src/game/movementCore.js` to match. Removed the previously added `excludeOccupancyTile` workaround from `findPath` since the root cause is now fixed.

## Files Changed
- `src/units.js` — occupancy coordinate formula in 3 functions
- `src/game/movementCore.js` — prevTileX/currentTileX coordinate formula
