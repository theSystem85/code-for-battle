# UTC Timestamp
2026-03-28T20:47:38Z

# Model
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Stabilize enemy harvester reroutes, pause harvester economy during retreat, and add debug unit command overlay
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Prevent rapid AI reroute spam and visible path-line flicker on enemy harvesters under attack by consolidating reroute ownership and throttling recomputes.  
- Stop harvester economy automation from immediately overwriting retreat routing so retreat logic is the single owner of movement intent.  
- Provide an in-game debug overlay to inspect recent high-level unit commands (player and AI) without logging every intermediate movement step.

### Description
- Add a shared reroute throttle (`AI_REROUTE_MIN_INTERVAL_MS = 2000`) and per-unit `lastAiRerouteTime` in `src/ai/retreatLogic.js`, reuse active retreat plans during the cooldown, and record `lastAiRerouteTime` when computing a new retreat path.  
- Prevent pointless damage-only retreats when harvesters are actively harvesting, unloading, or already at their assigned ore tile, and apply a short post-retreat re-engage cooldown (`harvester.harvesterRetreatCooldownUntil = now + 4000`) to avoid immediate re-trigger loops (changes in `src/ai/retreatLogic.js` and `src/ai/enemyStrategies.js`).  
- Suspend harvester economy loops while `isRetreating` is true by clearing scheduled ore/unload actions and ore state so economy code no longer overwrites retreat routing (`src/game/harvesterLogic.js`).  
- Remove the generic attack-move reroute ownership for AI-controlled units so dedicated AI systems remain the sole movement owner (`src/game/unitMovement.js`), and add a per-unit command history collector (`src/game/unitCommandHistory.js`) hooked into `updateUnitMovement` to capture high-level `move`/`attack`/`retreat` signals while avoiding spam for intermediate sub-path changes.  
- Add a debug UI overlay `src/ui/debugUnitCommandOverlay.js` (toggleable minimize/maximize header) and initialize it from `src/main.js` when `?debug` is present; this panel shows the last 10 high-level commands for the single selected unit.  
- Add behavior/spec documentation and artifacts: `specs/058-enemy-ai-reroute-throttle.md`, `specs/059-debug-unit-command-overlay.md`, update `TODO/Bugs.md`, and save related prompt-history files.  
- Add unit tests for the new command-history behavior (`tests/unit/unitCommandHistory.test.js`).

### Testing
- Ran lint auto-fix with `npm run lint:fix:changed`, which succeeded.  
- Ran focused retreat tests with `npx vitest run tests/unit/retreat.test.js`, which passed (`35 tests passed`).  
- Ran the new command-history unit test with `npx vitest run tests/unit/unitCommandHistory.test.js`, which passed.  
- Attempts to run the full unit-suite surfaced pre-existing unrelated failures in other modules and did not indicate regressions from these changes.
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
... (truncated in history copy) ...
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

1) when the logs get minimized ensure there is only the maximize button visible but nothing of the logs menu itself. Make sure the maximize logs button goes to the bottom right of the screen but above the condensed side bar if present.

2) There are still lots of quick rerouting loops going on with the enemy ai that need to be fixed. When looking at the logs just see move commands so we need some more detailed logging there. I also noticed with harvesters that no new commands coming in but the harvester is going back on forth on the ore field without doing anything useful like conflicting commands coming in that get into a feedback loop. Dig deeper to figure out why and fix it.

3) I also noticed that enemy tanks when moving to a target also reroute on the way to the target without actually a good reason for it since the way to the target was clear without obstacles. The problem is that on every reroute the tank got distracted and deviated from the optimal path to the target a bit. Try to find out why and fix the issue and explain the reasons to me.
