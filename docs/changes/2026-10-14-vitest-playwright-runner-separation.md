# Bug: Test runner separation

- [x] **Use the intended test runner**
  Apply the supplied patch's unit/integration-only `npm test` command and four-file Chromium regression script without changing Vitest configuration or disabling tests.
  Spec: none

Round 2 validation (offline dependencies installed with `npm ci --offline --ignore-scripts`):

- `npm run test:unit`: 256 files, 4,866 tests passed.
- `npm test`: 258 files, 4,952 tests passed; no Playwright suites collected.
- `npm run lint:fix:changed`: passed after the final implementation.
- `npm run lint`: passed after the final implementation.
- `git diff --check`: passed.

Functional baseline comparison: temporarily restore main's `crewHealing.js`, `enemyUnitBehaviorCore.js`, `helipadLogic.js` and `combatHelpers.js`, run `node_modules/.bin/vitest run tests/unit/regressionRuntime.test.js tests/unit/combatHelpers.test.js tests/unit/aiHospitalReturn.test.js tests/unit/enemyUnitBehavior.test.js`, then restore the implemented changes. Nine targeted assertions failed on main (30 passed), covering rocket hull aiming, airborne rocket damage, helipad settling, hospital coordinates/retry/priority/completion. The blocked/clear line-of-sight runtime check passed on main. All these suites pass with the implementation in the full run. The final runtime landing case additionally covers two pads and sequential landings.

All 18 supplied patch file blobs were verified against the prompt's Git hashes after application with `git apply`, before Round 2 edits. The supplied historical prompt entries were preserved.

- [ ] Human browser validation: `npm run test:e2e:regressions` (exactly the four requested files, `--project=chromium`). Browser/Playwright execution was prohibited and was not attempted.
- [ ] Qualifying-hardware 75 FPS validation per `performance_improvement.md`. Unit tests do not certify performance; no browser, frame/GPU timing or memory/GC measurements are claimed.

`vitest.config.js`, TODO checkboxes and CI lint rules remain unchanged. No commits, pushes or remote changes were made.
