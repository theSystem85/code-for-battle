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

Combined branch results reported by the root orchestrator: `npm run test:unit -- --maxWorkers=2` passed **247 files / 4,804 tests**; `npm run test:integration -- --maxWorkers=2` passed **2 files / 86 tests**; `npm run build` passed. The root orchestrator also reports **9 public-UI browser scenarios passed** (DAV/guided CFBL history, paste, save; phone/iPad rotation; all four categories save/reopen; real replay playback; production-building lifecycle). Final combined lint is recorded with the PR.

Local documentation verification: seven complete CFBL examples accepted; relative links valid; `npx vitest run tests/unit/landingPage.test.js` passed all 11 cases for the initial landing slice. The EN/DE landing routes were also checked in system Chromium: all four images decoded and had localized nonempty alt text in each locale. Full lint passed before each documentation commit. A concurrent full unit run was stopped to avoid resource contention, and is deferred to the orchestrator's combined run.

## Real screenshot provenance

Implementation revision: `864dbd1`, integrating specs 100–107. Capture helper: `scripts/captureAutomationScreenshots.mjs`. Assets are in `public/images/landing/automation/` and use **WebP quality 85**, DPR 1, English game UI. This is real rendered game UI, not a generated or composited editor image.

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

Accepted CFBL edits compile to inert instructions outside the simulation loop; gameplay evaluates state machines through normal game command APIs without parsing source each tick.
