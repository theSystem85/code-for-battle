# UTC Timestamp
2026-03-28T19:49:20Z

# Model
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Throttle harvester AI reroutes, pause economy during retreat, and add retrigger cooldown
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Prevent rapid enemy harvester reroute spam and visible path flicker when under attack by consolidating reroute ownership and throttling recompute frequency. 
- Stop harvester economy automation from immediately overwriting retreat routing to remove retreat-vs-economy tug-of-war. 
- Avoid immediate retreat re-trigger loops caused by lingering `recentlyDamaged` heuristics after retreat exit.

### Description
- Add a shared reroute throttle `AI_REROUTE_MIN_INTERVAL_MS = 2000` and per-unit `lastAiRerouteTime` in `src/ai/retreatLogic.js` so AI-initiated reroutes for the same retreat target are limited to once every 2 seconds. 
- Reuse an active retreat path during the cooldown window by short-circuiting `handleHarvesterRetreat` when the retreat target is unchanged and `lastAiRerouteTime` is recent, preserving `isRetreating` and clearing ore state. 
- Suspend harvester economy loops in `src/game/harvesterLogic.js` while `isRetreating` is true by clearing scheduled actions and ore/unload flags so retreat logic is the sole owner of movement intent. 
- Apply a short post-retreat re-engage cooldown (`harvester.harvesterRetreatCooldownUntil = now + 4000`) when stopping a harvester retreat so damage-only triggers cannot immediately re-enter retreat, while still allowing real nearby threats to bypass the cooldown. 
- Add a behavioral spec `specs/058-enemy-ai-reroute-throttle.md`, save prompt history files, and update `TODO/Bugs.md` to document the fixes and follow-up root causes.

### Testing
- Ran lint auto-fix with `npm run lint:fix:changed`, which succeeded. 
- Ran focused unit tests with `npx vitest run tests/unit/retreat.test.js`, which passed (`35 tests passed`). 
- A broader/full unit test run was attempted and surfaced unrelated pre-existing failures in other modules that are not caused by these changes.
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 3 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T085557Z_enemy-reroute-throttle.md
(File changed with 8 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T091552Z_harvester-reroute-loop.md
(File changed with 48 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T154134Z_harvester-reroute-followup.md
(File changed with 51 additions, 0 deletions)
diff --git a/None b/specs/058-enemy-ai-reroute-throttle.md
(File changed with 42 additions, 0 deletions)
diff --git a/src/ai/enemyStrategies.js b/src/ai/enemyStrategies.js
(File changed with 4 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 36 additions, 1 deletions)
diff --git a/src/game/harvesterLogic.js b/src/game/harvesterLogic.js
(File changed with 13 additions, 0 deletions)
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

The issue still happens! Try harder to fix it. Besides that Ensure that I can open the page in debug mode with the "debug" query parameter set and then when I select a unit I can see the last 10 commands that the unit received (should also work for enemy units) in a list popping up in the middle of the right screen. That list closes when unit gets deselected again. Make sure that any high level commands from ai and player units will be logged there.
