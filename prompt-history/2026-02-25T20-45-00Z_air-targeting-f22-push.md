# 2026-02-25T20:45:00Z
## LLM: copilot

## Prompt
more issues to fix:
1) ground units should not be able to even AIM at air units (if they have no capable weapons to attack them in the first place). I saw tanks aiming at an F22. Stuff like this should be prevented!
2) fix the problem with flying F22 pushing ground units away when flying over them (happens when F22 attacks a ground units)

## Implementation Summary
- Added shared target eligibility helpers in `src/game/unitCombat/combatHelpers.js`:
  - `isAirborneCombatTarget(target)`
  - `canUnitTargetEntity(unit, target)`
- Applied hard target filtering in `src/game/unitCombat/tankCombat.js`:
  - `updateTankCombat`, `updateTankV2Combat`, `updateTankV3Combat`, and `updateRocketTankCombat`
    now clear invalid airborne targets for non-AA units before aiming/movement/firing.
- Applied filtering in `src/game/unitCombat/combatState.js`:
  - Guard-targeting scan now rejects airborne targets for non-AA units.
  - Attack-queue target switching now rejects invalid airborne targets.
- Further hardened F22 non-push behavior in `src/game/movementCollision.js`:
  - `isPositionBlockedForCollision` ignores F22 in unit-separation checks.
  - `ensureMinimumSeparation` returns early when either unit is F22.

## Tracking Updates
- Updated `TODO/Bugs.md` with this follow-up issue.
- Updated `specs/021-f22-raptor-unit.md` with Engineering Update (round 4) and B3 note.
