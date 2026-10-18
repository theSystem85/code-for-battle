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

Never merge `main` (or `dev`) into a feature branch, and never create merge commits. Update a feature branch with `git fetch && git rebase origin/<target>` (`main` in main mode, `dev` in dev mode, see Deployment), then push with `git push --force-with-lease`. Merge pull requests with **rebase merge** so every commit is kept; do not squash unless Patrick asks for it.

## Deployment

### Modes

The repository has two long-lived branches: `main` (production, https://code-for-battle.netlify.app) and `dev` (branch deploy, https://dev--code-for-battle.netlify.app). Patrick switches between the two modes in chat ("work on dev now", "back to main"). Agents keep using the current mode until he says otherwise. Codex is only prompted through Grok Bot, so Grok Bot must tell Codex which mode is active and which base branch to use.

- **Main mode (default):** branch from `main`, open a PR into `main` (draft until it is ready), wait for the Netlify deploy preview and CI to pass, and merge **only when Patrick asks**. Never merge into `main` on your own.
- **Dev mode:** branch from `dev` and open a PR into `dev`, also for Codex tasks (Codex Cloud `--branch dev`, PR base `dev`). As soon as the PR has no conflicts with `dev` (rebase it onto `origin/dev` if needed), merge it with a rebase merge right away. No review wait. Patrick authorised this auto-merge for PRs into `dev` only. One agent per feature branch; never push directly to `dev`.

### Checks before every push

There is no CI on `dev` and deploys are not gated, so the agent that pushes is the safety net. Before **every** push (any branch, both modes) run locally and fix all failures:

1. `npm run lint`
2. `npm run test` (unit and integration tests)
3. `npm run test:e2e` (Playwright, Chromium). If the full suite cannot run in your environment, run the e2e tests that cover the changed area and say exactly what was skipped in the PR description.

GitHub Actions (`.github/workflows/ci.yml`) only runs for PRs into `main` and pushes to `main`. Do not add CI jobs for `dev`.

### Netlify

- `main` deploys to production.
- `dev` is the only branch deploy. Netlify builds it right after each merge into `dev`.
- Deploy previews are built for PRs into `main` only. PRs into `dev` get no preview; test them on the dev deploy after the merge.
- Netlify cannot filter by PR base on its own, so `netlify.toml` runs `node scripts/netlify-ignore.mjs` as its `ignore` command. It builds production, builds the `dev` branch deploy, skips any other branch deploy, and skips deploy previews whose PR base is `dev` (looked up on the public GitHub API; if the lookup fails it builds).
- **Backend separation:** the dev branch deploy uses the same Upstash Redis database and Netlify Blobs stores as production, but Netlify sets `REDIS_KEY_PREFIX=dev:` for the branch-deploy context only. Every Redis key (multiplayer stats Lua scripts) and every Blobs key (signalling, invite codes, Blobs stats fallback) is then written under `dev:` (`src/network/storageKeyPrefix.js`). Production has no prefix. Any new server or edge code that touches Redis or Blobs must go through that prefix (`readStorageKeyPrefix` / `prefixBlobStore`) and needs a test for it.

### Branch protection

`main` is protected: no direct pushes, no force-pushes, no deletion; changes land only through PRs with a passing `smoke-test` CI check. This also applies to admins.

### Releases (dev to main)

A release moves everything from `dev` to `main`. Use the "make a release" skill (`skills/make-a-release/SKILL.md`) when Patrick says "make a release". In short:

1. On a branch from up-to-date `dev`, run `npm run release -- --dry-run` and show Patrick the changelog and new version.
2. After his OK, run `npm run release`. It folds all `features/unreleased/**` entries into `features/<version>.json`, deletes the entry files, writes the version into `package.json` and `package-lock.json`, commits `chore(release): X.Y.Z` and creates a local tag `vX.Y.Z`. It pushes nothing.
3. Get that commit onto `dev` (PR into `dev`, auto-merged), then open a PR from `dev` into `main` and **rebase-merge** it. All dev commits are kept on `main`, nothing is squashed.
4. The rebase merge gives the commits new ids, so on the updated `main` run `npm run release:tag` (moves `vX.Y.Z` onto the release commit on `main`) and push the tag with `git push origin vX.Y.Z`.
5. Reset `dev` to `main` with `git push --force-with-lease=dev:<old dev sha> origin origin/main:dev`. This force-push is allowed **only right after a release and only if nothing new landed on `dev`** since the release PR was opened. If something did land, stop and ask Patrick.

In main mode a release works the same way, except the release commit goes through a PR into `main` and step 5 is skipped.

## Versioning and release notes

Never edit the version by hand. `package.json` holds the **last released** version and changes only through `npm run release`. There is no committed generated version file any more: `src/version.js` reads `__APP_VERSION__`, which `vite.config.js` (and `vitest.config.js`) compute at build time with `scripts/versioning.mjs`.

Every PR that changes behaviour adds one small file per change under `features/unreleased/<category>/`, where category is `features`, `improvements` or `bugfixes`:

```json
{ "description": "One short, user-facing line that fits the loading screen." }
```

Name it `<pr-number>-<slug>.json` or `<YYYY-MM-DD>-<slug>.json`. Add `"breaking": true` for a breaking change. Never edit another PR's entry file and never edit released `features/<version>.json` files. Because each PR only adds its own files, parallel branches never conflict on the version.

The shown version is computed with semver from `package.json` plus the unreleased entries: any breaking entry bumps the major version, any feature bumps the minor version, otherwise any improvement or bugfix bumps the patch version. Netlify deploy previews append their PR number (for example `0.62.1-pr757`); production, `dev` and local builds show the plain version. `npm run version:show` prints the current value.

Classify entries the same way as `docs/changes/` notes: a bug is something broken or contrary to intended behaviour, an improvement is polish of something that exists, a feature is a new capability.

The app bundles the released files and the unreleased entries for offline access and uses the same release-digest component in the loading screen and User Manual (`src/ui/releaseDigest.js`): unreleased entries count as part of the current build version. Loading prioritizes features, displays only improvement/bugfix counts when features exist, and falls back to improvement/bugfix descriptions when there are no new features. These entries are required in addition to `docs/changes/`, specs, and prompt history.

## Pull request descriptions

Every PR description (by any agent, into `main` or `dev`) contains a **manual test plan** that covers every new feature, bugfix and improvement in the PR. It is a Markdown table with one row per test step and these columns, in this order:

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Loading screen | Open the deploy preview | Version shows `v0.62.1-pr757` | 2: U05170, U05171 | 0 |

- IDs are `T01`, `T02`, ... per PR.
- The last two columns give the number of unit and e2e tests that cover the row, followed by their IDs (`0` when none).
- GitHub does not render clickable checkboxes inside tables, so put the checkboxes in a task list directly below the table, one per row and keyed by the same ID, for example `- [ ] T01 Loading screen version label`. The reviewer ticks them on GitHub after verifying each step.
- `.github/pull_request_template.md` holds this skeleton.
