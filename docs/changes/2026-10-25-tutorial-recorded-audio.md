# Improvement

- [x] **Play the existing guided tutorial recordings**
  Install thirteen previously generated Atlas Morgan MP3s, preserve exact-text matching and browser speech fallback, and verify default mouse, trackpad and touch narration.
  Spec: [Player-driven tutorial](../../specs/player-driven-tutorial.md)

Source generation IDs, full retrieved prompts and service durations are recorded in [the provenance manifest](../tutorial-narration-recordings.json). No audio was generated in this task. MP3 files were explicitly authorized by the user.

Hardware GPU performance acceptance remains pending with Patrick on dev; no performance benchmark was run in this environment.

## Verification

- All 13 MP3s decode with `ffprobe`; the retrieved full scripts and service durations match the local manifest.
- Focused narration/progression tests: 25 passed (`npx vitest run tests/unit/tutorialNarration.test.js tests/unit/tutorialOnboardingFlow.test.js`).
- Six focused Chromium checks passed across `tutorialInputMethods.test.js` and `tutorialPlayerActions.test.js`, including the corrected construction check rerun. The browser test harness now waits for tutorial initialization and accepts a completed blueprint when production finishes before a queue poll.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:narration -- --reporter=line`: passed; all 13 installed clips selected through `runCurrentStep`, native media time advances with application audio enabled and nonzero master volume, and native `ended` events release the narration gate. Uses 8x playback to keep this functional check bounded; this is not a performance measurement.
- Focused ordinary browser checks used system Chromium via a temporary configuration extending `playwright.config.js`, one worker, `executablePath: '/usr/bin/chromium'`, and launch args `['--no-sandbox', '--mute-audio']`. Output-device mute does not disable media decoding; the dedicated narration configuration disables the application's headless mute and asserts that it is disabled.
- Production build passed (`npm run build`). Full E2E suite was not run: this environment has no verified hardware GPU, so GPU/performance acceptance remains pending; the relevant tutorial browser checks were run instead.

## Manual acceptance on dev

1. Enable narration, start the tutorial, and choose mouse, trackpad, then touch guidance in separate runs. Changed steps should use Atlas Morgan, including the correct selection/rally variant.
2. Complete an action before its recording ends: the clip must finish before automatic progression. Use Skip step while speaking: the next briefing must start immediately.
3. Change the fire binding or use an unsupported narration language: the exact-text/language guard must preserve browser speech fallback.

Full-suite results: `npm run test:unit` ran 5,481 tests (5,477 passed, four blocked by `spawnSync git EPERM` in the sandbox). `npm run test` ran 5,567 unit/integration tests (5,563 passed, the same four blocked). The entire five-test `releaseScript.test.js` file passed when rerun with authorized Git subprocess execution. Thus all 5,567 distinct tests were verified, with the four environment-only failures resolved by that rerun. No assertions or release implementation were changed to accommodate the sandbox. `npm run lint:fix:changed` and final `npm run lint` passed, including all 5,483 stable test declarations.
