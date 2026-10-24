# Bug fixes

- [x] **Naval turn recovery**
  Ships braking to align their hull with a nearby waypoint no longer mistake that intentional stop for an obstruction and insert random detours; terrain collisions and aligned stalls still trigger recovery.
  Spec: none
- [x] **Carrier close-target arrival**
  A carrier accepts a final target along its forward centerline, including points already behind its bow, so close orders and slight overshoots settle instead of circling back.
  Spec: none
- [x] **Naval occupancy bookkeeping**
  Ship movement and removal leave the land occupancy map untouched, matching map construction and preserving terrain/ground-unit occupancy counts.
  Spec: none
- [x] **Straight diagonal routes**
  Tolerate negligible floating-point differences when comparing equivalent route costs, so clear-water diagonals lose unnecessary turning points without changing meaningful terrain-cost preferences.
  Spec: none

## Investigation

The current naval A* path and collision avoidance already ignore the land occupancy layer, and spatial queries exclude the querying ship. Self-blocking occupancy was not the reproduced source of the empty-water dodges. Regression tests against unchanged `dev` reproduced random detours during intentional turns, failure to settle a nearby carrier target, and land occupancy corruption (seven failing parameter cases). A later diagonal browser scenario exposed a 4.7-pixel deviation from the straight route, traced to route costs differing only in floating-point summation order; a focused unit test reproduced the unnecessary `(15,13)` waypoint between `(11,10)` and `(16,14)`. The fixed tests also cover real blockage recovery and targets behind/beside a carrier.

## Verification

After the user requested waiting for the other cloud agent, confirmed its occupancy/pathfinding commit `82460426` had landed on `dev`, then rebased onto it. The naval exclusions preserve its fixed/movable occupancy tags. This branch's unpublished regression test IDs were reassigned to avoid IDs already allocated upstream; final PR validation is rerun on the combined code.

- Focused unit regressions: `npx vitest run tests/unit/unifiedMovement.test.js tests/unit/navalIntegration.test.js tests/unit/pathfinding.test.js`.
- Browser movement regression: `npx playwright test tests/e2e/navalMovementRegression.test.js --project=chromium --reporter=line`. Exercises real move commands, pathfinding, rotation, collision and occupancy for carriers, battleships and destroyers, with close, distant and diagonal targets and a post-arrival observation period. Also run `tests/e2e/navalTransportEmbarking.test.js` for ferry/hovercraft boarding compatibility.
- Rebased full unit result: `npm run test:unit -- --maxWorkers=2` passes all 5,476 tests in 330 files.
- Required full checks: `npm run test:unit`, `npm run test`, `npm run lint:fix:changed`, `npm run lint`.
- Final full result: `npm run test -- --maxWorkers=2` passes all 5,562 unit/integration tests in 332 files with required Git subprocess access. The restricted sandbox cannot execute the release-script tests' Git subprocesses, so final validation runs outside that subprocess restriction.
- Focused unit result: 170 tests pass across the movement, naval integration and pathfinding files. Browser result: E00234 passes all nine routes; E00077 ferry/hovercraft boarding passes. ESLint and all 5,477 stable test declarations pass ID validation.
- Browser runs use `/tmp/naval-playwright.config.mjs` with `/usr/bin/chromium`; the installed system browser is used because downloading Playwright's bundled browser is blocked by the environment's destination policy. No project browser configuration is changed.
- Final browser command: `npm run test:e2e -- tests/e2e/navalMovementRegression.test.js tests/e2e/navalTransportEmbarking.test.js --config=/tmp/naval-playwright.config.mjs --project=chromium --reporter=line --workers=1` — both tests pass.
- Full browser suite is outside this focused movement verification; opt-in GPU/performance benchmarks are not run without verified hardware GPU access.

## Hot-loop review and hardware acceptance

Movement runs once per unit per fixed simulation tick (60 Hz). At 200 moving carriers, the arrival change adds bounded scalar projection arithmetic up to 12,000 times/second, reusing the existing hull object. Recovery adds one heading comparison only on a low-speed blockage check (normally once per 500–1,000 ms/unit). Occupancy updates return early for ships. There are no new entity scans, per-frame collections, or render operations; DPR does not multiply this CPU work. Hardware acceptance of the 75 FPS gate remains pending for Patrick on the dev deployment; these functional tests do not certify rendering performance.
