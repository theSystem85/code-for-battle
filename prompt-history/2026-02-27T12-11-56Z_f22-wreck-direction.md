# Prompt History
- UTC: 2026-02-27T12:11:56Z
- LLM: GPT-5.2-Codex

## Prompt
The user was unsatisfied with the code that the agent previously produced, which can be found as the latest commit in the git history.

<PREVIOUS_PR_TITLE>
Preserve F22 crash momentum, cap crash speed, add burning smoke visuals, and align wreck heading
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation
- Fix F22 crash behavior so an airborne F22 preserves its forward momentum and heading during the crash glide instead of dropping vertically. 
- Add visible burning/flame component to crash smoke and ensure the wreck sprite orientation matches the final crash heading. 
- Exempt F22 crash state from generic movement resets so crash-controlled velocity is not overwritten each frame and add an automated E2E regression to prevent future regressions.

### Description
- Update `src/game/movementF22.js` to sample and preserve the F22's pre-crash velocity (`f22CrashInitialSpeed`), apply a crash glide with a hard cap at 50% of the F22 max speed, persist a `f22CrashWreckDirection`, and emit smoke with `fireIntensity` during descent. 
- Update `src/game/movementCore.js` to skip zeroing target velocity and path handling for F22 units in `f22State === 'crashing'` so crash control is not overridden. 
- Extend smoke utilities in `src/utils/smokeUtils.js` to accept options and store per-particle `fireIntensity`, and update `src/rendering/effectsRenderer.js` to render a flame/glow overlay for smoke particles with `fireIntensity`. 
- Update `src/game/unitWreckManager.js` to use the persisted `f22CrashWreckDirection` for wreck `direction` so wreck orientation matches impact heading. 
- Add an end-to-end Playwright test `tests/e2e/f22CrashMomentum.test.js` that spawns an airborne F22, forces destruction, and asserts crash-state entry, forward movement during descent, crash speed cap, burning smoke emission, final crashed state, and wreck heading alignment. 
- Update tracking/docs and prompt history files (`TODO/Bugs.md`, `specs/021-f22-raptor-unit.md`, `specs/027-playwright-e2e-testing.md`, and `prompt-history/*`) to reflect the fixes and new test.

### Testing
- Ran repository lint flow with `npm run lint:fix:changed` which completed successfully. 
- Ran targeted ESLint on modified files (via `npx eslint`) with no errors reported. 
- Added a Playwright E2E test (`tests/e2e/f22CrashMomentum.test.js`), but the test was not executed in this environment because Playwright Chromium was not available and `npx playwright install chromium` failed (CDN `403`), so the E2E assertions remain un-run here.
</PREVIOUS_PR_DESCRIPTION>

<PREVIOUS_PR_DIFF_AND_COMMENTS>
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 3 additions, 0 deletions)
diff --git a/TODO/Bugs.md b/TODO/Bugs.md
(File changed with 2 additions, 0 deletions)
diff --git a/None b/prompt-history/2026-02-26T20-56-52Z_f22-crash-fire.md
(File changed with 6 additions, 0 deletions)
diff --git a/None b/prompt-history/2026-02-26T21-09-42Z_f22-crash-fix.md
(File changed with 52 additions, 0 deletions)
diff --git a/None b/prompt-history/2026-02-27T08-28-02Z_f22-crash-tuning.md
(File changed with 62 additions, 0 deletions)
diff --git a/specs/021-f22-raptor-unit.md b/specs/021-f22-raptor-unit.md
(File changed with 3 additions, 1 deletions)
diff --git a/specs/027-playwright-e2e-testing.md b/specs/027-playwright-e2e-testing.md
(File changed with 24 additions, 0 deletions)
diff --git a/src/game/movementCore.js b/src/game/movementCore.js
(File changed with 1 additions, 0 deletions)
diff --git a/src/game/movementCore.js b/src/game/movementCore.js
(File changed with 3 additions, 2 deletions)
diff --git a/src/game/movementF22.js b/src/game/movementF22.js
(File changed with 19 additions, 3 deletions)
diff --git a/src/game/unitWreckManager.js b/src/game/unitWreckManager.js
(File changed with 3 additions, 1 deletions)
diff --git a/src/rendering/effectsRenderer.js b/src/rendering/effectsRenderer.js
(File changed with 21 additions, 0 deletions)
diff --git a/src/utils/smokeUtils.js b/src/utils/smokeUtils.js
(File changed with 13 additions, 1 deletions)
diff --git a/None b/tests/e2e/f22CrashMomentum.test.js
(File changed with 181 additions, 0 deletions)
</PREVIOUS_PR_DIFF_AND_COMMENTS>

Please address any inline comments on the diff, as well as any additional instructions below.

now the wreck of the F22 on crash heads in the opposite direction compared to flight direction. fix that
