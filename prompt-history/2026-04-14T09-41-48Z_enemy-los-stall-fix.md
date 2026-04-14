# Prompt History Entry

**UTC Timestamp:** 2026-04-14T09:41:48Z
**LLM:** GitHub Copilot (GPT-5.4)

## Prompt Summary
Investigate the remaining enemy tank targeting-without-firing issue, with emphasis on firing-range approach logic, explain ruled-in and ruled-out hypotheses, and implement a fix.

## Original Prompt
I still see the enemy tanks of different parties to target each other but just standing still and not firing at each other. Maybe it has to do with the way they approach the target to get in firing range. looks to me like the tanks think they are in range and therefore stop but cannot fire becasue they actually did not sufficiently got close enough (just a guess). Dig deeper to try to fix the issue and explain your findings and guesses (also when you ruled out) and fixes to me!

## Findings

### Ruled Out
- A simple range mismatch between "stop moving" and "allowed to fire" for tanks. Both paths use the same effective range calculation, so tanks were not stopping on a shorter threshold than the firing check.
- The earlier `allowedToAttack` bug as the sole remaining cause. That bug was real and already fixed, but tanks could still stall even with `allowedToAttack === true`.

### Confirmed Root Cause
- Tanks that were already within nominal fire range but lacked line of sight called `findPositionWithClearShot()` and received a short reposition path.
- In the same combat flow, `handleTankMovement()` immediately cleared that path because it only checked distance, not whether a clear shot actually existed yet.
- The result was a stable deadlock: unit has target, unit is "in range", line of sight is blocked, reposition path gets erased, unit stands still forever.

## Implementation
- Extended `handleTankMovement()` with an explicit `stopWhenInRange` flag.
- Updated tank, tank-v2, and tank-v3 combat loops to compute `clearShot` before movement handling and only auto-stop on range when `clearShot` is already true.
- Added a regression test in `tests/unit/gameFolderUnitCombat.test.js` that proves blocked in-range tanks keep the reposition path instead of having it wiped.

## Validation
- Focused test: `tests/unit/gameFolderUnitCombat.test.js`
- Full required suite: `npm run test:unit`
- Changed-file lint: `npm run lint:fix:changed`

## Commit Message
```
fix(combat): preserve LOS reposition paths for in-range tanks
```