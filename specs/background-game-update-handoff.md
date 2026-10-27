# Background game update handoff

## Experimental opt-in and restart repair

Seamless updates are off by default. Settings exposes a persistent **Seamless updates (experimental)** checkbox. When disabled, the update action saves and uses the ordinary loading screen. When enabled, accepting the update immediately dismisses its notice/actions and displays a thin top download bar; polling is suspended until the attempt finishes. The bar remains above the frozen battlefield during restart and follows boot progress.

Navigation cache mode does not determine user intent. The worker serves an explicit staged update even when the browser marks its request `no-cache` or `reload`. The one-use preserved frame is bound to the target commit, so an installed browser reporting the new navigation as a reload still keeps the battlefield visible. A subsequent manual reload has no preserved frame and clears the staged URL.

Save loading reports success explicitly. The durable resume flag stays set during seamless startup and is cleared only when the restored battle finishes boot. If startup fails, keep the preserved battlefield visible and offer **Reload normally**, which clears transient update markers, removes the pinned URL, and restores the durable checkpoint through ordinary startup. Do not replace that view with a broken loading screen.

Regression coverage includes all three navigation cache modes, stable asset lookup for the restarted client, rejected save restoration, delayed recovery-flag clearing, and two browser scenarios: a reload-classified handoff and a failed startup followed by successful ordinary recovery. Hardware GPU and installed Safari acceptance remain pending; the checkbox stays off by default.

The update action stages the selected deploy in an isolated Cache Storage snapshot while the current single-player battle continues. A build-specific manifest includes the boot shell, bulk assets, prepared sprites, and unit source imagery; streamed videos and external services remain outside the game snapshot. Previously downloaded assets are reused only when their revisions match. The manifest and the final build pointer must identify the requested commit. Failed or interrupted staging never pauses or reloads the battle.

After staging, recheck multiplayer, activate the waiting worker, pause simulation, save `lastGame`, and verify both the checkpoint and auto-resume flag against durable storage. Render once without scheduling another loop, capture the visible canvas layers as WebP, and place a blocking paused overlay over the battlefield. Navigate to the same game URL with the selected commit. The service worker serves this client's navigation and all game asset requests from the complete staged snapshot, including stable-name imagery. Other clients continue using the ordinary Workbox routes.

The first inline script consumes the one-use frozen view before the loading screen paints. Save restoration keeps the battle paused until boot finishes asset preparation and presents a frame. Then remove the frozen view and resume. Failure to restore exposes the startup error instead of hiding it forever. A manual browser reload consumes no frozen view and exits the pinned snapshot via a clean navigation; normal startup, mission loading, and save-loading screens remain available.

Duplicate update clicks are ignored during staging and handoff. A multiplayer session that starts during download defers application. Failed downloads/saves resume the previous game and allow retry. The normal sidebar worker-update action shares this handoff for an active battle; updates outside a running battle keep ordinary loading.

## Verification

Focused unit coverage exercises ordering, duplicate clicks, download/save failure and retry, multiplayer deferral, isolated asset staging, and deploy mismatch. Browser coverage exercises a real saved game through restart with a delayed boot, the frozen canvas overlay, automatic resume, and ordinary manual reload. Full unit/integration checks, lint, and the production build are required.

The only new work in the paused render path is reporting the already-presented boot frame once per paused redraw. Snapshot capture runs once per accepted update, with no per-entity work added. GPU/performance acceptance remains pending on Patrick's qualifying hardware: verify WebGL/WebGPU frozen layers, first resumed frame, scrolling and update downloads at the existing quality and DPR with the repository's 75 FPS acceptance protocol. No software-rendered performance benchmark certifies this requirement.

## Recorded validation

- `npm run lint:fix:changed` and `npm run lint`: passed.
- `npm run build`: passed, including map sprite tier verification and service-worker generation.
- Focused Vitest run (`updateHandoff`, `liveUpdate`, `offlineMode`, `offlineUpdateNotification`, `loadingScreen`): 49 passed.
- `npm run test:integration`: 86 passed.
- Targeted Chromium Playwright run (`backgroundUpdateHandoff`, `liveCssUpdate`, `sidebarUpdatePrompt`): 3 passed using the installed `/usr/bin/chromium`. The CSS fixture explicitly declares its simulated running schema.
- Built-worker browser check: staged HTML, JavaScript and stable-name sprite metadata load with networking disabled; manual reload exits the pinned update URL.
- `npm run test:unit` and `npm run test` were run in full. Four unrelated failures reproduce on an untouched archive of `origin/dev` (`650c781a`): U06568 (aircraft-selection mock lacks `handleLandingSpotCommand`) and U04500/U05490/U04501 (tutorial narration does not match the current welcome text). Initial release-script subprocess failures disappear with the environment's additional execution/network permission. Three obsolete immediate-reload notification assertions were updated for the new background handoff; all notification tests now pass in the focused run. Full-suite success is not claimed.
- Full Playwright suite was not run; the three tests covering this change were run. Hardware GPU capture/75 FPS acceptance remains pending on Patrick's hardware.

## Manual acceptance

| Step | Action | Expected result |
|---|---|---|
| T01 | Accept an update during a local battle on a slow network. | The battle remains playable while all files download. |
| T02 | Allow downloads to finish. | The battle pauses, is saved, stays visually frozen through boot, and automatically resumes with the updated build and saved progress. |
| T03 | Manually reload the browser, including during a handoff. | The ordinary loading screen appears, with no stale frozen overlay. |
| T04 | Interrupt download or deny storage writes, then retry. | The original battle remains playable and the retry action remains available. |
| T05 | Connect another human while an update downloads. | Application defers without pausing or saving the network match. |
| T06 | Repeat T02 using hardware WebGL and WebGPU at the normal DPR. | All battlefield layers remain visible; resumed gameplay meets the existing quality and performance acceptance criteria. |
