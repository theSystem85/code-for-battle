2026-03-31T17:00:00Z
LLM: copilot (Claude Opus 4.6)

# Fix occupancy tile to use unit image center + physics self-occupancy exclusion

## Problem
1. Unit occupied tile was determined by top-left corner (`Math.floor(unit.x / TILE_SIZE)`) instead of the center of the unit's image (`Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)`)
2. The physics engine's self-occupancy exclusion in `isPositionBlockedForCollision` used center-based coords while the occupancy map was stored floor-based — causing mismatches where the unit got pushed away from its own occupied tile
3. This triggered pathfinding reroute loops (the recurring self-blocking occupancy bug)

## Root Cause
All occupancy-related code (`buildOccupancyMap`, `updateUnitOccupancy`, `removeUnitOccupancy`, `prevTileX/prevTileY`, `unit.tileX/tileY` post-movement) used `Math.floor(unit.x / TILE_SIZE)` which maps to the top-left corner pixel. Since units are rendered centered at `(unit.x + TILE_SIZE/2, unit.y + TILE_SIZE/2)`, the visual center could be on a different tile than the occupancy tile near boundaries. The physics self-exclusion check in `isPositionBlockedForCollision` was already center-based but the occupancy map was floor-based.

## Changes (11 source files)
- **`src/units.js`**: `buildOccupancyMap`, `updateUnitOccupancy`, `removeUnitOccupancy`, `isTileEmpty`, `moveBlockingUnits` — all switched to center-based formula
- **`src/game/movementCore.js`**: `prevTileX/prevTileY` and post-movement `unit.tileX/tileY` — switched to center-based
- **`src/game/movementCollision.js`**: `checkUnitCollision` primary tile check — switched to center-based; removed redundant F22 center-based re-check (now primary check is already center-based)
- **`src/logic.js`**: `isAdjacentToFactory`, `isAdjacentToBuilding`, `findClosestOre`, `findPositionWithClearShot` — all switched to center-based
- **`src/game/harvesterLogic.js`**: 4 tile position lookups — all switched to center-based
- **`src/behaviours/retreat.js`**: retreat path blocked check — switched to center-based
- **`src/game/bulletSystem.js`**: dodge tileX/tileY update — switched to center-based
- **`src/game/movementApache.js`**: apache landing tileX/tileY — switched to center-based
- **`src/game/helipadLogic.js`**: building adjacency check — switched to center-based
- **`src/input/keyboardHandler.js`**: dodge tile lookup — switched to center-based
- **`src/input/cheatSystem.js`**: unit tile match check — switched to center-based
- **`AGENTS.md`**: Added rule 11 — self-blocking occupancy warning for AI agents
