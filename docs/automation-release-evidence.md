# Automation release evidence

Specs 100–108 are implemented together. Software verification does not certify a real iPhone keyboard or qualifying-hardware performance. Those two acceptance gates remain **open**.

## Verification matrix

| Spec / contract | Evidence | Status |
| --- | --- | --- |
| 100: full grammar and catalogs | `src/automation/cfbl/`; shared parser/catalog coverage and complete template fixtures | Verified in final unit run |
| Published CFBL examples | `node scripts/validateAutomationDocs.mjs`: all seven reference/tutorial snippets accepted | Verified |
| 101: authoritative source, migration and lifecycle | `src/policies/policyStore.js`, `src/automation/automationDraft.js`; save/replay/source suites | Verified in final unit/integration runs |
| 102/107: ELSE semantics and compiled equivalence | Reference/compiled stepping suites; 178 focused runtime cases reported by implementation agent | Verified focused and final unit/integration coverage |
| 103/104: synchronized Buttons/CFBL | Real screenshots below show the same accepted IF/ELSE program; editor input/fuzzy/paste/undo suites | Verified in final public-UI scenarios |
| 105: phone and tablet shell | Device classifier/layout suites; real Chromium phone-emulation screenshot shows full-screen shell and footer | Software layout verified; physical Safari checks open |
| 106: defence automation | 256 focused cases and real projectile, Tesla DAV/ATV and recovery UI scenarios reported by implementation agent; captured live turret WHILE hold | Verified focused/live and final unit/integration coverage |
| 108: localized landing and guide | EN/DE Automation anchors, four localized screenshot captions/alt texts and intentional repository documentation links; landing unit suite | Verified in final build/browser run |
| iPhone Safari keyboard, orientation and flyout usability | Physical-device verification | **Open**: unavailable in cloud runner |
| At least 75 presented FPS under active worst-case gameplay | Qualifying reference hardware protocol, spec 107 | **Open**: headless/software browser cannot certify |

Combined branch results reported by the root orchestrator: `npm run test:unit -- --maxWorkers=2` passed **247 files / 4,804 tests**; `npm run test:integration -- --maxWorkers=2` passed **2 files / 86 tests**; `npm run build` passed. The root orchestrator also reports **9 public-UI browser scenarios passed** (DAV/guided CFBL history, paste, save; phone/iPad rotation; all four categories save/reopen; real replay playback; production-building lifecycle). Final combined lint passed. The 2026-10-12 UI polish reran all 4,804 unit tests and seven editor/browser cases; those cases now enter each category through the single creation select and verify horizontal active tabs plus sidebar/resource-bar stacking.

Local documentation verification: seven complete CFBL examples accepted; relative links valid; `npx vitest run tests/unit/landingPage.test.js` passed all 11 cases for the initial landing slice. The EN/DE landing routes were also checked in system Chromium: all four images decoded and had localized nonempty alt text in each locale. Full lint passed before each documentation commit. The initial documentation worktree deferred its full unit run to the successful combined run above.

## Real screenshot provenance

Screenshots refreshed on 2026-10-12 from `6058fdc` plus the Automation UI polish changes in this PR: horizontal active tabs and the single creation select. The accepted source fixture and real defence scenario are unchanged. Capture helper: `scripts/captureAutomationScreenshots.mjs`. Assets are in `public/images/landing/automation/` and use **WebP quality 85**, DPR 1, English game UI. This is real rendered game UI, not a generated or composited editor image.

```sh
npm run dev -- --host 127.0.0.1 --port 5175
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/captureAutomationScreenshots.mjs
node scripts/validateAutomationDocs.mjs
```

Use a fresh server when capturing after integration to avoid stale Vite HMR module identities. The optional `CHROMIUM_EXECUTABLE_PATH` selects an installed system browser; omit it when Playwright's Chromium is installed.

| Screenshot | Viewport | Scene / observable evidence |
| --- | --- | --- |
| `buttons-desktop.webp` | 1440 × 1080 | Built-in `demo`, seed `demo-battle-2`; Engage or advance, three generated indexes and visible IF/ELSE arrows |
| `cfbl-desktop.webp` | 1440 × 1080 | Same context and accepted program; action slot selected, transient fuzzy query `atk`, legal flyout and syntax colors |
| `cfbl-phone.webp` | 390 × 844 | Same built-in demo and program; iPhone UA/touch emulation, full-screen shell, toggle and reachable save footer |
| `defence-live.webp` | 1440 × 1080 | Built-in `Full_Base_Test`; owned Gun Turret V1 at 30% health, real bound WHILE machine controlling state 2 with a hold-fire action |

The exact unit program is preserved in [`source-fixture.cfbl`](../public/images/landing/automation/source-fixture.cfbl). The defence capture creates `control defence-building`, individual/continuous, state 1 waiting, `while (hp().relative < 0.5) until (hp().relative >= 0.75) goto 2`, state 2 `do holdFire()`. It applies that accepted source through the public store, releases any manual override and lets the actual game simulation enter the hold. The captured [`defence-status.json`](../public/images/landing/automation/defence-status.json) verifies `stateIndex: 2`, `active: true`, `holding: true` and `status: controlling`; no live state is fabricated.

Game scene setup deliberately changes turret health to exercise the hold and pauses after the actual transition. Unrelated notifications are removed before capture. Locale captions and alt texts describe the English UI in both landing languages. Image dimensions are declared, below-fold images lazy-load and responsive layout preserves aspect ratio.

Emulation proves layout only. It does not certify an iOS virtual keyboard, Safari viewport behavior or touch interactions on physical hardware. Tablet bounds have dedicated software tests; physical tablet/split-screen confirmation remains part of the device check.

## Performance evidence and limits

[Runtime measurement protocol](performance/automation-runtime-method.md) links raw CPU measurements and explains their scope. Cadences remain 150 ms for unit/defence control and 1,000 ms for production. Microbenchmarks include a cold pass and show **no general speedup claim**: compiled and reference machine overhead are close, and compile-on-edit removes parsing from evaluation. The 960-binding batch, shared-host contention and headless full-game diagnostics are not a 75 FPS certificate. The root orchestrator records whole-game baseline/after diagnostics and their backend/DPR limitations separately.

Whole-game raw evidence: [five baseline runs](performance/automation-game-baseline.json) and [two integrated runs](performance/automation-game-after.json). Both integrated full-map routes completed without page errors at DPR 2. Their measured 13.44/13.46 FPS, frame-time tails, CPU profiling and missed deadlines are retained as diagnostics; the headless software renderer is ineligible for presented-FPS certification. The first three baseline runs were contended and did not complete the route. These measurements do not establish a controlled speedup or active worst-case acceptance.

Final integration also refreshes replay inspection flags from recorded runtime/intent, restores accepted unit-command control ownership, and removes completed individual unit bindings. Replay remains output-driven and does not evaluate live machines again.

### Browser reproduction

With Playwright Chromium installed, run the ordinary repository configuration against its configured server:

```sh
npx playwright test tests/e2e/automationFeature.test.js tests/e2e/automationReplayCommands.test.js tests/e2e/basePolicyBuildingLifecycle.test.js
```

The cloud runner used `/usr/bin/chromium`, a separate Vite server on port 5173 and a temporary wrapper `/tmp/cfb-playwright.config.mjs`. To reproduce that configuration, place this wrapper in the repository root and pass its filename with `--config`:

```js
import config from './playwright.config.js'
export default {
  ...config,
  testDir: './tests/e2e',
  outputDir: '/tmp/cfb-e2e-results',
  reporter: 'line',
  workers: 1,
  webServer: undefined,
  use: {
    ...config.use,
    baseURL: 'http://127.0.0.1:5173',
    storageState: './tests/e2e/headlessMutedStorageState.json',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--mute-audio'] }
  }
}
```

The integrated diagnostic command used `PERF_RENDERING_PIPELINE=1 PERF_RENDERING_DURATION_MS=60000`, the same wrapper, `tests/e2e/renderingPipeline75Fps.test.js` and `--repeat-each=2`; both runs passed route/error checks. Qualifying hardware must additionally enable the acceptance gate and run the active worst-case protocol from spec 107.

Accepted CFBL edits compile to inert instructions outside the simulation loop; gameplay evaluates state machines through normal game command APIs without parsing source each tick.

## Spec 109 — optional completion waits

Completion waits are source-backed in both editors. Building/unit production waits track the exact order and authoritative completion; finite unit control waits track arrival, flight/service completion or the originally issued attack target. Cancellation and superseding orders cannot count as success. See [spec 109](../specs/109-automation-command-completion-waits.md) and the [runtime measurement note](performance/automation-completion-waits.md).

The integrated branch passed 249 unit files / **4,830 tests**, **86 integration tests**, lint and build. Browser runs passed ten scenarios in the main combined run and two real-completion scenarios in a focused rerun, covering **11 distinct cases** in total (one building case repeated). These include actual movement to the issued destination and actual paid building placement, with no duplicate order or early transition. Seven published CFBL snippets validated, including production completion modifiers. Physical iOS and qualifying-hardware performance acceptance remain open.
