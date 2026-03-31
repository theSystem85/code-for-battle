# 2026-03-31T08:43:41Z
# LLM: copilot

## Prompt

Make a deep analysis of how the harvester behaviour is controlled and managed. Figure out why harvesters (enemy's and player ones) can happen to sit idle on ore fields (when fuel is enough) or still end up in some rerouting loops. Ensure that can never happen. Explain your findings and fixes to prevent that. Also make a mermaid diagram in a havester-policies.md file that explains ALL havester automated behaviour for player and enemy AI units. In general the harvester policies should be like this (ordered by highest prio, most of it should already be implemented but verify and fix if needed):

1) go where player send you (you means the harvester itself). When target not an ore field sit there idle until player sends you to an ore field then do fully automated harvesting (includes unloading at the refinery).
2) when coming out new form the factory go to nearest ore filed to harvest fully automatically.
3) always prefer the refinery the player has assigned you to
4) ONLY enemy AI: when harvester got attacked go back to refinery immediately and then go back to harvest loop again.
5) when harvester cannot reach targetted ore tile and is unproductive (means not moving back to refinery or actively harvesting or moving to ore field and getting closer successfully) for more than a minute then assign a different pseudo random ore tile at similar distance to the targetted refinery.

## Findings & Fixes

### Root Cause 1: Proximity Tolerance Mismatch (Idle on Ore Fields)
`MOVE_TARGET_REACHED_THRESHOLD = 1.5` tiles, but `findNearbyOreTile()` used `0.7` tile tolerance. A harvester arriving at the right/bottom edge of an ore tile had its unit-center 0.7-1.0 tiles from the ore tile center → harvesting never triggered → idle.

**Fix**: Changed `HARVEST_DISTANCE_TOLERANCE = 1.5` and used it in `findNearbyOreTile` and `distanceToOreField` check.

### Root Cause 2: path.length === 1 Treated as "Can't Path" (Rerouting Loops)
When `findPath(A, A)` returns a single node (already at destination), the code treated this as a pathfinding failure and called `clearOreField()` + `findNewOreTarget()` immediately. Since the same tile was still the closest, this created a tight loop.

**Fix**: `path.length === 1` now correctly detected as "already at ore tile" → try to start harvesting immediately.

### Root Cause 3: No-Path Case Left Ore Reserved with No Path
When `findPath` returned empty array (unreachable tile), the ore tile reservation AND `unit.oreField` were set but no path existed. Next cycle the "has oreField but no path" handler fired, and (if at same tileX/Y) found `path.length === 1` again → loop.

**Fix**: When path is completely empty (`path.length === 0`), release the reservation and schedule a delayed retry.

### Root Cause 4: Productivity Check Premature Ore Field Clearing
`checkHarvesterProductivity()` ran every 500ms. When unit arrived at ore tile (path empty, moveTarget cleared within 0.3 tiles), this check fired BEFORE the main loop's `findNearbyOreTile` check and called `clearOreField()` + `findNewOreTarget()`, breaking harvesting.

**Fix**: Added check: if unit has `oreField` and is within `HARVEST_DISTANCE_TOLERANCE` → return early (let main loop handle harvesting start). Also added `retreatingToRefinery` to the "is productive" conditions.

### New Feature: Policy 4 – Enemy Harvester Attack Retreat
Added `unit.retreatingToRefinery` flag and `routeHarvesterToRefinery()` function. Enemy harvesters with `lastDamageTime` within 5000ms are forced to retreat to their assigned refinery even when empty.

### New Feature: Policy 5 – 60-second Stuck Detection
Added `unit.lastOreProgressTime` / `unit.lastOreProgressDistToTarget` tracking inside `checkHarvesterProductivity()`. After 60 seconds without getting closer to the targeted ore tile (by ≥ 0.5 tiles), `findRandomOreNearRefinery()` selects a pseudo-random free ore tile in the 50–150% distance band from the assigned refinery.
