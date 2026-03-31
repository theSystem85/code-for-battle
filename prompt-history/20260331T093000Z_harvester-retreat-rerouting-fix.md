# 2026-03-31T09:30:00Z
Model: copilot (Claude Opus 4.6)

## Prompt

Fix the harvester rerouting loop that occurs after enemy harvesters get attacked. Harvesters constantly reassign their retreat point over and over, resulting in no actual movement. The issue manifests as constant "reroute" entries in debug logs and harvesters sitting idle on ore fields or near their base. The staged changes from the previous prompt (harvester policy/state-ownership fix) did not resolve this issue.

## Root Causes Found

1. **`updateRetreatBehavior` (retreat.js) interference**: The player-oriented tactical retreat system (designed for Shift+Click backward-movement retreats) was running for ALL retreating units including AI harvesters. Its `checkRetreatPathBlocked()` does a straight-line check to the retreat target and immediately detects buildings in the way (the retreat target is near the enemy base). This clears `isRetreating` on the SAME FRAME the retreat was set, creating an instant cancel→re-trigger loop.

2. **`shouldHarvesterSeekProtection` cooldown bypass**: The function checked for nearby threats BEFORE checking the post-retreat cooldown. Since threats are always visible during an attack, the 4-second cooldown was never respected, allowing immediate re-retreat after every cancel.

3. **Missing `retreatStartTime`**: AI retreats never set `retreatStartTime`, so the 30-second safety timeout in `shouldExitRetreat` never triggered (duration was always 0).

4. **`unitMovement.js` body direction/acceleration conflicts**: The movement system assumed all retreating units used the backward-movement system, causing body rotation and acceleration to be managed incorrectly for AI path-based retreats.

## Changes Made

- `src/behaviours/retreat.js`: `updateRetreatBehavior` now returns false immediately for non-player-issued retreats (`!unit.retreatIssuedByPlayer`), preventing the tactical retreat system from interfering with AI path-based retreats.
- `src/ai/retreatLogic.js`: `shouldHarvesterSeekProtection` now checks cooldown BEFORE threats. `shouldStopRetreating` now returns true when path is consumed for non-player retreats. `handleHarvesterRetreat` and `handleRetreatToBase` now set `retreatStartTime`.
- `src/game/unitMovement.js`: Body direction and `canAccelerate` handling now distinguish between player retreats (backward movement managed by retreat behavior) and AI retreats (forward path-following movement).
- Tests updated to match new behavior.
