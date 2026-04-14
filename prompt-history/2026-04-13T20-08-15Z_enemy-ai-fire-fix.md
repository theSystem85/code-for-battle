# Prompt History Entry

**UTC Timestamp:** 2026-04-13T20:08:15Z
**LLM:** GitHub Copilot (GPT-5.4)

## Prompt Summary
Investigate why enemy tanks and possibly other units target each other without firing, explain the root cause, and fix it.

## Original Prompt
there is currently an issue with enemy tanks (and maybe also other units not fireing at each other when I can see that they targetted each other already (red indicator is visible when enemy unit is selected)). Find out why that is, explain it to me why it happend and fix the issue.

## Changes Made

### Root Cause Analysis
- Confirmed that combat execution for AI-owned tanks/howitzers is gated by `unit.allowedToAttack === true`.
- Confirmed that target assignment and red target-indicator rendering can persist independently of that flag.
- Found that `allowedToAttack` was only refreshed from the throttled classic-AI strategy pass, which is limited by `AI_DECISION_INTERVAL = 5000`.
- As a result, AI units could visibly keep targets while the combat loop continued to reject firing because the permission bit was stale.

### Implementation
- Added a lightweight per-tick sync in `src/ai/enemyUnitBehavior.js` for classic AI ground combat units that already have a target.
- Kept the broader strategy throttle in place so pathing and movement behavior still avoid the old wiggling regressions.
- Added a unit regression test proving that `allowedToAttack` is refreshed even when the AI is still between full decision ticks.

## Validation
- Focused test: `tests/unit/enemyUnitBehavior.test.js`
- Full required suite planned/executed in the same task: `npm run test:unit`
- Changed-file lint planned/executed in the same task: `npm run lint:fix:changed`

## Commit Message
```
fix(ai): refresh targeted enemy fire permission between decision ticks
```