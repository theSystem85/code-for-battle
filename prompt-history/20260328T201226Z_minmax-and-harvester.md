# UTC Timestamp
2026-03-28T20:12:26Z

# Model
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Stabilize enemy harvester reroutes, pause harvester economy during retreat, and add debug unit command overlay
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Prevent rapid AI reroute spam and visible path flicker on enemy harvesters under attack by consolidating reroute ownership and throttling recomputes. 
- Stop harvester economy automation from immediately overwriting retreat routing so retreat logic is the single owner of movement intent. 
- Avoid immediate retreat re-trigger loops after stop-retreat and provide a developer debug overlay to inspect recent high-level unit commands. 

### Description
- Add a shared reroute throttle `AI_REROUTE_MIN_INTERVAL_MS = 2000` and per-unit `lastAiRerouteTime` in `src/ai/retreatLogic.js` so AI-initiated reroutes for the same retreat target are limited to once every 2 seconds and reuse active retreat plans during the cooldown. 
- Apply a short post-retreat re-engage cooldown (`harvester.harvesterRetreatCooldownUntil = now + 4000`) when stopping a harvester retreat and gate `shouldHarvesterSeekProtection` with that cooldown. 
- Suspend harvester economy loops in `src/game/harvesterLogic.js` while `isRetreating` is true by clearing scheduled ore/unload actions and ore state so economy code cannot immediately overwrite retreat routing. 
- Disable the generic attack-move reroute ownership for AI-controlled units in `src/game/unitMovement.js` so dedicated AI systems remain the sole movement owner for enemy units. 
- Add a per-unit command history system `src/game/unitCommandHistory.js` with `observeUnitCommandSignals`, and wire it into `updateUnitMovement` to capture high-level move/attack/retreat signals and prune stale histories. 
- Provide a debug overlay `src/ui/debugUnitCommandOverlay.js` initialized from `src/main.js` that shows the last 10 high-level commands for the single selected unit when `?debug` is enabled. 
- Add spec and documentation entries: `specs/058-enemy-ai-reroute-throttle.md`, `specs/059-debug-unit-command-overlay.md`, update `TODO/Bugs.md` and save prompt history files. 
- Add unit tests `tests/unit/unitCommandHistory.test.js` to validate command capture and history cap. 

### Testing
- Ran lint auto-fix with `npm run lint:fix:changed`, which succeeded. 
- Ran focused retreat unit tests with `npx vitest run tests/unit/retreat.test.js`, which passed (`35 tests passed`). 
- Ran the new command-history unit test with `npx vitest run tests/unit/unitCommandHistory.test.js`, which passed. 
- A broader/full unit test run was attempted and surfaced unrelated pre-existing failures in other modules that are not caused by these changes.
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 5 additions, 0 deletions)
diff --git a/TODO/Features.md b/TODO/Features.md
(File changed with 1 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T085557Z_enemy-reroute-throttle.md
(File changed with 8 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T091552Z_harvester-reroute-loop.md
(File changed with 48 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T154134Z_harvester-reroute-followup.md
(File changed with 51 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T194920Z_debug-command-overlay.md
(File changed with 56 additions, 0 deletions)
diff --git a/None b/specs/058-enemy-ai-reroute-throttle.md
(File changed with 49 additions, 0 deletions)
diff --git a/None b/specs/059-debug-unit-command-overlay.md
(File changed with 29 additions, 0 deletions)
diff --git a/src/ai/enemyStrategies.js b/src/ai/enemyStrategies.js
(File changed with 4 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 36 additions, 1 deletions)
diff --git a/src/game/harvesterLogic.js b/src/game/harvesterLogic.js
(File changed with 13 additions, 0 deletions)
diff --git a/None b/src/game/unitCommandHistory.js
(File changed with 116 additions, 0 deletions)
diff --git a/src/game/unitMovement.js b/src/game/unitMovement.js
(File changed with 15 additions, 0 deletions)
diff --git a/src/game/unitMovement.js b/src/game/unitMovement.js
(File changed with 2 additions, 0 deletions)
diff --git a/src/game/unitMovement.js b/src/game/unitMovement.js
(File changed with 4 additions, 0 deletions)
diff --git a/src/main.js b/src/main.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/main.js b/src/main.js
(File changed with 4 additions, 0 deletions)
diff --git a/None b/src/ui/debugUnitCommandOverlay.js
(File changed with 97 additions, 0 deletions)
diff --git a/None b/tests/unit/unitCommandHistory.test.js
(File changed with 36 additions, 0 deletions)
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

Wnsure the debug commands list can be minimized and maximized.

There is an issue with the enemy harvesters rerouting when trying to harvest so that they just move around and turn around actually doing nothing useful anymore even when they are directly at the ore field. solve that issue as well and explain why it happened in the first place!

Also ensure the logging does not show each position the units move to only when new hight level orders come in for example when moving to a new target location but I dont want to see logs for every move (position change) on the way to the taget or every sub path.
