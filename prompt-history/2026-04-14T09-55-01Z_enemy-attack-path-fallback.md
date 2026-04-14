# Prompt History Entry

**UTC Timestamp:** 2026-04-14T09:55:01Z
**LLM:** GitHub Copilot (GPT-5.4)

## Prompt Summary
Investigate the still-unresolved stalled enemy tank targeting issue shown in the screenshot, verify the remaining live failure, and fix the deeper cause.

## Original Prompt
see the image where the situation is shown. the selected tank targets another but stands still. All 3 tanks from different parties there have the same issue. The issue is not yet solved! I see no difference in behaviour.

## Findings

### Ruled Out
- A simple remaining fire gate such as `allowedToAttack`, missing ammo, or `canFire` staying false for all stalled tanks.
- A general tank-vs-tank combat failure: a controlled open-ground three-tank repro using the live runtime still fought correctly.
- A pure stop-vs-fire range mismatch in tank combat.

### Confirmed Root Cause
- In terrain-heavy cases, classic AI attack movement still tried to path to the target's exact tile.
- When that exact destination was occupied or otherwise not pathable, AI tanks could keep a target but end up with `path: []`.
- Because no fallback attack destination inside firing range was chosen, the units stayed locked on target and appeared idle forever.

## Implementation
- Added `findReachableAttackDestination()` in `src/ai/enemyUnitBehavior.js`.
- AI target acquisition and attack-path recalculation now try the exact target tile first, then fall back to the best reachable tile within weapon range when the direct path fails.
- Added a regression test proving `updateAIUnit()` chooses an in-range fallback tile when the exact target tile path is blocked.

## Validation
- Focused test: `tests/unit/enemyUnitBehavior.test.js`
- Full required suite: `npm run test:unit`
- Changed-file lint: `npm run lint:fix:changed`

## Commit Message
```
fix(ai): fall back to reachable in-range attack tiles
```