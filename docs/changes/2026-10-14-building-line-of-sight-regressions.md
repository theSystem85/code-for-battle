# Bug regression: Building line of sight

- [x] **Exercise blocked and clear firing lanes independently**
  Keep existing tank and gun-turret building obstruction checks; correct the permanent regression setup and expose firing diagnostics.
  Spec: none

Main diagnosis: no missing line-of-sight check was found. `ensureLineOfSight` gates tank fire; `hasLineOfSightToTarget` gates gun-turret fire, including burst continuation. The coupled real movement/combat check passes on main, including the previous scenario's blocked/clear ammunition assertions. The human's browser failure therefore does not establish a game defect for this issue.

Regression: `tests/e2e/buildingLineOfSightRegression.test.js`. Use two independent lanes with separate stationary enemy targets, exact checked building footprints, and native ammunition capacities. Each shooter must preserve ammunition and target health for eight simulation seconds behind its obstacle, then expend ammunition and damage its own target after removal. Remove obstacles through `clearBuildingFromMapGrid`, including occupancy and map notifications, rather than clearing only their building references. Failures show both shooters' ammunition, health, positions, crew and targeting state.

Shared fixture corrections: preserve the buildings array, remove overlapping footprints through the game API, rebuild occupancy after removing starting armies, maintain occupancy when positioning units, explicitly initialize airborne occupancy, verify cheat-spawned building coordinates, and observe actual simulation time. Bullets are module-local; the fixture does not claim to clear `gameState.bullets`.

- [ ] Human Chromium validation: `npm run test:e2e:regressions` (browser execution prohibited here).

Round 2 validation is recorded in `2026-10-14-vitest-playwright-runner-separation.md`.
