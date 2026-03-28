# UTC Timestamp
2026-03-28T09:15:52Z

# Model
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Throttle enemy AI harvester reroutes (>=2s)
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Enemy AI units (notably harvesters under attack) were recomputing retreat paths very frequently causing rapid visual path flicker and wasted CPU. 
- Prevent duplicate/competing reroute processes by consolidating reroute logic and enforcing a minimum interval between AI-initiated reroutes.

### Description
- Add a global reroute throttle constant `AI_REROUTE_MIN_INTERVAL_MS = 2000` in `src/ai/retreatLogic.js` to enforce a 2s minimum between AI reroutes. 
- Track per-unit reroute time with `harvester.lastAiRerouteTime` and, when the retreat target is unchanged and an active retreat path exists, skip recomputing a path until the cooldown expires. 
- When a new retreat path is calculated, record `lastAiRerouteTime` and set `moveTarget`/`retreatTarget` while clearing ore/harvest state to preserve retreat semantics. 
- Add documentation and tracking: update `TODO/Bugs.md`, add `specs/058-enemy-ai-reroute-throttle.md`, and save the prompt to `prompt-history/20260328T085557Z_enemy-reroute-throttle.md`.

### Testing
- Ran lint auto-fix via `npm run lint:fix:changed` (succeeded).
- Ran the focused unit tests `npx vitest run tests/unit/retreat.test.js` which passed (35 tests passed).
- Attempted broader unit test runs that include other suites (`tests/unit/enemyUnitBehavior.test.js` / full unit set); the full run surfaced many pre-existing unrelated failures in other modules (these failures are not related to this change).

Commit message: `Fix enemy harvester reroute spam under attack`
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 1 additions, 0 deletions)
diff --git a/None b/prompt-history/20260328T085557Z_enemy-reroute-throttle.md
(File changed with 8 additions, 0 deletions)
diff --git a/None b/specs/058-enemy-ai-reroute-throttle.md
(File changed with 26 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/ai/retreatLogic.js b/src/ai/retreatLogic.js
(File changed with 23 additions, 0 deletions)
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

The issue still happens when I attack an enemy harvester. As soon as it got hit it starts to reroute so quickly it does not even move anymore. Looks like it wants to go back to base and then again to ore field in a loop quickly. Make sure to find the conflicting policies and solve the issue. Let me know what you figured out and explain it as well.
