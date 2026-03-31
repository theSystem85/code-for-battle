# Spec: Harvester Automated Behaviour

## Overview
Harvesters follow a strictly prioritised set of automated policies that govern movement, harvesting, unloading, and failure recovery. All behaviour is implemented in `src/game/harvesterLogic.js` with supporting functions in `src/logic.js` and `src/ai/enemyAIPlayer.js`.

## Policies (highest priority first)

### Policy 1 – Player Command Override
- `unit.manualOreTarget`: player right-clicked a specific ore tile → path there, harvest, auto-unload at assigned refinery.
- `unit.remoteControlActive` / `lastRemoteControlTime` (2 s grace): any player move command suspends all auto decisions.
- When sent to a non-ore tile the harvester idles until a new ore command is given.

### Policy 2 – Auto-spawn to Nearest Ore
- On production completion (no custom rally point): `assignHarvesterToOptimalRefinery()` + `findClosestOre()` → path and `oreField` set immediately.

### Policy 3 – Prefer Assigned Refinery
- `handleHarvesterUnloading()` priority: `assignedRefinery` → `targetRefinery` (current) → best-score closest.
- Assignment is stable; refinery is only changed when current one is invalid or destroyed.

### Policy 4 – Enemy Attack Retreat *(enemy AI only)*
- Trigger: `lastDamageTime` within `HARVESTER_ATTACK_RETREAT_MS` (5 000 ms) AND `owner !== humanPlayer`.
- `unit.retreatingToRefinery = true`; all auto-harvest decisions suppressed.
- `routeHarvesterToRefinery()` paths unit to assigned (or nearest) refinery even when empty.
- On arrival: flag cleared → `findOreAfterUnload` scheduled → normal harvest loop resumes.

### Policy 5 – 60-second Stuck Reassignment
- Tracking: `unit.lastOreProgressTime`, `unit.lastOreProgressDistToTarget` updated each 500 ms check.
- "Progress" = distance to ore target decreased by ≥ 0.5 tiles.
- After `HARVESTER_ORE_STUCK_TIMEOUT_MS` (60 000 ms) without progress: `findRandomOreNearRefinery()`.
  - Finds free ore tiles at 50–150% of current ore tile's refinery-distance.
  - Picks pseudo-random tile (seeded by `unit.id` sum for determinism).
  - Fallback to `findNewOreTarget()` if no candidates in range.

## Key Tolerances
- Harvest start proximity: `HARVEST_DISTANCE_TOLERANCE = 1.5` tiles (matches `MOVE_TARGET_REACHED_THRESHOLD`).
- Move command grace: `HARVESTER_REMOTE_OVERRIDE_GRACE_MS = 2 000` ms.

## State Transitions
See `harvester-policies.md` for the full Mermaid state diagram.
