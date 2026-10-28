RULES for agentic codeing
1) running a development server is allowed when required for verification/debugging (especially Playwright E2E), and should be used when a task depends on a live app runtime. You HAVE to run all unit tests using "npm run test:unit" before concluding your code changes and fix all issues in a meaningful way (means fix the root issues in the code and not just adjust the test to pass). This test requirement does not apply to a docs-only change (rule 21).
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
14) STRICT 75 FPS PERFORMANCE GATE: All new code changes must preserve a minimum of 75 FPS during fast scrolling and the feature's active worst case on qualifying reference hardware, at unchanged visual quality and settings. The frame deadline is 1000/75 = 13.333... ms. **Never run GPU/performance-related tests or benchmarks unless the environment has a verified hardware GPU.** SwiftShader, llvmpipe, software adapters, CPU fallback, or merely exposing WebGL/WebGPU APIs do not qualify. When no hardware GPU is available, leave GPU/performance verification to Patrick on `dev` or a Deploy Preview; do not run software-only before/after benchmarks or keep retrying performance tests. Record hardware acceptance as pending and continue the authorized PR/dev workflow so Patrick can test with his GPU. An explicit instruction to stop or skip tests overrides the routine test commands in this file. On qualifying hardware, representative measurements must include cold first traversal after preparation, repeated full-map scrolling, selected layered units, firing effects, movement, procedural water, and realistic entity counts. Record independently measured FPS, frame-time p95/p99/max and missed deadlines, CPU update/render time, actual backend/DPR, GPU timing where available, and memory/GC evidence. Do not claim performance acceptance while application-caused frames miss the 75 FPS deadline. Do not reduce resolution, detail, effects, animation cadence, or visual fidelity to pass. Add/update focused reproducible performance coverage and document exact commands/results in the affected spec. A display/browser limited below 75 Hz, headless/software-only run, or externally throttled session cannot certify 75 presented FPS: retain the qualifying-hardware check as outstanding, never silently lower the gate. See performance_improvement.md for the acceptance protocol.
15) Always name the exact model you are running for each prompt in the prompt hisotry not just the harness or model family like "codex". I want exact model name with reasoning level if possible and exact version of the model! Also put there how many token you used for input, visible output and reasoning and how long the entire task took! If available also put in which harness was used! Example:
"Codex using GPT5.6-Sol(High) took 18m15s (50k in/500 visible_out/20k resoning)". If the exact numbers cannot be provided ensure the numbers are left out and NOT filled with hallucinated ones.
16) in each response to a prompt ensure that you put a commit message (conventional commits) in the end that contains a title and a few lines of description below in bullet point what was done/fixed in a box that user can copy paste.
17) All new image and other binary asset files added to the repository MUST use WebP format with 85% compression. Do not add new PNG, JPG, or other binary formats.
18) PREPARED RENDERING REQUIREMENT: Prepare static terrain, final-size map/entity imagery, masks, shaders and necessary texture uploads before gameplay where possible, using explicit readiness and bounded byte budgets. Do not perform ordinary source-image resizing or lazily build resized sprite variants during gameplay; plane/helicopter takeoff and landing size animations are the only authorized animation exceptions. Preserve continuous rotation, clipping, procedural-water animation and existing visuals. Account for effective canvas DPR when auditing resizing. Handle explicit display/graphics changes through a controlled preparation-and-swap lifecycle. If another dynamic visual cannot satisfy this policy without deterioration, document the conflict instead of silently exempting it or degrading the image. Follow rendering_improvement_todos.md for staged ownership and implementation.
19) Codebase prompt-history entries are always written in English, regardless of the language of the user's message. When the user wrote the request in German or any other language, translate it into English in the new file under `prompt-history/`. Do not rewrite older prompt-history files.
20) Before every commit, run `npm run lint` and fix every reported issue. Never weaken, disable, or skip lint rules to make CI pass, and never omit the lint step from CI. This includes a docs-only commit (rule 21): lint is not a test.
21) DOCS-ONLY CHANGES: When a change **only** adds or edits documentation Markdown (`.md`) files, and none of those files is code or a configuration file, do **not** run any tests at all. Commit and push that change **straight onto the `dev` branch** with **no pull request** and no feature branch. Do not push it to `main`. Follow a different branch, pull request, or test demand only when the user explicitly asks for it. The full definition and the exclusions are under "Docs-only changes".

## Standing execution preferences

Patrick preauthorizes Vitest runs in this repository, including required test subprocesses. Routine `npm ci` and Playwright runs in this repository are also preauthorized. Do not ask for confirmation for routine Vitest execution. Sandbox/tool enforcement may still require the supported permission mechanism; this preference does not disable platform controls.

## Git / Workflow

Patrick has pre-authorized Git operations for this repository workflow, including reads, fetches, branches, commits, rebases and pushes. Do not ask again for routine Git confirmation. Keep following the branch and deployment safeguards below.

Never merge `main` (or `dev`) into a feature branch, and never create merge commits. Update a feature branch with `git fetch && git rebase origin/<target>` (`main` in main mode, `dev` in dev mode, see Deployment), then push with `git push --force-with-lease`. Merge pull requests with **rebase merge** so every commit is kept; do not squash unless Patrick asks for it.

## Deployment

### Modes

The repository has two long-lived branches: `main` (production, https://code-for-battle.netlify.app) and `dev` (branch deploy, https://dev--code-for-battle.netlify.app). Default to `dev`: create a feature branch from current `origin/dev`, open a PR against `dev`, run the required checks, and rebase-merge it once conflict-free. A docs-only change is the exception (rule 21): push it straight to `dev` with no pull request and do not run tests. Always return the PR link and the verified dev deployment URL (`https://dev--code-for-battle.netlify.app`); PRs into both `dev` and `main` get separate Netlify deploy previews. Persist this default until Patrick explicitly changes it. Do not stop after local changes.

Patrick switches between the two modes in chat ("work on dev now", "back to main"). Agents keep using the current mode until he says otherwise. Codex is only prompted through Grok Bot, so Grok Bot must tell Codex which mode is active and which base branch to use.

- **Main mode (only when explicitly requested):** branch from `main`, open a PR into `main` (draft until it is ready), wait for the Netlify deploy preview and CI to pass, and merge **only when Patrick asks**. Never merge into `main` on your own.
- **Dev mode (default):** branch from `dev` and open a PR into `dev`, also for Codex tasks (Codex Cloud `--branch dev`, PR base `dev`). As soon as the PR has no conflicts with `dev` (rebase it onto `origin/dev` if needed), merge it with a rebase merge right away. No review wait. Patrick authorised this auto-merge for PRs into `dev` only. One agent per feature branch; never push directly to `dev`, except a docs-only change (rule 21), which is pushed straight to `dev` with no pull request.

### Checks before every push

There is no CI on `dev` and deploys are not gated, so the agent that pushes is the safety net. Before **every** push (any branch, both modes) run locally and fix all failures:

1. `npm run lint` (ESLint plus the test ID check)
2. `npm run test` (unit and integration tests)
3. `npm run test:e2e` (Playwright, Chromium). If the full suite cannot run in your environment, run the e2e tests that cover the changed area and say exactly what was skipped in the PR description.

A docs-only change skips the test commands in this list. Run `npm run lint` only, then push straight to `dev` (rule 21).

GitHub Actions (`.github/workflows/ci.yml`) only runs for PRs into `main` and pushes to `main`. Do not add CI jobs for `dev`.

### Docs-only changes

A change is docs-only when **every** file it adds or edits is a documentation Markdown file (`.md`) and **none** of those files is code or a configuration file. Documentation Markdown includes `AGENTS.md` (agent rules are documentation, not configuration), README files, `docs/`, `specs/`, `prompt-history/`, `TODO/`, skill notes, and other prose `.md` files. Source code, tests, styles, scripts, JSON, YAML, TOML, and any other code or configuration file are outside this exception, whatever the extension. A `.md` file is also outside this exception when the repository treats that file itself as code or configuration (for example a file the build executes, or generated configuration stored as Markdown). Ordinary prose stays inside the exception. If the change also touches anything outside it, the change is not docs-only: run the normal checks and use the normal pull-request workflow. Change notes and prompt history that accompany a code or configuration edit do not make that edit docs-only.

For a docs-only change:

- Do not run any tests. Skip `npm run test:unit`, `npm run test`, `npm run test:e2e`, Playwright, and every other test command. Rule 1, rule 10, and test items 2 and 3 under "Checks before every push" do not apply.
- Rules 3, 4, 15, 19, and 20 still apply. Run `npm run lint` before the commit and fix every reported issue. Lint is not a test. Still add the `docs/changes/` note and the English `prompt-history/` entry.
- Commit and push **straight onto `dev`**. Do not create a feature branch and do not open a pull request. Do not push to `main`. The Dev mode line "never push directly to `dev`" does not apply.
- Push a fast-forward to `origin/dev`. If `origin/dev` moved, rebase onto it and push again. Do not merge, and do not force-push `dev` (the release reset is the only authorized force-push of `dev`).
- Use `Live-Update: safe` on that commit. A docs-only change does not alter runtime JavaScript.
- If the user explicitly demands tests, a pull request, a feature branch, another base branch, or a push to `main`, follow that demand instead of this exception.

### Netlify

- `main` deploys to production.
- `dev` is the only branch deploy. Netlify builds it right after each merge into `dev`.
- Deploy previews are built for PRs into both `main` and `dev`, at `https://deploy-preview-<PR-number>--code-for-battle.netlify.app`. Use the preview to verify a change before merging.
- `netlify.toml` runs `node scripts/netlify-ignore.mjs` as its `ignore` command. It builds production, the `dev` branch deploy, and all PR deploy previews, including PRs into `dev`. Other branch deploys are skipped. Preview decisions do not require a GitHub API lookup.
- **Backend separation:** the dev branch deploy uses the same Upstash Redis database and Netlify Blobs stores as production, but Netlify sets `REDIS_KEY_PREFIX=dev:` for the branch-deploy context only. Every Redis key (multiplayer stats Lua scripts) and every Blobs key (signalling, invite codes, Blobs stats fallback) is then written under `dev:` (`src/network/storageKeyPrefix.js`). Production has no prefix, and neither do deploy previews of PRs into `main`: they share production's keys. Any new server or edge code that touches Redis or Blobs must go through that prefix (`readStorageKeyPrefix` / `prefixBlobStore`) and needs a test for it.

### Live updates on the dev deploy

First step of B-008 (hot code push). Players on https://dev--code-for-battle.netlify.app never need to reload on their own after a merge into `dev`:

- **Update manifest:** every build writes `dist/build-info.json` (`scripts/liveUpdateBuildInfo.mjs`) with `manifestVersion`, `version`, `commit`, `stateSchemaVersion` (`GAME_STATE_SCHEMA_VERSION` in `src/gameStateSchema.js`), `update` (`{ kind: 'safe' | 'breaking' | 'auto', reason }`), merged `releases`, a `jsSignature` and a map of stable keys to the hashed stylesheet files. The manifest and loading screen use the same release merge helpers. `jsSignature` hashes the rendered JS modules, leaving out the release-note JSON under `features/`, `src/version.json` and the version string, so a PR that only changes CSS (plus its release-note entry) keeps the signature.
- **Safe vs breaking, decided by the coding agent:** add a commit trailer to the commit that dev deploys, `Live-Update: safe` or `Live-Update: breaking (<reason>)`. With no trailer the kind is `auto`. The client treats a deploy as breaking when the trailer says so, when non-swappable JS changed, or when a live state migration is unavailable; registered hot-swappable modules may still land with `Live-Update: safe` (see "Marking JavaScript changes safe for live module swap" below). Bump `GAME_STATE_SCHEMA_VERSION` whenever the shape of the game state changes.
- **State migrations:** when saved/live state changes shape, increment `GAME_STATE_SCHEMA_VERSION` by exactly one and add a pure `migrations[newVersion] = state => newState` entry in `src/gameStateMigrations.js`. Never mutate the input. Keep every historical migration so old saves can advance one version at a time, and cover the new step plus migration gaps with unit tests. Dev live-update builds warn if a schema bump has no matching registry entry.
- **Client** (`src/pwa/liveUpdate.js`): polls `/build-info.json` every 20 s and whenever the tab becomes visible again. The player is always told about a new update, in a bubble at the top and in a status line under the version in the left sidebar, including whether it needs a reload.
  - Every safe, deferred, breaking-ready and restored notice shows a scrollable shared release digest, diffed by entries as well as version so same-version dev commits list only their new notes.
  - Safe update: applied on its own. The changed `<link rel="stylesheet">` tags are swapped in place and the version labels updated, with no reload and no loss of game state.
  - Breaking update: never reloads on its own. The bubble offers "Reload now" / "Later" (the sidebar line keeps a "Load" button). Only after the player agrees does it save the running game into the `lastGame` checkpoint (`prepareForLiveUpdateReload` in `src/saveGame.js`), mark it for auto-resume, activate the waiting service worker and reload. The boot path restores the save and the bubble confirms it.
- **Scope: single-player, meaning no other human connected over the network.** A local game against any number of AI enemies (the HUD may show "You (Host)") gets live updates. Only while another human is connected (this browser joined someone's game, a WebRTC peer is connected, or a remote human controls a party; `isMultiplayerActive`) updates are held back with a notice and applied on the first poll after the match.
- **Build switch:** `__LIVE_UPDATE__` is true only when Netlify builds the `dev` branch deploy (`CONTEXT=branch-deploy`, `BRANCH=dev`) or with `CFB_LIVE_UPDATE=1` (`CFB_LIVE_UPDATE=0` forces it off). Production and deploy previews never include the module. Under `npm run dev`, Vite's HMR already swaps CSS; before Vite does a full reload for a JS change, the module saves the game so the boot restores it.
- **Service worker:** it never caches `/build-info.json` (`shouldBypassServiceWorkerCache`), and the file stays out of the offline asset manifest. Do not rename or move it without updating both.
- A device picks up the mechanism (and a service worker that bypasses `build-info.json`) with one ordinary reload after it lands on dev.
- **Built now:** hot-swapping registered JS modules at a safe point between simulation ticks, per-module state handover, and `migrateLiveState` during play (see below). Multiplayer hot code push is still out of scope.

### Branch protection

`main` is protected: no direct pushes, no force-pushes, no deletion; changes land only through PRs with a passing `smoke-test` CI check. Admins (Patrick) are not included and can still bypass it. Patrick configures this protection himself in the GitHub settings; agents never push to `main` directly.

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

The shown version is computed with semver from `package.json` plus the unreleased entries: any breaking entry bumps the major version, any feature bumps the minor version, otherwise any improvement or bugfix bumps the patch version. Every build shows only this plain version (for example `v0.62.1`): production, `dev`, deploy previews and local builds alike, on the loading screen, the update heading and the sidebar. Never add a PR label or suffix to the in-app version; a deploy preview's PR number appears only in its Netlify URL (`deploy-preview-758--code-for-battle.netlify.app`). `npm run version:show` prints the current value.

Classify entries the same way as `docs/changes/` notes: a bug is something broken or contrary to intended behaviour, an improvement is polish of something that exists, a feature is a new capability.

The app bundles the released files and the unreleased entries for offline access and uses the same release-digest component in the loading screen and User Manual (`src/ui/releaseDigest.js`): unreleased entries count as part of the current build version. Loading prioritizes features, displays only improvement/bugfix counts when features exist, and falls back to improvement/bugfix descriptions when there are no new features. These entries are required in addition to `docs/changes/`, specs, and prompt history.

## Test IDs

Every test has a stable ID at the start of its title: `U00001` style for unit and integration tests (`tests/unit`, `tests/integration`) and `E00001` style for Playwright e2e tests (`tests/e2e`), always a letter plus five digits with leading zeros, in square brackets followed by a space:

```js
it('[U00042] clears track marks on restart', () => { ... })
test('[E00007] skirmish map loads', async({ page }) => { ... })
```

- Write new tests without an ID, then run `npm run test:ids:assign`. It gives every declaration without an ID the next free number. Never renumber or reuse IDs; a deleted test retires its ID.
- `npm run lint` runs `npm run test:ids`, which fails on missing, malformed, wrong-prefix or duplicate IDs.
- An ID belongs to the source declaration, so `it.each` or a test declared in a loop shares one ID across its cases.
- `npm run test:ids:list -- <path or substring> [--markdown|--json]` prints the IDs per test file, for the test plan table. Run a single test with `npx vitest run -t U00042` or `npx playwright test -g E00007`.

## Pull request descriptions

Every PR description (by any agent, into `main` or `dev`) contains a **manual test plan** that covers every new feature, bugfix and improvement in the PR. It is a Markdown table with one row per test step and these columns, in this order:

| ID | Area | Steps | Expected result | Unit tests | E2E tests |
|---|---|---|---|---|---|
| T01 | Loading screen | Open the deploy preview | Version shows `v0.62.1` | 2: U05170, U05171 | 0 |

- IDs are `T01`, `T02`, ... per PR.
- The last two columns give the number of unit and e2e tests that cover the row, followed by their IDs (`0` when none).
- GitHub does not render clickable checkboxes inside tables, so put the checkboxes in a task list directly below the table, one per row and keyed by the same ID, for example `- [ ] T01 Loading screen version label`. The reviewer ticks them on GitHub after verifying each step.
- `.github/pull_request_template.md` holds this skeleton.

### Marking JavaScript changes safe for live module swap

Use `Live-Update: safe` only when all behavior-changing JavaScript files in the commit belong to modules registered in both `LIVE_MODULES` (`scripts/liveUpdateBuildInfo.mjs`) and the runtime registry (`src/pwa/liveModuleRegistry.js`). A registered module must export `hotSwappable = true`; it may export synchronous `hotDispose()` and `hotAccept(previousState)` hooks. The build publishes each registered module's URL and signature plus a signature for all non-swappable JavaScript. The client downloads changed registered modules first and installs them at the safe point at the start of an animation frame, before any simulation tick, after `migrateLiveState(state, fromVersion, toVersion)` runs. Imports, validation, migration, or hooks that fail fall back to the consent-based saved reload. Use `Live-Update: breaking (<reason>)` whenever a changed JavaScript file is outside the registry, a state migration is unavailable, a hook cannot safely preserve internal state, or compatibility is uncertain. CSS-only and release-note-only commits may still use `Live-Update: safe`.

## Patrick's current workflow preference (2026-10-27)

For subsequent requests, commit and push directly to `dev`, without a feature branch or PR, unless Patrick explicitly requests a different workflow. Keep the required validation checks.
