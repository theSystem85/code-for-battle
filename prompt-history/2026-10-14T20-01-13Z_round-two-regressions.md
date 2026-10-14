# Round 2 regression corrections

UTC: 2026-10-14T20:01:13.870020+00:00
Harness: Codex (API coding agent).
Model: GPT-6. The exact serving variant, model revision and reasoning level are not exposed in this session. Input, visible-output and reasoning token counts and exact total task duration are unavailable and omitted.

## Prompt

You are working in a git repository checked out at the current directory (branch codex/round-2-apply-the-given-patch-th-20261014-213027-3879f0, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
Round 2: apply the given patch, then correct the 4 Playwright E2E regression tests and fix real bugs per the context file

CONTEXT:
Repo: code-for-battle (vanilla JS RTS, Vite). Follow AGENTS.md strictly (English, lint clean, docs/changes note per issue, English prompt-history entry).
You have NO network and cannot run Playwright/browsers. Write Playwright E2E tests anyway; a human will run them and send failures back.

Handle FOUR issues. For EACH: (a) write a new permanent Playwright E2E test in tests/e2e/ following existing patterns (see tests/e2e/apacheAutoReturnHelipad.test.js, enemyAirTargetEligibility.test.js: goto '/?seed=N', wait for window.gameState/gameInstance/cheatSystem, skip tutorial, spawn units/buildings via cheat system or direct gameState manipulation, then assert behaviour with page.waitForFunction / expect.poll against game state). Tests must be deterministic and fail on the buggy behaviour. (b) Investigate the source code and fix the bug if present.

Issue 2: Defense turrets and tanks fire through buildings (TODO/Bugs.md "Defense turrets should not fire through buildings" and related). Shots must need line of sight, or buildings must block projectiles. Test: place turret/tank, a building between it and an enemy target; assert no firing / no damage through the building (target health unchanged), and that it does fire with a clear line.
Issue 3: Rocket tank rockets don't detonate on airborne targets and fire at the move destination (Bugs "Rocket tank rockets should detonate on airborne targets and stop firing at move destinations"). Test: rocket tank vs airborne Apache -> Apache takes damage; rocket tank given a move order with no target -> fires no rockets.
Issue 4: Multiple Apaches land on the same helipad when ordered one at a time; hovering an occupied helipad should show a blocked cursor (Bugs "Prevent multiple Apaches from landing on the same helipad", Improvements L74). Test: two Apaches, each individually ordered to the same helipad -> second must not land on the occupied pad (redirect to another free pad or stay airborne); cursor over occupied pad shows blocked state.
Issue 5: Enemy AI should send tanks missing crew members back to the hospital before continuing battle (Bugs item 7, spec specs/003-hospital-crew-system/spec.md). Test: enemy tank with missing crew and an enemy hospital -> AI moves it toward the hospital / it gets restored.

Also: add npm script "test:e2e:regressions" running exactly these 4 new files with --project=chromium. Do NOT change vitest config exclusion of tests/e2e. Do NOT edit TODO checkbox lines except ticking items you actually fixed. Put the four docs/changes notes as separate files. Summarize at the end per issue: whether you believe the bug existed in code, what you changed, the test file name.


=== ROUND 2 ===
=== ROUND 2 ===
FIRST apply the previous-round patch exactly (git apply); it is the starting point. (The ~770-line patch body is omitted here; it is the round-1 commit on this branch.)

## Human failure evidence supplied with the prompt

With fixes applied, using two Chromium workers:

- Building line-of-sight regression: the final conjunction (tank ammunition decreased, turret ammunition decreased, enemy health decreased) stayed false for 15,000ms; tests/e2e/buildingLineOfSightRegression.test.js:44.
- Apache helipad regression: first.landedHelipadId stayed null instead of helipad ID "60939ro1" for 30,000ms; tests/e2e/apacheHelipadOccupancyRegression.test.js:21.
- Rocket tank regression: Apache health stayed 10000 instead of less than 10000 for 20,000ms; tests/e2e/rocketTankAirAndMoveRegression.test.js:24.
- Hospital regression: final conjunction (gunner restored, returningToHospital and needsHospital cleared) stayed false for 60,000ms; tests/e2e/enemyHospitalCrewRegression.test.js:28.

Unmodified main, using two Chromium workers:

- The same line-of-sight final conjunction stayed false for 15,000ms.
- The same first Apache landing ID stayed null instead of "60939ro1" for 30,000ms.
- Hospital route assignment conjunction (returningToHospital, matching hospitalTarget, moveTarget coordinates smaller than map dimensions) stayed false for 15,000ms; tests/e2e/enemyHospitalCrewRegression.test.js:18.
- Rocket tank Apache damage check stayed at 10000 for 20,000ms.

## Repository instructions

RULES for agentic codeing
1) running a development server is allowed when required for verification/debugging (especially Playwright E2E), and should be used when a task depends on a live app runtime. You HAVE to run all unit tests using "npm run test:unit" before concluding your code changes and fix all issues in a meaningful way (means fix the root issues in the code and not just adjust the test to pass).
2) after completing any code implementation, always run `npm run lint:fix:changed` to auto-fix linting issues. If any errors remain that cannot be auto-fixed, manually resolve them before finishing the task.
3) with every prompt, record the feature, improvement, or bug in a new markdown file under `docs/changes/`. Name it `YYYY-MM-DD-<short-slug>.md` or `<pr-or-issue>-<slug>.md`. Do not append that note to the shared files `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Those three files are edited by almost every branch; on this invite-code branch `TODO/Features.md` had to be merged with main's offline-mode notes (#720) and `TODO/Bugs.md` conflicted on an earlier rebase of the same branch against main. Classify the note the same way those files used to: a bug is something broken or contrary to intended/spec'd behavior, an improvement is polish of something that already exists (performance, UX, refactors, balance), and a feature is a new capability. Use `- [ ]` while the work is open and `- [x]` when it is finished, a short **bold title**, one description line, and `Spec: [Title](../specs/....md)` or `Spec: none`. Spec content for a new feature goes in its own new file under `specs/`. Do not append that feature's requirements to an existing shared spec. A dedicated cleanup PR periodically consolidates `docs/changes/` back into `TODO/Bugs.md`, `TODO/Features.md`, and `TODO/Improvements.md`.
4) put the content of any prompt into the prompt-history folder and for each prompt create a new file inside that folder that has the UTC timestamp as its name followed by an underscore and up to 3 word summary (with dashes as separators) of the prompt so a user can quickly identify what the prompt was about when reading the filename. The file is and .md file with UTC timestamp added on top and the name of the LLM that processed it (copilot, chatGPT, codex, ...).
5) when adding new buildings to the game the sidebar image can be found in public/images/sidebar and the image to render the building on the map in public/images/map/buildings
6) when adding new units to the game the sidebar image can be found in public/images/sidebar and the image to render the unit on the map in public/images/map/units
7) when the image assets for the new units are not specified in the prompt search the content of the folders mentioned in rule 5 and 6 for matching filenames. The names should be self explanatory so you could easily match them to the new units or buildings that you have to implement. The assets are usually added to the repo before you have to start the implementation.
8) ALL LAND UNITS (tanks, trucks, harvesters, etc.) must spawn from the Vehicle Factory, not the Construction Yard. Apache helicopters spawn from Helipads. When adding a new land unit, always add it to the `vehicleUnitTypes` array in `src/productionQueue.js` to ensure proper spawn location.
9) Anser every prompt (when you actually changed code) with a last section that contains a commit message describing your last changes for the user to copy paste
10) !DISABLED FOR NOW!: for every implemented bugfix or feature request, always add a meaningful E2E test that verifies the implementation end-to-end. The workflow is mandatory: first implement the bugfix/feature, then in the same task implement the E2E test, run it, and keep improving code and/or test until the E2E test passes. The E2E test must stay behavior-driven and meaningful (the implementation must satisfy the real behavior being tested, not the test being weakened to fit current code).
11) SELF-BLOCKING OCCUPANCY WARNING: A unit's occupied tile MUST always be determined by the CENTER of the unit's image (`Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)`), NOT the top-left corner (`Math.floor(unit.x / TILE_SIZE)`). Additionally, the physics/collision system MUST always exclude a unit's own occupancy tile from blocking checks — otherwise the unit gets pushed away from its own tile, triggering pathfinding reroute loops. This has been a recurring source of bugs. When implementing any new feature or fixing bugs that involve occupancy, tile position, pathfinding, or collision logic, always verify: (a) tile position uses center-based formula, (b) self-occupancy is excluded in collision/blocking checks, (c) `unit.tileX`/`unit.tileY` assignment uses center-based formula.
12) HOT-LOOP PERFORMANCE GATE: Before changing code that runs every simulation tick, animation frame, entity render, or selected-unit overlay, explicitly identify the call frequency and multiply the proposed work by the expected entity count and device pixel ratio. Initialization/normalization helpers called from hot loops MUST be idempotent and preserve object/array identity after the first call; do not rebuild entity state, clone arrays, construct `Set`/`Map` instances, or allocate per-frame helper objects unless a measured benchmark proves the cost is safe. Do not perform `units.find(...)`, `buildings.find(...)`, or other linear scans inside a per-entity/per-turret loop; build or reuse one indexed lookup for the frame and skip lookup work entirely when no target/id exists.
13) CANVAS OVERDRAW WARNING: Never add large translucent fills, gradients, shadows, filters, dashed paths, or clips whose pixel area scales with weapon range/map size to a per-frame canvas path without measuring raster cost at the actual high-DPI backing resolution. Range/selection indicators should render only their visible boundary, cull themselves when that boundary is outside the viewport, and avoid full-viewport alpha blending. Keep independent sprite layers to the minimum draw calls required by the behavior and cache only when the cache is bounded and demonstrably cheaper.
14) STRICT 75 FPS PERFORMANCE GATE: Unit tests and lint do not detect FPS regressions. All new code changes must preserve a minimum of 75 FPS during fast scrolling and the feature's active worst case on the qualifying reference hardware, at unchanged visual quality and settings. The frame deadline is 1000/75 = 13.333... ms. For every update/render hot-path change, run representative before/after live benchmarks including cold first traversal after preparation, repeated full-map scrolling, selected layered units, firing effects, movement, procedural water, and realistic entity counts. Record independently measured FPS, frame-time p95/p99/max and missed deadlines, CPU update/render time, actual backend/DPR, GPU timing where available, and memory/GC evidence. Do not finish or mark performance work complete while application-caused frames miss the 75 FPS deadline. The previous 20% regression allowance and lower 30/40/60 FPS floors are superseded; a relative improvement below 75 FPS does not pass. Do not reduce resolution, detail, effects, animation cadence, or visual fidelity to pass. Add/update focused reproducible performance coverage and document exact commands/results in the affected spec. A display/browser limited below 75 Hz, headless/software-only run, or externally throttled session cannot certify 75 presented FPS: report that limitation and retain the qualifying-hardware check as outstanding, never silently lower the gate. See performance_improvement.md for the acceptance protocol.
15) Always name the exact model you are running for each prompt in the prompt hisotry not just the harness or model family like "codex". I want exact model name with reasoning level if possible and exact version of the model! Also put there how many token you used for input, visible output and reasoning and how long the entire task took! If available also put in which harness was used! Example:
"Codex using GPT5.6-Sol(High) took 18m15s (50k in/500 visible_out/20k resoning)". If the exact numbers cannot be provided ensure the numbers are left out and NOT filled with hallucinated ones.
16) in each response to a prompt ensure that you put a commit message (conventional commits) in the end that contains a title and a few lines of description below in bullet point what was done/fixed in a box that user can copy paste.
17) All new image and other binary asset files added to the repository MUST use WebP format with 85% compression. Do not add new PNG, JPG, or other binary formats.
18) PREPARED RENDERING REQUIREMENT: Prepare static terrain, final-size map/entity imagery, masks, shaders and necessary texture uploads before gameplay where possible, using explicit readiness and bounded byte budgets. Do not perform ordinary source-image resizing or lazily build resized sprite variants during gameplay; plane/helicopter takeoff and landing size animations are the only authorized animation exceptions. Preserve continuous rotation, clipping, procedural-water animation and existing visuals. Account for effective canvas DPR when auditing resizing. Handle explicit display/graphics changes through a controlled preparation-and-swap lifecycle. If another dynamic visual cannot satisfy this policy without deterioration, document the conflict instead of silently exempting it or degrading the image. Follow rendering_improvement_todos.md for staged ownership and implementation.
19) Codebase prompt-history entries are always written in English, regardless of the language of the user's message. When the user wrote the request in German or any other language, translate it into English in the new file under `prompt-history/`. Do not rewrite older prompt-history files.
20) Before every commit, run `npm run lint` and fix every reported issue. Never weaken, disable, or skip lint rules to make CI pass, and never omit the lint step from CI.

## Git / Workflow

Never merge `main` into a feature branch, and never create merge commits. Update a feature branch with `git fetch && git rebase origin/main`, then push with `git push --force-with-lease`. Merge pull requests without merge commits (squash or rebase).


## Outcome

Applied the supplied starting changes using git apply. Kept the four-file Chromium script and Vitest configuration unchanged. Corrected fixtures and diagnostics, fixed rocket hull/altitude firing alignment and Apache settling-state persistence, per-pad timer ownership and center-based touchdown coordinates, and retained hospital routing/priority/completion fixes. Independent runtime coverage uses real movement, combat, projectiles, pathfinding and service logic with audio/UI entry points mocked. No browser execution, commits, pushes or remote changes. Final validation results and outstanding browser/performance checks are recorded in the separate issue notes.

Final checks: `npm run test:unit` passed (256 files, 4,866 tests); `npm test` passed (258 files, 4,952 tests); `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed. The focused main baseline comparison failed nine targeted assertions (30 passed), including hospital route coordinates and rocket/Apache behavior; the line-of-sight runtime check passed on main. Human Chromium execution and qualifying-hardware 75 FPS acceptance remain outstanding.
