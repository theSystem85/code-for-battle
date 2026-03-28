# UTC Timestamp
2026-03-28T15:41:34Z

# Model
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Throttle enemy harvester reroutes and pause economy loops during retreat
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Enemy harvesters under attack were rapidly recomputing retreat paths causing visible path-line flicker and wasted CPU. 
- Harvester economy automation could still issue ore/unload routing while `isRetreating` was active, creating a retreat-vs-economy tug-of-war that overwrote retreat paths.

### Description
- Add a shared reroute cooldown `AI_REROUTE_MIN_INTERVAL_MS = 2000` and record per-unit `lastAiRerouteTime` in `src/ai/retreatLogic.js` to limit AI-initiated reroutes to once every 2 seconds for the same retreat target. 
- When the retreat target is unchanged and a valid retreat path exists within the cooldown window, reuse the existing retreat plan and preserve retreat state (`isRetreating`, `retreatIssuedByPlayer`, `moveTarget`) without recomputing a path. 
- When computing a new retreat path, set `lastAiRerouteTime`, clear ore/harvest state, and assign `moveTarget`/`retreatTarget` so retreat logic remains authoritative. 
- Suspend harvester economy loops in `src/game/harvesterLogic.js` while `isRetreating` is true by clearing scheduled ore actions, `oreField`, and unloading/harvest flags so economy code does not immediately overwrite retreat routing. 
- Add a behavior spec `specs/058-enemy-ai-reroute-throttle.md`, save prompt history, and update `TODO/Bugs.md` to document the fix.

### Testing
- Ran lint auto-fix via `npm run lint:fix:changed`, which succeeded. 
- Ran focused unit tests `npx vitest run tests/unit/retreat.test.js`, which passed (35 tests passed). 
- A broader/full unit test run surfaced unrelated pre-existing failures in other modules and did not indicate regressions from these changes.
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 2 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T085557Z_enemy-reroute-throttle.md
(File changed with 8 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T091552Z_harvester-reroute-loop.md
(File changed with 48 additions, 0 deletions)
diff --git a/None b/specs/058-enemy-ai-reroute-throttle.md
(File changed with 34 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 23 additions, 0 deletions)
diff --git a/src/game/harvesterLogic.js b/src/game/harvesterLogic.js
(File changed with 13 additions, 0 deletions)
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

The issue still happens, try harder to fit it
