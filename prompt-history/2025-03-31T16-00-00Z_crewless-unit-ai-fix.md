2025-03-31T16:00:00Z
LLM: copilot (Claude Opus 4.6)

# Fix AI commanding crewless units + harvester idle-at-ore

## Problem
1. Harvesters sit still at ore tiles and don't harvest after the occupancy coordinate fix
2. The rerouting loop issue correlates with missing crew members — AI keeps commanding units without drivers
3. AI should stop commanding crewless units; mobile crewless units should go to hospital for restaffing

## Root Cause
- `harvesterLogic.js` had zero crew checks — harvesters with missing loader kept trying to harvest, and harvesters with missing driver had paths cleared every frame by `movementCore.js` while harvester automation kept re-pathing
- `enemyUnitBehavior.js` detected missing crew and set `needsHospital=true` but didn't return early — the unit continued through all combat/movement AI, overwriting hospital paths from `crewHealing.js`
- `pathfinding.js` global batch repath kept recalculating paths for driverless units that would immediately have them cleared by `movementCore.js`

## Changes
1. **`src/game/harvesterLogic.js`**: Added crew check at top of forEach: no driver → stop movement/harvesting/scheduled actions and return; no loader → stop harvesting, allow unloading if carrying ore, return. Added `returningToHospital` check to skip all automation while heading to hospital.
2. **`src/game/pathfinding.js`**: Added driver check to both immediate and batch path calculations to skip driverless units entirely.
3. **`src/ai/enemyUnitBehavior.js`**: Changed `canMove && missingCrew > 0` branch to return early — clears moveTarget/path, allows only defensive fire against nearby attackers, prevents combat AI from overwriting hospital paths.
4. **`tests/unit/enemyUnitBehavior.test.js`**: Fixed pre-existing mock issues — added missing `getEnemyPlayers` and `normalizePartyOwner` to `enemyUtils` mock, and made `isEnemyTo` check ownership instead of always returning true (6 previously hidden test failures now pass).
