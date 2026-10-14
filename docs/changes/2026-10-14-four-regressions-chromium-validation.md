# Chromium validation of the four regression tests

- [x] **Make the shared regression arena deterministic and record real browser results**
  Fix fixture side effects that made all four E2E tests fail for reasons unrelated to the bugs under test.
  Spec: none

Fixture fixes in `tests/e2e/helpers/regressionScenario.js`:
- `gameState.partyStates` is empty in a fresh single-player page, so the enemy AI loop drove every party, including the human one. Seed the party table with `ensureMultiplayerState()` so only real AI parties run.
- The arena removes starting armies (including harvesters) and zeroes budgets, so the economy AI sold fixture buildings for emergency funds (this is what removed the line-of-sight blockers and the enemy hospital). Fixture buildings are pinned against selling.
- Construction yards inside the arena were removed from `gameState.buildings` but stayed in `gameState.factories`, where bullets still collided with them invisibly. They are now removed from both lists.
- Failure diagnostics use a circular-safe serializer; the rocket test reports `burstActive` instead of the circular burst object.

Results with `npx playwright test <4 files> --project=chromium` (the same files as `npm run test:e2e:regressions`):

| Issue | Test | Unmodified main (fixed tests) | This branch |
| --- | --- | --- | --- |
| 2 Firing through buildings | `buildingLineOfSightRegression.test.js` | passes, already solved | passes |
| 3 Rocket tank vs. air / move order | `rocketTankAirAndMoveRegression.test.js` | fails: rockets fired, airborne Apache took no damage | passes |
| 4 Apaches sharing a helipad | `apacheHelipadOccupancyRegression.test.js` | fails: first individual landing never settles/claims its pad | passes |
| 5 Enemy crew hospital return | `enemyHospitalCrewRegression.test.js` | fails: AI routes the tank and it heals, but the route uses a pixel `moveTarget` in the tile-based movement API | passes |

The branch passed 8/8 with `--repeat-each=2`.
